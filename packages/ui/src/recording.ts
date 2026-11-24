// Audio to notes: ● (or R) records a melody from the microphone (sung, hummed, played) into a new clip on the selected track, from the bar the playhead
// is in, with a bar's count-in and a click at the project's tempo. Keys played meanwhile, on the computer keyboard or
// a MIDI keyboard, are recorded instead of the microphone, into the clip the take starts in (the selected one first;
// a pattern's other clips share them), and need no microphone. Audio files dropped on a track are read the same way. A saved project keeps its takes' audio in <project folder>/takes/.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { mic } from '@chordinal/playback';
import { place } from './place.ts';
import { trackPitch } from '@chordinal/lib';
import { guessKeys } from '@chordinal/lib';
import { pitchName, MODES } from '@chordinal/lib';
import { encodeWav } from '@chordinal/lib';
import { bpmAt } from '@chordinal/lib';
import type { Mode, NamedKey } from '@chordinal/lib';
import { barAt, meterAt } from '@chordinal/daw';
import { makeTrack, addTrack, addClip, newId, findClip } from '@chordinal/daw';
import type { MeterChange, Note } from '@chordinal/daw';
import { startRecording, takeBlock, updateRecording, stopRecording, keyBeat } from '@chordinal/playback';
import type { MicTake, Recording } from '@chordinal/playback';
import { analyse, playedNotes, recordInto } from '@chordinal/sketch';
import type { TakeReading } from '@chordinal/sketch';
import { audioEngine } from '@chordinal/playback';
import { onPlayed } from './live.ts';
import type { PlayedKey } from './live.ts';
import { takingKeys } from './focus.ts';
import {
  project,
  projectName,
  selected,
  selectedClip,
  beat,
  status,
  statusTone,
  notify,
  settings,
} from './store.ts';
import { edit } from './document.ts';
import { stop } from './player.ts';
import { errorText } from './errors.ts';

const MELODY = { name: 'Melody', instrument: { bank: 0, program: 73 } }; // a flute
const VELOCITY = 90;
const DEFAULT_SIG = '4/4'; // a project always has a meter; this is only for one that somehow has none

/** a key played during a melody take, at its beat in the take */
export interface RecordedKey extends PlayedKey {
  beat: number;
}

/** the take being recorded: its track, its start beat, and the recording */
export interface Take {
  track: string;
  start: number;
  rec: Recording;
  played: RecordedKey[];
  unhear: () => unknown;
  mic: boolean;
}

/** the take being recorded: { track, start (beat), rec }, for the views to show. It
 * changes only as a take starts and stops: `rec` fills in place, and the lane redraws as the playhead moves. */
export const recording: Signal<Take | null> = signal(null);
let frame = 0;

/** the notes of the melody take being recorded so far, in the project's beats: the keys played (a key still held
 * runs to the playhead), else what the mic has heard. The arrangement and the piano roll draw them as they come in. */
export const takeNotes: Signal<Note[]> = signal([]);

/** a melody take's notes so far, in the project's beats */
function notesSoFar(r: Take): Note[] {
  const notes = r.played.length
    ? playedNotes(r.played, keyBeat(r.rec, takeClock.now(), takeClock.latency()))
    : r.rec.notes
        .filter((n) => n.beat >= 0)
        .map((n) => ({ beat: n.beat, beats: n.beats, key: n.key, vel: VELOCITY }));
  return notes.map((n) => ({ ...n, beat: r.start + n.beat }));
}

/** whether two lists of notes would draw the same */
const sameNotes = (a: Note[], b: Note[]) =>
  a.length === b.length &&
  a.every((n, i) => n.key === b[i]?.key && n.beat === b[i].beat && n.beats === b[i].beats);

/** counts the takes kept, so the list of them knows to look again */
export const takesKept: Signal<number> = signal(0);

/** the context's output latency in seconds, 0 when the browser doesn't say (or the context is offline) */
function outputLatency(): number {
  const ctx = audioEngine.context;
  return ('outputLatency' in ctx && ctx.outputLatency) || 0;
}

/** the audio clock that times played keys against a take: its time now (s) and its output latency (s). Tests replace
 * it, since Node has no audio. */
