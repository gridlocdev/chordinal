// Every project in projects/ reads and writes back byte for byte (Chordinal PRD §12.2, §12.3), so opening and saving
// one in Chordinal changes nothing.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readProject, writeProject } from '../src/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../../../projects');
const files = fs
  .readdirSync(ROOT)
  .map((d) => path.join(ROOT, d, 'project.json'))
  .filter((f) => fs.existsSync(f));

test('there are projects to check', () => assert.ok(files.length > 0));

for (const file of files)
  test(`${path.basename(path.dirname(file))} reads and writes back unchanged`, () => {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(writeProject(readProject(text)), text);
  });
