// Recording onto an audio track (Chordinal PRD §16.7): Record with an audio track selected plays the project from the
// playhead, on past its end and round no loop, and keeps what the microphone hears as a clip on the track from there,
// with the time the sound takes to reach the speakers and come back through the mic taken off. Record again, or Stop,
// ends the take. The track's Monitor button plays the mic through the track, during a take or at any other time.
import { effect, signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { addAudioClip, isAudioTrack } from '@chordinal/daw';
import type { Insert, Track } from '@chordinal/daw';
import { bpmAt, encodeWav, takeSamples } from '@chordinal/lib';
import type { StampedBlock } from '@chordinal/lib';
import { mic, monitorTrack } from '@chordinal/playback';
import type { Monitor } from '@chordinal/playback';
import { project, playing, beat, notify, selected } from './store.ts';
import { edit } from './document.ts';
import { play, playingFrom, stop } from './player.ts';
import { errorText } from './errors.ts';
import { audioFiles, audioRead } from './audio-files.ts';

/** a take on an audio track: its track, and where playing started (beat `from` at audio time `at`) */
export interface AudioTake {
  track: string;
  from: number;
  at: number;
}

/** the audio take being recorded, or null */
export const audioTake: Signal<AudioTake | null> = signal(null);

/** the audio track whose Monitor button is on, or null */
export const monitored: Signal<string | null> = signal(null);

const SHORTEST = 0.1; // seconds: a take shorter than this keeps nothing
const TAKE_FILE = 'Take.wav'; // what a take's file is called in the audio/ folder (then "Take 2.wav" and so on)

let blocks: StampedBlock[] = [];
let starting = false; // a take is waiting for the mic or the instruments
const keepBlock = (samples: Float32Array, time: number) => {
  if (audioTake.value) blocks.push({ samples: samples.slice(), time });
};

/** turns the mic on (or keeps it on) with its blocks going to the take; false, with a notice, when there's none */
async function micOn(): Promise<boolean> {
  try {
    await mic.start(keepBlock);
    return true;
  } catch (e) {
    notify(`No microphone: ${errorText(e)}`, 'error');
    return false;
  }
}

/** starts a take on audio track `trackId` from the playhead, or ends the one under way */
export async function recordAudio(trackId: string): Promise<void> {
  if (audioTake.value) return finishAudio();
  if (starting) return;
  starting = true;
  try {
    stop();
    if (!(await micOn())) return;
    selected.value = trackId;
    await play({ endless: true });
    const started = playingFrom();
    if (!started || !playing.value) return;
    blocks = [];
    audioTake.value = { track: trackId, ...started };
    notify('Recording…', 'busy');
  } finally {
    starting = false;
  }
}

/** ends the take under way and puts it on its track as a clip, from where playing started */
export async function finishAudio(): Promise<void> {
  const take = audioTake.value;
  if (!take) return;
  audioTake.value = null;
  if (playing.value) stop();
  const rate = mic.rate;
  // the sound of beat `from` left at `at` and came back through the mic this much later
  const samples = takeSamples(blocks, take.at + mic.latency, rate);
  blocks = [];
  if (samples.length < rate * SHORTEST) {
    notify('That take was too short to keep.');
    return;
  }
  try {
    const file = await audioFiles.keep(TAKE_FILE, encodeWav(samples, rate));
    await audioFiles.read(file);
    audioRead.value++;
    edit((p) =>
      isAudioTrack(p.tracks.find((t) => t.id === take.track) ?? {})
        ? addAudioClip(p, take.track, { start: take.from, file, seconds: samples.length / rate })
        : p,
    );
    beat.value = take.from;
    notify(`Recorded ${file}`);
  } catch (e) {
    notify(`Couldn't keep the take: ${errorText(e)}`, 'error');
  }
}

// Stop, or the Play button, during a take ends it
effect(() => {
  if (!playing.value && audioTake.peek()) void finishAudio();
});

/** turns an audio track's Monitor button on or off */
export async function toggleMonitor(trackId: string): Promise<void> {
  if (monitored.value === trackId) {
    monitored.value = null;
    return;
  }
  if (await micOn()) monitored.value = trackId;
}

// the monitor follows its track's strip as it's edited, and stops when the button goes off or the track goes
let monitor: { stop(): void; track: Track; master: Insert[] | undefined } | null = null;
effect(() => {
  const id = monitored.value,
    p = project.value,
    track = id ? p.tracks.find((t) => t.id === id) : undefined;
  if (monitor && track === monitor.track && p.masterInserts === monitor.master) return;
  monitor?.stop();
  monitor = null;
  if (!id) return;
  if (!track || !isAudioTrack(track)) {
    monitored.value = null;
    return;
  }
  try {
    const m: Monitor = monitorTrack(track, bpmAt(p.tempoMap, beat.peek()), p.masterInserts);
    monitor = { stop: () => m.stop(), track, master: p.masterInserts };
  } catch (e) {
    notify(`Couldn't monitor: ${errorText(e)}`, 'error');
    monitored.value = null;
  }
});
