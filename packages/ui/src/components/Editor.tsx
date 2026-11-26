// The panel under the arrangement: the piano roll for the selected track, the step grid for its clip, the mixer, or the
// selected track's sound.
// Its tabs and the open view's toolbar share the bar across its top.
import { settings } from '../store.ts';
import type { EditorTab } from '../store.ts';
import { PianoRoll } from './PianoRoll.tsx';
import { RollToolbar } from './RollToolbar.tsx';
import { Mixer } from './Mixer.tsx';
import { StepGrid, GridToolbar } from './StepGrid.tsx';
import { Sound } from './Sound.tsx';
import { chooseEditor } from '../steps.ts';

const TABS: [EditorTab, string][] = [
  ['roll', 'Piano Roll'],
  ['mixer', 'Mixer'],
  ['grid', 'Step Grid'],
  ['sound', 'Sound'],
];

/** Left and Right move between the tabs, which are one Tab stop (the open one) */
function tabKey(e: KeyboardEvent, tab: EditorTab) {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!step || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  e.stopPropagation();
  const i = TABS.findIndex(([id]) => id === tab);
  const next = TABS[(i + step + TABS.length) % TABS.length]?.[0];
  if (next) chooseEditor(next);
  const list = (e.currentTarget as HTMLElement).closest('[role="tablist"]');
  requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
}

export function Editor() {
  const tab = settings.value.editorTab;
  return (
    <div class="editor">
      <div class="bar">
        <div class="tabs seg" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              class={tab === id ? 'on' : ''}
              onClick={() => chooseEditor(id)}
              onKeyDown={(e) => tabKey(e, tab)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'roll' ? <RollToolbar /> : tab === 'grid' ? <GridToolbar /> : null}
      </div>
      {tab === 'roll' ? (
        <PianoRoll />
      ) : tab === 'grid' ? (
        <StepGrid />
      ) : tab === 'sound' ? (
        <Sound />
      ) : (
        <Mixer />
      )}
    </div>
  );
}