export const takeClock = { now: (): number => audioEngine.context.currentTime, latency: outputLatency };

const isMode = (m: string): m is Mode => Object.hasOwn(MODES, m);
const sigAt = (meters: MeterChange[], at: number) => meterAt(meters, at)?.sig ?? DEFAULT_SIG;

/** the key the project is in, or the likeliest for some notes */
export function keyFor(notes: { key: number; beats: number }[]): NamedKey {
  const k = project.value.key;
  if (k && isMode(k.mode)) return { key: pitchName(k.tonic, true), tonic: k.tonic, mode: k.mode };
  return (notes.length ? guessKeys(notes)[0] : undefined) ?? { key: 'C', tonic: 0, mode: 'major' };
}

/** the selected track, or a new melody track */
function targetTrack(): string {
  const sel = selected.value;
  if (sel !== null && project.value.tracks.some((t) => t.id === sel)) return sel;
  let id = '';
  edit((p) => {
    const t = makeTrack(p, MELODY);
    id = t.id;
    return addTrack(p, t);
  });
  selected.value = id;
  return id;
}

/** a melody take's notes as a clip from a bar on a track */
function placeTake(trackId: string, start: number, take: Pick<TakeReading, 'notes'>, label: string): void {
  const notes = take.notes
    .filter((n) => n.beat >= 0)
    .map((n) => ({ beat: n.beat, beats: n.beats, key: n.key, vel: VELOCITY }));
  if (!notes.length) {
    notify(`No notes heard in ${label}.`);
    return;
  }
  const bpb = barAt(project.value.meters, start).beatsPerBar;
  const beats = Math.max(1, Math.ceil(Math.max(...notes.map((n) => n.beat + n.beats)) / bpb - 1e-6)) * bpb;
  let clip = '';
  edit((p) => {
    clip = newId(p, 'c');
    return addClip(p, trackId, { id: clip, start, beats, notes });
  });
  selectedClip.value = { track: trackId, clip };
  notify(`${notes.length} notes from ${label}`);
}

/** notes played on the keys during a take: into the clip under its start (the selected one first), else a new clip;
 * returns that clip's start */
function placePlayed(trackId: string, start: number, notes: Note[]): number {
  let clip = '';
  edit((p) => {
    const sel = selectedClip.value;
    const out = recordInto(p, trackId, start, notes, sel?.track === trackId ? sel.clip : null);
    clip = out.clip;
    return out.project;
  });
  selectedClip.value = { track: trackId, clip };
  notify(`${notes.length} played note${notes.length === 1 ? '' : 's'} recorded`);
  return findClip(project.value, trackId, clip)?.start ?? start;
}

/** keeps a take's audio beside a saved project */
async function keepAudio(take: MicTake): Promise<string> {
  const name = projectName.value;
  if (!name) return '';
  const files = await place.files.takes(name).catch((): string[] => []);
  const n = Math.max(0, ...files.map((f) => Number(/^take-(\d+)\.wav$/.exec(f)?.[1] ?? 0))) + 1;
  await place.files.writeTake(name, `take-${n}.wav`, encodeWav(take.samples, take.rate));
  takesKept.value++;
  return `take-${n}.wav`;
}

