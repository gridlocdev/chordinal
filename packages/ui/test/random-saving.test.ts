// Seeded random use of the open project's saving (document.ts over the save session and a MemoryStore): edits, undo,
// saves, Save As, opening, writes held back or failing, other apps changing the project, and the answers to the
// questions that follow. After every step: no save overwrote a change made elsewhere unless the user agreed, a
// conflict is always asked about, each save passes the version token it last got from that place (or none, for a
// new place or a Replace), and a project shown as saved is one that was kept there.
// Replay a failing seed with SEED=<n> npx vitest run packages/ui/test/random-saving.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, writeProject } from '@chordinal/daw';
import { edit, openNew, openProject, redo, save, saveAs, undo } from '../src/document.ts';
import { setPlace } from '../src/place.ts';
import { answer, asking } from '../src/ask.ts';
import { dirty, hist, project, projectName } from '../src/store.ts';
import { memoryStore } from '../src/store/memory-store.ts';
import type { MemoryStore } from '../src/store/memory-store.ts';
import { ConflictError } from '../src/store/project-store.ts';
import type { ProjectStore, Version } from '../src/store/project-store.ts';
import { RANDOM_TIMEOUT, runRandomOps } from './support/random-ops.ts';
import type { Op, RandomRun } from './support/random-ops.ts';

// stopping playback, which opening a project does, cancels the window's frame callback
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const NAMES = ['A', 'B', 'C'];

interface State {
  /** the projects as kept; the app reaches them through `spy` */
  store: MemoryStore;
  /** the places that hold a project */
  names: Set<string>;
  /** each place's version token as the app last read or wrote it */
  known: Map<string, Version>;
  /** how many times the user agreed to write over each place (picked it in Save As, or answered Replace), less the
   * writes with no token that used an agreement */
  agreed: Map<string, number>;
  /** every text the app read from or wrote to each place */
  kept: Map<string, Set<string>>;
  /** broken rules seen inside the store, where throwing would only turn into a failed save */
  problems: string[];
  conflicts: number;
  /** conflict questions answered */
  conflictsAsked: number;
  lastConflict: string;
  /** writes wait for this while it's set */
  hold: { promise: Promise<void>; release: () => void } | null;
  failNext: boolean;
  /** what Save As picks next: a place, or null for Cancel */
  nextName: string | null;
  /** actions started (saves, opens), and whether each has finished */
  started: { what: string; done: boolean }[];
  outside: number;
}

/** lets every promise that can move on do so (the store resolves at once unless a write is held) */
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};

function keep(s: State, name: string, text: string): void {
  const texts = s.kept.get(name) ?? new Set<string>();
  texts.add(text);
  s.kept.set(name, texts);
}

/** the store the app uses: the MemoryStore, checking each write against the rules on its way */
function spy(s: State): ProjectStore {
  const problem = (text: string) => s.problems.push(text);
  return {
    async read(name) {
      const stored = await s.store.read(name);
      s.known.set(name, stored.version);
      keep(s, name, stored.text);
      return stored;
    },
    async write(name, text, expected) {
      if (s.hold) await s.hold.promise;
      if (s.failNext) {
        s.failNext = false;
        throw new Error('disk full');
      }
      const before = s.names.has(name) ? await s.store.read(name) : null;
      const known = s.known.get(name),
        agreed = (s.agreed.get(name) ?? 0) > 0;
      if (expected !== null && expected !== known)
        problem(
          `a save to ${name} passed token ${expected}, not the one it last got there (${known ?? 'none'})`,
        );
      if (expected === null && before && !agreed)
        problem(`a save to ${name} passed no token over a project nobody agreed to replace`);
      let version: Version;
      try {
        version = await s.store.write(name, text, expected);
      } catch (e) {
        if (e instanceof ConflictError) {
          s.conflicts++;
          s.lastConflict = name;
        }
        throw e;
      }
      if (before && before.version !== known && before.text !== text && !agreed)
        problem(`a save to ${name} wrote over a change made elsewhere without asking`);
      s.known.set(name, version);
      if (expected === null && agreed) s.agreed.set(name, (s.agreed.get(name) ?? 0) - 1);
      s.names.add(name);
      keep(s, name, text);
      return version;
    },
    takes: (name) => s.store.takes(name),
    readTake: (name, file) => s.store.readTake(name, file),
    writeTake: (name, file, bytes) => s.store.writeTake(name, file, bytes),
    samples: (name) => s.store.samples(name),
    readSample: (name, file) => s.store.readSample(name, file),
    writeSample: (name, file, bytes) => s.store.writeSample(name, file, bytes),
    audio: (name) => s.store.audio(name),
    readAudio: (name, file) => s.store.readAudio(name, file),
    writeAudio: (name, file, bytes) => s.store.writeAudio(name, file, bytes),
  };
}

const agree = (s: State, name: string) => s.agreed.set(name, (s.agreed.get(name) ?? 0) + 1);

function start(s: State, what: string, action: Promise<unknown>): void {
  const entry = { what, done: false };
  s.started.push(entry);
  void action.finally(() => {
    entry.done = true;
  });
}

const free = (_s: State) => !asking.value;
const op = (o: Op<State>): Op<State> => o;

