// Seeded random edits to a project, through the undo history, checking after every step that the project holds
// together (checkInvariants), that undo and redo give back the very projects they should, and that an edit which
// changes nothing records no step. Replay a failing seed with SEED=<n> npx vitest run packages/daw/test/random-edits.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  addAudioClip,
  audioClipsOf,
  makeAudioTrack,
  moveAudioClip,
  removeAudioClip,
  trimAudioClip,
  updateAudioClip,
  addClip,
  addMarker,
  addRow,
  addTrack,
  checkInvariants,
  commit,
  deleteTime,
  duplicateTrack,
  emptyProject,
  findPattern,
  hideRow,
  history,
  humanizeNotes,
  insertTime,
  joinClips,
  makePattern,
  makeTrack,
  makeUnique,
  moveClip,
  moveTrack,
  newId,
  nextPatternName,
  patternsOf,
  quantizeNotes,
  redo,
  removeClip,
  removeMarker,
  removeMeterChange,
  removeTempoChange,
  removeTrack,
  renameMarker,
  renamePattern,
  reverseNotes,
  scaleNotes,
  setLoop,
  setMeterAt,
  setMixer,
  setStep,
  setTempo,
  setTempoAt,
  splitAt,
  stepCount,
  stepOf,
  toggleAccent,
  undo,
  updateClip,
  updateTrack,
  writeProject,
} from '@chordinal/daw';
import type { Clip, History, Keyframe, Note, Project, Track } from '@chordinal/daw';
import { RANDOM_TIMEOUT, runRandomOps } from './support/random-ops.ts';
import type { Op, Random, RandomRun } from './support/random-ops.ts';

interface State {
  h: History;
  /** each project's file as it was when it was first the present one: undo must give back exactly that */
  files: Map<Project, string>;
  start: Project;
}

/** beats on the grids people use, and some off them */
const BEATS = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 1 / 3, 2 / 3, 1 / 6, 0.125, 7.75];
const beatIn = (r: Random, length: number) => r.int(Math.max(1, Math.floor(length))) + r.pick(BEATS);

function notes(r: Random, beats: number): Note[] {
  return Array.from({ length: r.int(7) }, () => ({
    beat: Math.min(beats, r.int(Math.ceil(beats)) + r.pick(BEATS)),
    beats: r.pick([0.25, 0.5, 1, 2, 1 / 3, 1 / 6]),
    key: r.chance(0.5) ? r.pick([36, 38, 42, 46]) : r.int(128),
    vel: 1 + r.int(127),
  })).sort((a, b) => a.beat - b.beat || a.key - b.key);
}

const present = (s: State) => s.h.present;
const tracks = (s: State) => present(s).tracks;
const clips = (s: State) => tracks(s).flatMap((t) => t.clips.map((c) => ({ t, c })));
const hasTracks = (s: State) => tracks(s).length > 0;
const hasClips = (s: State) => clips(s).length > 0;

/** commits an edit to the history, as the app does */
function edit(s: State, f: (p: Project) => Project): void {
  s.h = commit(s.h, f(s.h.present));
}

function pickClip(
  s: State,
  r: Random,
  which: (c: Clip) => boolean = () => true,
): { t: Track; c: Clip } | null {
  const found = clips(s).filter(({ c }) => which(c));
  return found.length ? r.pick(found) : null;
}

const op = (o: Op<State>): Op<State> => o;

const audioClips = (s: State) => tracks(s).flatMap((t) => audioClipsOf(t).map((c) => ({ t, c })));
const hasAudioClips = (s: State) => audioClips(s).length > 0;

