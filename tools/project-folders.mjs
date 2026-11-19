// Chordinal's projects (Chordinal PRD §4): folders anywhere on disk, each holding project.json and, beside it, the
// whistled takes in takes/. The window may read and write only a folder the user picked in this run (Open…, Save As…)
// or one in Open Recent, which is kept here, newest first, in a file in the app's data folder. A folder is named by
// its absolute path; a project.json picked instead of its folder names that folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './project-files.mjs';

export const RECENT_LIMIT = 10;
const TAKE = /^[\w-]+\.wav$/;

const exists = (file)=> fs.access(file).then(()=> true, ()=> false);

/** the folder a picked path names: the folder itself, or the folder of a project.json */
export const folderOf = (picked)=> path.basename(picked) === 'project.json' ? path.dirname(path.resolve(picked)) : path.resolve(picked);

/**
 * @param {{ listFile: string }} options  where Open Recent is kept
 */
export function projectFolders({ listFile })
{
    /** @type {string[]} */
    let recent = [];
    const granted = new Set();
    let writing = Promise.resolve();

    const keep = ()=>
    {
        const list = [...recent];
        writing = writing.then(()=> writeAtomic(listFile, JSON.stringify(list))).catch((e)=> console.error('could not keep the recent projects', e));
        return writing;
    };
    /** the folder `dir` names, or an error when the window may not reach it */
    const reach = (dir)=>
    {
        const d = path.resolve(String(dir));
        if (!granted.has(d) && !recent.includes(d)) throw new Error(`${path.basename(d)} isn't a project this app opened`);
        return d;
    };
    const take = (dir, file)=>
    {
        if (!TAKE.test(String(file))) throw new Error(`not a take: ${file}`);
        return path.join(reach(dir), 'takes', String(file));
    };

    return {
        async load()
        {
            try
            {
                const list = JSON.parse(await fs.readFile(listFile, 'utf8'));
                recent = Array.isArray(list) ? list.filter(x => typeof x === 'string' && path.isAbsolute(x)).slice(0, RECENT_LIMIT) : [];
            }
            catch { recent = []; }     // a first run, or a list that could not be read
        },
        /** a folder the user picked: the window may reach it, and it goes to the top of Open Recent */
        grant(picked)
        {
            const d = folderOf(picked);
            granted.add(d);
            return d;
        },
        /** @returns {Promise<{ path: string, name: string }[]>} the projects directly inside a folder (Chordinal's own,
         * in Documents), by name; the window may open each */
        async listIn(parent)
        {
            const root = path.resolve(String(parent));
            const entries = await fs.readdir(root, { withFileTypes: true }).catch(()=> []);
            const found = [];
            for (const e of entries)
            {
                const d = path.join(root, e.name);
                if (!e.isDirectory() || !await exists(path.join(d, 'project.json'))) continue;
                granted.add(d);
                found.push({ path: d, name: e.name });
            }
            return found.sort((a, b)=> a.name.localeCompare(b.name));
        },
        /** a project opened or saved goes to the top of Open Recent */
        async used(dir)
        {
            const d = reach(dir);
            recent = [d, ...recent.filter(x => x !== d)].slice(0, RECENT_LIMIT);
            await keep();
        },
        /** @returns {Promise<{ path: string, name: string, exists: boolean }[]>} Open Recent, newest first */
        recent: async ()=> Promise.all(recent.map(async p => ({ path: p, name: path.basename(p), exists: await exists(path.join(p, 'project.json')) }))),
        async forget(dir) { const d = path.resolve(String(dir)); recent = recent.filter(x => x !== d); await keep(); },
        async clear() { recent = []; await keep(); },
        exists: async (dir)=> exists(path.join(reach(dir), 'project.json')),
        read: async (dir)=> fs.readFile(path.join(reach(dir), 'project.json'), 'utf8'),
        /** writes project.json through a temporary file, so a crash never leaves half a file */
        async write(dir, text)
        {
            const d = reach(dir);
            await writeAtomic(path.join(d, 'project.json'), String(text));
            recent = [d, ...recent.filter(x => x !== d)].slice(0, RECENT_LIMIT);
            await keep();
        },
        takes: async (dir)=> (await fs.readdir(path.join(reach(dir), 'takes')).catch(()=> [])).filter(f => TAKE.test(f)),
        readTake: async (dir, file)=> new Uint8Array(await fs.readFile(take(dir, file))),
        writeTake: async (dir, file, bytes)=> writeAtomic(take(dir, file), Buffer.from(bytes)),
        /** the file a Finder reveal shows */
        fileToShow: (dir)=> path.join(reach(dir), 'project.json'),
    };
}
