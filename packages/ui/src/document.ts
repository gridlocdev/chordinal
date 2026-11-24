// The open project as a document: opening, saving, starting a new empty one,
// and every edit, each a step undo can take back. Where projects are kept, and how Save As and the unsaved-changes
// question go, is set at start-up (place.ts).
import { emptyProject } from '@chordinal/daw';
import { history, commit, undo as undoStep, redo as redoStep } from '@chordinal/daw';
import { writeProject } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import {
  hist,
  project,
  projectName,
  saved,
  dirty,
  selected,
  selectedClip,
  picked,
  beat,
  notify,
  setSettings,
} from './store.ts';
import { stop } from './player.ts';
import { focus } from './focus.ts';
import { askYes } from './ask.ts';
import { place } from './place.ts';
import { ConflictError } from './store/project-store.ts';
import type { Version } from './store/project-store.ts';
import { classifyFile } from './store/classify-file.ts';
import { NEW, step, expectedOf } from './store/save-session.ts';
import type { SaveState } from './store/save-session.ts';
import { errorText } from './errors.ts';

/** what a new project starts from: a title, a tempo, a meter and a length in bars */
export interface NewProjectOptions {
  title?: string;
  bpm?: number;
  sig?: string;
  bars?: number;
}

let mergeKey: string | null = null;
/** the saves, and the opens that replace the project, one at a time in the order they were asked for: a save on its way
 * lands before another project takes the window, so its result can't be taken for the new one's */
let turn: Promise<unknown> = Promise.resolve();
/** counts the projects put in the window: a save asked for one that another has replaced by its turn doesn't run */
let shown = 0;
/** counts the projects put in the window, so what belongs to one can tell when another has taken its place */
export const projectShown = (): number => shown;
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const next = turn.then(task, task);
  turn = next.catch(() => undefined);
  return next;
}
/** the open project's relation to where it's kept: its version token there, a save on its way, a conflict */
let session: SaveState = NEW;

/**
 * Changes the project. Edits with the same merge key one after another (a fader dragged) are one undo step.
 */
export function edit(fn: (p: Project) => Project, merge: string | null = null): void {
  const h = hist.value,
    next = fn(h.present);
  if (next === h.present) return;
  hist.value =
    merge && merge === mergeKey && h.past.length ? { ...h, present: next, future: [] } : commit(h, next);
  mergeKey = merge;
}

/** gives the project a new title all through its undo history: naming it isn't an edit, so undo doesn't take it back */
function retitle(title: string): void {
  const h = hist.value;
  if (h.present.title === title) return;
  const named = (p: Project): Project => (p.title === title ? p : { ...p, title });
  hist.value = { past: h.past.map(named), present: named(h.present), future: h.future.map(named) };
}

export function undo(): void {
  mergeKey = null;
  hist.value = undoStep(hist.value);
  keepSelection();
}
export function redo(): void {
  mergeKey = null;
  hist.value = redoStep(hist.value);
  keepSelection();
}

// a selection the undo took away goes; picked notes go too, as their indexes may now be other notes
function keepSelection(): void {
  const p = project.value;
  if (picked.value.size) picked.value = new Set();
  if (selected.value && !p.tracks.some((t) => t.id === selected.value))
    selected.value = p.tracks[0]?.id ?? null;
  const c = selectedClip.value;
  if (c && !p.tracks.find((t) => t.id === c.track)?.clips.some((x) => x.id === c.clip))
    selectedClip.value = null;
}

/** puts a project in the window, stopped at its start; a project with no name has unsaved changes unless `clean` */
function show(p: Project, name: string, clean = false): void {
  shown++;
  stop();
  mergeKey = null;
  hist.value = history(p);
  saved.value = name || clean ? p : null;
  projectName.value = name;
  session = NEW;
  selected.value = p.tracks[0]?.id ?? null;
  selectedClip.value = null;
  picked.value = new Set();
  focus.value = 'arrange';
  beat.value = 0;
  notify('');
  if (name) setSettings({ project: name });
}

/** whether the unsaved changes, if any, may go: the app's question (Save, Don't Save or Cancel), or Discard or Cancel */
export async function discardOk(): Promise<boolean> {
  if (!dirty.value) return true;
  if (!place.askDiscard) return askYes(`Discard the changes to “${project.value.title}”?`, 'Discard');
  const answer = await place.askDiscard(project.value.title);
  return answer === 'discard' || (answer === 'save' && (await save()));
}

