// Questions put to the user in the window (Electron has no window.prompt): a line of text, yes or no, or one of a few
// choices. The Ask component shows the one pending.
import { signal } from '@preact/signals';

/** the question showing: { text, value (null for yes/no), yes, other?, resolve } */
export const asking = signal(/** @type {any} */ (null));

/** @returns {Promise<string|null>} the text entered, or null when cancelled */
export const askText = (text, value = '', yes = 'OK')=> new Promise(resolve => { asking.value = { text, value, yes, resolve }; });

/** @returns {Promise<boolean>} */
export const askYes = (text, yes = 'OK')=> new Promise(resolve => { asking.value = { text, value: null, yes, resolve: (v)=> resolve(v !== null) }; });

/**
 * A question with a second answer beside Cancel, as macOS asks before changes go: Save, Don't Save, Cancel.
 * @returns {Promise<'yes'|'other'|null>} which was picked, or null when cancelled
 */
export const askChoice = (text, yes, other)=> new Promise(resolve =>
{
    asking.value = { text, value: null, yes, other, resolve: (v)=> resolve(v === null ? null : v === OTHER ? 'other' : 'yes') };
});

/** the answer of a choice's second button */
export const OTHER = Symbol('other');

/** answers the question showing: its text, '' for yes, OTHER for a choice's second button, or null to cancel */
export function answer(v)
{
    const a = asking.value;
    asking.value = null;
    a?.resolve(v);
}
