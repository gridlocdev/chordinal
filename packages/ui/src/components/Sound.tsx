// The editor's Sound tab (Chordinal PRD §13, §14): the selected track's synth or sampler, a section per stage of the sound
// (for a synth the oscillators, noise, the filter and its envelope, the amp envelope, the LFO and the voice; for a
// sampler its root key, mode and start, and the amp envelope), a slider per number and a dropdown per choice.
// Double-click a slider for the starting value. A track playing a SoundFont preset offers a synth or a sample instead.
import {
  DEFAULT_SAMPLER,
  DEFAULT_SYNTH,
  SAMPLER_SECTIONS,
  SYNTH_SECTIONS,
  controlPlace,
  controlText,
  controlValue,
  synthValue,
} from '@chordinal/audio';
import type { SynthControl, SynthSection } from '@chordinal/audio';
import { isDrums } from '@chordinal/daw';
import type { Track } from '@chordinal/daw';
import { selectedTrack } from '../store.ts';
import { instrumentName } from '../tracks.ts';
import { renameSynth, resetSynth, setSynthValue, synthOf, useSynth } from '../synth-edit.ts';
import { loadSample, renameSample, samplerOf, setSampleValue } from '../sample-edit.ts';
import { rgba } from './canvas.ts';

const STEPS = 1000; // a slider's steps from one end to the other

interface ControlProps<S extends object> {
  /** the settings shown */
  values: S;
  /** the settings a new one starts with, which a double-click goes back to */
  start: S;
  c: SynthControl<S>;
  /** its section's title, which its accessible name starts with */
  section: string;
  set: (path: string, value: unknown) => void;
}

function Control<S extends object>({ values, start: first, c, section, set: put }: ControlProps<S>) {
  const name = `${section} ${c.label}`;
  const value = synthValue(values, c.path);
  const set = (v: unknown) => put(c.path, v);
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
  if (c.shown && !c.shown(values)) return null;
  const n = typeof value === 'number' ? value : 0;
  const start = synthValue(first, c.path);
  const text = controlText(c, n);
  return (
    <label class={`param ${c.enabled && !c.enabled(values) ? 'off' : ''}`}>
      <span class="name">{c.label}</span>
      <input
        type="range"
        aria-label={name}
        aria-valuetext={text}
        min="0"
        max={STEPS}
        step="1"
        disabled={c.enabled ? !c.enabled(values) : false}
        value={Math.round(controlPlace(c, n) * STEPS)}
        title={`${c.label} (double-click for ${typeof start === 'number' ? controlText(c, start) : 'the start'})`}
        onInput={(e) => set(controlValue(c, Number(e.currentTarget.value) / STEPS))}
        onDblClick={() => set(start)}
      />
      <span class="value">{text}</span>
    </label>
  );
}

interface SectionsProps<S extends object> {
  sections: readonly SynthSection<S>[];
  values: S;
  start: S;
  set: (path: string, value: unknown) => void;
}

function Sections<S extends object>({ sections, values, start, set }: SectionsProps<S>) {
  return (
    <div class="sections">
      {sections.map((s) => (
        <section class="effect-panel" aria-label={s.title}>
          <strong>{s.title}</strong>
          <div class="params">
            {s.controls.map((c) => (
              <Control values={values} start={start} c={c} section={s.title} set={set} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** a button that picks an audio file and puts it on the track as a sampler */
function LoadSample({ track, label }: { track: Track; label: string }) {
  return (
    <label class="button load-sample">
      {label}
      <input
        type="file"
        accept=".wav,.aif,.aiff,.mp3,audio/wav,audio/aiff,audio/mpeg"
        aria-label={label}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void loadSample(track.id, file);
        }}
      />
    </label>
  );
}

export function Sound() {
  const track = selectedTrack.value;
  if (!track) return <div class="hint">Select a track to set its sound.</div>;
  const sample = samplerOf(track);
  if (sample)
    return (
      <div
        class="sound"
        role="region"
        aria-label={`${track.name} sampler`}
        style={{ '--track': rgba(track.color) }}
      >
        <header>
          <input
            class="synth-name"
            aria-label="Sample name"
            value={sample.name}
            onChange={(e) => renameSample(track.id, e.currentTarget.value)}
          />
          <span class="sample-file" title="In the project's samples folder">
            {sample.file || 'No file'}
          </span>
          <LoadSample track={track} label="Replace Sample…" />
        </header>
        <Sections
          sections={SAMPLER_SECTIONS}
          values={sample}
          start={DEFAULT_SAMPLER}
          set={(path, v) => setSampleValue(track.id, path, v)}
        />
      </div>
    );
  const synth = synthOf(track);
  if (!synth)
    return (
      <div class="hint sound-none">
        {isDrums(track) ? (
          <p>
            {track.name} plays a drum kit. Synths play the other tracks; drop a sample on a row of the step
            grid to play it in place of the kit's sound.
          </p>
        ) : (
          <>
            <p>
              {track.name} plays {instrumentName(track.instrument)}, from the sound library.
            </p>
            <button onClick={() => useSynth(track.id)}>Use a Synth</button>
            <LoadSample track={track} label="Load a Sample…" />
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
      <Sections
        sections={SYNTH_SECTIONS}
        values={synth}
        start={DEFAULT_SYNTH}
        set={(path, v) => setSynthValue(track.id, path, v)}
      />
    </div>
  );
}
