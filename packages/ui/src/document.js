// The open project as a document: opening, saving, starting a new one (empty, or made by the composer from a spec),
// and every edit, each a step undo can take back. Where projects are kept, and how Save As and the unsaved-changes
// question go, is set at start-up (place.js).
import { emptyProject } from '@chordinal/daw';
import { history, commit, undo as undoStep, redo as redoStep } from '@chordinal/daw';
import { writeProject } from '@chordinal/daw';
import { compose } from '@chordinal/composer';
import { toProject } from '@chordinal/composer';
import { hist, project, projectName, saved, dirty, selected, selectedClip, picked, chordRange, beat, status, setSettings } from './store.js';
import { stop } from './player.js';
import { focus } from './focus.js';
import { askYes } from './ask.js';
import { place } from './place.js';
import { ConflictError } from './store/project-store.ts';
import { classifyFile } from './store/classify-file.ts';
import { NEW, step, expectedOf } from './store/save-session.ts';

let mergeKey = null;
/** the open project's relation to where it's kept: its version token there, a save on its way, a conflict
 * @type {import('./store/save-session.ts').SaveState} */
let session = NEW;

/**
 * Changes the project. Edits with the same merge key one after another (a fader dragged) are one undo step.
 * @param {(p: import('@chordinal/daw').Project)=> import('@chordinal/daw').Project} fn
 * @param {string|null} [merge]
 */
export function edit(fn, merge = null)
{
    const h = hist.value, next = fn(h.present);
    if (next === h.present) return;
    hist.value = merge && merge === mergeKey && h.past.length ? { ...h, present: next, future: [] } : commit(h, next);
    mergeKey = merge;
}

export function undo() { mergeKey = null; hist.value = undoStep(hist.value); keepSelection(); }
export function redo() { mergeKey = null; hist.value = redoStep(hist.value); keepSelection(); }

// a selection the undo took away goes; picked notes go too, as their indexes may now be other notes
function keepSelection()
{
    const p = project.value;
    if (picked.value.size) picked.value = new Set();
    if (selected.value && !p.tracks.some(t => t.id === selected.value)) selected.value = p.tracks[0]?.id ?? null;
    const c = selectedClip.value;
    if (c && !p.tracks.find(t => t.id === c.track)?.clips.some(x => x.id === c.clip)) selectedClip.value = null;
}

/** puts a project in the window, stopped at its start; a project with no name has unsaved changes unless `clean` */
function show(p, name, clean = false)
{
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
    chordRange.value = null;
    beat.value = 0;
    status.value = '';
    if (name) setSettings({ project: name });
}

/** whether the unsaved changes, if any, may go: the app's question (Save, Don't Save or Cancel), or Discard or Cancel */
export async function discardOk()
{
    if (!dirty.value) return true;
    if (!place.askDiscard) return askYes(`Discard the changes to “${project.value.title}”?`, 'Discard');
    const answer = await place.askDiscard(project.value.title);
    return answer === 'discard' || (answer === 'save' && await save());
}

export async function openProject(name)
{
    if (!await discardOk()) return false;
    try
    {
        const { text, version } = await place.files.read(name);
        const file = classifyFile(text);
        if (file.kind !== 'project') throw new Error(file.message);
        show(file.project, name);
        session = step(session, { type: 'opened', version });
        place.opened?.(name);
        return true;
    }
    catch (e) { status.value = `Couldn't open ${place.where(name)}: ${e.message}`; return false; }
}

/** a new project, not saved yet: empty, or from a generator spec (a feeling, a genre, a song's spec, a whistled sketch) */
export async function newProject({ title = 'Untitled', spec = null, bpm = 120, sig = '4/4', bars = 16 } = {})
{
    if (!await discardOk()) return;
    const p = spec ? { ...toProject(compose({ ...spec, title })), title } : emptyProject({ title, bpm, sig, bars });
    show(p, '');
}

/** a project made elsewhere (an imported file), opened as a new one, not saved yet; `clean` when it has nothing worth
 * asking about until it's changed (Chordinal's empty new project) */
export async function openNew(p, { clean = false } = {})
{
    if (!await discardOk()) return false;
    show(p, '', clean);
    return true;
}

/** saves to the project's folder, or asks for a name when it has none; saves run one at a time, in order, so an older
 * one can never land after a newer one
 * @returns {Promise<boolean>} whether it saved */
export async function save()
{
    if (!projectName.value) return saveAs();
    return queueSave();
}

let saving = Promise.resolve(true);
const queueSave = ()=> (saving = saving.then(saveNow, saveNow));

/** @returns {Promise<boolean>} whether it saved */
async function saveNow()
{
    const name = projectName.value, p = project.value;
    if (!name) return false;
    session = step(session, { type: 'save' });
    const expected = expectedOf(session);
    if (expected === undefined) return false;     // saves run one at a time, so this can't happen
    try
    {
        const text = writeProject(p);
        let version;
        try { version = await place.files.write(name, text, expected); }
        catch (e)
        {
            if (!(e instanceof ConflictError)) throw e;
            // it changed where it's kept since it was read or written here (another app, a regenerated song): ask
            session = step(session, { type: 'conflict' });
            if (!await askYes(`${place.where(name)} changed on disk since it was opened. Replace it with this version?`, 'Replace'))
            {
                session = step(session, { type: 'cancel' });
                return false;
            }
            session = step(session, { type: 'replace' });
            version = await place.files.write(name, text, null);
        }
        session = step(session, { type: 'done', version });
        saved.value = p;
        status.value = `Saved ${place.where(name)}`;
        place.saved?.(name);
        return true;
    }
    catch (e)
    {
        session = step(session, { type: 'failed' });
        status.value = `Couldn't save ${place.where(name)}: ${e.message}`;
        return false;
    }
}

/** the takes of the project's old folder, copied into its new one after a Save As (those already there are kept) */
async function copyTakes(from, to)
{
    try
    {
        const there = new Set(await place.files.takes(to).catch(()=> []));
        for (const file of await place.files.takes(from))
            if (!there.has(file)) await place.files.writeTake(to, file, new Uint8Array(await place.files.readTake(from, file)));
    }
    catch (e) { status.value = `Saved ${place.where(to)}, but couldn't copy its takes: ${e.message}`; }
}

/** saves under a new name (the app's place asks where); the project takes the name only once it's saved there
 * @returns {Promise<boolean>} whether it saved */
export async function saveAs()
{
    const chosen = await place.chooseName(project.value.title, projectName.value);
    if (!chosen) return false;
    const { name, title } = chosen;
    edit(p => p.title === title ? p : { ...p, title });
    const before = { name: projectName.value, session };
    projectName.value = name;
    if (name !== before.name) session = step(session, { type: 'savedAs' });     // a new place, or one the user agreed to replace
    if (await queueSave())
    {
        setSettings({ project: name });
        if (before.name && name !== before.name) await copyTakes(before.name, name);
        return true;
    }
    if (projectName.value === name) { projectName.value = before.name; session = before.session; }
    return false;
}
