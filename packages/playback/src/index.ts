export { audioEngine, peak, renderPauses } from './audio-engine.ts';
export { buildEffect, dbGain, effectChain, prepareEffects } from './effects.ts';
export type { Effect, EffectChain, EffectParamTarget } from './effects.ts';
export { clipPlan, playClip } from './audio-clips.ts';
export type { ClipPlan, GainPoint } from './audio-clips.ts';
export { decodeSample, loadInstruments, presetFor } from './instruments.ts';
export type {
  LoadedAudio,
  LoadedInstrument,
  LoadedPreset,
  LoadedSample,
  LoadedSynth,
  PlayableInstrument,
  SampleReader,
} from './instruments.ts';
export { mic } from './mic.ts';
export { createMixer, dbToGain, delayTimes, panCurves, panGains } from './mixer.ts';
export type { DelayTime, Panner, ProjectMixer, Strip, StripOptions } from './mixer.ts';
export { startPitchMoves } from './pitch-moves.ts';
export { LEAD_IN, playProject } from './player.ts';
export type { ChannelMix, PlayOptions, PlaybackHandle } from './player.ts';
export { keyBeat, startRecording, stopRecording, takeBlock, updateRecording } from './recorder.ts';
export type { MicTake, Recording, TakeKind } from './recorder.ts';
export { createInstrument, findPreset, loadSoundFont, trimFonts, voicesIn } from './soundfont.ts';
export type { Instrument, LoadedFont, NoteOptions, SoundFontInstrument, Voice } from './soundfont.ts';
export { SAMPLER_VOICES, createSampler } from './sampler.ts';
export { SYNTH_VOICES, createSynth } from './synth.ts';
export { startTicker } from './ticker.ts';
export { withDrumRows } from './drum-rows.ts';
export type { LoadedRow } from './drum-rows.ts';
