// The song plan, made before any note: the form as a list of sections, each with its key, mode, meter, energy,
// cadence, harmonic rhythm, texture and arrangement; the energy curve with one clear climax; the tempo map; the loop.
// Later passes only read it. Pure and deterministic, like compose().
import { pitchClass, MODES, isMinorMode, hash } from '@chordinal/lib';
import type { Mode, TempoSegment } from '@chordinal/lib';
import { EMOTIONS, FORMS, SECTIONS, REPEAT_LIFT } from './composer-data.ts';
import type {
  Band,
  Breath,
  Cadence,
  CadenceOverrides,
  Choices,
  DrumFeel,
  Emotion,
  Extend,
  Progressions,
  Role,
  SectionDef,
} from './composer-data.ts';
import { GROOVES, ARPS, COMPING } from './patterns-data.ts';
import type { Arp, Groove } from './patterns-data.ts';
import { STYLES, VARIATION, CURVE, TEMPO, METER_CHANGE } from './song-craft-data.ts';
import type { CounterHow, Style } from './song-craft-data.ts';
import { GENRES } from './genre-data.ts';
import type { Genre, SplitProgressions } from './genre-data.ts';
import { clamp } from './meter.ts';
import type { Timeline } from './harmony.ts';
import { bpmAt } from '@chordinal/lib';
import { meterOf, nativeMeter } from './meter-patterns.ts';
import type { NamedMeter } from './meter-patterns.ts';

/** how a section's parts move together: in chords, in independent lines (the counter always plays), or the melody alone */
export type Texture = 'homophonic' | 'polyphonic' | 'solo';

/** a spec's own settings for one section type; see docs/composing.md, "The song spec" */
export interface SectionSpec {
  bars?: number;
  energy?: number;
  meter?: string;
  mode?: Mode;
  transpose?: number;
  tempo?: number;
  progression?: string;
  harmonicRhythm?: number;
  comp?: string;
  arp?: string;
  extend?: Extend | null | false;
  endOn?: Cadence | null;
  pedal?: number;
  /** a hand-written melody, or false for none */
  melody?: string | boolean;
  contour?: string;
  register?: number;
  density?: number;
  develop?: string[];
  counter?: CounterHow;
  answer?: boolean;
  texture?: Texture;
  fullness?: number;
  mute?: string[];
  unmute?: string[];
  breath?: Breath | false;
  feel?: DrumFeel;
  entries?: boolean;
  exits?: boolean;
}

/** a song spec, the input to compose(); see docs/composing.md, "The song spec". Anything left out comes from the emotion */
export interface SongSpec extends Omit<Choices, 'form'> {
  id?: string;
  title?: string;
  story?: string;
  genre?: string;
  emotion?: string;
  seed?: string | number;
  key?: string;
  tempo?: number;
  /** FORMS' name, or the section types in order */
  form?: string | string[];
  style?: string | Partial<Style>;
  band?: Band;
  dynamics?: number;
  extend?: Extend | null | false;
  swingSub?: number;
  meter?: string;
  loop?: boolean;
  /** the last chorus goes up: true a whole step, or this many semitones */
  lift?: boolean | number;
  push?: number;
  ritardando?: boolean;
  motif?: string;
  octaves?: Partial<Record<Role, number>>;
  sections?: Record<string, SectionSpec>;
  names?: Record<string, string>;
  scenes?: Record<string, string>;
}

/** a written song: a spec with its own id and title, as the catalog lists it */
export type WrittenSong = SongSpec & { id: string; title: string };

/** the song-wide choices every section starts from */
export interface Song {
  tonic: number;
  mode: Mode;
  tempo: number;
  arousal: number;
  legato: number;
  dynamics: number;
  power: boolean;
  sound: string;
  arp: Arp;
  groove: Groove;
  grooveName: string;
  style: Style;
  genre: Genre;
  extend: Extend | null;
  feelCadences: CadenceOverrides | null | undefined;
  swing: number;
  swingSub: number;
  seed: string;
  flats: boolean;
}

