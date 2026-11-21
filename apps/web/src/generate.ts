// Generate Part… (Chordinal PRD §8): the composer writes one part into a new clip on the selected track, over the
// selection, the loop or the whole project, in the project's tempo, meter and key, following its chords. One undo
// step; Generate Again replaces the last generated clip while it is untouched.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { barAt, beatsPerBar } from '@chordinal/daw';
import { bpmAt, MODES } from '@chordinal/lib';
import type { Mode } from '@chordinal/lib';
import {
  addTrack,
  makeTrack,
  addClip,
  removeClip,
  findClip,
  newId,
  isDrums,
  makePattern,
  nextPatternName,
  projectEnd,
} from '@chordinal/daw';
import type { Clip, Loop, Project, Track } from '@chordinal/daw';
import { composePart, PARTS } from '@chordinal/composer';
import type { PartName } from '@chordinal/composer';
import { project, selected, selectedClip, chordRange } from '@chordinal/ui';
import { edit } from '@chordinal/ui';
import { appDialog } from '@chordinal/ui';
import { trackOf } from '@chordinal/ui';

export { PARTS };

/** the dialog, when open: the track it writes on (null: a new one) */
export const generating: Signal<{ trackId: string | null } | null> = signal(null);

/** a generated clip: where it is, and the clip as it was made */
interface Made {
  trackId: string;
  clipId: string;
  clip: Clip | null;
}

/** the clips generated, newest last, for Generate Again: where each is, and the clip as it was made (an undo brings an
 * earlier one back as it was) */
const made: Made[] = [];
const KEEP = 50;

export function openGenerate(trackId: string | null = selected.value): void {
  generating.value = { trackId: trackId && trackOf(trackId) ? trackId : null };
  appDialog.value = true;
}

export function closeGenerate(): void {
  generating.value = null;
  appDialog.value = false;
}

/** the part a track's dialog starts on: drums on a drum track, the melody otherwise */
export const defaultPart = (track: Track | null | undefined): PartName =>
  track && isDrums(track) ? 'drums' : 'melody';

/** a range the dialog offers to write over */
export interface RangeChoice {
  id: 'selection' | 'loop' | 'project';
  label: string;
  range: Loop;
}

/** the ranges to write over, those that exist, in the order the dialog offers them (the first is the default) */
export function rangeChoices(p: Project = project.value): RangeChoice[] {
  const out: RangeChoice[] = [];
  const c = selectedClip.value,
    clip = c && findClip(p, c.track, c.clip);
  const sel = chordRange.value
    ? { from: chordRange.value.beat, to: chordRange.value.beat + chordRange.value.beats }
    : clip
      ? { from: clip.start, to: clip.start + clip.beats }
      : null;
  if (sel && sel.to > sel.from) out.push({ id: 'selection', label: 'Selection', range: sel });
  if (p.loop && p.loop.to > p.loop.from) out.push({ id: 'loop', label: 'Loop', range: p.loop });
  out.push({
    id: 'project',
    label: 'Whole project',
    range: { from: 0, to: Math.max(projectEnd(p), beatsPerBar(p.meters[0]?.sig ?? '4/4')) },
  });
  return out;
}

/** the newest generated clip still there as it was made, on this track (any track for null) */
const lastMade = (trackId: string | null | undefined) =>
  made.findLast(
    (m) =>
      (trackId == null || m.trackId === trackId) && findClip(project.value, m.trackId, m.clipId) === m.clip,
  ) ?? null;

/** whether Generate Again has a clip to replace */
export const canAgain = (trackId: string | null | undefined): boolean => !!lastMade(trackId);

/** what to write; key: when the project has none */
export interface GenerateRequest {
  part: PartName;
  style: string;
  seed: string;
  range: { from: number; to: number };
  trackId: string | null;
  key?: { tonic: number; mode: string };
}

export type GenerateResult = { ok: true; trackId: string; clipId: string } | { ok: false; message: string };

/** whether a string names a mode the composer knows */
export const isMode = (m: string): m is Mode => Object.hasOwn(MODES, m);

/** whether a string names a part the composer writes */
export const isPart = (s: string): s is PartName => Object.hasOwn(PARTS, s);

/** Writes the part; `again` replaces the last generated clip. */
export function generatePart(
  request: GenerateRequest,
  { again = false }: { again?: boolean } = {},
): GenerateResult {
  const p = project.value;
  const { from } = request.range;
  const bar = barAt(p.meters, from);
  const meter = p.meters.findLast((m) => m.beat <= from + 1e-9)?.sig ?? p.meters[0]?.sig ?? '4/4';
  const bars = Math.max(1, Math.round((request.range.to - from) / bar.beatsPerBar));
  const key = p.key ?? request.key ?? { tonic: 0, mode: 'major' };
  if (!isMode(key.mode)) return { ok: false, message: `The composer doesn't know the ${key.mode} mode.` };
  const to = from + bars * bar.beatsPerBar;
  const under = p.chords.filter((c) => c.beat < to - 1e-9 && c.beat + c.beats > from + 1e-9);
  const result = composePart({
    part: request.part,
    style: request.style,
    seed: request.seed,
    tempo: Math.round(bpmAt(p.tempoMap, from)),
    meter,
    tonic: key.tonic,
    mode: key.mode,
    bars,
    chords: under.map((c) => ({ ...c, beat: c.beat - from })),
  });
  if (!result.ok) return result;

  const replacing = again ? lastMade(request.trackId) : null;
  let trackId = replacing?.trackId ?? request.trackId ?? '',
    clipId = '';
  edit((q) => {
    let out = replacing ? removeClip(q, replacing.trackId, replacing.clipId) : q;
    if (!trackId || !out.tracks.some((t) => t.id === trackId)) {
      const t = makeTrack(out, { name: result.name, instrument: result.instrument });
      trackId = t.id;
      out = addTrack(out, t, out.tracks.length);
    }
    clipId = newId(out, 'c');
    out = addClip(out, trackId, { id: clipId, start: from, beats: result.beats, notes: result.notes });
    const t = out.tracks.find((x) => x.id === trackId);
    if (t && isDrums(t)) out = makePattern(out, trackId, clipId, nextPatternName(out, t.name));
    // no chords there: the ones the part was written over go on the chord track, for the parts that follow chords
    if (!under.length && request.part !== 'drums')
      out = {
        ...out,
        chords: [...out.chords, ...result.chords.map((c) => ({ ...c, beat: c.beat + from }))].sort(
          (a, b) => a.beat - b.beat,
        ),
      };
    return out;
  });
  made.push({ trackId, clipId, clip: findClip(project.value, trackId, clipId) });
  if (made.length > KEEP) made.shift();
  selected.value = trackId;
  selectedClip.value = { track: trackId, clip: clipId };
  return { ok: true, trackId, clipId };
}
