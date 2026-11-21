// The open project's relation to where it is kept (Chordinal PRD §4.6), as a statechart: whether it has a place yet,
// the version token of what is there, whether a save is on its way, and whether the place changed behind its back.
// Pure: document.ts feeds it events and does what the state says (which token a save passes, whether to ask).
//
//   new ──save──▶ saving ──done──▶ saved ──save──▶ saving (passing saved's token)
//                  │ ├──failed──▶ back where it was
//                  │ └──conflict──▶ conflict ──replace──▶ saving (passing no token)
//                  │                         └──cancel───▶ saved (the old token: the next save asks again)
//   any state ──opened──▶ saved; savedAs (a new place) ──▶ new, unless a save is on its way
import type { Version } from './project-store.ts';

export type SaveState =
  /** not kept anywhere yet, or just moved to a new place: the first write passes no token */
  | { at: 'new' }
  /** what's kept is `version`, as read or last written here */
  | { at: 'saved'; version: Version }
  /** a write is on its way, passing `expected`; `before` is the state to go back to if it fails */
  | { at: 'saving'; expected: Version | null; before: SaveState & { at: 'new' | 'saved' } }
  /** the place changed since `version`: the user picks Replace, or Cancel to leave it */
  | { at: 'conflict'; version: Version };

export type SaveEvent =
  | { type: 'opened'; version: Version }
  | { type: 'save' }
  | { type: 'done'; version: Version }
  | { type: 'failed' }
  | { type: 'conflict' }
  | { type: 'replace' }
  | { type: 'cancel' }
  | { type: 'savedAs' };

export const NEW: SaveState = { at: 'new' };

/** the next state; an event the state doesn't take leaves it as it is */
export function step(s: SaveState, e: SaveEvent): SaveState {
  switch (e.type) {
    case 'opened':
      return { at: 'saved', version: e.version };
    case 'savedAs':
      return s.at === 'saving' ? s : NEW;
    case 'save':
      if (s.at === 'new') return { at: 'saving', expected: null, before: s };
      if (s.at === 'saved') return { at: 'saving', expected: s.version, before: s };
      return s;
    case 'done':
      return s.at === 'saving' ? { at: 'saved', version: e.version } : s;
    case 'failed':
      return s.at === 'saving' ? s.before : s;
    case 'conflict':
      return s.at === 'saving' && s.expected !== null ? { at: 'conflict', version: s.expected } : s;
    case 'replace':
      return s.at === 'conflict'
        ? { at: 'saving', expected: null, before: { at: 'saved', version: s.version } }
        : s;
    case 'cancel':
      return s.at === 'conflict' ? { at: 'saved', version: s.version } : s;
  }
}

/** the token a write passes in this state, or undefined when no write may start */
export function expectedOf(s: SaveState): Version | null | undefined {
  return s.at === 'saving' ? s.expected : undefined;
}
