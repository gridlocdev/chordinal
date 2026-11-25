// The desktop app's one bridge to the page: `window.chordinalNative`, set by apps/desktop/src/preload.ts. The page
// reaches it only through `nativeBridge()`; in a browser there is none, and each caller falls back (IndexedDB for
// projects and settings, no native menus, downloads instead of save dialogs). The preload checks itself against this
// interface, so the two can't drift.

/** a project as read from disk, with the version a save must pass */
export interface NativeStored {
  text: string;
  version: string;
}

/** a project folder: its path and its name */
export interface NativeFolder {
  path: string;
  name: string;
}

/** an Open Recent entry: greyed when the folder is gone */
export interface NativeRecent extends NativeFolder {
  exists: boolean;
}

/** a menu item as the page describes it; the desktop app sends back its id when it's picked */
export interface NativeMenuItem {
  type?: 'separator';
  role?: string;
  id?: string;
  label?: string;
  enabled?: boolean;
  checked?: boolean;
  radio?: boolean;
  accelerator?: string;
  /** a shortcut shown but not registered (the page handles the key) */
  shown?: string;
  /** drops its shortcut while a text field has focus */
  field?: boolean;
  /** the text field's own edit, done instead while typing (or always, with `native`) */
  text?: string;
  native?: boolean;
  submenu?: NativeMenuItem[];
}

export interface ChordinalNative {
  /** the app's settings, kept in a file in the app's data folder */
  storage: {
    load(): Promise<unknown>;
    write(all: unknown): Promise<void>;
  };
  /** the SoundFont libraries: which are installed, and downloading one */
  soundfonts: {
    installed(): Promise<string[]>;
    download(id: string): Promise<void>;
    onProgress(fn: (id: string, loaded: number, total: number) => void): void;
  };
  /** the native menu bar and right-click menus, the docs, and files picked in the OS's dialogs */
  menu: {
    setBar(menus: NativeMenuItem[]): void;
    popup(items: NativeMenuItem[]): void;
    typing(on: boolean): void;
    onPick(fn: (id: string) => void): void;
    /** opens a page of the docs (README.md, docs/…) */
    open(rel: string): Promise<void>;
    /** null when cancelled */
    openFile(title: string, extensions: string[]): Promise<{ name: string; bytes: Uint8Array } | null>;
    /** the path written, or '' when cancelled */
    saveFile(name: string, bytes: Uint8Array): Promise<string>;
    /** the folder picked for a set of files, or '' when cancelled */
    chooseFolder(name: string): Promise<string>;
    /** writes one file into the folder last chosen; resolves to its path */
    writeInFolder(name: string, bytes: Uint8Array): Promise<string>;
  };
  /** projects in folders anywhere on disk */
  projects: {
    recent(): Promise<NativeRecent[]>;
    forget(dir: string): Promise<void>;
    clear(): Promise<void>;
    exists(dir: string): Promise<boolean>;
    read(dir: string): Promise<NativeStored>;
    /** rejects with an error naming CONFLICT when the file changed since `expected` */
    write(dir: string, text: string, expected: string | null): Promise<string>;
    used(dir: string): Promise<void>;
    takes(dir: string): Promise<string[]>;
    readTake(dir: string, file: string): Promise<Uint8Array>;
    writeTake(dir: string, file: string, bytes: Uint8Array): Promise<void>;
    /** the audio files in samples/ */
    samples(dir: string): Promise<string[]>;
    readSample(dir: string, file: string): Promise<Uint8Array>;
    writeSample(dir: string, file: string, bytes: Uint8Array): Promise<void>;
    /** the audio tracks' files in audio/ */
    audio(dir: string): Promise<string[]>;
    readAudio(dir: string, file: string): Promise<Uint8Array>;
    writeAudio(dir: string, file: string, bytes: Uint8Array): Promise<void>;
    /** the projects in Documents/Chordinal/ */
    library(): Promise<NativeFolder[]>;
    /** a folder handed over at launch, or '' */
    handed(): Promise<string>;
    onHandedOver(fn: (dir: string) => void): void;
    /** a MIDI file handed over at launch (Open With in the Finder), read, or null */
    handedMidi(): Promise<{ name: string; bytes: Uint8Array } | null>;
    onMidiHandedOver(fn: (file: { name: string; bytes: Uint8Array }) => void): void;
    reveal(dir: string): Promise<void>;
    /** the folder picked, or '' when cancelled */
    pickOpen(): Promise<string>;
    pickSave(name: string): Promise<string>;
  };
  /** the window: whether it has unsaved changes, its close question, and how it's framed */
  window: {
    dirty(on: boolean): void;
    onClosing(fn: () => void): void;
    close(): void;
    /** 'unified' when the page's top row is the title bar (macOS), 'native' when the window has its own */
    chrome: 'unified' | 'native';
    /** told when the window enters or leaves full screen */
    onFullScreen(fn: (full: boolean) => void): void;
  };
}

/** the desktop bridge, or undefined in a browser */
export const nativeBridge = (): ChordinalNative | undefined =>
  (globalThis as { chordinalNative?: ChordinalNative }).chordinalNative;
