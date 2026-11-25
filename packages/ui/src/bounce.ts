// Export as Audio File: the project, or a stretch of it, played into an offline context, faster than it would play,
// and saved as a stereo WAV: the mix, or each track on its own into a folder (stems, all the same length). It plays
// as Play would (instruments, mixer, automation, Humanize) but once through, with no loop.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { loadInstruments } from '@chordinal/playback';
import { playProject, LEAD_IN } from '@chordinal/playback';
import type { ChannelMix, LoadedInstrument } from '@chordinal/playback';
import { audioClipEnd, audioClipsOf, projectEnd } from '@chordinal/daw';
import type { Loop, Project } from '@chordinal/daw';
import { beatToSeconds } from '@chordinal/lib';
import { encodeWavChannels, normalize, peakOf } from '@chordinal/lib';
import { audioEngine } from '@chordinal/playback';
import { appMenu } from './platform/app-menu.ts';
import { project, projectName, mix, notify, exporting } from './store.ts';
import { stop } from './player.ts';
import { errorText } from './errors.ts';
import { readSample } from './sample-files.ts';

/** whether the Export dialog is open */
export const exportDialog: Signal<boolean> = signal(false);

export const TAIL = 3; // seconds after the last beat, for reverb and release
const PEAK_DB = -1; // a normalized export's peak

/** audio rendered: two channels and their sample rate */
export interface Rendered {
  channels: Float32Array[];
  rate: number;
}

/** what writeStems needs: how many stems, and how to render, write and report each */
export interface StemWriter {
  count: number;
  render: (n: number) => Promise<Rendered>;
  write: (n: number, bytes: Uint8Array) => Promise<unknown>;
  normalized: boolean;
  say: (n: number, measuring: boolean) => void;
}

/**
 * range: the beats to export (the whole project without one); stems: each audible track into a folder of its own
 * files rather than the mix; normalized: the loudest peak brought to −1 dB (for stems, one gain for them all, so
 * they keep their balance); tail: seconds after the end, for reverb and release
 */
export interface BounceOptions {
  range?: Loop | null;
  stems?: boolean;
  normalized?: boolean;
  tail?: number;
}

/** a file name without the characters a file system won't take */
const fileName = (s: string) => s.replace(/[/\\:*?"<>|]/g, '-').trim() || 'untitled';

/** the stretch `from`–`to` (beats) played with `gains`, then `tail` seconds: two channels */
async function render(
  p: Project,
  instruments: LoadedInstrument[],
  from: number,
  to: number,
  tail: number,
  gains: ChannelMix[],
): Promise<Rendered> {
  const seconds = LEAD_IN + beatToSeconds(p.tempoMap, to) - beatToSeconds(p.tempoMap, from) + tail;
  let stopPlaying = () => {};
  const buffer = await audioEngine.render(seconds, () => {
    let tick = () => {};
    const handle = playProject(p, instruments, {
      from,
      until: to,
      mix: gains,
      ticker: (_ms, fn) => {
        tick = fn;
        return () => {};
      },
    });
    stopPlaying = () => handle.stop();
    return () => tick();
  });
  try {
    stopPlaying();
  } catch {
    /* its nodes went with the offline context */
  }
  const skip = Math.round(LEAD_IN * buffer.sampleRate);
  return { channels: [0, 1].map((c) => buffer.getChannelData(c).slice(skip)), rate: buffer.sampleRate };
}

/**
 * renders each of `count` stems and writes it before the next is rendered, so only one stem is held at a time. A
 * normalized export needs one gain for them all, so it first renders every stem to find the loudest peak, then
 * renders each again to write it.
 */
export async function writeStems({ count, render, write, normalized, say }: StemWriter): Promise<void> {
  let peak = 0;
  if (normalized)
    for (let n = 0; n < count; n++) {
      say(n, true);
      peak = Math.max(peak, peakOf((await render(n)).channels));
    }
  for (let n = 0; n < count; n++) {
    say(n, false);
    const { channels, rate } = await render(n);
    await write(n, encodeWavChannels(normalized ? normalize(channels, PEAK_DB, peak) : channels, rate));
  }
}

/** exports the project as audio */
export async function bounce(options: BounceOptions = {}): Promise<void> {
  if (exporting.value) return;
  stop();
  exporting.value = true;
  try {
    await exportAudio(options);
  } finally {
    exporting.value = false;
  }
}

async function exportAudio({ range = null, stems = false, normalized = false, tail = TAIL }: BounceOptions) {
  const p: Project = { ...project.value, loop: null };
  const name = fileName(projectName.value || p.title || 'untitled');
  const from = range?.from ?? 0,
    to = range?.to ?? projectEnd(p);
  const gains = mix.value;
  try {
    const instruments = await loadInstruments(p.tracks, (text) => notify(text, 'busy'), readSample);
    if (!stems) {
      notify('Bouncing…', 'busy');
      const { channels, rate } = await render(p, instruments, from, to, tail, gains);
      const file = await appMenu.saveFile(
        `${name}.wav`,
        encodeWavChannels(normalized ? normalize(channels, PEAK_DB) : channels, rate),
      );
      notify(file ? `Exported ${file}` : '');
      return;
    }
    // a track is exported if it is heard and has a clip in the range
    const audible = p.tracks
      .map((track, index) => ({ track, index }))
      .filter(
        ({ track, index }) =>
          ((gains[index]?.gain ?? 0) > 0 &&
            track.clips.some((c) => c.start < to && c.start + c.beats > from && c.notes.length && !c.mute)) ||
          audioClipsOf(track).some((c) => c.start < to && audioClipEnd(p.tempoMap, c) > from && !c.mute),
      );
    if (!audible.length) {
      notify('No track to export: none is heard in that range');
      return;
    }
    const folder = await appMenu.chooseFolder(`${name} stems`);
    if (!folder) {
      notify('');
      return;
    }
    const used = new Set<string>();
    const stemsOut = audible.map(({ track, index }) => {
      let file = `${name} - ${fileName(track.name)}`;
      for (let k = 2; used.has(file); k++) file = `${name} - ${fileName(track.name)} ${k}`;
      used.add(file);
      return { track, index, file: `${file}.wav` };
    });
    const stemAt = (n: number) => {
      const s = stemsOut[n];
      if (!s) throw new RangeError(`no stem ${n}`);
      return s;
    };
    await writeStems({
      count: stemsOut.length,
      render: (n) => {
        const { index } = stemAt(n);
        return render(
          p,
          instruments,
          from,
          to,
          tail,
          gains.map((g, k) => (k === index ? g : { ...g, gain: 0 })),
        );
      },
      write: (n, bytes) => Promise.resolve(appMenu.writeInFolder(stemAt(n).file, bytes)),
      normalized,
      say: (n, measuring) => {
        notify(
          `${measuring ? 'Measuring' : 'Bouncing'} ${stemAt(n).track.name} (${n + 1} of ${stemsOut.length})…`,
          'busy',
        );
      },
    });
    notify(`Exported ${stemsOut.length} tracks to ${folder}`);
  } catch (e) {
    notify(`Couldn't export: ${errorText(e)}`, 'error');
  }
}
