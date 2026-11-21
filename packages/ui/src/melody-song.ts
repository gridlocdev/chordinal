// New from Melody (PRD §9.4): the selected clip's melody, and the chords over it, composed into a song. The song is
// a preview in the window, with the customizer docked beside it; every change composes it again, and playback carries
// on from where it is. The project waits, untouched, until the preview replaces it (one undo step), goes into a new
// project once it's saved, or is cancelled.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { guessChords, bpmAt, pitchClass, MODES } from '@chordinal/lib';
import type { Mode } from '@chordinal/lib';
import { beatsPerBar, meterAt, findClip, history } from '@chordinal/daw';
import type { History, Project } from '@chordinal/daw';
import { compose, toProject, planSong, genreProfile, EMOTIONS, FORMS, ROLES } from '@chordinal/composer';
import type { SongSpec } from '@chordinal/composer';
import { chordsOf, sketchSection, melodySongSpec, ONCE, SKETCH_EMOTION } from '@chordinal/sketch';
import type { MelodySong, SketchBand, SketchSection } from '@chordinal/sketch';
import {
  hist,
  project,
  projectName,
  saved,
  selected,
  selectedClip,
  picked,
  chordRange,
  beat,
  notify,
  songPreview,
} from './store.ts';
import type { ClipRef, ChordRange } from './store.ts';
import { edit, save, openNew } from './document.ts';
import { stop } from './player.ts';
import { keyFor } from './recording.ts';
import { errorText } from './errors.ts';

export { ONCE };
export type { MelodySong };

/** the keys the customizer offers, by name, one per pitch class */
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** the melody the song is made around: the clip's notes as a section, in the meter it was played in */
interface Source {
  title: string;
  meter: string;
  section: SketchSection;
}

/** the window as it was before the preview took it, to put back */
interface Stash {
  hist: History;
  saved: Project | null;
  name: string;
  selected: string | null;
  selectedClip: ClipRef | null;
  picked: Set<string>;
  chordRange: ChordRange | null;
  beat: number;
}

/** the customizer, while it's open: what it chose, and the last thing composing said when it failed */
export interface Customizer {
  choices: MelodySong;
  error: string;
}

export const customizer: Signal<Customizer | null> = signal(null);

let source: Source | null = null;
let stash: Stash | null = null;

const isMode = (m: string): m is Mode => Object.hasOwn(MODES, m);

/** the section types of a form the melody can go in: all but its intro and outro */
export function melodySections(form: string): string[] {
  if (form === ONCE) return [];
  return [...new Set(FORMS[form] ?? [])].filter((t) => t !== 'intro' && t !== 'outro');
}

/** where the melody goes in a form by default: its chorus, else its A, else its verse, else its first section */
export function defaultSection(form: string): string {
  const types = melodySections(form);
  return ['chorus', 'A', 'verse'].find((t) => types.includes(t)) ?? types[0] ?? 'verse';
}

/** what a feeling and a genre bring, as the composer plans them: the tempo, form, band, groove, swing, dynamics and
 * style; the key, mode, seed, lift and ending stay as they are */
export function styleDefaults(c: MelodySong, meter: string): MelodySong {
  const spec: SongSpec = {
    emotion: c.feeling,
    ...(c.genre && { genre: c.genre }),
    seed: c.seed,
    key: c.key,
    ...(isMode(c.mode) && { mode: c.mode }),
    meter,
  };
  const plan = planSong(spec);
  const band = Object.fromEntries(ROLES.map((r) => [r, plan.band[r] ?? null])) as unknown as SketchBand;
  const form = genreProfile(c.genre || undefined).form ?? EMOTIONS[c.feeling]?.form ?? 'ballad';
  return {
    ...c,
    tempo: plan.song.tempo,
    form,
    melodyIn: defaultSection(form),
    band,
    groove: plan.song.grooveName,
    swing: plan.song.swing,
    dynamics: plan.song.dynamics,
    style: { ...plan.song.style },
  };
}

/** a change to the choices, with what follows from it: a new feeling or genre brings its own defaults, a new form its
 * own melody section */
export function changed(c: MelodySong, patch: Partial<MelodySong>, meter: string): MelodySong {
  let next = { ...c, ...patch };
  if (patch.feeling !== undefined || patch.genre !== undefined) next = styleDefaults(next, meter);
  else if (patch.form !== undefined && !melodySections(next.form).includes(next.melodyIn))
    next = { ...next, melodyIn: defaultSection(next.form) };
  return next;
}

/** the preview's project for the choices */
export function songFor(c: MelodySong, src: Source): Project {
  const title = `${src.title} melody`;
  const spec = melodySongSpec(c, { name: title, meter: src.meter, section: src.section }) as SongSpec;
  return { ...toProject(compose({ ...spec, title })), title };
}

/** a short seed, easy to read back and type in again */
export const rollSeed = (): string =>
  Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');

