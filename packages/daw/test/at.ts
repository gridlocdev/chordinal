import assert from 'node:assert/strict';

/** the item at `i` of a list (from the end when negative), failing the test when there is none */
export function at<T>(list: readonly T[] | undefined, i: number): T {
  const x = list?.at(i);
  assert.ok(x !== undefined, `no item ${i}`);
  return x;
}
