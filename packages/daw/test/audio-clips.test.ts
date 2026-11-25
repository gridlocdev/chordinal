// Audio tracks and their clips (Chordinal PRD §16): made, saved as format version 3, read back, and refused when wrong;
// a project with none saves as it did.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  AUDIO_VERSION,
  PATTERN_VERSION,
  VERSION,
  addAudioClip,
  addClip,
  duplicateTrack,
  moveClip,
  addTrack,
  audioClipEnd,
  audioClipsOf,
  audioFiles,
  checkInvariants,
  emptyProject,
  isAudioTrack,
  makeAudioTrack,
  makeTrack,
  moveAudioClip,
  projectEnd,
  projectMidi,
  readProject,
  removeAudioClip,
  splitAt,
  trimAudioClip,
  updateAudioClip,
  findAudioClip,
  audioClipAt,
  insertTime,
  deleteTime,
  writeProject,
} from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import { readMidi } from '@chordinal/lib';

function withAudio(): Project {
  let p = emptyProject();
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  p = addTrack(p, { ...makeAudioTrack(p, { name: 'Vocal' }), id: 't2' });
  p = addAudioClip(p, 't2', { start: 8, file: 'vocal.wav', seconds: 4.5 });
  p = addAudioClip(p, 't2', { start: 0, file: 'count.wav', seconds: 2, gain: 0.5, fadeIn: 9 });
  return p;
}

const version = (p: Project) => (JSON.parse(writeProject(p)) as { version: number }).version;

test('an audio track holds clips in start order, each with an id of its own and its fades within it', () => {
  const p = withAudio();
  const t = p.tracks[1]!;
  assert.ok(isAudioTrack(t));
  assert.ok(!isAudioTrack(p.tracks[0]!));
  assert.deepEqual(
    audioClipsOf(t).map((c) => [c.id, c.start, c.file]),
    [
      ['a2', 0, 'count.wav'],
      ['a1', 8, 'vocal.wav'],
    ],
  );
  assert.deepEqual(audioClipsOf(t)[0], {
    id: 'a2',
    start: 0,
    file: 'count.wav',
    offset: 0,
    seconds: 2,
    gain: 0.5,
    fadeIn: 2,
    fadeOut: 0,
  });
  assert.deepEqual(audioFiles(p), ['count.wav', 'vocal.wav']);
  assert.equal(addAudioClip(p, 't1', { start: 0, file: 'x.wav', seconds: 1 }), p, 'a MIDI track takes none');
  assert.deepEqual(checkInvariants(p), []);
});

test('a project with an audio track is version 3 and reads back the same; one without is saved as before', () => {
  const p = withAudio();
  assert.equal(version(p), AUDIO_VERSION);
  assert.deepEqual(readProject(writeProject(p)), p);
  const midiOnly = { ...p, tracks: p.tracks.slice(0, 1) };
  assert.equal(version(midiOnly), VERSION);
  assert.ok(!writeProject(midiOnly).includes('"kind"'));
  assert.notEqual(PATTERN_VERSION, AUDIO_VERSION);
});

test('a file with a broken audio clip, or audio on a MIDI track, is refused with what is wrong', () => {
  const text = writeProject(withAudio());
  const broken = (f: (file: { tracks: Record<string, unknown>[] }) => void) => {
    const file = JSON.parse(text) as { tracks: Record<string, unknown>[] };
    f(file);
    return () => readProject(JSON.stringify(file));
  };
  assert.throws(
    broken((x) => ((x.tracks[1]!.audio as Record<string, unknown>[])[0]!.seconds = -1)),
    /track 2, audio clip a2 has no seconds of 0 or more/,
  );
  assert.throws(
    broken((x) => ((x.tracks[1]!.audio as Record<string, unknown>[])[1]!.id = 't1')),
    /track 2 has an audio clip with no id of its own/,
  );
  assert.throws(
    broken((x) => delete x.tracks[1]!.kind),
    /track 2 has audio clips but is not an audio track/,
  );
  assert.throws(
    broken((x) => (x.tracks[1]!.kind = 'video')),
    /track 2 is of a kind this app doesn't know/,
  );
});

test('an audio clip ends after its seconds at any tempo, and the project ends after its last clip', () => {
  let p = withAudio();
  assert.equal(audioClipEnd(p.tempoMap, { start: 8, seconds: 4.5 }), 8 + 4.5 * (p.tempoMap[0]!.bpm / 60));
  p = { ...p, length: 0, tempoMap: [{ beat: 0, bpm: 60 }] };
  assert.equal(projectEnd(p), 12.5);
  p = { ...p, tempoMap: [{ beat: 0, bpm: 120 }] };
  assert.equal(projectEnd(p), 17);
});

test('a MIDI export leaves audio tracks out', () => {
  const p = withAudio();
  const note = { beat: 0, beats: 1, key: 60, vel: 100 };
  const keys = { ...p.tracks[0]!, clips: [{ id: 'c1', start: 0, beats: 4, notes: [note] }] };
  const file = readMidi(projectMidi({ ...p, tracks: [keys, ...p.tracks.slice(1)] }));
  assert.deepEqual(
    file.tracks.map((t) => t.name),
    ['Keys'],
  );
});

const clips = (p: Project, track = 't2') =>
  audioClipsOf(p.tracks.find((t) => t.id === track)!).map((c) => [c.id, c.start, c.offset, c.seconds]);