/** one section of the plan: the song's choices with the section's own over them */
export interface SectionPlan extends Song {
  type: string;
  n: number;
  index: number;
  base: SectionDef;
  over: SectionSpec;
  bars: number;
  beat: number;
  meter: NamedMeter;
  beatsPerBar: number;
  beats: number;
  energy: number;
  lifted: boolean;
  progression: string | undefined;
  comp: string;
  climax: boolean;
  ending: boolean;
  meterChange: boolean;
  simpleBars: number;
  fill: boolean;
  endOn: Cadence | null | undefined;
  harmonicRhythm: number;
  fullness: number;
  mute: string[];
  breath: Breath | null;
  answer: boolean;
  feel: DrumFeel | null;
  texture: Texture;
  pedal: number | null;
  entries: boolean;
  exits: boolean;
  vary: { lastBar: boolean; octave: boolean };
  counter: CounterHow;
  label: string;
  scene: string;
  /** the chords, set by compose() */
  timeline: Timeline;
}

export type Plan = ReturnType<typeof planSong>;

export function planSong(spec: SongSpec) {
  const emotion = spec.emotion ?? 'hopeful';
  const feel = EMOTIONS[emotion];
  if (!feel) throw new Error(`unknown emotion: ${emotion}`);
  // the spec's own choice, else its genre's, else its emotion's
  const genre = genreProfile(spec.genre);
  const choose = <K extends Exclude<keyof Choices, 'form'>>(field: K) =>
    spec[field] ?? genre[field] ?? feel[field];
  const mode = choose('mode');
  if (!MODES[mode]) throw new Error(`unknown mode: ${mode}`);
  // the genre's usual keys (guitar keys for country, flat keys for horns), one picked by the song's seed
  const keyName =
    spec.key ??
    (genre.keys
      ? genre.keys[hash(String(spec.seed ?? spec.title ?? spec.id ?? 'song'), 'key') % genre.keys.length]!
      : feel.key);
  const grooveName = choose('groove');
  const groove = GROOVES[grooveName];
  if (!groove) throw new Error(`unknown groove: ${grooveName}`);
  const arp = ARPS[choose('arp')];
  if (!arp) throw new Error(`unknown arpeggio: ${spec.arp}`);
  let form = Array.isArray(spec.form) ? spec.form : FORMS[spec.form ?? genre.form ?? feel.form];
  if (!form) throw new Error(`unknown form: ${spec.form}`);
  // a game loop: the intro plays once, the rest repeats, and there's no outro
  const loop = !!spec.loop;
  if (loop) {
    form = [...form];
    while (form.length > 1 && SECTIONS[form.at(-1)!]?.ending) form.pop();
  }
  const style = styleOf(spec.style ?? genre.style, feel.style);
  const band = { ...feel.band, ...genre.band, ...spec.band };
  if (band.drums !== null && grooveName === 'none') band.drums = null;

  const song: Song = {
    tonic: pitchClass(keyName),
    mode,
    tempo: spec.tempo ?? genreTempo(genre.tempo, feel) ?? feel.tempo,
    arousal: feel.arousal,
    legato: choose('legato'),
    dynamics: spec.dynamics ?? feel.dynamics,
    power: choose('power') ?? false,
    sound: choose('sound') ?? 'gm',
    arp,
    groove,
    grooveName,
    style,
    genre,
    // chord colour: the spec's, else its genre's, else its emotion's (null or false: plain triads)
    extend:
      'extend' in spec
        ? spec.extend || null
        : 'extend' in genre
          ? genre.extend || null
          : (feel.extend ?? null),
    feelCadences: feel.cadences,
    swing: choose('swing') ?? groove.swing ?? style.swing ?? 0,
    swingSub: spec.swingSub ?? 0.5,
    seed: String(spec.seed ?? spec.title ?? spec.id ?? 'song'),
    flats:
      /b/.test(keyName) ||
      keyName === 'F' ||
      (/minor|dorian|phrygian|aeolian|locrian/i.test(mode) && ['D', 'G', 'C', 'F'].includes(keyName)),
  };

  const songMeter = spec.meter ?? nativeMeter(groove);
  const seen: Record<string, number> = {};
  const lastChorus = form.lastIndexOf('chorus');
  let beat = 0,
    transpose = 0;
  const sections = form.map((type, index): SectionPlan => {
    const base = SECTIONS[type];
    if (!base) throw new Error(`unknown section: ${type}`);
    const over: SectionSpec = spec.sections?.[type] ?? {};
    const n = (seen[type] = (seen[type] ?? -1) + 1);
    const lifted = !!spec.lift && index === lastChorus && n > 0;
    if (lifted && spec.lift) transpose += spec.lift === true ? 2 : spec.lift;
    const meter = meterOf(over.meter ?? base.meter ?? songMeter);
    const bars = over.bars ?? base.bars;
    const from = base.progressionFrom;
    const progressions = progressionsFor(genre, feel, over.mode ?? mode);
    const progression =
      over.progression ??
      pickOne(progressions[type], song.seed, type) ??
      base.progression ??
      (from === undefined
        ? undefined
        : (spec.sections?.[from]?.progression ?? pickOne(progressions[from], song.seed, from))) ??
      pickOne(progressions.verse, song.seed, 'verse');
    const comp = over.comp ?? choose('comp');
    // a section may pick its own arpeggio: a sonata's left hand changes figure with the theme
    const ownArp = over.arp ? ARPS[over.arp] : arp;
    if (!COMPING[comp]) throw new Error(`unknown comp: ${comp}`);
    if (!ownArp) throw new Error(`unknown arpeggio: ${over.arp}`);
    const s: SectionPlan = {
      ...song,
      type,
      n,
      index,
      base,
      over,
      bars,
      beat,
      meter,
      beatsPerBar: meter.beats,
      beats: bars * meter.beats,
      energy: clamp((over.energy ?? base.energy) + REPEAT_LIFT * n, 0, 1),
      tonic: song.tonic + transpose + (over.transpose ?? 0),
      mode: over.mode ?? mode,
      lifted,
      progression,
      comp,
      // a hand-written tune sings its own thirds, so its chords keep them: no suspensions under it
      // ...and ends on the cadence it was written over, not the emotion's own
      feelCadences: typeof over.melody === 'string' ? null : song.feelCadences,
      extend: noSus('extend' in over ? over.extend || null : song.extend, typeof over.melody === 'string'),
      arp: ownArp,
      // set below, once every section is planned, and by compose()
      climax: false,
      ending: false,
      meterChange: false,
      simpleBars: 0,
      fill: false,
      endOn: null,
      harmonicRhythm: 1,
      fullness: 0,
      mute: [],
      breath: null,
      answer: false,
      feel: null,
      texture: 'homophonic',
      pedal: null,
      entries: false,
      exits: false,
      vary: { lastBar: false, octave: false },
      counter: 'guide',
      label: '',
      scene: '',
      timeline: [],
    };
    beat += s.beats;
    return s;
  });
  const climax = shapeEnergy(sections, beat);

  sections.forEach((s, i) => {
    const prev = sections[i - 1],
      next = sections[i + 1];
    const { base, over } = s;
    const v = VARIATION[Math.min(s.n, VARIATION.length - 1)]!;
    s.climax = s === climax;
    s.ending = !!base.ending && !next && !loop;
    s.meterChange = !!prev && prev.meter.name !== s.meter.name;
    s.simpleBars = s.meterChange ? METER_CHANGE.simpleBars : 0;
    // a fill announces whatever comes next: more energy, a build's arrival, a new meter, a new key, or the loop's top
    s.fill = next
      ? next.energy > s.energy + 0.05 || !!base.build || next.meter.name !== s.meter.name || next.lifted
      : loop;
    // two choruses in a row: the first ends deceptively, delaying the payoff; a loop's last bar leads back to its first
    s.endOn =
      'endOn' in over
        ? over.endOn
        : loop && !next
          ? 'dominant'
          : next?.type === s.type && base.endOn === 'tonic'
            ? 'deceptive'
            : (base.endOn ?? null);
    s.harmonicRhythm = over.harmonicRhythm ?? (over.progression ? 1 : (base.harmonicRhythm ?? 1));
    s.fullness = over.fullness ?? base.fullness ?? s.energy;
    s.mute = [...(base.mute ?? []), ...(over.mute ?? [])].filter((r) => !over.unmute?.includes(r));
    s.breath = next && over.breath !== false ? (over.breath ?? base.breath ?? null) : null;
    // a genre's call and response (the blues' harmonica answering each line, the gospel choir) and its counter lines
    s.answer = over.answer ?? (genre.answer?.includes(s.type) || null) ?? base.answer ?? false;
    s.feel = over.feel ?? base.feel ?? null;
    s.texture = over.texture ?? 'homophonic';
    s.pedal = over.pedal ?? null;
    s.entries = i === 0 && (over.entries ?? base.entries ?? false);
    s.exits = s.ending && (over.exits ?? base.exits ?? false);
    s.vary = { lastBar: !!v.lastBar, octave: !!v.octave };
    s.counter = over.counter ?? genre.counter?.[s.type] ?? (s.climax ? 'harmony' : (v.counter ?? 'guide'));
    s.label = label(s.type, s.n, form, spec.names);
    s.scene =
      spec.scenes?.[s.label.toLowerCase()] ??
      spec.scenes?.[`${s.type} ${s.n + 1}`] ??
      spec.scenes?.[s.type] ??
      '';
  });

  return {
    song,
    sections,
    band,
    feel,
    emotion,
    keyName,
    loop: loop ? { from: sections.find((s) => s.type !== 'intro')?.beat ?? 0, to: beat } : null,
    tempoMap: tempoMap(spec, song.tempo, sections, beat),
    beats: beat,
  };
}

