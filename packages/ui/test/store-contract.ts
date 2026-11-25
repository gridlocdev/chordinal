// What every project store must do (store/project-store.ts), run against each of them: the memory store, the
// browser's, and the desktop's (here over a stand-in bridge; apps/desktop/test runs it over the real folders).
import { expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { ConflictError } from '../src/store/project-store.ts';
import type { ProjectStore } from '../src/store/project-store.ts';

export interface ContractStore {
  store: ProjectStore;
  /** a name the store may write to */
  name: (n: string) => string;
  /** another app changes the project behind the store's back */
  change: (name: string, text: string) => Promise<void>;
}

export function storeContract(label: string, make: () => Promise<ContractStore>): void {
  test(`${label}: a project written is read back, with the version the write gave`, async () => {
    const { store, name } = await make();
    const a = name('A');
    await assert.rejects(store.read(a));
    const v = await store.write(a, '{"a":1}', null);
    assert.deepEqual(await store.read(a), { text: '{"a":1}', version: v });
    const w = await store.write(a, '{"a":2}', v);
    assert.notEqual(w, v);
    assert.deepEqual(await store.read(a), { text: '{"a":2}', version: w });
  });

  test(`${label}: a write with a stale version is refused and changes nothing`, async () => {
    const { store, name, change } = await make();
    const a = name('A');
    const v = await store.write(a, 'mine', null);
    await change(a, 'theirs');
    const err = await store.write(a, 'mine again', v).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    assert.equal((await store.read(a)).text, 'theirs');
    // with no version, the user agreed to replace it
    const r = await store.write(a, 'mine again', null);
    assert.deepEqual(await store.read(a), { text: 'mine again', version: r });
  });

  test(`${label}: a stale write of what is already there is no conflict`, async () => {
    const { store, name, change } = await make();
    const a = name('A');
    const v = await store.write(a, 'one', null);
    await change(a, 'two');
    await store.write(a, 'two', v);
    assert.equal((await store.read(a)).text, 'two');
  });

  test(`${label}: takes are kept per project, by safe names only`, async () => {
    const { store, name } = await make();
    const a = name('A'),
      b = name('B');
    await store.write(a, '{}', null);
    await store.write(b, '{}', null);
    assert.deepEqual(await store.takes(a), []);
    await store.writeTake(a, 'take-2.wav', new Uint8Array([4, 5]));
    await store.writeTake(a, 'take-1.wav', new Uint8Array([1, 2, 3]));
    assert.deepEqual(await store.takes(a), ['take-1.wav', 'take-2.wav']);
    assert.deepEqual(await store.takes(b), []);
    assert.deepEqual([...new Uint8Array(await store.readTake(a, 'take-1.wav'))], [1, 2, 3]);
    await assert.rejects(store.writeTake(a, '../evil.wav', new Uint8Array([1])), /not a take/);
  });

  test(`${label}: samples are kept per project, by safe names only`, async () => {
    const { store, name } = await make();
    const a = name('A'),
      b = name('B');
    await store.write(a, '{}', null);
    await store.write(b, '{}', null);
    assert.deepEqual(await store.samples(a), []);
    await store.writeSample(a, 'Pad C3.aiff', new Uint8Array([4, 5]));
    await store.writeSample(a, 'kick.wav', new Uint8Array([1, 2, 3]));
    assert.deepEqual((await store.samples(a)).sort(), ['Pad C3.aiff', 'kick.wav']);
    assert.deepEqual(await store.samples(b), []);
    assert.deepEqual([...new Uint8Array(await store.readSample(a, 'kick.wav'))], [1, 2, 3]);
    for (const bad of ['../evil.wav', '.hidden.wav', 'a/b.wav', 'notes.txt'])
      await assert.rejects(store.writeSample(a, bad, new Uint8Array([1])), /not a sample/);
  });

  test(`${label}: audio tracks' files are kept per project, apart from the samples, by safe names only`, async () => {
    const { store, name } = await make();
    const a = name('A'),
      b = name('B');
    await store.write(a, '{}', null);
    await store.write(b, '{}', null);
    assert.deepEqual(await store.audio(a), []);
    await store.writeAudio(a, 'Vocal take.wav', new Uint8Array([4, 5]));
    assert.deepEqual(await store.audio(a), ['Vocal take.wav']);
    assert.deepEqual(await store.samples(a), []);
    assert.deepEqual(await store.audio(b), []);
    assert.deepEqual([...new Uint8Array(await store.readAudio(a, 'Vocal take.wav'))], [4, 5]);
    for (const bad of ['../evil.wav', '.hidden.wav', 'a/b.wav', 'notes.txt'])
      await assert.rejects(store.writeAudio(a, bad, new Uint8Array([1])), /not a sample/);
  });

  test(`${label}: saves one after another keep the last`, async () => {
    const { store, name } = await make();
    const a = name('A');
    let v = await store.write(a, '0', null);
    for (let i = 1; i <= 20; i++) v = await store.write(a, String(i), v);
    assert.deepEqual(await store.read(a), { text: '20', version: v });
  });
}
