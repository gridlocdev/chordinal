// Where the open project is kept, set once at start-up (apps/web/src/files.ts): folders anywhere on disk. The
// document code (document.ts) and the takes (recording.ts, the browser) read and write through it, and name the
// project in messages by it.
import { memoryStore } from './store/memory-store.ts';
import type { ProjectStore } from './store/project-store.ts';

export interface Place {
  /** where projects are kept: memory until start-up picks the desktop's folders or the browser's storage */
  files: ProjectStore;
  /** the project's place, as written in messages */
  where: (name: string) => string;
  /** Save As: asks where to save */
  chooseName: (title: string, current: string) => Promise<{ name: string; title: string } | null>;
  /** a project was opened from `name` */
  opened: ((name: string) => void) | null;
  /** a project was saved as `name` */
  saved: ((name: string) => void) | null;
  /** the question before unsaved changes go, or null for the default (Discard or Cancel) */
  askDiscard: ((title: string) => Promise<'save' | 'discard' | null>) | null;
}

export const place: Place = {
  files: memoryStore(),
  where: (name) => `“${name}”`,
  chooseName: async () => null,
  opened: null,
  saved: null,
  askDiscard: null,
};

export function setPlace(patch: Partial<Place>): void {
  Object.assign(place, patch);
}