const ops: Op<State>[] = [
  op({
    name: 'add track',
    weight: 2,
    run(s, r) {
      const drums = r.chance(0.4);
      const instrument = drums ? { bank: 128, program: 0 } : { bank: 0, program: r.int(128) };
      const at = r.int(tracks(s).length + 1);
      edit(s, (p) => addTrack(p, makeTrack(p, { name: r.text(), instrument }), at));
      return `at ${at}${drums ? ' (drums)' : ''}`;
    },
  }),
  op({
    name: 'add audio track',
    run(s, r) {
      const at = r.int(tracks(s).length + 1);
      edit(s, (p) => addTrack(p, makeAudioTrack(p, { name: r.text() }), at));
      return `at ${at}`;
    },
  }),
  op({
    name: 'add audio clip',
    weight: 2,
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s)),
        start = beatIn(r, present(s).length),
        seconds = r.pick([0.5, 1, 2.25, 7]),
        fadeIn = r.pick([0, 0.1, 1, 9]);
      edit(s, (p) => addAudioClip(p, t.id, { start, file: r.pick(['a.wav', 'b.mp3']), seconds, fadeIn }));
      return `on ${t.id} at ${start}, ${seconds} s`;
    },
  }),
  op({
    name: 'edit audio clip',
    weight: 2,
    when: hasAudioClips,
    run(s, r) {
      const { t, c } = r.pick(audioClips(s)),
        to = r.pick(tracks(s)),
        at = beatIn(r, present(s).length);
      switch (r.int(5)) {
        case 0:
          edit(s, (p) => moveAudioClip(p, t.id, c.id, to.id, at, r.chance(0.5)));
          return `move ${c.id} to ${to.id} at ${at}`;
        case 1:
          edit(s, (p) =>
            trimAudioClip(p, t.id, c.id, r.chance(0.5) ? 'start' : 'end', at, r.pick([1, 3, Infinity])),
          );
          return `trim ${c.id} to ${at}`;
        case 2:
          edit(s, (p) =>
            updateAudioClip(p, t.id, c.id, { fadeOut: r.pick([0, 0.5, 9]), gain: r.pick([0, 0.5, 1, 2]) }),
          );
          return `fade and gain ${c.id}`;
        case 3:
          edit(s, (p) => updateAudioClip(p, t.id, c.id, { mute: !c.mute }));
          return `mute ${c.id}`;
        default:
          edit(s, (p) => removeAudioClip(p, t.id, c.id));
          return `remove ${c.id}`;
      }
    },
  }),
  op({
    name: 'remove track',
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s));
      edit(s, (p) => removeTrack(p, t.id));
      return t.id;
    },
  }),
  op({
    name: 'move track',
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s)),
        by = r.pick([-2, -1, 1, 2]);
      edit(s, (p) => moveTrack(p, t.id, by));
      return `${t.id} by ${by}`;
    },
  }),
  op({
    name: 'duplicate track',
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s));
      edit(s, (p) => duplicateTrack(p, t.id));
      return t.id;
    },
  }),
  op({
    name: 'mixer',
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s)),
        from = r.pick(tracks(s));
      if (r.chance(0.5)) {
        const volumeDb = -r.int(40);
        edit(s, (p) => setMixer(p, t.id, { volumeDb }));
        return `${t.id} volume ${volumeDb}`;
      }
      edit(s, (p) => setMixer(p, t.id, { duck: { from: from.id, keys: [36], db: -6 } }));
      return `${t.id} ducks to ${from.id}`;
    },
  }),
  op({
    name: 'add clip',
    weight: 4,
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s)),
        beats = 1 + r.int(16),
        start = beatIn(r, present(s).length);
      edit(s, (p) => addClip(p, t.id, { id: newId(p, 'c'), start, beats, notes: notes(r, beats) }));
      return `on ${t.id} at ${start}, ${beats} beats`;
    },
  }),
  op({
    name: 'remove clip',
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s));
      edit(s, (p) => removeClip(p, t.id, c.id));
      return c.id;
    },
  }),
  op({
    name: 'move clip',
    weight: 2,
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s)),
        to = r.pick(tracks(s)),
        start = beatIn(r, present(s).length) - r.int(2),
        copy = r.chance(0.5);
      edit(s, (p) => moveClip(p, t.id, c.id, to.id, start, copy));
      return `${c.id} to ${to.id} at ${start}${copy ? ', a copy' : ''}`;
    },
  }),
  op({
    name: 'split',
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s)),
        at = c.start + r.next() * c.beats,
        one = r.chance(0.5);
      edit(s, (p) => splitAt(p, at, one ? t.id : null));
      return `at ${at}${one ? ` on ${t.id}` : ''}`;
    },
  }),
  op({
    name: 'join clips',
    when: (s) => tracks(s).some((t) => t.clips.length > 1),
    run(s, r) {
      const t = r.pick(tracks(s).filter((x) => x.clips.length > 1));
      const ids = t.clips.filter(() => r.chance(0.7)).map((c) => c.id);
      edit(s, (p) => joinClips(p, t.id, ids));
      return `${ids.join(', ')} on ${t.id}`;
    },
  }),
  op({
    name: 'edit notes',
    weight: 4,
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s));
      const how = r.pick(['quantize', 'humanize', 'scale', 'reverse', 'add', 'delete', 'velocity'] as const);
      const change = (n: Note[]): Note[] => {
        switch (how) {
          case 'quantize':
            return quantizeNotes(n, r.pick([0.25, 1 / 3, 0.5, 1]), r.pick([1, 0.5]));
          case 'humanize':
            return humanizeNotes(n, {}, r.next);
          case 'scale':
            return scaleNotes(n, r.pick([0.5, 2, 2 / 3, 1.5]));
          case 'reverse':
            return reverseNotes(n, 0, c.beats);
          case 'add':
            return [...n, ...notes(r, c.beats).slice(0, 1)];
          case 'delete':
            return n.filter(() => r.chance(0.6));
          case 'velocity':
            return n.map((x) => ({ ...x, vel: 1 + r.int(127) }));
        }
      };
      edit(s, (p) => updateClip(p, t.id, c.id, (x) => ({ ...x, notes: change(x.notes) })));
      return `${how} ${c.id}${c.pattern ? ` (${c.pattern})` : ''}`;
    },
  }),
  op({
    name: 'chance and swing',
    weight: 2,
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s));
      if (r.chance(0.5)) {
        const swing = r.pick([0, 0.25, 0.5, 0.75]);
        edit(s, (p) => updateClip(p, t.id, c.id, { swing }));
        return `swing ${c.id} ${swing}`;
      }
      const chance = r.pick([0, 0.3, 0.5, 1]);
      edit(s, (p) =>
        updateClip(p, t.id, c.id, (x) => ({
          ...x,
          notes: x.notes.map((n) => (r.chance(0.5) ? { ...n, chance } : n)),
        })),
      );
      return `chance ${chance} on ${c.id}${c.pattern ? ` (${c.pattern})` : ''}`;
    },
  }),
  op({
    name: 'resize clip',
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s)),
        beats = r.pick([1, 2, 4, 8, 3.5, 1 / 3]);
      edit(s, (p) => updateClip(p, t.id, c.id, { beats }));
      return `${c.id} to ${beats}`;
    },
  }),
  op({
    name: 'step',
    weight: 3,
    when: hasClips,
    run(s, r) {
      const { t, c } = r.pick(clips(s));
      const step = r.chance(0.2) ? r.pick([0.5, 0.125, 1 / 6]) : stepOf(c),
        i = r.int(stepCount({ ...c, step })),
        key = r.pick([36, 38, 42, 46, 49]);
      const accent = r.chance(0.3),
        on = r.chance(0.6);
      edit(s, (p) =>
        updateClip(p, t.id, c.id, (x) => ({
          ...x,
          step,
          notes: accent ? toggleAccent(x.notes, key, i, step) : setStep(x.notes, key, i, step, on),
        })),
      );
      return `${c.id} key ${key} step ${i} of ${step}${accent ? ' accent' : on ? ' on' : ' off'}`;
    },
  }),
  op({
    name: 'step rows',
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s)),
        key = r.pick([36, 37, 38, 56, 75]),
        show = r.chance(0.5);
      edit(s, (p) => updateTrack(p, t.id, (x) => (show ? addRow(x, key) : hideRow(x, key, x.clips[0]))));
      return `${show ? 'show' : 'hide'} ${key} on ${t.id}`;
    },
  }),
  op({
    name: 'make pattern',
    weight: 2,
    when: (s) => clips(s).some(({ c }) => !c.pattern),
    run(s, r) {
      const found = pickClip(s, r, (c) => !c.pattern);
      if (!found) return;
      const name = r.text();
      edit(s, (p) => makePattern(p, found.t.id, found.c.id, name));
      return found.c.id;
    },
  }),
  op({
    name: 'make unique',
    when: (s) => clips(s).some(({ c }) => c.pattern),
    run(s, r) {
      const found = pickClip(s, r, (c) => !!c.pattern);
      if (!found) return;
      edit(s, (p) => makeUnique(p, found.t.id, found.c.id));
      return found.c.id;
    },
  }),
  op({
    name: 'rename pattern',
    when: (s) => patternsOf(present(s)).length > 0,
    run(s, r) {
      const x = r.pick(patternsOf(present(s))),
        name = r.text();
      edit(s, (p) => renamePattern(p, x.id, name));
      return `${x.id} to ${JSON.stringify(name)}`;
    },
  }),
  op({
    name: 'automation',
    when: hasTracks,
    run(s, r) {
      const t = r.pick(tracks(s)),
        lane = r.pick(['tone', 'reverb', 'delay'] as const);
      const frame: Keyframe = {
        beat: beatIn(r, present(s).length),
        value: r.next(),
        curve: r.pick(['set', 'linear', 'exp']),
      };
      edit(s, (p) =>
        updateTrack(p, t.id, (x) => ({
          ...x,
          automation: {
            ...x.automation,
            [lane]: [...(x.automation[lane] ?? []), frame].sort((a, b) => a.beat - b.beat),
          },
        })),
      );
      return `${lane} on ${t.id} at ${frame.beat}`;
    },
  }),
  op({
    name: 'insert time',
    run(s, r) {
      const at = beatIn(r, present(s).length),
        beats = r.pick([1, 2, 4, 0.5, 1 / 3]);
      edit(s, (p) => insertTime(p, at, beats));
      return `${beats} at ${at}`;
    },
  }),
  op({
    name: 'delete time',
    run(s, r) {
      const length = present(s).length,
        from = beatIn(r, length),
        to = from + r.pick([1, 2, 4, 0.5, 1 / 3]);
      edit(s, (p) => deleteTime(p, from, to));
      return `${from} to ${to}`;
    },
  }),
  op({
    name: 'tempo',
    run(s, r) {
      const bpm = 40 + r.int(200),
        how = r.pick(['base', 'at', 'ramp', 'remove'] as const);
      const beat = beatIn(r, present(s).length);
      edit(s, (p) => {
        if (how === 'base') return setTempo(p, bpm);
        if (how === 'remove') return removeTempoChange(p, r.int(p.tempoMap.length));
        return setTempoAt(p, beat, bpm, { ramp: how === 'ramp' });
      });
      return `${how} ${bpm} at ${beat}`;
    },
  }),
  op({
    name: 'meter',
    run(s, r) {
      const sig = r.pick(['4/4', '3/4', '6/8', '7/8', '5/4']),
        beat = r.int(Math.floor(present(s).length)),
        remove = r.chance(0.3);
      edit(s, (p) => (remove ? removeMeterChange(p, r.int(p.meters.length)) : setMeterAt(p, beat, sig)));
      return remove ? 'remove' : `${sig} at ${beat}`;
    },
  }),
  op({
    name: 'marker',
    run(s, r) {
      const how = r.pick(['add', 'rename', 'remove'] as const),
        beat = beatIn(r, present(s).length),
        name = r.text();
      edit(s, (p) => {
        const i = r.int(Math.max(1, p.markers.length));
        if (how === 'add') return addMarker(p, beat, name);
        return how === 'rename' ? renameMarker(p, i, name) : removeMarker(p, i);
      });
      return how;
    },
  }),
  op({
    name: 'loop',
    run(s, r) {
      const from = beatIn(r, present(s).length),
        to = from + r.pick([-1, 0, 1, 4, 8]);
      edit(s, (p) => setLoop(p, r.chance(0.2) ? null : { from, to }));
      return `${from} to ${to}`;
    },
  }),
  op({
    name: 'undo',
    weight: 3,
    when: (s) => s.h.past.length > 0,
    run(s) {
      s.h = undo(s.h);
    },
  }),
  op({
    name: 'redo',
    weight: 2,
    when: (s) => s.h.future.length > 0,
    run(s) {
      s.h = redo(s.h);
    },
  }),
  op({
    name: 'edit that changes nothing',
    run(s, r) {
      const before = s.h,
        p = present(s);
      const found = pickClip(s, r);
      const t = p.tracks[0];
      const pattern = patternsOf(p)[0];
      const how = r.pick(['track', 'clip', 'pattern', 'step', 'mixer'] as const);
      edit(s, (q) => {
        if (how === 'track' && t) return updateTrack(q, t.id, { name: t.name, clips: t.clips });
        if (how === 'mixer' && t) return setMixer(q, t.id, { volumeDb: t.mixer.volumeDb });
        if (how === 'clip' && found) return updateClip(q, found.t.id, found.c.id, { start: found.c.start });
        if (how === 'pattern' && pattern) return renamePattern(q, pattern.id, pattern.name);
        if (how === 'step' && found) {
          const step = stepOf(found.c);
          const on = found.c.notes.find((n) => Math.abs(n.beat / step - Math.round(n.beat / step)) < 1e-9);
          if (on)
            return updateClip(q, found.t.id, found.c.id, (c) => {
              const after = setStep(c.notes, on.key, Math.round(on.beat / step), step, true);
              return after === c.notes ? c : { ...c, notes: after };
            });
        }
        return q;
      });
      assert.ok(s.h === before, `an edit to the ${how} that changed nothing recorded an undo step`);
      return how;
    },
  }),
];

