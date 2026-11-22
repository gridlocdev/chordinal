// A composed score as a project: a clip per section on each part's track, the sections as markers, the chords on the
// chord track, the mix (each part's channel strip, its automation and the ducking under the kick) baked in from
// mix-plan.ts, and the Humanize MIDI FX on every track so it's played as the composer means it. Pure.
import { emptyProject } from '@chordinal/daw';
import { planMix } from './mix-plan.ts';
import { DUCK, AUTO_PAN } from './mix-data.ts';
import { ROLE_COLORS } from './composer-data.ts';
import { METERS } from './patterns-data.ts';
import type { Clip, MeterChange, Project } from '@chordinal/daw';
import type { Score, ScoreSection } from './compose.ts';

// what a section's marker keeps for the Humanize FX and the mix: everything but where it is
const SECTION_META = [
  'type',
  'energy',
  'scene',
  'climax',
  'meter',
  'tonic',
  'mode',
] as const satisfies (keyof ScoreSection)[];

export function toProject(score: Score): Project {
  const plan = planMix(score);
  const id = (i: number): string => `t${i + 1}`;
  const drums = score.tracks.findIndex((t) => t.role === 'drums');
  const sig = (s: ScoreSection): string => (METERS[s.meter]?.sig ?? [s.beatsPerBar, 4]).join('/');
  const meters: MeterChange[] = [];
  for (const s of score.sections) {
    const last = meters.at(-1);
    if (!last || last.sig !== sig(s)) meters.push({ beat: s.beat, sig: sig(s) });
  }
  let clipId = 0;
  const tracks = score.tracks.map((t, i) => {
    const { strip, duck, frames } = plan.tracks[i]!;
    const clips: Clip[] = [];
    for (const s of score.sections) {
      const notes = t.notes
        .filter((n) => n.beat >= s.beat - 1e-9 && n.beat < s.beat + s.beats - 1e-9)
        .map(({ anticipates, ...n }) => ({
          ...n,
          beat: n.beat - s.beat,
          ...(anticipates !== undefined && { early: anticipates - n.beat }),
        }));
      if (notes.length) clips.push({ id: `c${++clipId}`, start: s.beat, beats: s.beats, notes });
    }
    return {
      id: id(i),
      name: t.name,
      color: ROLE_COLORS[t.role] ?? ROLE_COLORS.lead,
      instrument: { bank: t.bank, program: t.program },
      mixer: {
        volumeDb: strip.volumeDb,
        pan: strip.pan,
        mute: false,
        solo: false,
        lowCut: strip.lowCut,
        sends: { reverb: strip.reverb, delay: strip.delay },
        autoPan: AUTO_PAN[t.role] ?? null,
        duck: duck && drums >= 0 ? { from: id(drums), keys: DUCK.keys, db: duck } : null,
      },
      fx: [{ type: 'humanize', role: t.role }],
      automation: { tone: frames.tone, reverb: frames.reverb, ...(frames.delay && { delay: frames.delay }) },
      clips,
    };
  });
  const first = score.sections[0]!;
  return {
    ...emptyProject({ title: score.title }),
    length: score.beats,
    tempoMap: score.tempoMap,
    meters,
    key: { tonic: first.tonic, mode: first.mode },
    markers: score.sections.map((s) => ({
      beat: s.beat,
      name: s.label,
      meta: Object.fromEntries(SECTION_META.map((k) => [k, s[k]])),
    })),
    loop: score.loop,
    groove: {
      swing: score.swing,
      swingSub: score.swingSub,
      style: score.style,
      seed: score.seed,
      sound: score.sound,
      salt: score.title,
      genre: score.genre,
      ...(score.pocket && { pocket: score.pocket }),
      ...(score.tight !== undefined && { tight: score.tight }),
    },
    chords: score.chords,
    tracks,
  };
}