export async function openProject(name: string): Promise<boolean> {
  if (!(await discardOk())) return false;
  return inTurn(async () => {
    try {
      const { text, version } = await place.files.read(name);
      const file = classifyFile(text);
      if (file.kind !== 'project') throw new Error(file.message);
      show(file.project, name);
      session = step(session, { type: 'opened', version });
      place.opened?.(name);
      return true;
    } catch (e) {
      notify(`Couldn't open ${place.where(name)}: ${errorText(e)}`, 'error');
      return false;
    }
  });
}

/** a new, empty project, not saved yet */
export async function newProject({
  title = 'Untitled',
  bpm = 120,
  sig = '4/4',
  bars = 16,
}: NewProjectOptions = {}): Promise<void> {
  if (!(await discardOk())) return;
  const p = emptyProject({ title, bpm, sig, bars });
  await inTurn(async () => show(p, ''));
}

/** a project made elsewhere (an imported file), opened as a new one, not saved yet; `clean` when it has nothing worth
 * asking about until it's changed (Chordinal's empty new project) */
export async function openNew(p: Project, { clean = false }: { clean?: boolean } = {}): Promise<boolean> {
  if (!(await discardOk())) return false;
  return inTurn(async () => {
    show(p, '', clean);
    return true;
  });
}

/** saves to the project's folder, or asks for a name when it has none; saves run one at a time, in order, so an older
 * one can never land after a newer one. Resolves to whether it saved. */
export async function save(): Promise<boolean> {
  if (!projectName.value) return saveAs();
  const at = shown;
  return inTurn(async () => at === shown && saveNow());
}

/** resolves to whether it saved */
async function saveNow(): Promise<boolean> {
  const name = projectName.value,
    p = project.value;
  if (!name) return false;
  session = step(session, { type: 'save' });
  const expected = expectedOf(session);
  if (expected === undefined) return false; // saves run one at a time, so this can't happen
  try {
    const text = writeProject(p);
    let version: Version;
    try {
      version = await place.files.write(name, text, expected);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      // it changed where it's kept since it was read or written here (another app, a regenerated song): ask
      session = step(session, { type: 'conflict' });
      if (
        !(await askYes(
          `${place.where(name)} changed on disk since it was opened. Replace it with this version?`,
          'Replace',
        ))
      ) {
        session = step(session, { type: 'cancel' });
        return false;
      }
      session = step(session, { type: 'replace' });
      version = await place.files.write(name, text, null);
    }
    session = step(session, { type: 'done', version });
    saved.value = p;
    notify(`Saved ${place.where(name)}`);
    place.saved?.(name);
    return true;
  } catch (e) {
    session = step(session, { type: 'failed' });
    notify(`Couldn't save ${place.where(name)}: ${errorText(e)}`, 'error');
    return false;
  }
}

/** the takes of the project's old folder, copied into its new one after a Save As (those already there are kept) */
async function copyTakes(from: string, to: string): Promise<void> {
  try {
    const there = new Set(await place.files.takes(to).catch((): string[] => []));
    for (const file of await place.files.takes(from))
      if (!there.has(file))
        await place.files.writeTake(to, file, new Uint8Array(await place.files.readTake(from, file)));
  } catch (e) {
    notify(`Saved ${place.where(to)}, but couldn't copy its takes: ${errorText(e)}`, 'error');
  }
}

/** saves under a new name (the app's place asks where); the project takes the name only once it's saved there.
 * Resolves to whether it saved. */
export async function saveAs(): Promise<boolean> {
  const at = shown;
  const chosen = await place.chooseName(project.value.title, projectName.value);
  if (at !== shown) return false;
  if (!chosen) return false;
  const { name, title } = chosen;
  retitle(title);
  let before = '';
  // The move to the new place waits its turn behind the saves already on their way: made at once, those would land
  // under the new name and hand the old place's token to it. A new place, or one the user agreed to replace, starts
  // with no token; if the save fails, the project goes back to the old place as it was.
  const done = await inTurn(async () => {
    if (at !== shown) return false;
    before = projectName.value;
    const left = session;
    projectName.value = name;
    if (name !== before) session = step(session, { type: 'savedAs' });
    if (await saveNow()) return true;
    projectName.value = before;
    session = left;
    return false;
  });
  if (done) {
    setSettings({ project: name });
    if (before && name !== before) await copyTakes(before, name);
  }
  return done;
}