const run: RandomRun<State> = {
  steps: 60,
  setup(r) {
    let p = emptyProject({ title: r.text(), bars: 4 + r.int(12), sig: r.pick(['4/4', '3/4', '6/8']) });
    p = addTrack(p, makeTrack(p, { name: 'Drums', instrument: { bank: 128, program: 0 } }));
    p = addTrack(p, makeTrack(p, { name: 'Keys' }));
    return { h: history(p), files: new Map(), start: p };
  },
  ops,
  check(s) {
    const p = s.h.present;
    assert.deepEqual(checkInvariants(p), []);
    const file = writeProject(p);
    const was = s.files.get(p);
    if (was === undefined) s.files.set(p, file);
    else assert.equal(file, was, 'a project in the history changed after it was made');
    if (s.h.past.length) {
      const back = undo(s.h);
      assert.ok(redo(back).present === p, 'undo then redo gives back the same project');
      const before = back.present;
      assert.equal(writeProject(before), s.files.get(before), 'undo gives back the project as it was');
    }
    for (const x of [...s.h.past, ...s.h.future])
      if (x.patterns) for (const id of x.patterns.map((y) => y.id)) assert.ok(findPattern(x, id));
  },
  finish(s) {
    let h = s.h;
    while (h.past.length) {
      h = undo(h);
      assert.equal(
        writeProject(h.present),
        s.files.get(h.present),
        'every step back gives its project as it was',
      );
    }
    // the history keeps the last 200 steps; a run has fewer, so undoing them all gives back the start
    assert.ok(h.present === s.start, 'undoing every step gives back the start');
    for (let i = 0; i < s.h.past.length; i++) h = redo(h);
    assert.ok(h.present === s.h.present, 'redoing every step gives back the last project');
  },
};

