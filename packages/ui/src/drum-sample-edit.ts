// Samples on a drum track's rows (Chordinal PRD §14): an audio file dropped on a step grid row, or loaded from the
// row's right-click menu, is copied into the project's samples/ folder (sample-files.ts) and played on that row in place
// of the kit's sound. Each change is one edit.
import { SAMPLE_FILE, drumSamples, type DrumSample } from '@chordinal/audio';
import { drumName, isDrums, updateTrack } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import { mic } from '@chordinal/playback';
import { edit } from './document.ts';
import { notify } from './store.ts';
import { trackOf } from './tracks.ts';
import { errorText } from './errors.ts';
import { keepSample } from './sample-files.ts';

/** the sample on a drum track's row, or null when the kit plays it */
export const rowSample = (
  track: { instrument: { drumSamples?: object } } | null,
  key: number,
): DrumSample | null => drumSamples(track?.instrument.drumSamples).get(key) ?? null;

/** what a drum row is called: its sample's name, or the kit's name for the key */
export const rowName = (track: { instrument: { drumSamples?: object } } | null, key: number): string =>
  rowSample(track, key)?.name ?? drumName(key);

/** the track with its row samples changed by `change` (none left drops the field) */
function withRows(p: Project, trackId: string, change: (rows: Map<number, DrumSample>) => void): Project {
  const t = p.tracks.find((x) => x.id === trackId);
  if (!t) return p;
  const rows = drumSamples(t.instrument.drumSamples);
  change(rows);
  const { drumSamples: _, ...instrument } = t.instrument;
  return updateTrack(p, trackId, {
    instrument: rows.size ? { ...instrument, drumSamples: Object.fromEntries(rows) } : instrument,
  });
}

/** puts an audio file on a drum track's row, copied into the project, played as recorded */
export async function loadDrumSample(trackId: string, key: number, file: File): Promise<void> {
  const t = trackOf(trackId);
  if (!t || !isDrums(t)) return;
  if (!SAMPLE_FILE.test(file.name)) {
    notify(`${file.name}: a drum row plays a WAV, AIFF or MP3 file`, 'error');
    return;
  }
  notify(`Reading ${file.name}…`, 'busy');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await mic.decode(bytes.slice().buffer); // only an audio file the browser can play goes on the row
    const stored = await keepSample(file.name, bytes);
    const sample = { name: file.name.replace(SAMPLE_FILE, ''), file: stored };
    edit((p) => withRows(p, trackId, (rows) => rows.set(key, sample)));
    notify(`${drumName(key)} on ${t.name} plays ${file.name}`);
  } catch (e) {
    notify(`${file.name}: ${errorText(e)}`, 'error');
  }
}

/** takes a row's sample off, so the kit plays it again; its file stays in the project */
export function removeDrumSample(trackId: string, key: number): void {
  if (rowSample(trackOf(trackId), key)) edit((p) => withRows(p, trackId, (rows) => rows.delete(key)));
}

/** asks for an audio file and puts it on the row */
export function pickDrumSample(trackId: string, key: number): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wav,.aif,.aiff,.mp3,audio/wav,audio/aiff,audio/mpeg';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void loadDrumSample(trackId, key, file);
  });
  input.click();
}
