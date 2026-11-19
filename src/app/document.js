// The open project as a document: opening, saving, starting a new one (empty, or made by the composer from a feeling,
// a genre or one of its songs), and every edit, each a step undo can take back.
import { projectFiles, folderName } from '../platform/project-files.js';
import { emptyProject, history, commit, undo as undoStep, redo as redoStep } from '../daw/project.js';
import { readProject, writeProject } from '../daw/project-format.js';
import { compose } from '../composer/compose.js';
import { toProject } from '../composer/to-project.js';
import { hist, project, projectName, projectList, saved, dirty, selected, selectedClip, picked, chordRange, beat, status, setSettings } from './store.js';
import { stop } from './player.js';
import { askText, askYes } from './ask.js';

let mergeKey = null;
/** the open project's file as last read or written, to tell when it changes on disk */
let onDisk = null;

/**
 * Changes the project. Edits with the same merge key one after another (a fader dragged) are one undo step.
 * @param {(p: import('../daw/project.js').Project)=> import('../daw/project.js').Project} fn
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

/** puts a project in the window, stopped at its start */
function show(p, name)
{
    stop();
    mergeKey = null;
    hist.value = history(p);
    saved.value = name ? p : null;
    projectName.value = name;
    selected.value = p.tracks[0]?.id ?? null;
    selectedClip.value = null;
    chordRange.value = null;
    beat.value = 0;
    status.value = '';
    if (name) setSettings({ project: name });
}

/** lists projects/ again */
export async function refreshProjects()
{
    projectList.value = await projectFiles.list().catch(e => { status.value = e.message; return []; });
}

/**
 * Keeps the Projects tab in step with projects/: lists it now, and again whenever it changes on disk, so projects
 * written by `just projects` or copied into the folder show up without a restart. The open project, when it has no
 * unsaved changes and its file now holds something else, is read again: a regenerated song plays as regenerated.
 */
export function watchProjects()
{
    refreshProjects();
    projectFiles.onChange(async ()=>
    {
        await refreshProjects();
        const name = projectName.value;
        if (!name || dirty.value || !projectList.value.some(p => p.name === name)) return;
        const text = await projectFiles.read(name).catch(()=> null);
        // an edit made, or another project opened, while it was read is kept: no reload over it
        if (!text || text === onDisk || dirty.value || projectName.value !== name) return;
        try { show(readProject(text), name); onDisk = text; status.value = `Reloaded projects/${name}/: it changed on disk`; }
        catch (e) { status.value = `Couldn't read projects/${name} again: ${e.message}`; }
    });
}

const discardOk = async ()=> !dirty.value || askYes(`Discard the changes to “${project.value.title}”?`, 'Discard');

export async function openProject(name)
{
    if (!await discardOk()) return false;
    try
    {
        const text = await projectFiles.read(name);
        show(readProject(text), name);
        onDisk = text;
        return true;
    }
    catch (e) { status.value = `Couldn't open projects/${name}: ${e.message}`; return false; }
}

/** a new project, not saved yet: empty, or from a generator spec (a feeling, a genre, a song's spec, a whistled sketch) */
export async function newProject({ title = 'Untitled', spec = null, bpm = 120, sig = '4/4', bars = 16 } = {})
{
    if (!await discardOk()) return;
    const p = spec ? { ...toProject(compose({ ...spec, title })), title } : emptyProject({ title, bpm, sig, bars });
    show(p, '');
}

/** a project made elsewhere (an imported file), opened as a new one, not saved yet */
export async function openNew(p)
{
    if (!await discardOk()) return false;
    show(p, '');
    return true;
}

/** saves to the project's folder, or asks for a name when it has none; saves run one at a time, in order, so an older
 * one can never land after a newer one */
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
    try
    {
        const text = writeProject(p);
        // the file changed on disk since it was read or written here (another app, a regenerated song): ask first
        const current = onDisk === null ? null : await projectFiles.read(name).catch(()=> null);
        if (current !== null && current !== onDisk && current !== text
            && !await askYes(`projects/${name}/ changed on disk since it was opened. Replace it with this version?`, 'Replace')) return false;
        await projectFiles.write(name, text);
        onDisk = text;
        saved.value = p;
        status.value = `Saved projects/${name}/`;
        refreshProjects();
        return true;
    }
    catch (e) { status.value = `Couldn't save projects/${name}/: ${e.message}`; return false; }
}

/** saves under a new name: a new folder in projects/, or over one after asking; the project takes the name only once
 * it's saved there */
export async function saveAs()
{
    const title = await askText('Save the project as', project.value.title, 'Save');
    if (!title) return;
    const name = folderName(title);
    const existing = await projectFiles.list().catch(()=> []);
    if (name !== projectName.value && existing.some(e => e.name === name) && !await askYes(`projects/${name} exists. Replace it?`, 'Replace')) return;
    edit(p => p.title === title ? p : { ...p, title });
    const before = { name: projectName.value, onDisk };
    projectName.value = name;
    if (name !== before.name) onDisk = null;     // a new file, or one the user just agreed to replace
    if (await queueSave()) setSettings({ project: name });
    else if (projectName.value === name) { projectName.value = before.name; onDisk = before.onDisk; }
}