test('random edits keep the project whole, and undo and redo exact', () => runRandomOps(run), RANDOM_TIMEOUT);

// Seeds that found a bug, kept so it stays fixed. Each also has a plain test of the bug alone.

test('random seed 4: a mixer change to the values it has is no undo step', () => runRandomOps(run, [4]));

test('setMixer with the values a track has gives back the same project', () => {
  const p = addTrack(emptyProject(), makeTrack(emptyProject()));
  const t = p.tracks[0];
  assert.ok(t);
  assert.ok(setMixer(p, t.id, { volumeDb: t.mixer.volumeDb, mute: false }) === p);
  assert.notEqual(setMixer(p, t.id, { volumeDb: t.mixer.volumeDb - 1 }), p);
});

test('random seed 35: renaming a pattern to the name it has is no undo step', () => runRandomOps(run, [35]));

test('a pattern keeps its name trimmed from the start, so renaming it to that name changes nothing', () => {
  let p = addTrack(emptyProject(), makeTrack(emptyProject(), { name: ' Drums\t' }));
  const t = p.tracks[0];
  assert.ok(t);
  p = addClip(p, t.id, { id: 'c1', start: 0, beats: 4, notes: [] });
  p = makePattern(p, t.id, 'c1', nextPatternName(p, t.name));
  const x = patternsOf(p)[0];
  assert.equal(x?.name, 'Drums 1');
  assert.ok(renamePattern(p, x.id, x.name) === p);
  p = addClip(p, t.id, { id: 'c2', start: 4, beats: 4, notes: [] });
  assert.equal(patternsOf(makePattern(p, t.id, 'c2', '  ')).at(-1)?.name, 'Pattern 1');
});

test('random seed 117: a note on a cut starts at 0 in the right-hand clip', () => runRandomOps(run, [117]));

test('splitting a clip at a note on the cut leaves it at beat 0, never a hair before', () => {
  let p = addTrack(emptyProject(), makeTrack(emptyProject()));
  const t = p.tracks[0];
  assert.ok(t);
  p = addClip(p, t.id, {
    id: 'c1',
    start: 2 / 3,
    beats: 4,
    notes: [{ beat: 2, beats: 1, key: 60, vel: 100 }],
  });
  const right = splitAt(p, 2 / 3 + 2, t.id).tracks[0]?.clips[1];
  assert.equal(right?.notes[0]?.beat, 0);
});
