export {
  CHIP_RATE,
  buildChipFont,
  deltaCode,
  drumSample,
  harmonics,
  lfsrNoise,
  waveZones,
} from './chip-synth.ts';
export type {
  ChipDrum,
  ChipFontDefs,
  ChipInstrument,
  ChipKit,
  ChipLayer,
  DrumNoise,
  DrumTone,
  Harmonics,
  Wave,
  WaveShape,
} from './chip-synth.ts';
export {
  CHORD_GUESS,
  chordKey,
  chordVocabulary,
  guessChords,
  nameChord,
  scoreChord,
  toProgression,
} from './chord-guess.ts';
export type {
  BeatNote,
  ChordKind,
  FreeNote,
  GuessKey,
  GuessOptions,
  GuessedChord,
  GuessedChords,
  NamedKey,
  ScoreOptions,
  ScoredSymbol,
} from './chord-guess.ts';
export { reverbImpulse } from './impulse.ts';
export type { ImpulseOptions } from './impulse.ts';
export { readMidi, varLen, writeMidi } from './midi-file.ts';
export type { MidiFile, MidiMeter, MidiNote, MidiSong, MidiTempo, MidiTrack } from './midi-file.ts';
export { augment, develop, fragment, invert, join, retrograde, sequence } from './motif.ts';
export type { Motif, MotifNote } from './motif.ts';
export {
  MODES,
  alterToChord,
  bassOf,
  chordName,
  chordPitchClasses,
  degreePitchClass,
  degreeToKey,
  diatonicShift,
  extendChord,
  hash,
  inScale,
  isMinorMode,
  keyToDegree,
  parseChord,
  parseProgression,
  pitchClass,
  pitchName,
  toneStep,
  unalter,
} from './music-theory.ts';
export type { Chord, Extension, Mode, Scale } from './music-theory.ts';
export { isBlackKey, noteName, octaveC } from './notes.ts';
export { PITCH_FLOOR, gateFrames, trackPitch } from './pitch-track.ts';
export type { PitchFrame, PitchTrackOptions } from './pitch-track.ts';
export {
  ENV_TIME_CONSTANTS,
  VELOCITY_CUTOFF_CENTS,
  absoluteCentsToHz,
  centibelsToGain,
  envelopeLevel,
  modulated,
  sourceValue,
  sweepCents,
  timecentsToSeconds,
  voiceLevel,
  voiceParams,
} from './sf2-voice.ts';
export type { FilterSweep, VoiceEnvelope, VoiceParams, VoiceRegion, VoiceRelease } from './sf2-voice.ts';
export { GEN, defaultGenerators, parseSf2, regionsFor } from './sf2.ts';
export type { Sf2Font, Sf2Modulator, Sf2Preset, Sf2Region, Sf2Sample } from './sf2.ts';
export { beatToSeconds, bpmAt, secondsToBeat, tempoSteps } from './tempo-map.ts';
export type { TempoSegment } from './tempo-map.ts';
export {
  beatDivisions,
  clickGrid,
  fitGrid,
  freeNotes,
  guessKeys,
  measureVibrato,
  noteStarts,
  readLive,
  smoothPitch,
  spellDegree,
  toNotation,
  transcribe,
  tuningOffset,
  vibratoSummary,
  withoutGlides,
} from './transcribe.ts';
export type {
  Frame,
  Grid,
  KeyGuess,
  LiveOptions,
  LiveReading,
  TranscribeOptions,
  TranscribedNote,
  Transcription,
  Vibrato,
} from './transcribe.ts';
export { dropTwo, shellClasses, voiceChord } from './voicing.ts';
export { encodeWav, encodeWavChannels, normalize, peakOf } from './wav.ts';
