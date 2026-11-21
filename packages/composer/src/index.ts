export { arrangeSection } from './arrange.ts';
export { CATALOG } from './catalog.ts';
export type { CatalogEntry } from './catalog.ts';
export { CHIP_SONGS } from './chip-songs-data.ts';
export { echoTrack } from './chip.ts';
export { CLASSICAL_SONGS } from './classical-songs-data.ts';
export { compose, describe, instrumentFor, sectionSeek } from './compose.ts';
export type { Score, ScoreChord, ScoreNote, ScoreSection, ScoreTrack, TrackRole } from './compose.ts';
export {
  ARRANGEMENT,
  CADENCES,
  CADENCE_DEGREES,
  CONTOURS,
  DYNAMICS,
  EMOTIONS,
  ENTRY_ORDER,
  FORMS,
  LEADS_IN,
  MELODY_HOME,
  MELODY_OCTAVE,
  MELODY_PACE,
  MELODY_RULES,
  MELODY_SEARCH,
  PEAK_RULE,
  RANGES,
  REPEAT_LIFT,
  RHYTHMS,
  ROLES,
  ROLE_COLORS,
  ROLE_NAMES,
  SECTIONS,
} from './composer-data.ts';
export type {
  Band,
  Breath,
  Cadence,
  CadenceChords,
  CadenceDef,
  CadenceOverrides,
  Choices,
  DrumFeel,
  Emotion,
  Extend,
  MelodyCadence,
  MelodyDef,
  MelodyRules,
  PhraseCadence,
  Progressions,
  Rhythms,
  Role,
  SectionDef,
} from './composer-data.ts';
export { EAR_CANDY } from './ear-candy-data.ts';
export { planEarCandy } from './ear-candy.ts';
export type { Candy } from './ear-candy.ts';
export { GAME_SONGS } from './game-songs-data.ts';
export { GENRES } from './genre-data.ts';
export type { Genre, GenreFeel, GenreMix, SplitProgressions } from './genre-data.ts';
export { GENRE_SONGS } from './genre-songs-data.ts';
export {
  harmonyStats,
  melodyDistance,
  melodyStats,
  numerals,
  overlap,
  readChordName,
} from './harmony-report.ts';
export type { ChordNumeral, MelodyStats } from './harmony-report.ts';
export {
  approach,
  cadenceChord,
  callAndResponse,
  harmonyVoice,
  passingDim7,
  sectionChords,
} from './harmony.ts';
export type { Pitched, SongChord, Timeline } from './harmony.ts';
export { HUMANIZE, HUMANIZE_ROLES, humanizeFx, scoreOf } from './humanize-fx.ts';
export type { HumanizedTrack, ProjectScore } from './humanize-fx.ts';
export { repeatPhrases, varyMelody } from './melody-repeats.ts';
export { keyUnder, notesPerBeat, songMotif, writeMelody } from './melody.ts';
export type { SongMotif } from './melody.ts';
export {
  bassBar,
  compBar,
  drumBar,
  meterOf,
  nativeMeter,
  rhythmsFor,
  withFeel,
  withRoll,
} from './meter-patterns.ts';
export type { DrumBarLevel, NamedMeter } from './meter-patterns.ts';
export {
  STEP,
  barAt,
  barLines,
  chordAt,
  chordTimeline,
  clamp,
  compound,
  groupStarts,
  metricWeight,
  mod,
  sectionAt,
  strongBeat,
  swingAmount,
  swingTime,
  velocity,
} from './meter.ts';
export type { BarPlace, Grouped, MetricWeight, Span, Timed } from './meter.ts';
export { planMix } from './mix-plan.ts';
export { notatedMelody, parseMelody } from './notation.ts';
export type { MelodyNote } from './notation.ts';
export { ornament } from './ornaments.ts';
export type { OrnamentSection } from './ornaments.ts';
export { PARTS, composePart, progressionOver, romanFor, styleName } from './part.ts';
export type { PartChord, PartName, PartNote, PartRequest, PartResult } from './part.ts';
export { writeArp, writeBass, writeChords, writeCounter, writeDrums, writePad } from './parts.ts';
export type { PartMemory } from './parts.ts';
export {
  ARPS,
  BASS,
  COMPING,
  COMP_QUIET,
  DRUM_KEYS,
  GROOVES,
  GROUP_CELLS,
  HAND,
  METERS,
  OFFBEAT_COMPS,
} from './patterns-data.ts';
export type {
  Arp,
  BassHit,
  BassLine,
  BassTone,
  CompHit,
  DrumLevel,
  DrumPattern,
  DrumVoice,
  Groove,
  HandArp,
  HandToken,
  Meter,
  PlainArp,
} from './patterns-data.ts';
export { perform, swungTracks } from './perform.ts';
export type { PerformScore, PerformSection, PerformTrack, PerformedNote } from './perform.ts';
export { AUTO_PAN, CHIP, DUCK, EXPRESSION, MIX, MOVEMENT } from './performance-data.ts';
export type { Expression, Strip, VibratoRule } from './performance-data.ts';
export { energyShape, genreProfile, planSong } from './plan.ts';
export type { Plan, SectionPlan, SectionSpec, Song, SongSpec, Texture, WrittenSong } from './plan.ts';
export {
  CALL_BARS,
  CURVE,
  LEITMOTIFS,
  METER_CHANGE,
  MOTIF,
  ORNAMENTS,
  PASSING,
  STYLES,
  SYNCOPATION,
  TEMPO,
  VARIATION,
  VARIATION_LIFT,
} from './song-craft-data.ts';
export type { CounterHow, MotifCost, PassingKind, Style, Variation } from './song-craft-data.ts';
export { SONGS } from './songs-data.ts';
export { syncopate } from './syncopation.ts';
export { toProject } from './to-project.ts';
