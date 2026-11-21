// The Humanize MIDI FX: plays a project's tracks the way perform.ts plays a composed score, with ear candy, ghost
// notes, swing, scoops, glides, vibrato and timing that breathes, a little differently on each pass round a loop.
// It reads each track's role from its FX settings, the sections from the markers' meta, and swing and style from the
// project's groove, so a song made by the composer plays as composed, and a track added by hand can join in.
import { trackNotes } from '@chordinal/daw';
import { beatsPerBar, meterAt } from '@chordinal/daw';
import type { FxEvent, FxType, Project } from '@chordinal/daw';
import { perform } from './perform.ts';
import type { PerformScore, PerformTrack } from './perform.ts';
import { planEarCandy } from './ear-candy.ts';
import { EAR_CANDY } from './ear-candy-data.ts';
import { ROLES } from './composer-data.ts';
import { STYLES } from './song-craft-data.ts';
import type { Style } from './song-craft-data.ts';

export const HUMANIZE = 'humanize';
export const HUMANIZE_ROLES = [...ROLES, 'echo'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const text = (v: unknown, otherwise: string): string => (typeof v === 'string' ? v : otherwise);
const num = (v: unknown, otherwise: number): number => (typeof v === 'number' ? v : otherwise);

type StyleKnob = Exclude<keyof Style, 'vibrato'>;
const isKnob = (k: string): k is StyleKnob => k !== 'vibrato' && Object.hasOwn(STYLES.plain, k);

/** the style the project's groove keeps: its number knobs, and a whistled take's vibrato */
function grooveStyle(v: unknown): Partial<Style> {
  if (!isRecord(v)) return {};
  const style: Partial<Style> = {};
  for (const [k, x] of Object.entries(v)) if (isKnob(k) && typeof x === 'number') style[k] = x;
  const vib = v.vibrato;
  if (isRecord(vib)) {
    const own: NonNullable<Style['vibrato']> = {};
    for (const k of ['rate', 'cents', 'delay', 'ramp'] as const) {
      const x = vib[k];
      if (typeof x === 'number') own[k] = x;
    }
    style.vibrato = own;
  }
  return style;
}

/** a track with the FX, as perform() reads it */
export interface HumanizedTrack extends PerformTrack {
  id: string;
  name: string;
}

/** a project as perform() reads it */
export interface ProjectScore extends PerformScore {
  tracks: HumanizedTrack[];
  loop: Project['loop'];
}

/** the score shape perform() reads, rebuilt from a project and the tracks that have the FX */
export function scoreOf(project: Project): ProjectScore {
  const g = project.groove ?? {};
  const sig = (beat: number): string => {
    const m = meterAt(project.meters, beat);
    if (!m) throw new Error('the project has no meter');
    return m.sig;
  };
  const sectionsFrom = project.markers.length ? project.markers : [{ beat: 0, name: 'Song', meta: {} }];
  const sections = sectionsFrom.map((m, i) => {
    const end = sectionsFrom[i + 1]?.beat ?? project.length;
    const meta: Record<string, unknown> = m.meta ?? {};
    const tonic = project.key?.tonic ?? 0;
    const defaults = {
      type: 'verse',
      energy: 0.5,
      scene: '',
      climax: false,
      meter: sig(m.beat),
      tonic,
      mode: project.key?.mode ?? 'major',
    };
    return {
      ...defaults,
      ...meta,
      type: text(meta.type, 'verse'),
      energy: num(meta.energy, 0.5),
      meter: text(meta.meter, sig(m.beat)),
      tonic: num(meta.tonic, tonic),
      label: m.name,
      beat: m.beat,
      beats: end - m.beat,
      beatsPerBar: beatsPerBar(sig(m.beat)),
    };
  });
  const tracks = project.tracks.flatMap((t): HumanizedTrack[] => {
    const fx = t.fx.findLast((f) => f.type === HUMANIZE);
    if (!fx) return [];
    const notes = trackNotes(t).map(({ early, ...n }) => ({
      ...n,
      ...(typeof early === 'number' && { anticipates: n.beat + early }),
    }));
    return [
      {
        id: t.id,
        role: text(fx.role, 'lead'),
        name: t.name,
        bank: t.instrument.bank,
        program: t.instrument.program,
        notes,
      },
    ];
  });
  return {
    title: text(g.salt, project.title),
    tempoMap: project.tempoMap,
    sections,
    tracks,
    chords: project.chords ?? [],
    beats: project.length,
    loop: project.loop,
    swing: num(g.swing, 0),
    swingSub: num(g.swingSub, 0.5),
    style: grooveStyle(g.style),
    seed: text(g.seed, project.title),
    sound: text(g.sound, 'gm'),
    genre: text(g.genre, ''),
  };
}

export const humanizeFx: FxType = {
  name: 'Humanize',
  perform(project, pass) {
    const score = scoreOf(project);
    const candy = planEarCandy(score, pass);
    const played = perform(score, pass, candy);
    const idOf = (role: string): string | undefined => score.tracks.find((t) => t.role === role)?.id;
    const events = candy.flatMap((c): FxEvent[] => {
      if (c.kind === 'tapeStop')
        return [{ kind: 'tapeStop', beat: c.beat, seconds: c.seconds, rate: EAR_CANDY.tapeStop.rate }];
      const track = c.kind === 'flourish' ? idOf(c.role) : undefined;
      return c.kind === 'flourish' && track
        ? [{ kind: 'sendSwell', track, beat: c.beat, beats: c.beats, send: EAR_CANDY.flourish.send }]
        : [];
    });
    return { notes: new Map(score.tracks.map((t, i) => [t.id, played[i]!])), events };
  },
};
