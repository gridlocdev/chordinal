import assert from 'node:assert/strict';

/** the item at `i` of a list (from the end when negative), failing the test when there is none */
export function at<T>(list: readonly T[] | undefined, i: number): T {
  const x = list?.at(i);
  assert.ok(x !== undefined, `no item ${i}`);
  return x;
}

/** the value under `key` in a record, failing the test when there is none */
export function of<T>(record: Readonly<Partial<Record<string, T>>>, key: string): T {
  const x = record[key];
  assert.ok(x !== undefined, `no ${key}`);
  return x;
}

/** a value that must be there (a find that must find), failing the test when it isn't */
export function must<T>(x: T | undefined | null, what = 'a value'): T {
  assert.ok(x !== undefined && x !== null, `no ${what}`);
  return x;
}
