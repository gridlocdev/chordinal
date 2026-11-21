import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseArgs, UsageError } from '../src/args.ts';

const KINDS = { out: 'value', mp3: 'flag', library: 'value' } as const;

test('words, flags and values, in any order, with a value after the option or after =', () => {
  const p = parseArgs(['a', '--mp3', '--out', 'dir', 'b', '--library=fluidr3'], KINDS);
  assert.deepEqual(p.positional, ['a', 'b']);
  assert.deepEqual(p.values, { out: 'dir', library: 'fluidr3' });
  assert.deepEqual([...p.flags], ['mp3']);
  assert.equal(p.help, false);
});

test('--help and -h are always taken', () => {
  assert.equal(parseArgs(['--help'], {}).help, true);
  assert.equal(parseArgs(['x', '-h'], {}).help, true);
});

test('an option the command does not take, a value missing, or a value on a flag is a usage error', () => {
  assert.throws(() => parseArgs(['--nope'], KINDS), UsageError);
  assert.throws(() => parseArgs(['--out'], KINDS), /--out needs a value/);
  assert.throws(() => parseArgs(['--out', '--mp3'], KINDS), /--out needs a value/);
  assert.throws(() => parseArgs(['--out='], KINDS), /--out needs a value/);
  assert.throws(() => parseArgs(['--mp3=yes'], KINDS), /takes no value/);
});

test('paths that look like words stay words, and the last value given wins', () => {
  const p = parseArgs(['-x', '../a b', '--out', 'one', '--out', 'two'], KINDS);
  assert.deepEqual(p.positional, ['-x', '../a b']);
  assert.equal(p.values.out, 'two');
});
