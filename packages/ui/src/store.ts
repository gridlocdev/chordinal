// The app's state, as signals: what components read, and what the actions in document.ts, player.ts, recording.ts
// and live.ts change.
import { signal, computed, effect } from '@preact/signals';
import type { ReadonlySignal, Signal } from '@preact/signals';
import { storage } from './platform/storage.ts';
import { dbToGain } from '@chordinal/playback';
import type { ChannelMix } from '@chordinal/playback';
import { soundfontLibrary } from '@chordinal/audio';
import { emptyProject } from '@chordinal/daw';
import { history } from '@chordinal/daw';
import type { History, Project, Track } from '@chordinal/daw';

// ── settings, saved between runs ─────────────────────────────────────────────────────────────────────────────────────

/** Chordinal's browser, on the left */
export type BrowserTab = 'instruments' | 'kits' | 'projects' | 'takes';
/** what the editor, below the arrangement, shows */
export type EditorTab = 'roll' | 'mixer' | 'grid';
/** the theme setting: System follows the OS */
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  /** the SoundFont library; '' is the first */
  library: string;
  /** master volume */
  volume: number;
  /** musical typing's octave */
  octave: number;
  /** the project last opened, by folder name */
  project: string;
  browserTab: BrowserTab;
  browserOpen: boolean;
  editorTab: EditorTab;
  /** px */
  editorHeight: number;
  /** px: Chordinal's browser, on the left */
  leftWidth: number;
  theme: ThemeChoice;
  /** the piano roll's snap, in beats */
  grid: number;
  /** a click while recording, after the count-in */
  click: boolean;
  /** a click while playing */
  metronome: boolean;
  /** the arrangement scrolls to keep the playhead in view while playing */
  follow: boolean;
  /** the piano roll shows the other tracks' notes faintly */
  ghosts: boolean;
}

const DEFAULTS: Settings = {
  library: '',
  volume: 0.8,
  octave: 4,
  project: '',
  browserTab: 'instruments',
  browserOpen: true,
  editorTab: 'roll',
  editorHeight: 300,
  leftWidth: 260,
  theme: 'system',
  grid: 0.25,
  click: true,
  metronome: false,
  follow: true,
  ghosts: true,
};

export const settings: Signal<Settings> = signal(DEFAULTS);

export const setSettings = (patch: Partial<Settings>): void => {
  settings.value = { ...settings.value, ...patch };
};

/** writes the settings now, not a moment after the last change: before the window closes */
export const saveSettingsNow = (): Promise<void> | undefined => storage.save(settings.value);

export async function loadSettings(): Promise<void> {
  const saved = await storage.load();
  // the file holds the settings as this app wrote them, so they're taken as they are, over the defaults
  settings.value = { ...DEFAULTS, ...(saved as Partial<Settings>) };
  soundfontLibrary.select(settings.value.library);
  // written a moment after the last change, so dragging a fader isn't a file write per pixel
  let timer = 0;
  effect(() => {
    const all = settings.value;
    clearTimeout(timer);
    timer = setTimeout(() => storage.save(all), 300);
  });
}

// ── the project ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** a clip in the arrangement, by its track's id and its own */
export interface ClipRef {
  track: string;
  clip: string;
}

/** a stretch of the chord track, in beats */
export interface ChordRange {
  beat: number;
  beats: number;
}

/** a library being downloaded, and how far along (0..1) */
export interface LibraryDownload {
  id: string;
  fraction: number;
}

/** each track's level (peak 0..1) and the master's */
export interface Levels {
  tracks: number[];
  master: number;
}

/** the project and its undo history */
export const hist: Signal<History> = signal(history(emptyProject()));
export const project: ReadonlySignal<Project> = computed(() => hist.value.present);
/** its folder, or '' when it has never been saved */
export const projectName: Signal<string> = signal('');
/** the project as last saved or opened, to tell whether there are changes to save; null when it never was */
export const saved: Signal<Project | null> = signal(hist.value.present);
export const dirty: ReadonlySignal<boolean> = computed(() => project.value !== saved.value);
/** the ids of the SoundFont libraries on this machine */
export const installedLibraries: Signal<string[]> = signal([]);
/** the library being downloaded, and how far along */
export const libraryDownload: Signal<LibraryDownload | null> = signal(null);

/** the track the editor shows and musical typing plays, by id */
export const selected: Signal<string | null> = signal(null);
/** the clip selected in the arrangement */
export const selectedClip: Signal<ClipRef | null> = signal(null);
/** a stretch of the chord track picked to whistle a chord for */
export const chordRange: Signal<ChordRange | null> = signal(null);

/** selected notes, as 'clipId:index': an edit that moves notes to other indexes clears it */
export const picked: Signal<Set<string>> = signal(new Set());

export const selectedTrack: ReadonlySignal<Track | null> = computed(
  () => project.value.tracks.find((t) => t.id === selected.value) ?? null,
);

/** the fader's bottom, which is silence */
export const FADER_FLOOR_DB = -40;

/** each track's gain and pan for the player: muted and un-soloed tracks, and faders at the bottom, are silent */
export const mix: ReadonlySignal<ChannelMix[]> = computed(() => {
  const tracks = project.value.tracks;
  const soloed = tracks.some((t) => t.mixer.solo);
  return tracks.map(({ mixer: m }) => ({
    gain: m.mute || (soloed && !m.solo) || m.volumeDb <= FADER_FLOOR_DB ? 0 : dbToGain(m.volumeDb),
    pan: m.pan,
    reverb: m.sends.reverb,
    delay: m.sends.delay,
    lowCut: m.lowCut,
  }));
});

// ── the transport ────────────────────────────────────────────────────────────────────────────────────────────────────

export const playing: Signal<boolean> = signal(false);
/** the playhead, in beats */
export const beat: Signal<number> = signal(0);
/** the status bar's notice (PRD §5.6): what just happened, what's under way, or what went wrong; '' for none */
export const status: Signal<string> = signal('');
/** what kind of notice `status` is: 'done' goes after a while (notices.ts), 'busy' and 'error' stay */
export type NoticeTone = 'done' | 'busy' | 'error';
export const statusTone: Signal<NoticeTone> = signal('done');
/** shows a notice in the status bar, replacing the one there; '' clears it */
export function notify(text: string, tone: NoticeTone = 'done'): void {
  statusTone.value = tone;
  status.value = text;
}
/** true from an export's start to its end, loading included: nothing else plays meanwhile */
export const exporting: Signal<boolean> = signal(false);
/** while playing: each track's level (peak 0..1) and the master's, for the mixer's meters */
export const levels: Signal<Levels> = signal({ tracks: [], master: 0 });