/** a genre's profile (genre-data.ts) from its name, case and spacing aside: 'Bossa nova' is bossa-nova; else an empty one */
export const genreProfile = (name?: string | null): Genre =>
  GENRES[
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
  ] ?? {};

function styleOf(given: string | Partial<Style> | undefined, fallback: string): Style {
  if (typeof given === 'string' && !STYLES[given]) throw new Error(`unknown style: ${given}`);
  const own = typeof given === 'string' ? STYLES[given] : (given ?? {});
  return { ...STYLES.plain, ...STYLES[typeof given === 'string' ? given : fallback], ...own };
}

// the climax is the loudest section starting inside CURVE.window (the later one on a tie); nothing else reaches it
function shapeEnergy(sections: SectionPlan[], total: number): SectionPlan {
  const [lo, hi] = CURVE.window;
  const inside = sections.filter((s) => s.beat / total >= lo && s.beat / total <= hi);
  const climax = (inside.length ? inside : sections).reduce((best, s) =>
    s.energy >= best.energy ? s : best,
  );
  for (const s of sections)
    if (s !== climax) s.energy = Math.min(s.energy, Math.max(0, climax.energy - CURVE.margin));
  return climax;
}

/** where the energy curve peaks (a fraction of the song) and how many dips give it contrast */
export function energyShape(sections: { beat: number; beats: number; energy: number }[]): {
  peak: number;
  dips: number;
} {
  const total = sections.reduce((t, s) => t + s.beats, 0);
  const peak = sections.reduce((best, s) => (s.energy > best.energy ? s : best));
  const dips = sections.filter((s, i) => i > 0 && sections[i - 1]!.energy - s.energy >= CURVE.dip).length;
  return { peak: (peak.beat + peak.beats / 2) / total, dips };
}

