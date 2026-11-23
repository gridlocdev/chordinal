// A track's audio effects (its inserts) in the mixer: adding, bypassing, moving and removing one, the menu with all of
// that (right-click an effect), and which effect's settings panel is open. Every change is an edit, so it can be
// undone; a knob's drag is one undo step.
import {
  EFFECTS,
  addInsert,
  effectName,
  effectSpec,
  insertsOf,
  moveInsert,
  removeInsert,
  setInsertBypass,
  setInsertParams,
} from '@chordinal/daw';
import type { EffectParam, EffectType } from '@chordinal/daw';
import { signal } from '@preact/signals';
import { appMenu } from './platform/app-menu.ts';
import { project, selected } from './store.ts';
import { edit } from './document.ts';

/** the effect whose settings panel is open: its track and its insert's id */
export const openEffect = signal<{ track: string; id: string } | null>(null);

const trackOf = (id: string) => project.value.tracks.find((t) => t.id === id);

/** the effects you can add, in the order the menu lists them */
export const ADDABLE_EFFECTS = EFFECTS.map((e) => ({ type: e.type, name: e.name }));

/** adds an effect at the end of the track's chain (or at `at`) and opens its settings */
export function addEffect(trackId: string, type: EffectType, at?: number): void {
  const before = new Set(insertsOf(trackOf(trackId) ?? { inserts: [] }).map((x) => x.id));
  edit((p) => addInsert(p, trackId, type, at));
  const added = insertsOf(trackOf(trackId) ?? { inserts: [] }).find((x) => !before.has(x.id));
  if (added) openEffect.value = { track: trackId, id: added.id };
}

export const removeEffect = (trackId: string, id: string): void => {
  edit((p) => removeInsert(p, trackId, id));
  const o = openEffect.value;
  if (o?.track === trackId && o.id === id) openEffect.value = null;
};

export const bypassEffect = (trackId: string, id: string, bypass: boolean): void =>
  edit((p) => setInsertBypass(p, trackId, id, bypass));

export const moveEffect = (trackId: string, id: string, to: number): void =>
  edit((p) => moveInsert(p, trackId, id, to));

/** changes one setting; a run of changes to the same setting (a drag) is one undo step */
export const setEffectParam = (trackId: string, id: string, param: string, value: number): void =>
  edit((p) => setInsertParams(p, trackId, id, { [param]: value }), `insert:${trackId}:${id}:${param}`);

/** puts every setting back to its starting value */
export function resetEffect(trackId: string, id: string): void {
  const x = insertsOf(trackOf(trackId) ?? { inserts: [] }).find((i) => i.id === id);
  const spec = x && effectSpec(x.type);
  if (!spec) return;
  edit((p) => setInsertParams(p, trackId, id, Object.fromEntries(spec.params.map((q) => [q.id, q.value]))));
}

/** a knob's place, 0..1, for a setting's value: on octaves for a 'log' setting */
export function knobPlace(param: EffectParam, value: number): number {
  if (param.scale === 'log') return Math.log(value / param.min) / Math.log(param.max / param.min);
  return (value - param.min) / (param.max - param.min);
}

/** a setting's value at a knob's place, 0..1 */
export function knobValue(param: EffectParam, place: number): number {
  const x = Math.max(0, Math.min(1, place));
  if (param.choices) return Math.round(param.min + x * (param.max - param.min));
  if (param.scale === 'log') return param.min * (param.max / param.min) ** x;
  return param.min + x * (param.max - param.min);
}

/** one effect's menu: open its settings, bypass, order, reset and remove */
export function effectMenu(trackId: string, id: string): void {
  selected.value = trackId;
  const list = insertsOf(trackOf(trackId) ?? { inserts: [] });
  const index = list.findIndex((x) => x.id === id);
  const x = list[index];
  if (!x) return;
  appMenu.popup([
    { label: 'Settings…', run: () => (openEffect.value = { track: trackId, id }) },
    { label: 'Bypass', checked: x.bypass === true, run: () => bypassEffect(trackId, id, x.bypass !== true) },
    { label: 'Move Up', enabled: index > 0, run: () => moveEffect(trackId, id, index - 1) },
    { label: 'Move Down', enabled: index < list.length - 1, run: () => moveEffect(trackId, id, index + 1) },
    { label: 'Reset Settings', run: () => resetEffect(trackId, id) },
    '-',
    { label: `Remove ${effectName(x.type)}`, run: () => removeEffect(trackId, id) },
  ]);
}
