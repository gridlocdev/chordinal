// The mixer: a strip per track (its effects, MIDI effects, pan, fader, mute, solo), the open effect's settings, and the
// master volume. Every move is an edit of the project,
// a drag one undo step. Beside each fader, a meter of what it plays. Right-click a strip for more.
import { audioEngine } from '@chordinal/playback';
import { ARP_DIRECTIONS, ARP_FX, ARP_RATES, CHORD_FX, arpSettings, fxName, setMixer } from '@chordinal/daw';
import type { TrackFx } from '@chordinal/daw';
import { project, selected, settings, setSettings, levels, FADER_FLOOR_DB } from '../store.ts';
import { edit } from '../document.ts';
import { instrumentName, toggleMute, toggleSolo } from '../tracks.ts';
import { stripMenu } from '../context-menus.ts';
import {
  ADDABLE,
  ARP_DIRECTION_NAMES,
  GATES,
  SHAPES,
  SHAPE_NAMES,
  addFx,
  applyFx,
  canApply,
  fxLabel,
  fxMenu,
  fxShortName,
  removeFx,
  setFx,
} from '../midi-fx.ts';
import { rgba } from './canvas.ts';
import { EffectList, EffectPanel } from './Effects.tsx';

const DB = [FADER_FLOOR_DB, 6] as const;
const db = (v: number) => (v <= DB[0] ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);
const panName = (p: number) =>
  Math.abs(p) < 0.01 ? 'C' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`;

/** a track's index in the project, or -1 for the master */
interface MeterProps {
  track?: number;
}

/** a track's peak level (0..1), or the master's with no track, as a meter: -60 dB at the bottom to 0 dB at the top,
 * red at the top. It reads the levels itself, so only the meters re-render as they move. */
function Meter({ track = -1 }: MeterProps) {
  const level = track < 0 ? levels.value.master : (levels.value.tracks[track] ?? 0);
  const dB = level > 0 ? 20 * Math.log10(level) : -Infinity;
  const fill = Math.max(0, Math.min(1, (dB + 60) / 60));
  return (
    <div class="meter" title={Number.isFinite(dB) ? `${dB.toFixed(1)} dB` : ''}>
      <div class={fill > 0.98 ? 'hot' : ''} style={{ height: `${fill * 100}%` }} />
    </div>
  );
}

const set = (id: string, field: 'pan' | 'volumeDb', value: number) =>
  edit((p) => setMixer(p, id, field === 'pan' ? { pan: value } : { volumeDb: value }), `mix:${id}:${field}`);

interface FxRowProps {
  trackId: string;
  fx: TrackFx;
  index: number;
}

/** one of a track's MIDI effects: bypass, its name, Apply to Notes, remove, and its settings under them (Chord's shape, the
 * arpeggiator's rate, direction, octaves and gate); right-click for its order */
function FxRow({ trackId, fx, index }: FxRowProps) {
  const off = fx.bypass === true;
  return (
    <div
      class={`fx-row ${off ? 'off' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        fxMenu(trackId, index);
      }}
    >
      <button
        class="power"
        aria-pressed={off}
        aria-label={`Bypass ${fxName(fx.type)}`}
        title={off ? `Turn ${fxLabel(fx)} back on` : `Bypass ${fxLabel(fx)}`}
        onClick={() => setFx(trackId, index, { bypass: !off })}
      >
        ⏻
      </button>
      <span class="label" title={fxLabel(fx)}>
        {fxShortName(fx.type)}
      </span>
      <button
        class="apply"
        aria-label={`Apply ${fxName(fx.type)} to notes`}
        title={`Apply to Notes: write ${fxLabel(fx)} into the clips' notes${index > 0 ? ' (with the effects on above it)' : ''}, so you can edit them`}
        disabled={!canApply(fx)}
        onClick={() => applyFx(trackId, index)}
      >
        ↧
      </button>
      <button
        class="remove"
        aria-label={`Remove ${fxName(fx.type)}`}
        title={`Remove ${fxLabel(fx)}`}
        onClick={() => removeFx(trackId, index)}
      >
        ×
      </button>
      {fx.type === CHORD_FX && (
        <select
          class="setting"
          aria-label="Chord shape"
          title={`Chord: ${SHAPE_NAMES[isShape(fx.shape) ? fx.shape : 'key']}`}
          value={isShape(fx.shape) ? fx.shape : 'key'}
          onChange={(e) => setFx(trackId, index, { shape: e.currentTarget.value })}
        >
          {SHAPES.map((sh) => (
            <option value={sh}>{SHAPE_NAMES[sh]}</option>
          ))}
        </select>
      )}
      {fx.type === ARP_FX && <ArpSettings trackId={trackId} fx={fx} index={index} />}
    </div>
  );
}

