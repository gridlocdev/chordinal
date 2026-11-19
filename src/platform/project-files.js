// The project files in the checkout's projects/ folder, through the desktop app (tools/project-files.mjs): listing
// them, reading one's text, writing it back, the whistled takes kept beside it, and hearing when the folder changes.
async function ok(res, what)
{
    if (!res.ok) throw new Error(`${what}: ${res.status}`);
    return res;
}

/** a folder name for a title, in the letters the desktop app accepts: 'Night Drive' → 'night-drive', 'Café' → 'cafe',
 * and any other character written as its code point ('夜' → 'u591c'), so titles in other scripts keep apart */
export const folderName = (title)=> String(title).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^\x00-\x7f]/gu, (c)=> `-u${c.codePointAt(0).toString(16)}-`)
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'untitled';

export const projectFiles = {
    /** @returns {Promise<{ name: string, title: string }[]>} */
    list: async ()=> (await ok(await fetch('projects/'), 'projects/')).json(),
    read: async (name)=> (await ok(await fetch(`projects/${name}/project.json`, { cache: 'no-store' }), `projects/${name}`)).text(),
    write: async (name, text)=> { await ok(await fetch(`projects/${name}/project.json`, { method: 'PUT', body: text }), `saving projects/${name}`); },
    /** @returns {Promise<string[]>} the take files, take-1.wav … */
    takes: async (name)=> { const res = await fetch(`projects/${name}/takes/`); return res.ok ? res.json() : []; },
    readTake: async (name, file)=> (await ok(await fetch(`projects/${name}/takes/${file}`), file)).arrayBuffer(),
    writeTake: async (name, file, bytes)=> { await ok(await fetch(`projects/${name}/takes/${file}`, { method: 'PUT', body: bytes }), `saving ${file}`); },
    /** calls fn when anything in projects/ changes on disk (the desktop app only; in a browser, never) */
    onChange: (fn)=> { globalThis.projectFolder?.onChange(fn); },
};
