// A sketch (the melody take's notes and the chords over it) as the composer reads it: a section's `melody:` and
// `progression:`, a playable spec to hear it with, and text to paste into a song. Pure.
import { toNotation, vibratoSummary } from '@chordinal/lib';
import type { NamedKey, Vibrato } from '@chordinal/lib';
import { beatsPerBar } from '@chordinal/daw';
import { toProgression } from '@chordinal/lib';
import { SKETCH_BAND, SKETCH_EMOTION } from './sketchpad-data.ts';
import type { SketchBand } from './sketchpad-data.ts';

/** a note of a sketch's melody */
export interface SketchNote {
  beat: number;
  beats: number;
  key: number;
  vibrato?: Vibrato | null;
}

/** a chord over a sketch, as a symbol in its key */
export interface SketchChord {
  beat: number;
  beats: number;
  symbol: string;
}

export interface Sketch {
  key: NamedKey;
  meter: string;
  melody?: SketchNote[];
  chords?: SketchChord[];
}

/** a section of a song spec, as the composer reads it */
export interface SketchSection {
  bars: number;
  melody?: string;
  progression?: string;
  vibrato?: { rate: number; cents: number };
}

const end = (list: { beat: number; beats: number }[]) => Math.max(0, ...list.map((x) => x.beat + x.beats));

export function sketchSection({ key, meter, melody = [], chords = [] }: Sketch): SketchSection {
  const bpb = beatsPerBar(meter);
  const section: SketchSection = {
    bars: Math.max(1, Math.ceil(Math.max(end(melody), end(chords)) / bpb - 1e-6)),
  };
  if (melody.length)
    section.melody = toNotation(melody, { tonic: key.tonic, mode: key.mode, beatsPerBar: bpb });
  if (chords.length) section.progression = toProgression(chords, bpb);
  const vib = melody.length ? vibratoSummary(melody) : null;
  if (vib) section.vibrato = { rate: vib.rate, cents: vib.cents };
  return section;
}

/** a song of one section, to hear the sketch */
export function sketchSpec({
  name = 'Sketch',
  key,
  tempo,
  meter,
  section,
}: {
  name?: string;
  key: NamedKey;
  tempo: number;
  meter: string;
  section: SketchSection;
}) {
  const { vibrato, ...body } = section;
  return {
    id: 'sketch',
    title: name,
    emotion: SKETCH_EMOTION,
    key: key.key,
    mode: key.mode,
    tempo,
    meter,
    band: SKETCH_BAND,
    form: ['verse'],
    style: { ornaments: 0, ...(vibrato && { vibrato }) },
    sections: { verse: body },
  };
}

/** a form that plays the melody once, on its own, as a single section: the sketch as it was played */
export const ONCE = 'once';

/** what New from Melody's customizer chooses (PRD §9.4) */
export interface MelodySong {
  /** an emotion's name */
  feeling: string;
  /** a genre's name, or '' for none */
  genre: string;
  seed: string;
  tempo: number;
  /** a key's name ('Eb'): the melody is moved there */
  key: string;
  /** the melody's scale degrees are read in this mode */
  mode: string;
  /** a form's name, or ONCE */
  form: string;
  /** the type of the sections that play the melody (chorus, verse, A…); the other sections are composed */
  melodyIn: string;
  band: SketchBand;
  groove: string;
  /** 0 straight, 0.67 a triplet swing */
  swing: number;
  /** 0 soft to 1 loud */
  dynamics: number;
  /** the last chorus goes up a step */
  lift: boolean;
  /** the end slows down */
  ritardando: boolean;
  /** the style the feeling and genre play in, as the composer plans it; the sketch's own touches go over it */
  style: Record<string, unknown>;
}

/** the song the customizer's choices make around the melody: its section is every section of the melody's type */
export function melodySongSpec(
  choices: MelodySong,
  { name = 'Sketch', meter, section }: { name?: string; meter: string; section: SketchSection },
) {
  const { vibrato, ...body } = section;
  const once = choices.form === ONCE;
  const type = once ? 'verse' : choices.melodyIn;
  return {
    id: 'sketch',
    title: name,
    seed: choices.seed,
    emotion: choices.feeling,
    ...(choices.genre && { genre: choices.genre }),
    key: choices.key,
    mode: choices.mode,
    tempo: choices.tempo,
    meter,
    band: choices.band,
    groove: choices.groove,
    swing: choices.swing,
    dynamics: choices.dynamics,
    lift: choices.lift,
    ritardando: choices.ritardando,
    form: once ? ['verse'] : choices.form,
    style: { ...choices.style, ornaments: 0, ...(vibrato && { vibrato }) },
    sections: { [type]: body },
  };
}