// the song's tempo, pushed a little from the climax on, a section's own tempo where it has one, and a ritardando
// over an ending's last bars
function tempoMap(spec: SongSpec, tempo: number, sections: SectionPlan[], end: number): TempoSegment[] {
  const push = spec.push ?? TEMPO.push;
  const climax = sections.find((s) => s.climax);
  let map: TempoSegment[] = [{ beat: 0, bpm: tempo }];
  const rubato = sections[0]!.style.rubato ?? 0,
    R = TEMPO.rubato;
  for (const s of sections) {
    const bpm = (s.over.tempo ?? tempo) + (climax && s.index >= climax.index ? push : 0);
    const span = Math.min(R.bars, s.bars) * s.beatsPerBar;
    if (rubato > 0 && s.bars >= 2)
      for (let p = s.beat; p < s.beat + s.beats - 1e-9; p += span) {
        const len = Math.min(span, s.beat + s.beats - p),
          fast = bpm * (1 + R.up * rubato);
        map.push(
          { beat: p, bpm, to: fast },
          { beat: p + len * R.peak, bpm: fast, to: bpm * (1 - R.down * rubato) },
        );
      }
    else if (bpm !== map.at(-1)!.bpm || map.at(-1)!.to) map.push({ beat: s.beat, bpm });
  }
  // one segment per beat: the later wins (a section's first phrase starts where the song does)
  map = map.filter((seg, i) => map[i + 1]?.beat !== seg.beat);
  const last = sections.at(-1)!;
  if (last.ending && spec.ritardando !== false) {
    const r = TEMPO.ritardando;
    const from = Math.max(last.beat, end - r.bars * last.beatsPerBar);
    const bpm = bpmAt(map, from);
    map = map.filter((seg) => seg.beat < from);
    map.push({ beat: from, bpm, to: bpm * r.to }, { beat: end, bpm: bpm * r.to });
  }
  return map;
}

