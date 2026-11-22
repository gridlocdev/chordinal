// The CLI's render page, in a hidden Electron window (bundled into dist/page.js). It plays projects offline as the
// app's Export as Audio File does (instruments, mixer, automation, Humanize), through the same audio engine, and
// decodes encoded files as Chromium does, for the jobs the CLI hands it (../jobs.ts). ?library=<id> picks the
// SoundFont library (without it, the app's default); ?rate=<Hz> renders at that sample rate rather than the sound
// device's, so a file comes out the same on every machine.
import { readProject, projectEnd, registerFx } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import { loadInstruments, playProject, LEAD_IN, audioEngine, dbToGain } from '@chordinal/playback';
import type { PlaybackHandle } from '@chordinal/playback';
import { beatToSeconds } from '@chordinal/lib';
import { soundfontLibrary } from '@chordinal/audio';
import { humanizeFx, HUMANIZE } from '@chordinal/perform';
import type { DecodeJob, Job, PlayJob } from '../jobs.ts';

const FADER_FLOOR_DB = -40; // a fader at the bottom is silent, as in the app

const params = new URLSearchParams(location.search);
const library = params.get('library');
if (library) soundfontLibrary.select(library);
const rate = Number(params.get('rate'));
if (rate) {
  // the audio engine renders at its context's rate, and makes that context with `new AudioContext()`
  const Base = AudioContext;
  window.AudioContext = class extends Base {
    constructor(options: AudioContextOptions = {}) {
      super({ ...options, sampleRate: rate });
    }
  };
}
registerFx(HUMANIZE, humanizeFx);

const put = (path: string, body: BodyInit): Promise<Response> => fetch(path, { method: 'PUT', body });

/** each track's gain and pan: muted and un-soloed tracks, and faders at the bottom, are silent */
function mixOf(p: Project): { gain: number; pan: number }[] {
  const soloed = p.tracks.some((t) => t.mixer.solo);
  return p.tracks.map(({ mixer: m }) => ({
    gain: m.mute || (soloed && !m.solo) || m.volumeDb <= FADER_FLOOR_DB ? 0 : dbToGain(m.volumeDb),
    pan: m.pan,
  }));
}

async function play(job: PlayJob): Promise<void> {
  const p: Project = { ...readProject(job.project), loop: null };
  const instruments = await loadInstruments(p.tracks);
  const until = job.until ?? projectEnd(p);
  const seconds = LEAD_IN + beatToSeconds(p.tempoMap, until) + job.tail;
  const playing: { handle: PlaybackHandle | null } = { handle: null };
  // the render drives the player's scheduler itself, as the app's export does
  const buffer = await audioEngine.render(seconds, () => {
    let tick = (): void => {};
    playing.handle = playProject(p, instruments, {
      from: 0,
      until,
      mix: mixOf(p),
      ticker: (_ms, fn) => {
        tick = fn;
        return () => {};
      },
    });
    return () => tick();
  });
  try {
    playing.handle?.stop();
  } catch {
    // its nodes went with the offline context
  }
  const out = new Float32Array(buffer.length * 2);
  out.set(buffer.getChannelData(0));
  out.set(buffer.getChannelData(1), buffer.length);
  await put(`/result/${job.id}?rate=${buffer.sampleRate}&leadIn=${LEAD_IN}`, out);
}

async function decode(job: DecodeJob): Promise<void> {
  const data = await (await fetch(job.url)).arrayBuffer();
  const decoded = await new OfflineAudioContext(2, 1, job.rate).decodeAudioData(data);
  const part = decoded.getChannelData(0).slice(job.from, job.from + job.count);
  await put(`/result/${job.id}?frames=${decoded.length}`, part);
}

const isJob = (v: unknown): v is Job =>
  typeof v === 'object' && v !== null && 'kind' in v && 'id' in v && typeof v.id === 'number';

for (;;) {
  const job: unknown = await (await fetch('/job')).json();
  if (!isJob(job)) throw new Error(`not a job: ${JSON.stringify(job)}`);
  if (job.kind === 'done') break;
  try {
    if (job.kind === 'play') await play(job);
    else await decode(job);
  } catch (e) {
    await put(`/error/${job.id}`, e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));
  }
}