/** the arpeggiator's rate, direction, octaves and gate, one dropdown each */
function ArpSettings({ trackId, fx, index }: FxRowProps) {
  const a = arpSettings(fx);
  const gate = GATES.reduce((best, g) => (Math.abs(g - a.gate) < Math.abs(best - a.gate) ? g : best));
  return (
    <>
      <select
        class="setting"
        aria-label="Arpeggiator rate"
        title="Arpeggiator rate: the length of a step (t: triplet)"
        value={a.rate}
        onChange={(e) => setFx(trackId, index, { rate: e.currentTarget.value })}
      >
        {Object.keys(ARP_RATES).map((r) => (
          <option value={r}>{r}</option>
        ))}
      </select>
      <select
        class="setting"
        aria-label="Arpeggiator direction"
        title="Arpeggiator direction"
        value={a.direction}
        onChange={(e) => setFx(trackId, index, { direction: e.currentTarget.value })}
      >
        {ARP_DIRECTIONS.map((d) => (
          <option value={d}>{ARP_DIRECTION_NAMES[d]}</option>
        ))}
      </select>
      <select
        class="setting"
        aria-label="Arpeggiator octaves"
        title="Arpeggiator octaves: how far up it climbs"
        value={a.octaves}
        onChange={(e) => setFx(trackId, index, { octaves: Number(e.currentTarget.value) })}
      >
        {[1, 2, 3, 4].map((o) => (
          <option value={o}>
            {o} {o === 1 ? 'octave' : 'octaves'}
          </option>
        ))}
      </select>
      <select
        class="setting"
        aria-label="Arpeggiator gate"
        title="Arpeggiator gate: how much of each step a note sounds"
        value={gate}
        onChange={(e) => setFx(trackId, index, { gate: Number(e.currentTarget.value) })}
      >
        {GATES.map((g) => (
          <option value={g}>Gate {Math.round(g * 100)}%</option>
        ))}
      </select>
    </>
  );
}

const isShape = (v: unknown): v is keyof typeof SHAPE_NAMES =>
  typeof v === 'string' && Object.hasOwn(SHAPE_NAMES, v);

export function Mixer() {
  void settings.value.library;
  const list = project.value.tracks;
  if (!list.length)
    return (
      <div class="mixer">
        <div class="empty">Add a track to mix it.</div>
      </div>
    );
  return (
    <div class="mixer">
      {list.map((t, i) => {
        const m = t.mixer;
        return (
          <div
            class={`strip ${selected.value === t.id ? 'on' : ''}`}
            style={{ '--track': rgba(t.color) }}
            onPointerDown={() => {
              selected.value = t.id;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              stripMenu(t.id);
            }}
          >
            <span class="name" title={t.name}>
              {t.name}
            </span>
            <span class="inst">{instrumentName(t.instrument)}</span>
            <EffectList track={t} />
            <div class="fx" role="group" aria-label={`${t.name} MIDI effects`}>
              {t.fx.map((fx, n) => (
                <FxRow trackId={t.id} fx={fx} index={n} />
              ))}
              <select
                class="add"
                aria-label={`Add a MIDI effect to ${t.name}`}
                value=""
                onChange={(e) => {
                  const fx = ADDABLE.find((a) => a.type === e.currentTarget.value);
                  e.currentTarget.value = '';
                  if (fx) addFx(t.id, fx);
                }}
              >
                <option value="">+ MIDI FX</option>
                {ADDABLE.map((a) => (
                  <option value={a.type}>{fxName(a.type)}</option>
                ))}
              </select>
            </div>
            <input
              class="pan"
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={m.pan}
              title={`Pan ${panName(m.pan)} (double-click to centre)`}
              onInput={(e) => set(t.id, 'pan', Number(e.currentTarget.value))}
              onDblClick={() => set(t.id, 'pan', 0)}
            />
            <span class="db">{panName(m.pan)}</span>
            <div class="level">
              <input
                class="fader"
                type="range"
                min={DB[0]}
                max={DB[1]}
                step="0.5"
                value={m.volumeDb}
                title="Volume (double-click for 0 dB)"
                onInput={(e) => set(t.id, 'volumeDb', Number(e.currentTarget.value))}
                onDblClick={() => set(t.id, 'volumeDb', 0)}
              />
              <Meter track={i} />
            </div>
            <span class="db">{db(m.volumeDb)} dB</span>
            <div class="ms">
              <button class={`mute ${m.mute ? 'on' : ''}`} title="Mute" onClick={() => toggleMute(t.id)}>
                M
              </button>
              <button class={`solo ${m.solo ? 'on' : ''}`} title="Solo" onClick={() => toggleSolo(t.id)}>
                S
              </button>
            </div>
          </div>
        );
      })}
      <EffectPanel />
      <div class="strip master">
        <span class="name">Master</span>
        <span class="inst">&nbsp;</span>
        <div class="level">
          <input
            class="fader"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.value.volume}
            title="Master volume"
            onInput={(e) => {
              const v = Number(e.currentTarget.value);
              audioEngine.volume = v;
              setSettings({ volume: v });
            }}
          />
          <Meter />
        </div>
        <span class="db">{Math.round(settings.value.volume * 100)}%</span>
      </div>
    </div>
  );
}
