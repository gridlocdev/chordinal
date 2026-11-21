// Ornaments on a melody, as a classical pianist plays them, written into the score so the view and the MIDI file show
// them: a trill on the long note before a phrase's last, a turn on a long note, a mordent on a phrase's first long
// note, and a grace note before a leap up. Each is a chance of the style's `ornaments`, hashed so a song plays the same
// every time, and ORNAMENTS.gap seconds apart, so they decorate the line rather than bury it. A note outside the scale
// (a borrowed b6) is left plain: its neighbours aren't the scale's. A genre brings its own (`ornaments`, each a chance):
// the celtic roll (the note, above, the note, below, round a long note) and cut (a flick from above, starting a phrase
// or splitting a repeated note), a slide up from a semitone below (a country fiddle, a blues bend), and the gospel run
// down into a phrase's last note. Pure.
import { diatonicShift, hash, MODES } from '@chordinal/lib';
import type { Mode } from '@chordinal/lib';
import { ORNAMENTS } from './song-craft-data.ts';
import type { ScoreNote } from './compose.ts';
import type { Genre } from './genre-data.ts';

/** the section settings ornament() reads */
export interface OrnamentSection {
  tonic: number;
  mode: Mode;
  seed: string;
  type: string;
  n: number;
  style: { ornaments: number };
  genre?: Genre;
}

/**
 * lead: a section's melody, in order; bpm: the tempo where the section starts, where a slow tempo plays its ornaments
 * in shorter steps
 */
export function ornament(lead: ScoreNote[], sec: OrnamentSection, bpm: number): ScoreNote[] {
  const c = sec.style.ornaments ?? 0;
  const chance = {
    trill: c,
    turn: c,
    mordent: c,
    grace: c,
    roll: 0,
    cut: 0,
    slide: 0,
    run: 0,
    ...sec.genre?.ornaments,
  };
  if (!Object.values(chance).some((x) => x > 0)) return lead;
  const O = ORNAMENTS,
    step = bpm > O.slowAbove ? O.fast : O.slow;
  const near = (key: number, steps: number): number => diatonicShift(key, steps, sec.tonic, sec.mode);
  const soft = (vel: number): number => Math.max(1, vel - O.soften);
  const roll = (what: string, n: ScoreNote): number =>
    hash(sec.seed, sec.type, sec.n, 'ornament', what, n.beat) / 2 ** 32;
  // a note ends a phrase when a rest of half a beat or more, or the section's end, follows it
  const endsPhrase = (i: number): boolean => {
    const next = lead[i + 1],
      n = lead[i]!;
    return !next || next.beat - (n.beat + n.beats) >= 0.5 - 1e-9;
  };
  const startsPhrase = (i: number): boolean => i === 0 || endsPhrase(i - 1);
  const out: ScoreNote[] = [];
  let last = -Infinity;
  lead.forEach((n, i) => {
    const free =
      ((n.beat - last) * 60) / bpm >= O.gap &&
      MODES[sec.mode].includes((((n.key - sec.tonic) % 12) + 12) % 12);
    // the notes an ornament plays at the start of n, then n itself for what's left
    const run = (keys: number[]): ScoreNote[] =>
      keys.map((key, j) => ({
        key,
        beat: n.beat + j * step,
        beats: step,
        vel: j ? soft(n.vel) : n.vel,
        ornament: true,
      }));
    let notes: ScoreNote[] | null = null;
    if (
      free &&
      n.beats >= O.trill &&
      i + 1 < lead.length &&
      endsPhrase(i + 1) &&
      roll('trill', n) < Math.min(1, chance.trill * O.cadence)
    ) {
      // from the note above, alternating for most of the note, then the note itself held to the end
      const count = 2 * Math.max(1, Math.floor((n.beats * O.trillShare) / step / 2));
      notes = run(Array.from({ length: count }, (_, j) => (j % 2 ? n.key : near(n.key, 1))));
    } else if (free && n.beats >= O.roll && !endsPhrase(i) && roll('roll', n) < chance.roll)
      notes = run([n.key, near(n.key, 1), n.key, near(n.key, -1)]);
    else if (free && n.beats >= O.turn && !endsPhrase(i) && roll('turn', n) < chance.turn)
      notes = run([near(n.key, 1), n.key, near(n.key, -1)]);
    else if (free && n.beats >= O.run && endsPhrase(i) && roll('run', n) < chance.run)
      notes = run([near(n.key, 3), near(n.key, 2), near(n.key, 1)]);
    else if (free && n.beats >= O.mordent && startsPhrase(i) && roll('mordent', n) < chance.mordent)
      notes = run([n.key, near(n.key, -1)]);
    else if (
      free &&
      n.beats >= O.grace &&
      (startsPhrase(i) || lead[i - 1]!.key === n.key) &&
      roll('cut', n) < chance.cut
    )
      notes = run([near(n.key, 1)]);
    else if (
      n.beats >= O.grace &&
      i > 0 &&
      n.key - lead[i - 1]!.key >= O.slide &&
      ((n.beat - last) * 60) / bpm >= O.gap &&
      roll('slide', n) < chance.slide
    )
      notes = run([n.key - 1]);
    else if (
      free &&
      n.beats >= O.grace &&
      i > 0 &&
      n.key - lead[i - 1]!.key >= O.leap &&
      roll('grace', n) < chance.grace
    )
      notes = run([near(n.key, -1)]);
    if (!notes) {
      out.push(n);
      return;
    }
    const used = notes.length * step;
    out.push(...notes, {
      ...n,
      beat: n.beat + used,
      beats: n.beats - used,
      vel: soft(n.vel),
      written: n.beat,
    });
    last = n.beat;
  });
  return out;
}
