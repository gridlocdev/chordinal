// The editor's Sound tab (Chordinal PRD §13): the selected track's synth, a section per stage of the sound (the
// oscillators, noise, the filter and its envelope, the amp envelope, the LFO and the voice), a slider per number and a
// dropdown per choice. Double-click a slider for the starting synth's value. A track playing a SoundFont preset offers
// to play a synth instead.
import {
  DEFAULT_SYNTH,
  SYNTH_SECTIONS,
  controlPlace,
  controlText,
  controlValue,
  synthValue,
} from '@chordinal/audio';
import type { SynthControl, SynthSettings } from '@chordinal/audio';
import { isDrums } from '@chordinal/daw';
import type { Track } from '@chordinal/daw';
import { selectedTrack } from '../store.ts';
import { instrumentName } from '../tracks.ts';
import { renameSynth, resetSynth, setSynthValue, synthOf, useSynth } from '../synth-edit.ts';
import { rgba } from './canvas.ts';

const STEPS = 1000; // a slider's steps from one end to the other

interface ControlProps {
  track: Track;
  synth: SynthSettings;
  c: SynthControl;
  /** its section's title, which its accessible name starts with */
  section: string;
}

function Control({ track, synth, c, section }: ControlProps) {
  const name = `${section} ${c.label}`;
  const value = synthValue(synth, c.path);
  const set = (v: unknown) => setSynthValue(track.id, c.path, v);
  if (c.kind === 'switch')
    return (
      <label class="param switch">
        <input
          type="checkbox"
          aria-label={name}
          checked={value === true}
          onChange={(e) => set(e.currentTarget.checked)}
        />
        <span class="name">{c.label}</span>
      </label>
    );
  if (c.kind === 'choice')
    return (
      <label class="param">
        <span class="name">{c.label}</span>
        <select aria-label={name} value={String(value)} onChange={(e) => set(e.currentTarget.value)}>
          {c.choices.map(([v, label]) => (
            <option value={v}>{label}</option>
          ))}
        </select>
      </label>
    );
  if (c.shown && !c.shown(synth)) return null;
  const n = typeof value === 'number' ? value : 0;
  const start = synthValue(DEFAULT_SYNTH, c.path);
  const text = controlText(c, n);
  return (
    <label class={`param ${c.enabled && !c.enabled(synth) ? 'off' : ''}`}>
      <span class="name">{c.label}</span>
      <input
        type="range"
        aria-label={name}
        aria-valuetext={text}
        min="0"
        max={STEPS}
        step="1"
        disabled={c.enabled ? !c.enabled(synth) : false}
        value={Math.round(controlPlace(c, n) * STEPS)}
        title={`${c.label} (double-click for ${typeof start === 'number' ? controlText(c, start) : 'the start'})`}
        onInput={(e) => set(controlValue(c, Number(e.currentTarget.value) / STEPS))}
        onDblClick={() => set(start)}
      />
      <span class="value">{text}</span>
    </label>
  );
}

export function Sound() {
  const track = selectedTrack.value;
  if (!track) return <div class="hint">Select a track to set its sound.</div>;
  const synth = synthOf(track);
  if (!synth)
    return (
      <div class="hint sound-none">
        {isDrums(track) ? (
          <p>{track.name} plays a drum kit. Synths play the other tracks.</p>
        ) : (
          <>
            <p>
              {track.name} plays {instrumentName(track.instrument)}, from the sound library.
            </p>
            <button onClick={() => useSynth(track.id)}>Use a Synth</button>
          </>
        )}
      </div>
    );
  return (
    <div
      class="sound"
      role="region"
      aria-label={`${track.name} synth`}
      style={{ '--track': rgba(track.color) }}
    >
      <header>
        <input
          class="synth-name"
          aria-label="Synth name"
          value={synth.name}
          onChange={(e) => renameSynth(track.id, e.currentTarget.value)}
        />
        <button onClick={() => resetSynth(track.id)} title="Every setting back to the starting synth's">
          Reset
        </button>
      </header>
      <div class="sections">
        {SYNTH_SECTIONS.map((s) => (
          <section class="effect-panel" aria-label={s.title}>
            <strong>{s.title}</strong>
            <div class="params">
              {s.controls.map((c) => (
                <Control track={track} synth={synth} c={c} section={s.title} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