// 'Verse 2'; a spec's names override the defaults, e.g. { A: 'Blues chorus' }
function label(type: string, n: number, form: string[], own: Record<string, string> = {}): string {
  const count = form.filter((t) => t === type).length;
  return (own[type] ?? SECTIONS[type]!.name ?? `Section ${type}`) + (count > 1 ? ` ${n + 1}` : '');
}

// a section's colour without its suspensions, when it has a hand-written melody
function noSus(extend: Extend | null, written: boolean): Extend | null {
  if (!written || !Array.isArray(extend)) return extend;
  const kept = extend.filter((w) => !w.how.startsWith('sus'));
  return kept.length ? kept : null;
}

// A genre's progressions for the mode: written per section type, or split { bright, dark } when the genre leaves the
// mode to the emotion; a genre with none for this side plays the emotion's
function progressionsFor(genre: Genre, feel: Emotion, mode: Mode): Progressions {
  const p = genre.progressions;
  if (!p) return feel.progressions;
  if (!isSplit(p)) return p;
  return (isMinorMode(mode) ? p.dark : p.bright) ?? feel.progressions;
}

// one of a section's progressions, by the song's seed: a list gives every song in the genre its own
// split { bright, dark } progressions
const isSplit = (p: Progressions | SplitProgressions): p is SplitProgressions => !!(p.bright || p.dark);

const pickOne = (choices: string | string[] | undefined, seed: string, type: string): string | undefined =>
  Array.isArray(choices) ? choices[hash(seed, 'progression', type) % choices.length] : choices;

// a genre's tempo: one number, or its range [slow, fast], where the emotion's arousal places the song (a calm reggae
// song at the slow end, an excited one at the fast)
function genreTempo(tempo: number | [number, number] | undefined, feel: Emotion): number | undefined {
  if (!Array.isArray(tempo)) return tempo;
  return Math.round(tempo[0] + (tempo[1] - tempo[0]) * feel.arousal);
}