test('a clip moves along its track or to another audio track, keeping its id; a copy gets one of its own', () => {
  let p = withAudio();
  p = addTrack(p, { ...makeAudioTrack(p, { name: 'Gtr' }), id: 't3' });
  const moved = moveAudioClip(p, 't2', 'a1', 't2', 2);
  assert.deepEqual(clips(moved), [
    ['a2', 0, 0, 2],
    ['a1', 2, 0, 4.5],
  ]);
  const across = moveAudioClip(p, 't2', 'a1', 't3', 4);
  assert.deepEqual(clips(across, 't3'), [['a1', 4, 0, 4.5]]);
  assert.deepEqual(clips(across), [['a2', 0, 0, 2]]);
  const copied = moveAudioClip(p, 't2', 'a1', 't3', 4, true);
  assert.equal(clips(copied).length, 2);
  assert.deepEqual(clips(copied, 't3'), [['a3', 4, 0, 4.5]]);
  assert.equal(moveAudioClip(p, 't2', 'a1', 't1', 4), p, 'a MIDI track takes no audio clip');
  assert.deepEqual(checkInvariants(copied), []);
});

test('a clip changed to what it is already leaves the project as it was; deleting one takes it out', () => {
  const p = withAudio();
  assert.equal(updateAudioClip(p, 't2', 'a1', { gain: 1 }), p);
  const louder = updateAudioClip(p, 't2', 'a1', { gain: 2, fadeOut: 99 });
  assert.deepEqual(findAudioClip(louder, 't2', 'a1'), {
    ...findAudioClip(p, 't2', 'a1'),
    gain: 2,
    fadeOut: 4.5,
  });
  assert.deepEqual(clips(removeAudioClip(p, 't2', 'a2')), [['a1', 8, 0, 4.5]]);
  assert.equal(audioClipAt(p, p.tracks[1]!, 10)?.id, 'a1');
  assert.equal(audioClipAt(p, p.tracks[1]!, 6), undefined);
});

test('splitting cuts an audio clip in two that play on as one, the fades going with their ends', () => {
  let p = withAudio(); // 120 BPM: 2 beats a second
  p = updateAudioClip(p, 't2', 'a1', { fadeIn: 1, fadeOut: 1, offset: 0.5 });
  const cut = splitAt(p, 11, 't2');
  assert.deepEqual(clips(cut), [
    ['a2', 0, 0, 2],
    ['a1', 8, 0.5, 1.5],
    ['a3', 11, 2, 3],
  ]);
  assert.deepEqual(
    audioClipsOf(cut.tracks[1]!).map((c) => [c.fadeIn, c.fadeOut]),
    [
      [2, 0],
      [1, 0],
      [0, 1],
    ],
  );
  assert.equal(splitAt(p, 8, 't2'), p, "nothing to cut at a clip's start");
  assert.equal(splitAt(p, 17, 't2'), p, 'or at its end');
});

test("trimming a clip's start or end moves that edge alone, never past the file's ends", () => {
  let p = withAudio();
  p = updateAudioClip(p, 't2', 'a1', { offset: 1, fadeIn: 0.5 });
  // its start a second (2 beats) later: the rest plays where it did
  assert.deepEqual(clips(trimAudioClip(p, 't2', 'a1', 'start', 10)), [
    ['a2', 0, 0, 2],
    ['a1', 10, 2, 3.5],
  ]);
  assert.equal(findAudioClip(trimAudioClip(p, 't2', 'a1', 'start', 10), 't2', 'a1')?.fadeIn, 0);
  // back before the file's start: it stops there
  assert.deepEqual(clips(trimAudioClip(p, 't2', 'a1', 'start', 0))[1], ['a1', 6, 0, 5.5]);
  // past its end: as short as a clip goes
  assert.ok(
    Math.abs(findAudioClip(trimAudioClip(p, 't2', 'a1', 'start', 40), 't2', 'a1')!.seconds - 0.01) < 1e-9,
  );
  assert.deepEqual(clips(trimAudioClip(p, 't2', 'a1', 'end', 12))[1], ['a1', 8, 1, 2]);
  assert.deepEqual(clips(trimAudioClip(p, 't2', 'a1', 'end', 40, 6))[1], ['a1', 8, 1, 5]);
});

test('putting in or taking out bars moves audio clips with the rest, and cuts one across the edit', () => {
  const p = withAudio();
  assert.deepEqual(clips(insertTime(p, 4, 4)), [
    ['a2', 0, 0, 2],
    ['a1', 12, 0, 4.5],
  ]);
  const out = deleteTime(p, 0, 8);
  assert.deepEqual(clips(out), [['a1', 0, 0, 4.5]]);
  assert.deepEqual(clips(insertTime(p, 10, 4)), [
    ['a2', 0, 0, 2],
    ['a1', 8, 0, 1],
    ['a3', 14, 1, 3.5],
  ]);
  assert.deepEqual(checkInvariants(insertTime(p, 10, 4)), []);
});

test('an audio track takes no MIDI clip, moved or added, and a copy of one has clips with ids of their own', () => {
  let p = withAudio();
  p = addClip(p, 't1', { id: 'c1', start: 0, beats: 4, notes: [] });
  assert.equal(addClip(p, 't2', { id: 'c2', start: 0, beats: 4, notes: [] }), p);
  assert.equal(moveClip(p, 't1', 'c1', 't2', 4), p, 'the clip stays where it was');
  const copied = duplicateTrack(p, 't2');
  assert.deepEqual(
    copied.tracks.map((t) => audioClipsOf(t).map((c) => c.id)),
    [[], ['a2', 'a1'], ['a3', 'a4']],
  );
  assert.deepEqual(checkInvariants(copied), []);
});
