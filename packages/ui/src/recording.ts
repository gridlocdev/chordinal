// Whistle to MIDI: ● (or R) records a whistled melody into a new clip on the selected track, from the bar the playhead
// is in, with a bar's count-in and a click at the project's tempo. Keys played meanwhile, on the computer keyboard or
// a MIDI keyboard, are recorded instead of the whistle, into the clip the take starts in (the selected one first;
// a pattern's other clips share them), and need no microphone. With a stretch of the chord track picked, it
// records a chord instead: an arpeggio whistled freely, named and put on the chord track. Audio files dropped on a
// track are read the same way. A saved project keeps its takes' audio in projects/<name>/takes/.
//
// "New from melody" hands the selected clip and the chords over it to the composer, which writes a new project
// round them.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { mic } from '@chordinal/playback';
import { place } from './place.ts';
import { trackPitch } from '@chordinal/lib';
import { freeNotes, guessKeys } from '@chordinal/lib';
import { guessChords, nameChord } from '@chordinal/lib';
import { parseChord, chordName, chordPitchClasses, pitchName, MODES } from '@chordinal/lib';
import { encodeWav } from '@chordinal/lib';
import { bpmAt } from '@chordinal/lib';
import type { Mode, NamedKey } from '@chordinal/lib';
import { barAt, meterAt, beatsPerBar } from '@chordinal/daw';
import { makeTrack, addTrack, addClip, newId, findClip } from '@chordinal/daw';
import type { ChordSpan, MeterChange, Note } from '@chordinal/daw';
import { startRecording, takeBlock, updateRecording, stopRecording, keyBeat } from '@chordinal/playback';
import type { MicTake, Recording, TakeKind } from '@chordinal/playback';
import { analyse, chordsOf, cut, playedNotes, recordInto } from '@chordinal/sketch';
import type { TakeReading } from '@chordinal/sketch';
import { audioEngine } from '@chordinal/playback';
import { onPlayed } from './live.ts';
import type { PlayedKey } from './live.ts';
import { takingKeys } from './focus.ts';
import { sketchSection, sketchSpec } from '@chordinal/sketch';
import {
  project,
  projectName,
  selected,
  selectedClip,
  chordRange,
  beat,
  status,
  statusTone,
  notify,
  settings,
} from './store.ts';
import type { ChordRange } from './store.ts';
import { edit, newProject } from './document.ts';
import { stop } from './player.ts';
import { errorText } from './errors.ts';

const WHISTLE = { name: 'Whistle', instrument: { bank: 0, program: 73 } }; // a flute
const VELOCITY = 90;
const DEFAULT_SIG = '4/4'; // a project always has a meter; this is only for one that somehow has none

/** a key played during a melody take, at its beat in the take */
export interface RecordedKey extends PlayedKey {
  beat: number;
}

/** the take being recorded: what it is, its track (a melody's), its start beat, a chord's stretch, and the recording */
export interface Take {
  kind: TakeKind;
  track: string | null;
  start: number;
  range: ChordRange | null;
  rec: Recording;
  played: RecordedKey[];
  unhear: () => unknown;
  mic: boolean;
}

/** the take being recorded: { kind, track, start (beat), range (a chord's stretch), rec }, for the views to show. It
 * changes only as a take starts and stops: `rec` fills in place, and the lane redraws as the playhead moves. */
export const recording: Signal<Take | null> = signal(null);
let frame = 0;

/** counts the takes kept, so the list of them knows to look again */
export const takesKept: Signal<number> = signal(0);

/** the context's output latency in seconds, 0 when the browser doesn't say (or the context is offline) */
function outputLatency(): number {
  const ctx = audioEngine.context;
  return ('outputLatency' in ctx && ctx.outputLatency) || 0;
}

const isMode = (m: string): m is Mode => Object.hasOwn(MODES, m);
const sigAt = (meters: MeterChange[], at: number) => meterAt(meters, at)?.sig ?? DEFAULT_SIG;

/** the key the project is in, or the likeliest for some notes */
function keyFor(notes: { key: number; beats: number }[]): NamedKey {
  const k = project.value.key;
  if (k && isMode(k.mode)) return { key: pitchName(k.tonic, true), tonic: k.tonic, mode: k.mode };
  return (notes.length ? guessKeys(notes)[0] : undefined) ?? { key: 'C', tonic: 0, mode: 'major' };
}

