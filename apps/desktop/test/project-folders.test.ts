import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectFolders, folderOf, RECENT_LIMIT, versionOf } from '../src/project-folders.ts';
import type { ProjectFolders } from '../src/project-folders.ts';

async function scratch(fn: (root: string, folders: ProjectFolders) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-folders-'));
  try {
    await fn(root, projectFolders({ listFile: path.join(root, 'data', 'recent.json') }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('a picked project.json names its folder', () => {
  // resolved, so on Windows it is the current drive's D:\a\Song
  const song = path.resolve('/a/Song');
  assert.equal(folderOf('/a/Song/project.json'), song);
  assert.equal(folderOf('/a/Song'), song);
});

test('a folder the user never picked and that is not recent cannot be read or written', () =>
  scratch(async (root, folders) => {
    await folders.load();
    const other = path.join(root, 'other');
    await assert.rejects(folders.read(other), /isn't a project this app opened/);
    await assert.rejects(folders.write(other, '{}', null), /isn't a project this app opened/);
    await assert.rejects(fs.access(path.join(other, 'project.json')));
  }));

test('saving into a picked folder writes project.json whole and puts it at the top of Open Recent, kept across runs', () =>
  scratch(async (root, folders) => {
    await folders.load();
    const a = folders.grant(path.join(root, 'A')),
      b = folders.grant(path.join(root, 'B', 'project.json'));
    assert.equal(await folders.write(a, '{"a":1}', null), versionOf('{"a":1}'));
    await folders.write(b, '{"b":1}', null);
    assert.deepEqual(await folders.read(a), { text: '{"a":1}', version: versionOf('{"a":1}') });
    assert.deepEqual(await fs.readdir(a), ['project.json'], 'no temporary file left behind');
    assert.deepEqual(
      (await folders.recent()).map((r) => r.name),
      ['B', 'A'],
    );
    await folders.used(a);
    const again = projectFolders({ listFile: path.join(root, 'data', 'recent.json') });
    await again.load();
    assert.deepEqual(
      (await again.recent()).map((r) => r.name),
      ['A', 'B'],
    );
    assert.equal((await again.read(b)).text, '{"b":1}', 'a recent project can be opened in the next run');
  }));

test('Open Recent keeps the last ten, marks missing ones, and forgets or clears on request', () =>
  scratch(async (root, folders) => {
    await folders.load();
    for (let i = 0; i < RECENT_LIMIT + 2; i++)
      await folders.write(folders.grant(path.join(root, `S${i}`)), '{}', null);
    let list = await folders.recent();
    assert.equal(list.length, RECENT_LIMIT);
    assert.equal(list[0]?.name, `S${RECENT_LIMIT + 1}`);
    await fs.rm(path.join(root, 'S11'), { recursive: true });
    list = await folders.recent();
    assert.equal(list[0]?.exists, false);
    assert.equal(list[1]?.exists, true);
    await folders.forget(list[0]?.path);
    assert.equal((await folders.recent())[0]?.name, 'S10');
    await folders.clear();
    assert.deepEqual(await folders.recent(), []);
    assert.equal(
      (await folders.read(path.join(root, 'S10'))).text,
      '{}',
      'a folder picked in this run stays reachable after Clear Menu',
    );
  }));

test("takes are kept in the folder's takes/, by safe names only", () =>
  scratch(async (root, folders) => {
    await folders.load();
    const a = folders.grant(path.join(root, 'A'));
    await folders.writeTake(a, 'take-1.wav', new Uint8Array([1, 2, 3]));
    assert.deepEqual(await folders.takes(a), ['take-1.wav']);
    assert.deepEqual([...(await folders.readTake(a, 'take-1.wav'))], [1, 2, 3]);
    await assert.rejects(folders.writeTake(a, '../../evil.wav', new Uint8Array([1])), /not a take/);
  }));

test("samples are kept in the folder's samples/, by safe names only", () =>
  scratch(async (root, folders) => {
    await folders.load();
    const a = folders.grant(path.join(root, 'A'));
    await folders.writeSample(a, 'Kick 2.wav', new Uint8Array([1, 2, 3]));
    assert.deepEqual(await folders.samples(a), ['Kick 2.wav']);
    assert.deepEqual([...(await folders.readSample(a, 'Kick 2.wav'))], [1, 2, 3]);
    await fs.access(path.join(root, 'A', 'samples', 'Kick 2.wav'));
    for (const bad of ['../../evil.wav', '.hidden.wav', 'notes.txt'])
      await assert.rejects(folders.writeSample(a, bad, new Uint8Array([1])), /not a sample/);
  }));

test("audio tracks' files are kept in the folder's audio/, by safe names only", () =>
  scratch(async (root, folders) => {
    await folders.load();
    const a = folders.grant(path.join(root, 'A'));
    await folders.writeAudio(a, 'Vocal.wav', new Uint8Array([1, 2]));
    assert.deepEqual(await folders.audio(a), ['Vocal.wav']);
    assert.deepEqual(await folders.samples(a), []);
    assert.deepEqual([...(await folders.readAudio(a, 'Vocal.wav'))], [1, 2]);
    await fs.access(path.join(root, 'A', 'audio', 'Vocal.wav'));
    await assert.rejects(folders.writeAudio(a, '../../evil.wav', new Uint8Array([1])), /not a sample/);
  }));

test('the projects in a folder are listed by name, and each can be opened', () =>
  scratch(async (root, folders) => {
    await folders.load();
    const home = path.join(root, 'Chordinal');
    for (const name of ['Beta', 'Alpha']) {
      await fs.mkdir(path.join(home, name), { recursive: true });
      await fs.writeFile(path.join(home, name, 'project.json'), `"${name}"`);
    }
    await fs.mkdir(path.join(home, 'Not a project'));
    assert.deepEqual(
      (await folders.listIn(home)).map((p) => p.name),
      ['Alpha', 'Beta'],
    );
    assert.equal((await folders.read(path.join(home, 'Beta'))).text, '"Beta"');
    assert.deepEqual(await folders.listIn(path.join(root, 'missing')), []);
  }));

test('a save over a project.json that changed on disk since it was read fails and leaves the file as it is', () =>
  scratch(async (root, folders) => {
    await folders.load();
    const a = folders.grant(path.join(root, 'A'));
    const first = await folders.write(a, '{"v":1}', null);
    const { version } = await folders.read(a);
    assert.equal(version, first);
    // another app writes it
    await fs.writeFile(path.join(a, 'project.json'), '{"v":"theirs"}');
    await assert.rejects(folders.write(a, '{"v":2}', version), /^Error: CONFLICT/);
    assert.equal((await folders.read(a)).text, '{"v":"theirs"}');
    // the user chose to replace it
    const replaced = await folders.write(a, '{"v":2}', null);
    assert.equal((await folders.read(a)).version, replaced);
    // a save with the version just written goes through; so does one whose text is already what's on disk
    const next = await folders.write(a, '{"v":3}', replaced);
    await fs.writeFile(path.join(a, 'project.json'), '{"v":4}');
    assert.equal(await folders.write(a, '{"v":4}', next), versionOf('{"v":4}'));
    // a project.json deleted on disk is written again
    await fs.rm(path.join(a, 'project.json'));
    await folders.write(a, '{"v":5}', versionOf('{"v":4}'));
    assert.equal((await folders.read(a)).text, '{"v":5}');
  }));

test('a failed save does not stop the next one', () =>
  scratch(async (root, folders) => {
    await folders.load();
    const a = folders.grant(path.join(root, 'A'));
    await folders.write(a, '1', null);
    await fs.writeFile(path.join(a, 'project.json'), '2');
    await assert.rejects(folders.write(a, '3', versionOf('1')));
    await folders.write(a, '4', null);
    assert.equal((await folders.read(a)).text, '4');
  }));
