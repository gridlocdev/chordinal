// A track's MIDI FX in the mixer: adding one, changing, bypassing or removing one, and (right-click, in the desktop
// app) the menu that also reorders them. Every change is
// an edit, so it can be undone. Note effects (Scale, Chord) play first, then Humanize; the list's order is the order
// note effects run in.
import {
  ARP_FX,
  CHORD_FX,
  CHORD_SHAPES,
  SCALE_FX,
  addTrackFx,
  fxName,
  moveTrackFx,
  removeTrackFx,
  setTrackFx,
} from '@chordinal/daw';
import type { ArpDirection, ChordShape, TrackFx } from '@chordinal/daw';
import { appMenu } from './platform/app-menu.ts';
import type { MenuEntry } from './platform/app-menu.ts';
import { project, selected } from './store.ts';
import { edit } from './document.ts';

/** the chord shapes as the strip and the menu name them; `key` (In Key) builds each chord from the project's key */
export const SHAPE_NAMES: Record<ChordShape, string> = {
  key: 'In Key',
  major: 'Major',
  minor: 'Minor',
  '7th': '7th',
  maj7: 'Major 7th',
  min7: 'Minor 7th',
  sus2: 'Sus2',
  sus4: 'Sus4',
  power: 'Power',
};
export const SHAPES = ['key', ...Object.keys(CHORD_SHAPES)] as ChordShape[];

/** the effects you can add, with their starting settings */
export const ADDABLE: TrackFx[] = [
  { type: SCALE_FX },
  { type: CHORD_FX, shape: 'key' },
  { type: ARP_FX, rate: '1/16', direction: 'up', octaves: 1, gate: 0.8 },
];

/** the arpeggiator's directions as the strip names them */
export const ARP_DIRECTION_NAMES: Record<ArpDirection, string> = {
  up: 'Up',
  down: 'Down',
  updown: 'Up & Down',
  played: 'As Played',
  random: 'Random',
};
/** the gates the strip offers: how much of a step each note sounds */
export const GATES = [0.25, 0.5, 0.8, 1];

/** an effect's name where the strip has little room */
export const fxShortName = (type: string): string => (type === ARP_FX ? 'Arp' : fxName(type));

const trackOf = (id: string) => project.value.tracks.find((t) => t.id === id);

/** a track's FX as the strip shows it: its name, with the chord shape for Chord */
export function fxLabel(fx: TrackFx): string {
  if (fx.type === ARP_FX && typeof fx.rate === 'string') return `${fxName(fx.type)} ${fx.rate}`;
  if (fx.type === CHORD_FX && typeof fx.shape === 'string' && fx.shape !== 'key')
    return `Chord ${SHAPE_NAMES[fx.shape as ChordShape] ?? fx.shape}`;
  return fxName(fx.type);
}

export const addFx = (trackId: string, fx: TrackFx): void => edit((p) => addTrackFx(p, trackId, fx));
export const removeFx = (trackId: string, index: number): void =>
  edit((p) => removeTrackFx(p, trackId, index));
export const setFx = (trackId: string, index: number, patch: Record<string, unknown>): void =>
  edit((p) => setTrackFx(p, trackId, index, patch));

/** one FX's menu: its settings, bypass, order and remove */
export function fxMenu(trackId: string, index: number): void {
  selected.value = trackId;
  const t = trackOf(trackId),
    fx = t?.fx[index];
  if (!t || !fx) return;
  const settings: MenuEntry[] =
    fx.type === CHORD_FX
      ? [
          {
            label: 'Shape',
            submenu: SHAPES.map((s) => ({
              label: SHAPE_NAMES[s],
              radio: true,
              checked: (fx.shape ?? 'key') === s,
              run: () => edit((p) => setTrackFx(p, trackId, index, { shape: s })),
            })),
          },
          {
            label: 'Chord Notes',
            submenu: [
              [-1, 'An Octave Down'],
              [0, 'Over the Note'],
              [1, 'An Octave Up'],
            ].map(([n, label]) => ({
              label: String(label),
              radio: true,
              checked: (typeof fx.octave === 'number' ? fx.octave : 0) === n,
              run: () => edit((p) => setTrackFx(p, trackId, index, { octave: n })),
            })),
          },
          '-',
        ]
      : [];
  appMenu.popup([
    ...settings,
    {
      label: 'Bypass',
      checked: fx.bypass === true,
      run: () => edit((p) => setTrackFx(p, trackId, index, { bypass: fx.bypass !== true })),
    },
    { label: 'Move Up', enabled: index > 0, run: () => edit((p) => moveTrackFx(p, trackId, index, -1)) },
    {
      label: 'Move Down',
      enabled: index < t.fx.length - 1,
      run: () => edit((p) => moveTrackFx(p, trackId, index, 1)),
    },
    '-',
    { label: `Remove ${fxName(fx.type)}`, run: () => edit((p) => removeTrackFx(p, trackId, index)) },
  ]);
}
