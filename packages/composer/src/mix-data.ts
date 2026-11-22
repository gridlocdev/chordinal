// How a composed song is mixed: each part's channel strip, ducking, auto-pan and mix movement. Content only,
// imports nothing. docs/composing.md, "Performance and mix", explains them.

// ---- Mix -------------------------------------------------------------------------------------------
// Each part's channel strip. volumeDb is the fader; pan −1..1; lowCut a high-pass in Hz, on everything but the kit
// and bass, to keep mud out of the low end; reverb and delay are send levels into the shared buses.
// Lead, bass and drums sit in the centre; the rest spread to the sides. Drums and bass stay dry, pads get the most reverb.
/** a part's channel strip: fader (dB), pan, low cut (Hz) and send levels */
export interface Strip {
  volumeDb: number;
  pan: number;
  lowCut: number;
  reverb: number;
  delay: number;
}
export const MIX: Record<string, Strip> & { chords: Strip } = {
  lead: { volumeDb: -2, pan: 0, lowCut: 150, reverb: 0.25, delay: 0.16 },
  counter: { volumeDb: -5, pan: 0.4, lowCut: 120, reverb: 0.3, delay: 0.06 },
  arp: { volumeDb: -8, pan: -0.45, lowCut: 150, reverb: 0.3, delay: 0.1 },
  chords: { volumeDb: -6, pan: -0.3, lowCut: 120, reverb: 0.2, delay: 0 },
  pad: { volumeDb: -9, pan: 0.3, lowCut: 100, reverb: 0.55, delay: 0 },
  bass: { volumeDb: -2, pan: 0, lowCut: 20, reverb: 0, delay: 0 },
  drums: { volumeDb: -3, pan: 0, lowCut: 20, reverb: 0.08, delay: 0 },
  echo: { volumeDb: -6, pan: -0.35, lowCut: 150, reverb: 0.3, delay: 0 }, // a chip song's echo of the lead
  sting: { volumeDb: -3, pan: 0, lowCut: 150, reverb: 0.35, delay: 0.25 }, // stingers over the song
};
// a slow auto-pan on these parts' strips: rate in Hz, depth in pan units
export const AUTO_PAN: Record<string, { rate: number; depth: number }> = { arp: { rate: 0.11, depth: 0.3 } };
// On every kick, these parts dip by db for `seconds`: the clean, pumping low end of a sidechain, without one.
export const DUCK: { keys: number[]; seconds: number; attack: number; db: Record<string, number> } = {
  keys: [35, 36],
  seconds: 0.1,
  attack: 0.01,
  db: { bass: 4, pad: 3 },
};
// How the mix moves through a song.
//   sweep: the tone filter on these parts closes at the start of a build (a pre-chorus) and opens across it;
//          a section rising into a chorus by `rise` energy or more sweeps over its last `bars` bars instead
//   reverb: every send is scaled up in outros, contrasting sections (bridges) and quiet sections
//   brightness: the tone filter's resting cutoff follows energy, from `low` Hz at 0 to `high` at 1, eased over a bar
//   swell: these parts' reverb sends rise by `amount` across each 4-bar phrase and fall back for the next
//   throw: a delay throw; these parts send `base` × their delay most of the time and `peak` × on a phrase's last note
export const MOVEMENT = {
  sweep: { roles: ['pad', 'arp', 'chords'], closed: 700, open: 20000, rise: 0.2, bars: 2 },
  reverb: { ending: 1.6, contrast: 1.25, quiet: 1.3, quietBelow: 0.4 },
  brightness: { roles: ['pad', 'arp', 'chords', 'counter'], low: 2500, high: 20000 },
  swell: { roles: ['pad'], amount: 1.5, bars: 4 },
  throw: { roles: ['lead'], base: 0.4, peak: 3 },
};