const ops: Op<State>[] = [
  op({
    name: 'edit',
    weight: 5,
    when: free,
    run(_s, r) {
      if (r.chance(0.5)) {
        const title = r.text();
        edit((p) => ({ ...p, title }));
        return `title ${JSON.stringify(title)}`;
      }
      edit((p) => ({ ...p, length: p.length + 1 }));
      return 'length';
    },
  }),
  op({
    name: 'edit that changes nothing',
    when: free,
    run() {
      const before = hist.value;
      edit((p) => p);
      assert.ok(hist.value === before, 'an edit that changed nothing recorded an undo step');
    },
  }),
  op({ name: 'undo', when: (s) => free(s) && hist.value.past.length > 0, run: () => undo() }),
  op({ name: 'redo', when: (s) => free(s) && hist.value.future.length > 0, run: () => redo() }),
  op({
    name: 'save',
    weight: 4,
    when: free,
    async run(s, r) {
      s.nextName = r.chance(0.2) ? null : r.pick(NAMES);
      if (!projectName.value && s.nextName) agree(s, s.nextName);
      start(s, 'save', save());
      await settle();
      return projectName.value ? `to ${projectName.value}` : `as ${s.nextName ?? '(cancelled)'}`;
    },
  }),
  op({
    name: 'save as',
    weight: 2,
    when: free,
    async run(s, r) {
      s.nextName = r.chance(0.2) ? null : r.pick(NAMES);
      // picking a place in Save As is agreeing to replace what's there (the desktop's dialog asks first)
      if (s.nextName) agree(s, s.nextName);
      start(s, 'save as', saveAs());
      await settle();
      return s.nextName ?? '(cancelled)';
    },
  }),
  op({
    name: 'open',
    weight: 2,
    when: (s) => free(s) && s.names.size > 0,
    async run(s, r) {
      const name = r.pick([...s.names]);
      start(s, `open ${name}`, openProject(name));
      await settle();
      return name;
    },
  }),
  op({
    name: 'changed elsewhere',
    weight: 2,
    run(s, r) {
      const name = r.chance(0.7) && projectName.value ? projectName.value : r.pick(NAMES);
      const text = writeProject(emptyProject({ title: `theirs ${++s.outside}` }));
      s.store.change(name, text);
      s.names.add(name);
      return name;
    },
  }),
  op({
    name: 'hold writes',
    when: (s) => !s.hold,
    run(s) {
      let release = () => {};
      const promise = new Promise<void>((resolve) => (release = resolve));
      s.hold = { promise, release };
    },
  }),
  op({
    name: 'let writes through',
    weight: 2,
    when: (s) => !!s.hold,
    async run(s) {
      s.hold?.release();
      s.hold = null;
      await settle();
    },
  }),
  op({
    name: 'next write fails',
    when: (s) => !s.failNext,
    run(s) {
      s.failNext = true;
    },
  }),
  op({
    name: 'answer',
    weight: 20,
    when: () => !!asking.value,
    async run(s, r) {
      const question = asking.value?.text ?? '';
      const yes = r.chance(0.5);
      if (/changed on disk/.test(question)) {
        s.conflictsAsked++;
        if (yes) agree(s, s.lastConflict);
      }
      answer(yes ? '' : null);
      await settle();
      return `${yes ? 'yes' : 'no'} to ${JSON.stringify(question)}`;
    },
  }),
];

const run: RandomRun<State> = {
  steps: 60,
  async setup() {
    const s: State = {
      store: memoryStore(),
      names: new Set(),
      known: new Map(),
      agreed: new Map(),
      kept: new Map(),
      problems: [],
      conflicts: 0,
      conflictsAsked: 0,
      lastConflict: '',
      hold: null,
      failNext: false,
      nextName: null,
      started: [],
      outside: 0,
    };
    setPlace({
      files: spy(s),
      chooseName: async (title) => (s.nextName === null ? null : { name: s.nextName, title }),
      opened: null,
      saved: null,
      askDiscard: null,
    });
    // a clean new project, whatever the last seed left
    const opened = openNew(emptyProject({ title: 'Mine' }), { clean: true });
    await settle();
    if (asking.value) answer('');
    assert.equal(await opened, true);
    return s;
  },
  ops,
  check(s) {
    assert.deepEqual(s.problems, []);
    // a conflict's question shows, or waits behind the one showing
    if (s.conflicts > s.conflictsAsked) assert.ok(asking.value, 'a conflict is asked about');
    // once every save has landed, a project shown as saved is one its place held (while a Save As is on its way the
    // window shows the new name already)
    const name = projectName.value;
    if (!dirty.value && name && s.started.every((x) => x.done))
      assert.ok(
        s.kept.get(name)?.has(writeProject(project.value)),
        `the project shows as saved, but ${name} never held it`,
      );
  },
  async finish(s) {
    s.hold?.release();
    s.hold = null;
    for (let i = 0; i < 20; i++) {
      await settle();
      if (!asking.value) break;
      if (/changed on disk/.test(asking.value.text)) s.conflictsAsked++;
      answer(null);
    }
    await settle();
    assert.deepEqual(
      s.started.filter((x) => !x.done).map((x) => x.what),
      [],
      'every save and open finishes once its questions are answered',
    );
    assert.equal(s.conflictsAsked, s.conflicts, 'every conflict was asked about');
    assert.deepEqual(s.problems, []);
  },
  async teardown(s) {
    s.hold?.release();
    for (let i = 0; i < 20 && asking.value; i++) {
      answer(null);
      await settle();
    }
  },
};

test(
  'random saving never loses a change silently and always asks about a conflict',
  () => runRandomOps(run),
  RANDOM_TIMEOUT,
);

// Seeds that found a bug, kept as tests of their own; saving-races.test.ts has each bug cut down to its steps.
// (A seed replays its steps only while the operations above stay as they are.)
test('random seed 7: a Save As while a save is on its way gives the new place no old token', () =>
  runRandomOps(run, [7]));
test('random seed 2: a project opened while a save is on its way keeps its own token', () =>
  runRandomOps(run, [2]));
test('random seed 23: a conflict asked while another question shows waits instead of replacing it', () =>
  runRandomOps(run, [23]));
test('random seed 36: a Save As asked for a project an open has replaced does nothing', () =>
  runRandomOps(run, [36]));