// ── recording ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** a melody on the selected track; again to stop */
export async function record(): Promise<void> {
  if (recording.value) {
    void finish();
    return;
  }
  // nothing plays while recording: the band leaking into the mic would be heard as notes
  stop();
  let heard = '';
  try {
    if (!mic.on)
      await mic.start((samples, time) => {
        if (recording.value) takeBlock(recording.value.rec, samples, time);
      });
  } catch (e) {
    // a melody can still be played on the keys
    heard = `No microphone: ${errorText(e)}.`;
    if (!hasAudio()) {
      notify(`${heard} You can still drop audio files on a track.`, 'error');
      return;
    }
  }
  if (recording.value) return;
  const p = project.value;
  const at = barAt(p.meters, beat.value).start;
  const track = targetTrack();
  const rec = startRecording({
    kind: 'melody',
    tempo: Math.round(bpmAt(p.tempoMap, at)),
    meter: sigAt(p.meters, at),
    click: settings.value.click,
  });
  // keys played during a melody take (the computer keyboard or a MIDI keyboard) are kept, at their beats in it
  const played: RecordedKey[] = [];
  const unhear = onPlayed((e) => played.push({ ...e, beat: keyBeat(rec, e.time, takeClock.latency()) }));
  takingKeys.value = true;
  recording.value = { track, start: at, rec, played, unhear, mic: !heard };
  const doing = heard ? `${heard} Recording the keys you play…` : 'Recording…';
  notify(doing, 'busy');
  const step = () => {
    const r = recording.value;
    if (!r) return;
    if (!updateRecording(r.rec)) {
      void finish();
      return;
    }
    // the playhead follows the take as heard, from its bar once the count-in is over
    beat.value = r.start + Math.max(0, (r.rec.playhead - r.rec.origin) / r.rec.beatSec);
    const notes = notesSoFar(r);
    if (!sameNotes(notes, takeNotes.value)) takeNotes.value = notes;
    notify(r.rec.countIn ? `Count-in: ${r.rec.countIn}` : doing, 'busy');
    frame = requestAnimationFrame(step);
  };
  step();
}

/** whether there's any sound at all to time a take on (none where Web Audio is missing) */
function hasAudio(): boolean {
  try {
    return !!audioEngine.context;
  } catch {
    return false;
  }
}

/** stops recording and reads the take */
export async function finish(): Promise<void> {
  const r = recording.value;
  if (!r) return;
  cancelAnimationFrame(frame);
  recording.value = null;
  takeNotes.value = [];
  takingKeys.value = false;
  r.unhear();
  // the playhead goes back to the start of the clip the take went into (or of the take, when nothing was kept)
  beat.value = r.start;
  // keys played win over the mic, which heard them clicking
  const notes = playedNotes(r.played, keyBeat(r.rec, takeClock.now(), takeClock.latency()));
  if (notes.length) {
    beat.value = placePlayed(r.track, r.start, notes);
    return;
  }
  if (!r.mic) {
    notify('No keys were played in that take.');
    return;
  }
  const take = stopRecording(r.rec);
  if (!take) {
    notify('That take was too short to read.');
    return;
  }
  // a melody take from the mic always has its downbeat
  placeTake(
    r.track,
    r.start,
    analyse({ ...take, kind: 'melody', downbeat: take.downbeat ?? null }),
    'the take',
  );
  const file = await keepAudio(take).catch((e: unknown) => {
    notify(errorText(e), 'error');
    return '';
  });
  if (file) notify(`${status.value} · audio kept in takes/${file}`, statusTone.value);
}

/** audio files dropped on a track: each read as a recorded melody at the project's tempo, in a clip from the bar at `at` */
export async function dropAudio(trackId: string, files: Iterable<File>, at: number): Promise<void> {
  selected.value = trackId;
  let start = barAt(project.value.meters, at).start;
  for (const file of files) {
    notify(`Reading ${file.name}…`, 'busy');
    try {
      const { samples, rate } = await mic.decode(await file.arrayBuffer());
      const p = project.value;
      const take = analyse({
        kind: 'melody',
        samples,
        rate,
        frames: trackPitch(samples, rate),
        tempo: Math.round(bpmAt(p.tempoMap, start)),
        meter: sigAt(p.meters, start),
        downbeat: null,
      });
      placeTake(trackId, start, take, file.name);
      const sel = selectedClip.value;
      const c = sel && findClip(project.value, trackId, sel.clip);
      if (c) start = c.start + c.beats;
    } catch (err) {
      notify(`${file.name}: ${errorText(err)}`, 'error');
    }
  }
}

/** a take kept with the project, read again onto a track at `at` */
export async function dropTake(trackId: string, file: string, at: number): Promise<void> {
  const name = projectName.value;
  if (!name) return;
  const bytes = await place.files.readTake(name, file).catch((e: unknown) => {
    notify(errorText(e), 'error');
    return null;
  });
  if (bytes) await dropAudio(trackId, [new File([bytes], file, { type: 'audio/wav' })], at);
}
