// Chordinal's files (Chordinal PRD §4): projects are folders anywhere on disk, named by their path. Start-up reopens
// the project open at the last quit, else starts a new one; New starts one at once; Open… and Open Recent open a
// folder; Save As asks for a folder (in Documents/Chordinal/ by default). Unsaved changes are asked about with Save,
// Don't Save and Cancel, before New, Open and closing the window alike.
import { signal, effect } from '@preact/signals';
import { projectFolders, folderTitle, docWindow } from '@chordinal/ui';
import { emptyProject, makeTrack, addTrack } from '@chordinal/daw';
import { setPlace } from '@chordinal/ui';
import { openProject, openNew, discardOk } from '@chordinal/ui';
import { askChoice } from '@chordinal/ui';
import { project, projectName, dirty, settings, setSettings, saveSettingsNow, status } from '@chordinal/ui';

/** Open Recent: the last projects opened or saved, newest first */
export const recent = signal(/** @type {{ path: string, name: string, exists: boolean }[]} */ ([]));

export async function refreshRecent() { recent.value = await projectFolders.recent().catch(()=> []); }

/** a new project (§4.3): 120 bpm, 4/4, 8 bars, a drum track with the Standard kit and a Grand Piano track */
export function newSongProject()
{
    let p = emptyProject({ title: 'Untitled', bpm: 120, sig: '4/4', bars: 8 });
    p = addTrack(p, makeTrack(p, { name: 'Drums', instrument: { bank: 128, program: 0 } }));
    p = addTrack(p, makeTrack(p, { name: 'Grand Piano', instrument: { bank: 0, program: 0 } }));
    return p;
}

/** the question before unsaved changes go (§4.3) */
const askDiscard = async (title)=>
{
    const a = await askChoice(`Save changes to “${title}”?`, 'Save', 'Don’t Save');
    return a === 'yes' ? 'save' : a === 'other' ? 'discard' : null;
};

/** Chordinal's place for projects, used by the shared document code */
export function useProjectFolders()
{
    setPlace({
        files: projectFolders,
        where: (dir)=> `“${folderTitle(dir)}”`,
        chooseName: async (title)=>
        {
            const dir = await projectFolders.pickSave(title);
            return dir ? { name: dir, title: folderTitle(dir) } : null;
        },
        opened: (dir)=> { projectFolders.used(dir).then(refreshRecent, ()=> {}); },
        saved: ()=> { refreshRecent(); },
        askDiscard,
    });
}

/** New (§4.3): a new project at once, after the question if there are unsaved changes */
export async function newSong()
{
    if (await openNew(newSongProject(), { clean: true })) setSettings({ project: '' });
}

/** Open… (§4.4): a project folder or its project.json, anywhere */
export async function openFolder()
{
    const dir = await projectFolders.pickOpen();
    if (dir) await openProject(dir);
}

/** a project in Open Recent; one that is gone is said so, and leaves the list (§4.5) */
export async function openRecent(dir)
{
    if (!await projectFolders.exists(dir))
    {
        status.value = `${folderTitle(dir)} was moved or deleted`;
        await projectFolders.forget(dir);
        await refreshRecent();
        return;
    }
    await openProject(dir);
}

export async function clearRecent()
{
    await projectFolders.clear();
    await refreshRecent();
}

let listening = false;

/** start-up (§4.1, §4.2): a folder handed over (§9.2), else the project open at the last quit, else a new one, saying nothing */
export async function startUp()
{
    await refreshRecent();
    if (!listening) projectFolders.onHandedOver((dir)=> { if (dir) openRecent(dir); });
    listening = true;
    const handed = await projectFolders.handed().catch(()=> '');
    if (handed && await openProject(handed)) return;
    const last = settings.value.project;
    if (last && await projectFolders.exists(last) && await openProject(last)) return;
    await openNew(newSongProject(), { clean: true });
    setSettings({ project: '' });
}

/** the window's title (§4.8) and close question (§4.7) */
export function watchWindow()
{
    effect(()=> { document.title = `${dirty.value ? '• ' : ''}${project.value.title} — Chordinal`; });
    effect(()=> { docWindow.dirty(dirty.value); });
    docWindow.onClosing(async ()=>
    {
        if (!await discardOk()) return;
        await saveSettingsNow();
        docWindow.close();
    });
    // a reload while there are unsaved changes: the desktop app asks first
    addEventListener('beforeunload', (e)=> { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } });
}

/** shows the open project's folder in the Finder */
export const revealProject = ()=> { if (projectName.value) projectFolders.reveal(projectName.value); };
