// What the arrangement's parts share: its geometry (the header width, how many beats it spans, px per beat) and
// snapping a beat to the bar.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { barAt, projectEnd } from '@chordinal/daw';
import type { MeterChange } from '@chordinal/daw';
import { project } from '../store.ts';
import { recording } from '../recording.ts';
import { arrangeZoom as zoom } from '../tracks.ts';

export const HEAD_W = 232;
export const ZOOM: readonly [min: number, max: number] = [0.5, 120]; // px per beat
const ROOM = 32; // beats of empty space after the end, to add clips in
/** the arrangement's width for lanes, px */
export const width: Signal<number> = signal(0);

/** Preact sets numbers in style as they are, with no unit */
export const px = (n: number): string => `${n}px`;

/** how many beats the arrangement shows: the project, the take being recorded, and room after them */
export function span(): number {
  const r = recording.value;
  return Math.max(projectEnd(project.value), r ? r.start + 4 : 0, 16) + ROOM;
}

/** a beat snapped to the bar it's nearest in these meters, or to the beat with Shift */
export function snapToBar(meters: MeterChange[], b: number, shiftKey: boolean): number {
  if (shiftKey) return Math.max(0, Math.round(b));
  const at = barAt(meters, b);
  return b - at.start < at.beatsPerBar / 2 ? at.start : at.start + at.beatsPerBar;
}

/** a beat snapped to the bar it's nearest, or to the beat with Shift */
export const snapTo = (b: number, e: { shiftKey: boolean }): number =>
  snapToBar(project.value.meters, b, e.shiftKey);

/** px per beat for this many beats: the zoom, or the beats fitted to the width; a canvas wider than ~32k device px
 * doesn't draw */
export function fittedPpb(beats: number, zoomed: number, w: number, dpr: number): number {
  return Math.min(zoomed || Math.max(ZOOM[0], w / beats) || 8, 30000 / beats / (dpr || 1));
}

/** px per beat: the zoom, or the project fitted to the window */
export const fitted = (): number => fittedPpb(span(), zoom.value, width.value, devicePixelRatio);
