// Plays the open project: loads its instruments, starts it from the playhead, follows it with the playhead, keeps the
// mixer's faders, pans, sends and low cuts on its channels, and starts again from where it is when an edit changes what's heard.
import { effect } from '@preact/signals';
import { loadInstruments } from '@chordinal/playback';
import { playProject } from '@chordinal/playback';
import type { PlaybackHandle } from '@chordinal/playback';
import { projectEnd } from '@chordinal/daw';
import type { Mixer, Project } from '@chordinal/daw';
import { audioEngine } from '@chordinal/playback';
import { project, mix, playing, beat, notify, settings, levels, exporting } from './store.ts';
import { errorText } from './errors.ts';
import { readSample } from './sample-files.ts';

let handle: PlaybackHandle | null = null;
let heard: Project | null = null; // the project the handle plays
let starting = 0; // id of the newest play request, so a slow load can't start a project that was replaced
let frame = 0;
const FALL = 0.92; // what's left of a meter's level a frame later

export async function play(): Promise<void> {
  if (audioEngine.rendering || exporting.value) {
    notify('Wait for the export to finish');
    return;
  }
  const p = project.value;
  const id = ++starting;
  halt();
  playing.value = true;
  try {
    const instruments = await loadInstruments(
      p.tracks,
      (text) => {
        if (id === starting) notify(text, 'busy');
      },
      readSample,
    );
    if (id !== starting) return;
    // an edit while the instruments loaded: start again with what's there now (and its instruments)
    if (project.value !== p) return play();
    const from = beat.value >= projectEnd(p) ? 0 : beat.value;
    heard = p;
    handle = playProject(p, instruments, { from, mix: mix.value, click: settings.value.metronome });
    notify('');
    follow(handle);
  } catch (e) {
    if (id === starting) {
      notify(`Couldn't play: ${errorText(e)}`, 'error');
      playing.value = false;
    }
  }
}

// the playhead follows the project once a frame, until it ends
function follow(h: PlaybackHandle): void {
  cancelAnimationFrame(frame);
  const step = () => {
    if (h !== handle) return;
    if (h.done) {
      stop();
      return;
    }
    beat.value = Math.max(0, h.beat);
    if (settings.value.editorTab === 'mixer') {
      // a meter falls back slowly from a peak, so a short note still shows
      const was = levels.value,
        fall = (v: number, i?: number) =>
          Math.max(v, (i === undefined ? was.master : (was.tracks[i] ?? 0)) * FALL);
      levels.value = { tracks: h.levels().map((v, i) => fall(v, i)), master: fall(audioEngine.level) };
    }
    frame = requestAnimationFrame(step);
  };
  step();
}

function halt(): void {
  cancelAnimationFrame(frame);
  handle?.stop();
  handle = null;
  levels.value = { tracks: [], master: 0 };
}

/** stops where it is; stopping when already stopped goes back to the start */
export function stop(): void {
  starting++;
  if (!playing.value && !handle) beat.value = 0;
  halt();
  playing.value = false;
}

export const toggle = (): Promise<void> | void => (playing.value ? stop() : play());

export function seek(to: number): void {
  beat.value = Math.max(0, Math.min(projectEnd(project.value), to));
  handle?.seek(beat.value);
}

/** restarts from the playhead, when playing, so a change is heard */
export function reload(): void {
  if (playing.value) void play();
}

const MIX_ONLY: readonly (keyof Mixer)[] = ['volumeDb', 'pan', 'mute', 'solo', 'lowCut', 'sends'];
// what playback hears besides the tracks: the tempo, loop and end, and what Humanize reads (sections, meter, key,
// chords, and the title as its seed)
const HEARD: readonly (keyof Project)[] = [
  'tempoMap',
  'loop',
  'markers',
  'groove',
  'meters',
  'key',
  'chords',
  'length',
  'title',
];
/** whether an edit changed more than the faders, pans, mutes, solos, sends and low cuts, which play on without a restart */
export function heardDifferently(a: Project, b: Project): boolean {
  if (a.tracks.length !== b.tracks.length || HEARD.some((k) => a[k] !== b[k])) return true;
  return a.tracks.some((t, i) => {
    const u = b.tracks[i];
    if (t === u) return false;
    if (
      !u ||
      t.id !== u.id ||
      t.clips !== u.clips ||
      t.audio !== u.audio ||
      t.instrument !== u.instrument ||
      t.fx !== u.fx ||
      t.automation !== u.automation
    )
      return true;
    // the mixer's own keys: Object.keys lists only those
    const keys = Object.keys(t.mixer) as (keyof Mixer)[];
    return keys.some((k) => !MIX_ONLY.includes(k) && t.mixer[k] !== u.mixer[k]);
  });
}

// an edit while playing: the faders follow at once; anything else is heard after a moment's pause in the editing
let restart = 0;
effect(() => {
  const p = project.value;
  if (!handle || !heard || p === heard) return;
  if (!heardDifferently(heard, p)) {
    // track effects change as they play: settings glide, and the chain is rewired where effects come and go
    if (
      p.masterInserts !== heard.masterInserts ||
      p.tracks.some((t, i) => t.inserts !== heard?.tracks[i]?.inserts)
    )
      handle.setInserts(
        p.tracks.map((t) => t.inserts),
        p.masterInserts ?? [],
      );
    heard = p;
    return;
  }
  clearTimeout(restart);
  restart = setTimeout(() => {
    if (playing.value && project.value !== heard) void play();
  }, 250);
});
effect(() => {
  const m = mix.value;
  handle?.setMix(m);
});
// the metronome turned on or off is heard at once
let clicking = settings.value.metronome;
effect(() => {
  const on = settings.value.metronome;
  if (on !== clicking) {
    clicking = on;
    reload();
  }
});
