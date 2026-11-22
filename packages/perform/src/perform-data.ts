// What every performance shares: the parts (roles), the meters' beat groups and the General MIDI drum keys. Content
// only, imports nothing. The composer writes with the same ones.

/** the parts a song is arranged for */
export type Role = 'lead' | 'counter' | 'arp' | 'chords' | 'pad' | 'bass' | 'drums';
export const ROLES: Role[] = ['lead', 'counter', 'arp', 'chords', 'pad', 'bass', 'drums'];

// ---- Meters ----------------------------------------------------------------------------------------
// A meter is beat groupings, not just a count: the groups drive the accents, the drum, bass and comping patterns
// in meters a groove wasn't written for, and the melody's strong beats. Lengths are in beats (quarter notes),
// so 6/8 is three beats in two groups of a dotted quarter. sig is the written time signature.
//   roll  odd meters put a fill on the last beat of every roll-th bar, so the loop back to beat 1 sounds meant
//   cut   7 as two bars of 4/4 with the last beat cut off: abrupt on purpose
export interface Meter {
  sig: [number, number];
  beats: number;
  groups: number[];
  roll?: number;
  cut?: boolean;
}
export const METERS: Record<string, Meter> & { '4/4': Meter } = {
  '4/4': { sig: [4, 4], beats: 4, groups: [2, 2] },
  '2/4': { sig: [2, 4], beats: 2, groups: [2] },
  '3/4': { sig: [3, 4], beats: 3, groups: [3] },
  '6/8': { sig: [6, 8], beats: 3, groups: [1.5, 1.5] },
  '12/8': { sig: [12, 8], beats: 6, groups: [1.5, 1.5, 1.5, 1.5] },
  '5/4': { sig: [5, 4], beats: 5, groups: [3, 2], roll: 2 },
  '7/4': { sig: [7, 4], beats: 7, groups: [4, 3], roll: 2 },
  '7/4b': { sig: [7, 4], beats: 7, groups: [3, 4], roll: 2 },
  '7/4c': { sig: [7, 4], beats: 7, groups: [2, 3, 2], roll: 2 },
  '7/4cut': { sig: [7, 4], beats: 7, groups: [2, 2, 2, 1], roll: 1, cut: true },
  '7/8': { sig: [7, 8], beats: 3.5, groups: [1, 1, 1.5], roll: 2 },
};

// ---- Drums ------------------------------------------------------------------------------------------
export type DrumVoice =
  | 'kick'
  | 'stick'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'pedal'
  | 'open'
  | 'tomLow'
  | 'tomMid'
  | 'tomHi'
  | 'crash'
  | 'ride'
  | 'tamb';
export const DRUM_KEYS: Record<DrumVoice, number> = {
  kick: 36,
  stick: 37,
  snare: 38,
  clap: 39,
  hat: 42,
  pedal: 44,
  open: 46,
  tomLow: 45,
  tomMid: 47,
  tomHi: 50,
  crash: 49,
  ride: 51,
  tamb: 54,
};
