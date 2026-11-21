// Where the open project is kept, set once at start-up (src/chordinal/files.js): folders anywhere on disk. The
// document code (document.js) and the takes (recording.js, the browser) read and write through it, and name the
// project in messages by it.
import { memoryStore } from './store/memory-store.ts';

/**
 * @typedef {object} Place
 * @property {import('./store/project-store.ts').ProjectStore} files  where projects are kept: memory until start-up
 *   picks the desktop's folders or the browser's storage
 * @property {(name: string)=> string} where  the project's place, as written in messages
 * @property {(title: string, current: string)=> Promise<{ name: string, title: string }|null>} chooseName
 *   Save As: asks where to save
 * @property {((name: string)=> void)|null} opened  a project was opened from `name`
 * @property {((name: string)=> void)|null} saved  a project was saved as `name`
 * @property {((title: string)=> Promise<'save'|'discard'|null>)|null} askDiscard  the question before unsaved changes go,
 *   or null for the default (Discard or Cancel)
 */

/** @type {Place} */
export const place = {
    files: memoryStore(),
    where: (name)=> `“${name}”`,
    chooseName: async ()=> null,
    opened: null,
    saved: null,
    askDiscard: null,
};

/** @param {Partial<Place>} patch */
export function setPlace(patch) { Object.assign(place, patch); }
