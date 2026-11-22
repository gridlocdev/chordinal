// @chordinal/perform: how a song is played. The Humanize MIDI FX plays each track that has it with timing that
// breathes, swing, ghost notes, scoops, glides, vibrato and ear candy, the same way every time. Pure.
export { EAR_CANDY } from './ear-candy-data.ts';
export { planEarCandy } from './ear-candy.ts';
export type { Candy } from './ear-candy.ts';
export { HUMANIZE, HUMANIZE_ROLES, humanizeFx, scoreOf } from './humanize-fx.ts';
export type { HumanizedTrack, ProjectScore } from './humanize-fx.ts';
export { DRUM_KEYS, METERS, ROLES } from './perform-data.ts';
export type { DrumVoice, Meter, Role } from './perform-data.ts';
export { PERFORM_KNOBS, perform, swungNotes } from './perform.ts';
export type {
  PerformScore,
  PerformSection,
  PerformStyle,
  PerformTrack,
  PerformedNote,
  ScoreNote,
} from './perform.ts';
export { CHIP, EXPRESSION } from './performance-data.ts';
export type { Expression, VibratoRule } from './performance-data.ts';
export { clamp, compound, sectionAt, swingAmount, swingTime } from './time.ts';
export type { Grouped } from './time.ts';
