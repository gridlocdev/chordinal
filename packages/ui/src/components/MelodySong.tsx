// New from Melody's customizer (PRD §9.4), docked on the right while the song it makes is previewed in the window:
// Roll and the versions heard so far, then style and pace, song form, band and feel, each with a lock. Every change
// composes the song again; Cancel, Replace This Project and Save and Create New end it.
import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren, TargetedKeyboardEvent } from 'preact';
import { EMOTIONS, GENRES, FORMS, GROOVES, ROLES, ROLE_NAMES, styleName } from '@chordinal/composer';
import type { Role } from '@chordinal/composer';
import { MODES } from '@chordinal/lib';
import { soundfontLibrary } from '@chordinal/audio';
import {
  customizer,
  customize,
  cancelMelodySong,
  replaceWithMelodySong,
  saveAndCreateMelodySong,
  melodySections,
  roll,
  toggleLock,
  pickVersion,
  versionName,
  KEY_NAMES,
  ONCE,
} from '../melody-song.ts';
import type { Customizer, LockKey } from '../melody-song.ts';
import type { MelodySong as Choices } from '../melody-song.ts';

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
/** 'verseChorus' → 'Verse chorus'; 'AABA' stays */
const words = (s: string) =>
  cap(s.replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`));
const TEMPO = { min: 40, max: 220 };

/** the instruments a part can play, by program: General MIDI's, or the drum kits */
function instruments(drums: boolean): { program: number; name: string }[] {
  const bank = drums ? 128 : 0,
    seen = new Set<number>();
  return soundfontLibrary
    .presets()
    .filter((p) => p.bank === bank && !seen.has(p.program) && seen.add(p.program))
    .sort((a, b) => a.program - b.program);
}

function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <fieldset>
      <legend>{title}</legend>
      <div class="form">{children}</div>
    </fieldset>
  );
}

/** a padlock, shut or open */
const padlock = (shut: boolean) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill={shut ? 'currentColor' : 'none'} />
    <path d={shut ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7'} />
  </svg>
);

/** a choice's label and control, and its lock when it has one */
function Field({
  name,
  lock,
  locked,
  off,
  children,
}: {
  name: string;
  lock?: LockKey;
  locked: ReadonlySet<LockKey>;
  off?: boolean;
  children: ComponentChildren;
}) {
  const on = lock !== undefined && locked.has(lock);
  return (
    <>
      <label class={off ? 'off' : ''}>
        {name} {children}
      </label>
      {lock === undefined ? (
        <span />
      ) : (
        <button
          class={`lock${on ? ' on' : ''}`}
          aria-pressed={on}
          aria-label={`Lock ${name}`}
          title={on ? `${name} is locked: Roll and a new style keep it` : `Lock ${name} so Roll keeps it`}
          onClick={() => toggleLock(lock)}
        >
          {padlock(on)}
        </button>
      )}
    </>
  );
}

/** the versions heard so far, to go back to and compare */
function Versions({ versions, at }: { versions: readonly Choices[]; at: number }) {
  return (
    <div class="versions" role="group" aria-label="Versions">
      {versions.map((v, i) => (
        <button
          aria-pressed={i === at}
          aria-label={`Version ${i + 1}`}
          title={`Version ${i + 1}: ${versionName(v)}`}
          onClick={() => pickVersion(i)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function Panel({ state }: { state: Customizer }) {
  const { choices: c, error, locked } = state;
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);
  const set = (patch: Partial<Choices>) => customize(patch);
  const sections = melodySections(c.form);
  const keys = (e: TargetedKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelMelodySong();
    }
  };
  const band = (role: Role) => {
    const list = instruments(role === 'drums'),
      at = c.band[role];
    return (
      <Field name={ROLE_NAMES[role]} lock={`band.${role}`} locked={locked}>
        <select
          name={`band-${role}`}
          value={at === null ? '' : String(at)}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set({ band: { ...c.band, [role]: v === '' ? null : Number(v) } });
          }}
        >
          <option value="">None</option>
          {at !== null && !list.some((i) => i.program === at) && (
            <option value={String(at)}>Program {at}</option>
          )}
          {list.map((i) => (
            <option value={String(i.program)}>{i.name}</option>
          ))}
        </select>
      </Field>
    );
  };
  return (
    <aside class="customizer" role="complementary" aria-label="Song from melody" onKeyDown={keys}>
      <h2>Song from Melody</h2>
      <p class="hint">Each change composes the song again. Your project is kept until you choose below.</p>
      <div class="reroll">
        <button
          class="primary"
          onClick={() => roll()}
          title="A new seed, feeling, genre and key, but for what's locked"
        >
          Roll
        </button>
        <Versions versions={state.versions} at={state.at} />
      </div>
      <div class="groups">
        <Group title="Style and pace">
          <Field name="Feeling" lock="feeling" locked={locked}>
            <select
              ref={first}
              name="feeling"
              value={c.feeling}
              onChange={(e) => set({ feeling: e.currentTarget.value })}
            >
              {Object.keys(EMOTIONS).map((f) => (
                <option value={f}>{cap(f)}</option>
              ))}
            </select>
          </Field>
          <Field name="Genre" lock="genre" locked={locked}>
            <select name="genre" value={c.genre} onChange={(e) => set({ genre: e.currentTarget.value })}>
              <option value="">None</option>
              {Object.keys(GENRES).map((g) => (
                <option value={g}>{styleName(g)}</option>
              ))}
            </select>
          </Field>
          <Field name="Tempo" lock="tempo" locked={locked}>
            <span class="row">
              <input
                type="number"
                name="tempo"
                min={TEMPO.min}
                max={TEMPO.max}
                value={c.tempo}
                onChange={(e) => {
                  const v = Math.round(Number(e.currentTarget.value));
                  if (v >= TEMPO.min && v <= TEMPO.max) set({ tempo: v });
                  else e.currentTarget.value = String(c.tempo);
                }}
              />
              <span class="hint">bpm</span>
            </span>
          </Field>
          <Field name="Key" lock="key" locked={locked}>
            <span class="row">
              <select name="key" value={c.key} onChange={(e) => set({ key: e.currentTarget.value })}>
                {KEY_NAMES.map((k) => (
                  <option value={k}>{k}</option>
                ))}
              </select>
              <select name="mode" value={c.mode} onChange={(e) => set({ mode: e.currentTarget.value })}>
                {Object.keys(MODES).map((m) => (
                  <option value={m}>{m}</option>
                ))}
              </select>
            </span>
          </Field>
          <Field name="Seed" lock="seed" locked={locked}>
            <span class="row">
              <input name="seed" value={c.seed} onChange={(e) => set({ seed: e.currentTarget.value })} />
            </span>
          </Field>
        </Group>
        <Group title="Song form">
          <Field name="Form" lock="form" locked={locked}>
            <select name="form" value={c.form} onChange={(e) => set({ form: e.currentTarget.value })}>
              <option value={ONCE}>Melody once</option>
              {Object.keys(FORMS).map((f) => (
                <option value={f}>{words(f)}</option>
              ))}
            </select>
          </Field>
          <Field name="Melody in" locked={locked} off={!sections.length}>
            <select
              name="melodyIn"
              value={c.melodyIn}
              disabled={!sections.length}
              onChange={(e) => set({ melodyIn: e.currentTarget.value })}
            >
              {sections.map((t) => (
                <option value={t}>{words(t)}</option>
              ))}
            </select>
          </Field>
        </Group>
        <Group title="Band">{ROLES.map(band)}</Group>
        <Group title="Feel">
          <Field name="Groove" lock="groove" locked={locked}>
            <select name="groove" value={c.groove} onChange={(e) => set({ groove: e.currentTarget.value })}>
              {Object.keys(GROOVES).map((g) => (
                <option value={g}>{words(g)}</option>
              ))}
            </select>
          </Field>
          <Field name="Swing" lock="swing" locked={locked}>
            <input
              type="range"
              name="swing"
              min={0}
              max={0.75}
              step={0.01}
              value={c.swing}
              onChange={(e) => set({ swing: Number(e.currentTarget.value) })}
            />
          </Field>
          <Field name="Dynamics" lock="dynamics" locked={locked}>
            <input
              type="range"
              name="dynamics"
              min={0}
              max={1}
              step={0.05}
              value={c.dynamics}
              onChange={(e) => set({ dynamics: Number(e.currentTarget.value) })}
            />
          </Field>
          <Field name="Lift" lock="lift" locked={locked}>
            <span class="row">
              <input
                type="checkbox"
                name="lift"
                checked={c.lift}
                onChange={(e) => set({ lift: e.currentTarget.checked })}
              />
              <span class="hint">the last chorus goes up a step</span>
            </span>
          </Field>
          <Field name="Ritardando" lock="ritardando" locked={locked}>
            <span class="row">
              <input
                type="checkbox"
                name="ritardando"
                checked={c.ritardando}
                onChange={(e) => set({ ritardando: e.currentTarget.checked })}
              />
              <span class="hint">the end slows down</span>
            </span>
          </Field>
        </Group>
      </div>
      {error && (
        <p class="hint message error" role="status">
          Couldn't compose that: {error}
        </p>
      )}
      <div class="actions">
        <button onClick={cancelMelodySong} title="Put the project back as it was (Escape)">
          Cancel
        </button>
        <button
          onClick={replaceWithMelodySong}
          title="The song takes this project's place; Undo brings it back"
        >
          Replace This Project
        </button>
        <button
          class="primary"
          onClick={() => void saveAndCreateMelodySong()}
          title="Save this project, then open the song as a new one"
        >
          Save and Create New
        </button>
      </div>
    </aside>
  );
}

/** the customizer, while a song from a melody is previewed */
export function MelodySong() {
  const c = customizer.value;
  return c ? <Panel state={c} /> : null;
}
