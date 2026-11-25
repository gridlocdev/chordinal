// Audio tracks and their clips (Chordinal PRD §16): made, saved as format version 3, read back, and refused when wrong;
// a project with none saves as it did.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  AUDIO_VERSION,
  PATTERN_VERSION,
  VERSION,
  addAudioClip,
  addTrack,
  audioClipsOf,
  audioFiles,
  checkInvariants,
  emptyProject,
  isAudioTrack,
  makeAudioTrack,
  makeTrack,
  readProject,
  writeProject,
} from '@chordinal/daw';
import type { Project } from '@chordinal/daw';

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
