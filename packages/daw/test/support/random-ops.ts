// Seeded random-operation runs: a test gives the operations, how to start and what must hold after every step, and
// this runs them for a set of seeds. Name each test that uses it "random …" and give it RANDOM_TIMEOUT:
//   test('random edits keep the invariants', () => runRandomOps({ … }), RANDOM_TIMEOUT);
//
//   RUNS=<n>       how many seeds to try (default 20)
//   SEED=<n>       run this seed alone (paste it from a failure to replay it); its failure lists every step
//   SEED_BASE=<n>  the first seed of a run (default 1, so every run of the tests tries the same seeds)
//
// A failure throws with its seed and the last 30 steps. Pin a seed that found a bug as a test of its own.
// (packages/ui/test/support/random-ops.ts is the same file: each package's tests keep to their own folder.)

export interface Random {
  /** an integer in [0, max) */
  int(max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** a number in [0, 1) */
  next(): number;
  /** text that breaks naive code: empty, spaces, Unicode, emoji, right-to-left, tabs, CRLF, a byte-order mark */
  text(maxLength?: number): string;
}

export interface Op<S> {
  name: string;
  /** how often, relative to the others (default 1) */
  weight?: number;
  /** false to skip it in this state (nothing to undo, no clip to move) */
  when?(state: S): boolean;
  /** does it; returns a short note of what it chose, for the failure's list of steps */
  run(state: S, random: Random): void | string | Promise<void | string>;
}

export interface RandomRun<S> {
  setup(random: Random): S | Promise<S>;
  ops: readonly Op<S>[];
  /** what must hold: throws when something doesn't. Runs after every step. */
  check(state: S): void | Promise<void>;
  steps?: number;
  /** checks for the end of a run (undoing every step gives back the start) */
  finish?(state: S): void | Promise<void>;
  /** cleans up after each seed; its own error never hides the seed's failure */
  teardown?(state: S): void | Promise<void>;
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
    next,
    int: (max) => Math.floor(next() * max),
    chance: (p) => next() < p,
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

/** the test's timeout: a minute for the usual seeds, none when replaying a seed or trying many */
export const RANDOM_TIMEOUT = process.env.RUNS || process.env.SEED ? 0 : 60_000;

function seeds(): number[] {
  const one = process.env.SEED;
  if (one) return [Number(one)];
  const runs = Number(process.env.RUNS ?? 20);
  const base = Number(process.env.SEED_BASE ?? 1);
  return Array.from({ length: runs }, (_, i) => base + i);
}

function choose<S>(ops: readonly Op<S>[], state: S, random: Random): Op<S> | undefined {
  const ready = ops.filter((op) => op.when?.(state) ?? true);
  const total = ready.reduce((sum, op) => sum + (op.weight ?? 1), 0);
  let roll = random.next() * total;
  for (const op of ready) {
    roll -= op.weight ?? 1;
    if (roll < 0) return op;
  }
  return ready.at(-1);
}

/** runs random sequences of operations for each seed, checking what must hold after every step */
export async function runRandomOps<S>(
  run: RandomRun<S>,
  seedList: readonly number[] = seeds(),
): Promise<void> {
  for (const seed of seedList) {
    const random = createRandom(seed);
    const state = await run.setup(random);
    const log: string[] = [];
    try {
      await run.check(state);
      for (let step = 0; step < (run.steps ?? 50); step++) {
        const op = choose(run.ops, state, random);
        if (!op) break;
        // listed before it runs, so an op that throws is the last line
        log.push(`${step}: ${op.name}`);
        const detail = await op.run(state, random);
        if (detail) log[log.length - 1] += ` ${detail}`;
        await run.check(state);
      }
      log.push('finish');
      await run.finish?.(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SEED=${seed} failed after:\n${(process.env.SEED ? log : log.slice(-30)).join('\n')}\n\n${message}`,
        { cause: error },
      );
    } finally {
      try {
        await run.teardown?.(state);
      } catch (error) {
        // thrown from here, it would replace the failure above and lose the seed
        console.error(`SEED=${seed} teardown failed:`, error);
      }
    }
  }
}
