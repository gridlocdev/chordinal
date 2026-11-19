// Music Generator's desktop app (the window and what it shares with Chordinal are in shell.js). Run from this checkout
// (`just app`), projects save straight into projects/; installed from a release build, they live in
// Documents/Music Generator/projects (the written songs copied there on the first run). Either way the window hears
// when projects/ changes on disk, and lists it again.
//
// Open in Chordinal (Chordinal PRD §9.2) copies a project's folder into Documents/Chordinal/<title>/ (" 2", " 3" … when
// the name is taken) and opens it in Chordinal: the checkout's Chordinal when run from it, the installed app on macOS.
// When Chordinal can't be started, the folder is shown in the Finder instead.
import { app, net } from 'electron';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRequest } from '../tools/project-files.mjs';
import { freeFolder } from '../tools/project-folders.mjs';
import { startShell, ROOT, within, exists } from './shell.js';

/** the folder holding projects/ */
const DATA = (packaged)=> packaged ? path.join(app.getPath('documents'), 'Music Generator') : ROOT;

// projects/ changed on disk (`just projects`, a save, a folder copied in): the window lists it again, once it settles
function tellProjectChanges(packaged, win)
{
    let timer = 0, watcher = null;
    const projects = path.join(DATA(packaged), 'projects');
    fs.mkdir(projects, { recursive: true }).then(()=>
    {
        if (win.isDestroyed()) return;
        watcher = watch(projects, { recursive: true }, ()=>
        {
            clearTimeout(timer);
            timer = setTimeout(()=> { if (!win.isDestroyed()) win.webContents.send('projects:changed'); }, 300);
        });
        watcher.on('error', (e)=> console.error('could not watch projects/', e));
    }, (e)=> console.error('could not watch projects/', e));
    win.on('closed', ()=> { clearTimeout(timer); watcher?.close(); });
}

/** starts Chordinal on `dir`; resolves to whether it started */
function startChordinal(packaged, screen, dir)
{
    if (!packaged) return screen.launch(process.execPath, [path.join(ROOT, 'electron', 'chordinal.js'), dir]);
    if (process.platform === 'darwin') return screen.launch('open', ['-a', 'Chordinal', dir], { wait: true });
    return Promise.resolve(false);
}

startShell({
    name: 'Music Generator',
    id: 'music-generator',
    icon: 'icon',
    page: 'index.html',
    async setup({ packaged, ipcMain, screen })
    {
        // the first run of an installed build: the written songs, as projects to open
        const projects = path.join(DATA(packaged), 'projects');
        if (packaged && !await exists(projects))
            await fs.cp(path.join(process.resourcesPath, 'projects'), projects, { recursive: true }).catch((e)=> console.error('could not copy the projects', e));
        // a project or take shows in the Finder
        ipcMain.handle('shell:reveal', (e, rel)=> { const file = within(projects, rel); if (file) screen.showInFolder(file); });
        ipcMain.handle('chordinal:open', async (e, name)=>
        {
            const from = within(projects, String(name));
            if (!from || from === projects) throw new Error(`no project ${name}`);
            const { title } = JSON.parse(await fs.readFile(path.join(from, 'project.json'), 'utf8'));
            const home = path.join(app.getPath('documents'), 'Chordinal');
            await fs.mkdir(home, { recursive: true });
            const dir = await freeFolder(home, title || name);
            await fs.cp(from, dir, { recursive: true });
            const opened = await startChordinal(packaged, screen, dir);
            if (!opened) screen.showInFolder(path.join(dir, 'project.json'));
            return { dir, opened };
        });
    },
    // saving projects and takes into projects/, and reading them
    async request({ packaged }, pathname, method, body)
    {
        const answer = await projectRequest(DATA(packaged), method, pathname, body).catch((e)=> ({ status: 500, body: String(e) }));
        if (answer)
        {
            if (answer.saved) console.log(`saved ${answer.saved}`);
            return new Response(answer.body ?? null, { status: answer.status, headers: { 'content-type': answer.type ?? 'text/plain' } });
        }
        const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
        if (!rel.startsWith('projects/')) return null;
        const file = within(DATA(packaged), rel);
        return file ? net.fetch(pathToFileURL(file).toString()) : new Response('not found', { status: 404 });
    },
    window: ({ packaged }, win)=> tellProjectChanges(packaged, win),
});

