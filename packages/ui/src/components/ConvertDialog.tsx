// Track → Convert Audio Again: a clip read from recorded or dropped audio, read once more from that audio with another
// grid, snapped to the key or not, and more or less sensitive. Each change rewrites the clip's notes at once, as one
// undo step, and the dialog sits low over the window so the notes can be watched as they change.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GRIDS } from '@chordinal/sketch';
import type { ConvertOptions, GridChoice } from '@chordinal/sketch';
import { findClip } from '@chordinal/daw';
import { project, notify } from '../store.ts';
import { convertAgain, convertChoices, convertDialog, sourceOf } from '../recording.ts';

const isGrid = (g: string): g is GridChoice => Object.hasOwn(GRIDS, g);

export function ConvertDialog() {
  const open = convertDialog.value,
    first = useRef<HTMLSelectElement>(null);
  const [sensitivity, setSensitivity] = useState(convertChoices.value.sensitivity);
  const src = open && sourceOf(open.track, open.clip);
  useEffect(() => {
    if (!open) return;
    setSensitivity(convertChoices.value.sensitivity);
    first.current?.focus();
  }, [open]);
  // the clip went (undone, deleted, another project opened): the dialog goes with it
  useEffect(() => {
    if (open && !src) {
      convertDialog.value = null;
      notify('The clip read from that audio is gone.');
    }
  }, [open, src]);
  if (!open || !src) return null;
  const c = convertChoices.value;
  const set = (patch: Partial<ConvertOptions>) => convertAgain(open.track, open.clip, { ...c, ...patch });
  const close = () => {
    convertDialog.value = null;
  };
  const notes = findClip(project.value, open.track, open.clip)?.notes.length ?? 0;
  return (
    <div class="dialog-back see-through" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        class="dialog convert"
        role="dialog"
        aria-label="Convert audio again"
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement))) close();
        }}
      >
        <h2>Convert Audio Again</h2>
        <div class="form">
          <label>
            Grid{' '}
            <select
              ref={first}
              name="grid"
              value={c.grid}
              onChange={(e) => {
                const g = e.currentTarget.value;
                if (isGrid(g)) set({ grid: g });
              }}
            >
              {Object.entries(GRIDS).map(([id, g]) => (
                <option value={id}>{g.label}</option>
              ))}
            </select>
          </label>
          <label>
            Key{' '}
            <span>
              <input
                type="checkbox"
                name="snap"
                checked={c.snap}
                onChange={(e) => set({ snap: e.currentTarget.checked })}
              />{' '}
              snap notes to the key
            </span>
          </label>
          <label>
            Sensitivity{' '}
            <input
              type="range"
              name="sensitivity"
              min="0"
              max="1"
              step="0.05"
              value={sensitivity}
              aria-valuetext={`${Math.round(sensitivity * 100)}%`}
              onInput={(e) => setSensitivity(Number(e.currentTarget.value))}
              onChange={(e) => set({ sensitivity: Number(e.currentTarget.value) })}
            />
          </label>
        </div>
        <p class="hint">
          {notes} notes from {src.label}. Higher sensitivity hears quieter and shorter notes. Each change
          replaces the clip’s notes; Undo takes it back.
        </p>
        <div class="actions">
          <button class="primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