/** opens the customizer on the selected clip's melody, with the song it makes in the window */
export function newFromMelody(): void {
  if (customizer.value) return;
  const sel = selectedClip.value,
    p = project.value;
  const clip = sel && findClip(p, sel.track, sel.clip);
  if (!clip?.notes.length) {
    notify('Select a clip with a melody in it first.');
    return;
  }
  const meter = meterAt(p.meters, clip.start)?.sig ?? '4/4',
    bpb = beatsPerBar(meter);
  const notes = clip.notes.filter((n) => n.beat < clip.beats);
  const key = keyFor(notes);
  // chords put over the clip keep their reading; the rest are guessed from the melody
  const a = clip.start,
    b = clip.start + clip.beats;
  const over = p.chords.flatMap((c) => {
    if (!c.symbol || c.beat >= b || c.beat + c.beats <= a) return [];
    const from = Math.max(a, c.beat),
      to = Math.min(b, c.beat + c.beats);
    return [{ ...c, symbol: c.symbol, beat: from - a, beats: to - from }];
  });
  const chords = chordsOf({
    chords: over,
    notes,
    guesses: guessChords(notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: bpb, melody: true }),
  });
  source = { title: p.title, meter, section: sketchSection({ key, meter, melody: notes, chords }) };
  const choices = styleDefaults(
    {
      feeling: SKETCH_EMOTION,
      genre: '',
      seed: rollSeed(),
      tempo: 0,
      key: KEY_NAMES[pitchClass(key.key)] ?? 'C',
      mode: key.mode,
      form: ONCE,
      melodyIn: 'verse',
      band: { lead: null, counter: null, arp: null, chords: null, pad: null, bass: null, drums: null },
      groove: '',
      swing: 0,
      dynamics: 0.5,
      lift: false,
      ritardando: false,
      style: {},
    },
    meter,
  );
  // the project's own tempo, as it was played
  const opening = { ...choices, tempo: Math.round(bpmAt(p.tempoMap, clip.start)) };
  let song: Project;
  try {
    song = songFor(opening, source);
  } catch (e) {
    notify(`Couldn't compose from the melody: ${errorText(e)}`, 'error');
    source = null;
    return;
  }
  enter(song);
  customizer.value = { choices: opening, error: '' };
}

/** the window shows the song in place of the project, which is kept to put back */
function enter(song: Project): void {
  stash = {
    hist: hist.value,
    saved: saved.value,
    name: projectName.value,
    selected: selected.value,
    selectedClip: selectedClip.value,
    picked: picked.value,
    chordRange: chordRange.value,
    beat: beat.value,
  };
  songPreview.value = { cancel: cancelMelodySong };
  hist.value = history(song);
  selected.value = song.tracks[0]?.id ?? null;
  selectedClip.value = null;
  picked.value = new Set();
  chordRange.value = null;
  beat.value = 0;
}

/** changes the choices and composes the song again; it keeps playing from where it is, and each track keeps its mute
 * and solo */
export function customize(patch: Partial<MelodySong>): void {
  const c = customizer.value;
  if (!c || !source) return;
  let choices = { ...c.choices, ...patch },
    song: Project;
  try {
    choices = changed(c.choices, patch, source.meter);
    song = songFor(choices, source);
  } catch (e) {
    customizer.value = { choices, error: errorText(e) };
    return;
  }
  const was = new Map(project.value.tracks.map((t) => [t.name, t.mixer]));
  song = {
    ...song,
    tracks: song.tracks.map((t) => {
      const m = was.get(t.name);
      return m && (m.mute || m.solo) ? { ...t, mixer: { ...t.mixer, mute: m.mute, solo: m.solo } } : t;
    }),
  };
  const sel = project.value.tracks.find((t) => t.id === selected.value)?.name;
  hist.value = history(song);
  selected.value = song.tracks.find((t) => t.name === sel)?.id ?? song.tracks[0]?.id ?? null;
  selectedClip.value = null;
  picked.value = new Set();
  customizer.value = { choices, error: '' };
}

/** puts the project back as it was, and closes the customizer; returns the song as it was in the window */
function leave(): Project {
  const song = project.value;
  stop();
  const s = stash;
  if (s) {
    hist.value = s.hist;
    saved.value = s.saved;
    projectName.value = s.name;
    selected.value = s.selected;
    selectedClip.value = s.selectedClip;
    picked.value = s.picked;
    chordRange.value = s.chordRange;
    beat.value = s.beat;
  }
  stash = null;
  songPreview.value = null;
  customizer.value = null;
  return song;
}

/** Cancel: the project comes back as it was */
export function cancelMelodySong(): void {
  if (!customizer.value) return;
  leave();
  source = null;
}

/** Replace This Project: the song takes the project's place, keeping its title and folder; one undo step */
export function replaceWithMelodySong(): void {
  if (!customizer.value) return;
  const song = leave();
  source = null;
  edit((p) => ({ ...song, title: p.title }));
  notify(`Replaced ${project.value.title} with the song from its melody. Undo brings it back.`);
}

/** Save and Create New: the project is saved first (asking for a name if it has none), then the song opens as a new
 * project, not saved yet. If the project isn't saved, the customizer stays open. */
export async function saveAndCreateMelodySong(): Promise<void> {
  const c = customizer.value;
  if (!c) return;
  const song = leave();
  if (await save()) {
    source = null;
    await openNew(song);
    return;
  }
  enter(song);
  customizer.value = c;
}
