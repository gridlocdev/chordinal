// A sketch (the melody take's notes and the chords over it) as the composer reads it: a section's `melody:` and
// `progression:`, a playable spec to hear it with, and text to paste into a song. Pure.
import { toNotation, vibratoSummary } from '@chordinal/lib';
import type { NamedKey, Vibrato } from '@chordinal/lib';
import { beatsPerBar } from '@chordinal/daw';
import { toProgression } from '@chordinal/lib';
import { SKETCH_BAND, SKETCH_EMOTION } from './sketchpad-data.ts';

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