/** the selected track, or a new whistle track */
function targetTrack(): string {
  const sel = selected.value;
  if (sel !== null && project.value.tracks.some((t) => t.id === sel)) return sel;
  let id = '';
  edit((p) => {
    const t = makeTrack(p, WHISTLE);
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

/** notes played on the keys during a take: into the clip under its start (the selected one first), else a new clip */
function placePlayed(trackId: string, start: number, notes: Note[]): void {
  let clip = '';
  edit((p) => {
    const sel = selectedClip.value;
    const out = recordInto(p, trackId, start, notes, sel?.track === trackId ? sel.clip : null);
    clip = out.clip;
    return out.project;
  });
  selectedClip.value = { track: trackId, clip };
  notify(`${notes.length} played note${notes.length === 1 ? '' : 's'} recorded`);
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

/** a chord for the stretch picked on the chord track, else a melody on the selected track; again to stop */
export async function record(): Promise<void> {
  if (recording.value) {
    void finish();
    return;
  }
  // nothing plays while recording: the band leaking into the mic would be heard as notes
  stop();
  const range = chordRange.value;
  const kind: TakeKind = range ? 'chord' : 'melody';
  let heard = '';
  try {
    if (!mic.on)
      await mic.start((samples, time) => {
        if (recording.value) takeBlock(recording.value.rec, samples, time);
      });
  } catch (e) {
    // a melody can still be played on the keys; a chord is only ever whistled
    heard = `No microphone: ${errorText(e)}.`;
    if (kind === 'chord' || !hasAudio()) {
      notify(`${heard} You can still drop audio files on a track.`, 'error');
      return;
    }
  }
  if (recording.value) return;
  const p = project.value;
  const at = range ? range.beat : barAt(p.meters, beat.value).start;
  const track = kind === 'melody' ? targetTrack() : null;
  const rec = startRecording({
    kind,
    tempo: Math.round(bpmAt(p.tempoMap, at)),
    meter: sigAt(p.meters, at),
    click: settings.value.click,
  });
  // keys played during a melody take (the computer keyboard or a MIDI keyboard) are kept, at their beats in it
  const played: RecordedKey[] = [];
  const unhear =
    kind === 'melody'
      ? onPlayed((e) => played.push({ ...e, beat: keyBeat(rec, e.time, outputLatency()) }))
      : () => {};
  takingKeys.value = kind === 'melody';
  recording.value = { kind, track, start: at, range, rec, played, unhear, mic: !heard };
  const doing = heard ? `${heard} Recording the keys you play…` : 'Recording…';
  notify(kind === 'chord' ? 'Whistle the chord as an arpeggio, then press ● again' : doing, 'busy');
  const step = () => {
    const r = recording.value;
    if (!r) return;
    if (!updateRecording(r.rec)) {
      void finish();
      return;
    }
    // the playhead follows the take as heard, from its bar once the count-in is over
    if (r.kind === 'melody')
      beat.value = r.start + Math.max(0, (r.rec.playhead - r.rec.origin) / r.rec.beatSec);
    notify(r.rec.countIn ? `Count-in: ${r.rec.countIn}` : r.kind === 'chord' ? status.value : doing, 'busy');
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
  takingKeys.value = false;
  r.unhear();
  // keys played win over the mic, which heard them clicking
  const notes =
    r.kind === 'melody'
      ? playedNotes(r.played, keyBeat(r.rec, audioEngine.context.currentTime, outputLatency()))
      : [];
  // a melody take always has its track
  if (notes.length && r.track !== null) {
    placePlayed(r.track, r.start, notes);
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
  if (r.kind === 'chord') chordTake(take, r.range);
  else if (r.track !== null)
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

/** a chord whistled over the stretch picked as it started: named in the project's key and put on the chord track there */
function chordTake(take: MicTake, range: ChordRange | null): void {
  const notes = freeNotes(take.frames);
  const key = keyFor(notes.map((n) => ({ beat: n.time, beats: n.seconds, key: n.key })));
  const named = nameChord(notes, key);
  if (!range || !named) {
    notify('No notes heard in that chord.');
    return;
  }
  const parsed = parseChord(named.symbol, key.tonic, key.mode);
  const chord: ChordSpan = {
    beat: range.beat,
    beats: range.beats,
    name: chordName(parsed, key.key.includes('b')),
    tones: chordPitchClasses(parsed),
    symbol: named.symbol,
  };
  edit((p) => ({
    ...p,
    chords: [...p.chords.flatMap((c) => cut(c, range.beat, range.beat + range.beats)), chord].sort(
      (a, b) => a.beat - b.beat,
    ),
  }));
  chordRange.value = null;
  notify(
    `${chord.name}${named.others.length ? ` (or ${named.others.map((o) => chordName(parseChord(o.symbol, key.tonic, key.mode))).join(', ')})` : ''}`,
  );
}

/** audio files dropped on a track: each read as a whistled melody at the project's tempo, in a clip from the bar at `at` */
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

// ── new from melody ──────────────────────────────────────────────────────────────────────────────────────────────────

/** the selected clip's notes and the chords over them, composed into a new project with a band */
export function newFromMelody(): void {
  const sel = selectedClip.value,
    p = project.value;
  const clip = sel && findClip(p, sel.track, sel.clip);
  if (!clip?.notes.length) {
    notify('Select a clip with a melody in it first.');
    return;
  }
  const meter = sigAt(p.meters, clip.start),
    bpb = beatsPerBar(meter);
  const notes = clip.notes.filter((n) => n.beat < clip.beats);
  const key = keyFor(notes);
  // chords whistled over the clip keep their reading; the rest are guessed from the melody
  const a = clip.start,
    b = clip.start + clip.beats;
  const whistled = p.chords.flatMap((c) => {
    if (!c.symbol || c.beat >= b || c.beat + c.beats <= a) return [];
    const from = Math.max(a, c.beat),
      to = Math.min(b, c.beat + c.beats);
    return [{ ...c, symbol: c.symbol, beat: from - a, beats: to - from }];
  });
  const chords = chordsOf({
    chords: whistled,
    notes,
    guesses: guessChords(notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: bpb, melody: true }),
  });
  const section = sketchSection({ key, meter, melody: notes, chords });
  const tempo = Math.round(bpmAt(p.tempoMap, clip.start));
  void newProject({
    title: `${p.title} melody`,
    spec: sketchSpec({ name: `${p.title} melody`, key, tempo, meter, section }),
  });
}
