// How a score is played: the performance's expression (timing, phrasing, ghost notes, slides, scoops, vibrato) and
// how chip songs play. Content only, imports nothing.

// ---- Performance ---------------------------------------------------------------------------------
// What perform() adds to the written notes when a song plays. The score itself stays on the grid.
export interface Expression {
  jitterMs: Record<string, number>;
  phrase: { roles: string[]; bars: number; swell: number; taper: number; follow: Record<string, number> };
  glide: {
    roles: string[];
    programs: number[];
    maxInterval: number;
    maxGapBeats: number;
    minBeats: number;
    chance: number;
    seconds: number;
  };
  ghost: {
    minEnergy: number;
    snare: { vel: [number, number]; beats: number; chance: number };
    bass: { vel: [number, number]; beats: number; chance: number };
  };
  run: { roles: string[]; maxGapBeats: number; minNotes: number; inner: number };
  scoop: { roles: string[]; programs: [number, number][]; cents: number; seconds: [number, number] };
  vibrato: VibratoRule;
}
/** late vibrato on held notes: which parts and programs, from how long a note, and how it wobbles */
export interface VibratoRule {
  roles: string[];
  programs: number[];
  minSeconds: number;
  rate: number;
  rateSpread: number;
  cents: number;
  delay: number;
  ramp: number;
}
export const EXPRESSION: Expression = {
  // timing drift in milliseconds either way, per part; kick and bass stay tight to hold the groove
  jitterMs: { lead: 12, counter: 10, arp: 5, chords: 8, pad: 15, bass: 0, drums: 0 },
  // each 4-bar phrase of these parts swells by `swell` velocity (times the style's) from start to end, and its last
  // note tapers by `taper`; with a style's swell above 1, the `follow` parts swell by that share of the extra
  phrase: { roles: ['lead', 'counter'], bars: 4, swell: 10, taper: 12, follow: { arp: 0.5 } },
  // legato slides on instruments that bend (fretless and synth bass, bowed strings, trombone, synth leads),
  // into a note that follows the last one closely, by a step or small leap, off the downbeat; `chance` of those
  glide: {
    roles: ['lead', 'counter', 'bass'],
    programs: [35, 38, 39, 40, 41, 42, 57, 80, 81, 82, 83, 84, 85, 86, 87],
    maxInterval: 5,
    maxGapBeats: 0.25,
    minBeats: 0.5,
    chance: 0.35,
    seconds: 0.08,
  },
  // late-arriving vibrato on held notes, for voices that sing: bowed strings, voices, brass, reeds, pipes, synth leads
  // ghost notes: very quiet, very short extra hits on empty sixteenths next to the backbeat (snare), and a dead
  // note just before a bass note; chance is scaled by the style's ghosts
  ghost: {
    minEnergy: 0.45,
    snare: { vel: [15, 35], beats: 0.1, chance: 0.5 },
    bass: { vel: [18, 30], beats: 0.12, chance: 0.35 },
  },
  // in a run of three or more quick notes the inner ones are softer than the first and the last
  run: { roles: ['lead', 'counter', 'arp', 'bass'], maxGapBeats: 0.5, minNotes: 3, inner: 10 },
  // the +1 trick: start a semitone low and slide up, on phrase-ending notes and on a section's last chord;
  // chance is the style's scoops. programs: ranges of GM programs that can bend (organs, strings, ensembles, winds, synths)
  scoop: {
    roles: ['lead', 'counter', 'chords', 'pad'],
    programs: [
      [16, 23],
      [40, 44],
      [48, 95],
    ],
    cents: -100,
    seconds: [0.05, 0.2],
  },
  vibrato: {
    roles: ['lead', 'counter'],
    programs: [
      40, 41, 42, 43, 52, 53, 54, 56, 57, 58, 59, 60, 64, 65, 66, 67, 68, 69, 72, 73, 74, 75, 78, 79, 80, 81,
      82, 83, 84, 85, 86, 87, 110,
    ],
    minSeconds: 0.6,
    rate: 5.5,
    rateSpread: 0.4,
    cents: 15,
    delay: 0.25,
    ramp: 0.35,
  },
};

// ---- Chip songs (spec `sound: 'chip'`) -------------------------------------------------------------
// What the NES soundtracks measured in tools/nsf-report.mjs do that other songs don't.
//   echo: a second channel repeats the lead `seconds` later (rounded to a sixteenth, at least one) at `vel` × its
//         velocity, in the bars where the countermelody rests. Mega Man 2 and DuckTales echo 8–12 frames late
//         (0.13–0.2 s). null: no echo.
//   arp: a tracker arpeggio (the `tracker` pattern) steps to the chord's next note every `frames` 60ths of a second;
//        1 is the classic shimmer, 2–3 a slower, more legible one
//   timbre: these parts change pulse width with the section, as Flash Man's lead moves between widths: a part
//           whose program is in one of `groups` (darkest to brightest) plays one step darker in a section under
//           `darker` energy and one brighter from `brighter` up. The modern widths are 50%, 25%, 12.5%; the NES ones 50%, 25%.
//   fall: on these parts, a note of `minSeconds` or more followed by `rest` beats of silence (a phrase's end), at
//         `chance`, drops `cents` over its last `seconds`
//   zap: on these parts, a note after `rest` beats of silence, in a section of `minEnergy` or more (not a quiet one), at `chance`,
//        starts `cents` above itself and sweeps down onto it over `seconds`, a pitch-envelope blip
//   mono: these parts play one note at a time, as a chip channel does: a new note cuts the one before, release tail
//         and all. The chords and pad keep their overlap, standing in for the channels a modern chip song adds.
//   staccato: on these parts, a note of `maxBeats` or less sounds for `gate` of its length (at least `minSeconds`),
//             as tracker lines cut their quick notes with a note-off a few frames in; not notes slid into or out of
//   vibrato: replaces these fields of EXPRESSION.vibrato. Chip drivers' vibrato tables are deep and start soon: the
//            leads measured wobble 10–34 cents (median about 20) from 6–10 frames in, on notes as short as an eighth.
export const CHIP = {
  echo: { seconds: 0.16, vel: 0.55 },
  arp: { frames: 1 },
  timbre: {
    roles: ['lead', 'counter', 'echo'],
    groups: [
      [83, 80, 82],
      [87, 86],
    ],
    darker: 0.5,
    brighter: 0.85,
  },
  fall: { roles: ['lead', 'counter'], cents: -700, seconds: 0.16, minSeconds: 0.28, rest: 0.75, chance: 0.6 },
  zap: { roles: ['lead'], cents: 1200, seconds: 0.045, rest: 0.75, minEnergy: 0.5, chance: 0.6 },
  mono: { roles: ['lead', 'counter', 'echo', 'arp', 'bass'] },
  staccato: { roles: ['lead', 'counter', 'echo', 'bass'], maxBeats: 0.5, gate: 0.5, minSeconds: 0.06 },
  vibrato: {
    roles: ['lead', 'counter', 'echo'],
    minSeconds: 0.3,
    rate: 6,
    cents: 25,
    delay: 0.12,
    ramp: 0.12,
  },
};
