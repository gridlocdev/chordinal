// Seeded random picks for random-ui.spec.ts: the same seed gives the same run, so a failure can be replayed.

export interface Random {
  /** an integer in [0, max) */
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
  /** text that breaks naive code: empty, spaces, Unicode, emoji, right-to-left, tabs, CRLF, a byte-order mark */
  text(maxLength?: number): string;
}

const PIECES = [
  '',
  ' ',
  'a',
  'Z',
  '0',
  '-',
  '#',
  '[ ]',
  '\t',
  '\n',
  '\r\n',
  'é',
  'ß',
  '漢字',
  '👩‍👩‍👧',
  'שלום',
  '​',
  '﻿',
];

export function createRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const random: Random = {
    int: (max) => Math.floor(next() * max),
    pick: (items) => {
      const item = items[random.int(items.length)];
      if (item === undefined) throw new Error('pick from an empty list');
      return item;
    },
    text: (maxLength = 12) => {
      let out = '';
      const count = random.int(maxLength + 1);
      for (let i = 0; i < count; i++) out += random.pick(PIECES);
      return out;
    },
  };
  return random;
}
