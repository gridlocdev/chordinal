import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FORMAT, emptyProject, writeProject } from '@chordinal/daw';
import { classifyFile } from '../src/store/classify-file.ts';

test('a project this app wrote is a project', () => {
  const r = classifyFile(writeProject(emptyProject({ title: 'A' })));
  assert.equal(r.kind, 'project');
  assert.equal(r.kind === 'project' && r.project.title, 'A');
});

test('a version 1 project from projects/ is a project', () => {
  const text = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../../projects/first-light/project.json'),
    'utf8',
  );
  assert.equal(classifyFile(text).kind, 'project');
});

test('a project from a newer Chordinal is left alone, with its version in the message', () => {
  const r = classifyFile(JSON.stringify({ format: FORMAT, version: 99 }));
  assert.equal(r.kind, 'newer');
  assert.match(r.kind === 'newer' ? r.message : '', /newer Chordinal \(project version 99\)/);
});

test('JSON that is not a project, and text that is not JSON', () => {
  for (const t of ['{}', '[]', 'null', '"x"', JSON.stringify({ format: 'something-else', version: 1 })])
    assert.equal(classifyFile(t).kind, 'other', t);
  const cut = writeProject(emptyProject({ title: 'A' })).slice(0, 40);
  assert.equal(classifyFile(cut).kind, 'damaged');
});

test('a project that fails its checks is damaged, with the reason', () => {
  const r = classifyFile(JSON.stringify({ format: FORMAT, version: 2, tracks: 'no' }));
  assert.equal(r.kind, 'damaged');
  assert.ok(r.kind === 'damaged' && r.message.length > 0);
});
