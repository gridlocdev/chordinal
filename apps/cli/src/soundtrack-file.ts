// A game's soundtrack file, which `chordinal render` reads: JSON, `{ "tracks": [{ id, project, loop?, trim?, ...extra }] }`,
// with `project` a project folder (relative to the file), and what the timing needs read back from each project. Pure.
import { bpmAt } from '@chordinal/lib';
import { beatsPerBar, meterAt } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import type { LoopSections, SoundtrackScore } from './soundtrack.ts';

export interface SoundtrackTrack {
  id: string;
  /** the project folder, as the file names it */
  project: string;
  /** the sections a looping track repeats, as [first, end) indexes into the project's markers; null plays once */
  loop: LoopSections | null;
  /** the file starts at the loop's start: the sections before it only ring into it */
  trim: boolean;
  /** every other field: the game's own, copied into the tracks-data file */
  extra: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** the tracks of a soundtrack file (its parsed JSON), checked; `file` names it in errors */
export function soundtrackOf(json: unknown, file: string): SoundtrackTrack[] {
  const tracks = isRecord(json) ? json.tracks : undefined;
  if (!Array.isArray(tracks)) throw new Error(`${file} has no "tracks" list`);
  const seen = new Set<string>();
  return tracks.map((t: unknown, i) => {
    if (!isRecord(t)) throw new Error(`${file}: tracks[${i}] isn't an object`);
    const { id, project, loop = null, trim = false, ...extra } = t;
    const where = typeof id === 'string' ? `${file}: ${id}` : `${file}: tracks[${i}]`;
    if (typeof id !== 'string' || !id) throw new Error(`${where} has no id`);
    if (seen.has(id)) throw new Error(`${where} is listed twice`);
    seen.add(id);
    if (typeof project !== 'string' || !project) throw new Error(`${where} names no project folder`);
    let sections: LoopSections | null = null;
    if (loop !== null) {
      const pair: unknown[] = Array.isArray(loop) ? loop : [];
      const [first, end] = pair;
      if (
        pair.length !== 2 ||
        typeof first !== 'number' ||
        typeof end !== 'number' ||
        !Number.isInteger(first) ||
        !Number.isInteger(end)
      )
        throw new Error(`${where}: loop is [first, end] section indexes, or null`);
      sections = [first, end];
    }
    if (typeof trim !== 'boolean') throw new Error(`${where}: trim is true or false`);
    return { id, project, loop: sections, trim, extra };
  });
}

/** what the timing needs, read from a project: its sections are its markers, each typed by its meta's `type` */
export function scoreOfProject(p: Project): SoundtrackScore & { title: string; tempo: number } {
  const sig = (beat: number): string => meterAt(p.meters, beat)?.sig ?? '4/4';
  const marks = p.markers.length ? p.markers : [{ beat: 0, name: 'Song', meta: {} }];
  const sections = marks.map((m, i) => {
    const type = m.meta?.type;
    return {
      type: typeof type === 'string' ? type : m.name,
      label: m.name,
      beat: m.beat,
      beats: (marks[i + 1]?.beat ?? p.length) - m.beat,
      beatsPerBar: beatsPerBar(sig(m.beat)),
    };
  });
  return {
    title: p.title,
    tempo: Math.round(bpmAt(p.tempoMap, 0) * 1000) / 1000,
    beats: p.length,
    beatsPerBar: beatsPerBar(sig(0)),
    tempoMap: p.tempoMap,
    sections,
  };
}
