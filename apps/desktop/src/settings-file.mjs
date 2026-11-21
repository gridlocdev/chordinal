// An app's settings file (save.json in its user data folder), for the desktop apps' main process. The page hands over
// all its settings on every change; each write goes to a temporary file that is then swapped in, so a crash mid-write
// never leaves half a file, and writes run one at a time. A file that can't be read as settings is kept beside it as
// save.json.bad-<time>, not overwritten by the next change.
import fs from 'node:fs/promises';
import path from 'node:path';

/** @param {string} file  the settings file's path */
export function settingsFile(file)
{
    let writing = Promise.resolve();
    return {
        /** the settings, or {} on a first run or after setting a bad file aside */
        async load()
        {
            let text;
            try { text = await fs.readFile(file, 'utf8'); }
            catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
            try
            {
                const all = JSON.parse(text);
                if (all && typeof all === 'object' && !Array.isArray(all)) return all;
            }
            catch { /* unreadable: set aside below */ }
            const aside = `${file}.bad-${Date.now()}`;
            await fs.rename(file, aside);
            console.error(`the settings could not be read; kept them as ${aside}`);
            return {};
        },
        /** @param {object} all */
        write(all)
        {
            const temp = file + '.tmp';
            writing = writing.then(async ()=>
            {
                await fs.mkdir(path.dirname(file), { recursive: true });
                await fs.writeFile(temp, JSON.stringify(all));
                await fs.rename(temp, file);
            }).catch((e)=> console.error('could not save the settings', e));
            return writing;
        },
        /** resolves once every write handed over so far has finished (or failed) */
        written: ()=> writing,
    };
}
