// A track's audio effects in its mixer strip, and the settings panel of the one opened. In the strip: each effect with
// its bypass and remove buttons, dragged to reorder, clicked to open its settings, right-clicked for its menu; and a
// dropdown to add one. The panel beside the strips has a slider per setting (a dropdown for one with named values);
// double-click a slider for its starting value.
import { effectName, effectSpec, insertValue, insertsOf, paramText } from '@chordinal/daw';
import type { EffectType, Track } from '@chordinal/daw';
import { project, selected } from '../store.ts';
import {
  ADDABLE_EFFECTS,
  addEffect,
  bypassEffect,
  effectMenu,
  knobPlace,
  knobValue,
  moveEffect,
  openEffect,
  removeEffect,
  resetEffect,
  setEffectParam,
} from '../track-effects.ts';
import { rgba } from './canvas.ts';

const DRAG = 'application/x-chordinal-effect'; // what a dragged effect carries: `<track>:<insert id>`
const STEPS = 1000; // a slider's steps from one end to the other

/** the track's effects in its strip, and the dropdown that adds one */
export function EffectList({ track }: { track: Track }) {
  const list = insertsOf(track);
  const open = openEffect.value;
  return (
    <div class="fx effects" role="group" aria-label={`${track.name} effects`}>
      {list.map((x, index) => {
        const off = x.bypass === true,
          name = effectName(x.type);
        return (
          <div
            key={x.id}
            class={`fx-row effect ${off ? 'off' : ''} ${open?.track === track.id && open.id === x.id ? 'open' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer?.setData(DRAG, `${track.id}:${x.id}`);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (e.dataTransfer?.types.includes(DRAG)) e.preventDefault();
            }}
            onDrop={(e) => {
              const [from, id] = (e.dataTransfer?.getData(DRAG) ?? '').split(':');
              if (from !== track.id || !id) return;
              e.preventDefault();
              moveEffect(track.id, id, index);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              effectMenu(track.id, x.id);
            }}
          >
            <button
              class="power"
              aria-pressed={off}
              aria-label={`Bypass ${name}`}
              title={off ? `Turn ${name} back on` : `Bypass ${name}`}
              onClick={() => bypassEffect(track.id, x.id, !off)}
            >
              ⏻
            </button>
            <button
              class="label open-effect"
              title={`${name}: open its settings (drag to reorder)`}
              onClick={() => {
                selected.value = track.id;
                openEffect.value =
                  open?.track === track.id && open.id === x.id ? null : { track: track.id, id: x.id };
              }}
            >
              {name}
            </button>
            <span />
            <button
              class="remove"
              aria-label={`Remove ${name}`}
              title={`Remove ${name}`}
              onClick={() => removeEffect(track.id, x.id)}
            >
              ×
            </button>
          </div>
        );
      })}
      <select
        class="add"
        aria-label={`Add an effect to ${track.name}`}
        value=""
        onChange={(e) => {
          const type = e.currentTarget.value as EffectType;
          e.currentTarget.value = '';
          if (type) addEffect(track.id, type);
        }}
      >
        <option value="">+ Effect</option>
        {ADDABLE_EFFECTS.map((a) => (
          <option value={a.type}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}

/** the open effect's settings, beside the strips; nothing when none is open */
export function EffectPanel() {
  const open = openEffect.value;
  const track = open && project.value.tracks.find((t) => t.id === open.track);
  const x = track && insertsOf(track).find((i) => i.id === open.id);
  const spec = x && effectSpec(x.type);
  if (!open || !track || !x || !spec) return null;
  const name = spec.name;
  return (
    <section
      class="effect-panel"
      aria-label={`${name} on ${track.name}`}
      style={{ '--track': rgba(track.color) }}
    >
      <header>
        <button
          class={`power ${x.bypass ? '' : 'on'}`}
          aria-pressed={x.bypass === true}
          aria-label={`Bypass ${name}`}
          title={x.bypass ? `Turn ${name} back on` : `Bypass ${name}`}
          onClick={() => bypassEffect(track.id, x.id, x.bypass !== true)}
        >
          ⏻
        </button>
        <div class="title">
          <strong>{name}</strong>
          <span>{track.name}</span>
        </div>
        <button
          class="close"
          aria-label="Close the effect's settings"
          title="Close"
          onClick={() => (openEffect.value = null)}
        >
          ×
        </button>
      </header>
      <p class="about">{spec.about}</p>
      <div class="params">
        {spec.params.map((param) => {
          const value = insertValue(x, param.id);
          const label = `${name} ${param.label}`;
          return (
            <label class="param" key={param.id}>
              <span class="name">{param.label}</span>
              {param.choices ? (
                <select
                  aria-label={label}
                  value={Math.round(value)}
                  onChange={(e) => setEffectParam(track.id, x.id, param.id, Number(e.currentTarget.value))}
                >
                  {param.choices.map((c, i) => (
                    <option value={i}>{c}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="range"
                  aria-label={label}
                  aria-valuetext={paramText(param, value)}
                  min="0"
                  max={STEPS}
                  step="1"
                  value={Math.round(knobPlace(param, value) * STEPS)}
                  title={`${param.label} (double-click for ${paramText(param, param.value)})`}
                  onInput={(e) =>
                    setEffectParam(
                      track.id,
                      x.id,
                      param.id,
                      knobValue(param, Number(e.currentTarget.value) / STEPS),
                    )
                  }
                  onDblClick={() => setEffectParam(track.id, x.id, param.id, param.value)}
                />
              )}
              <span class="value">{paramText(param, value)}</span>
            </label>
          );
        })}
      </div>
      <footer>
        <button onClick={() => resetEffect(track.id, x.id)}>Reset</button>
      </footer>
    </section>
  );
}
