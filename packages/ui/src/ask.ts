// Questions put to the user in the window (Electron has no window.prompt): a line of text, yes or no, or one of a few
// choices. The Ask component shows the one pending.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';

/** the answer of a choice's second button */
export const OTHER: unique symbol = Symbol('other');

/** an answer: the text entered ('' for yes), OTHER for a choice's second button, or null when cancelled */
export type Answer = string | typeof OTHER | null;

/** the question showing: its text, the text field's value (null for yes/no), its buttons, and what hears the answer */
export interface Question {
  text: string;
  value: string | null;
  yes: string;
  other?: string;
  resolve: (v: Answer) => void;
}

/** the question showing, or null */
export const asking: Signal<Question | null> = signal(null);

/** resolves to the text entered, or null when cancelled */
export const askText = (text: string, value = '', yes = 'OK'): Promise<string | null> =>
  new Promise((resolve) => {
    asking.value = { text, value, yes, resolve: (v) => resolve(typeof v === 'symbol' ? null : v) };
  });

export const askYes = (text: string, yes = 'OK'): Promise<boolean> =>
  new Promise((resolve) => {
    asking.value = { text, value: null, yes, resolve: (v) => resolve(v !== null) };
  });

/**
 * A question with a second answer beside Cancel, as macOS asks before changes go: Save, Don't Save, Cancel.
 * Resolves to which was picked, or null when cancelled.
 */
export const askChoice = (text: string, yes: string, other: string): Promise<'yes' | 'other' | null> =>
  new Promise((resolve) => {
    asking.value = {
      text,
      value: null,
      yes,
      other,
      resolve: (v) => resolve(v === null ? null : v === OTHER ? 'other' : 'yes'),
    };
  });

/** answers the question showing: its text, '' for yes, OTHER for a choice's second button, or null to cancel */
export function answer(v: Answer): void {
  const a = asking.value;
  asking.value = null;
  a?.resolve(v);
}
