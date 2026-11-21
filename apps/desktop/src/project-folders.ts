// Chordinal's projects (Chordinal PRD §4): folders anywhere on disk, each holding project.json and, beside it, the
// whistled takes in takes/. The window may read and write only a folder the user picked in this run (Open…, Save As…)
// or one in Open Recent, which is kept here, newest first, in a file in the app's data folder. A folder is named by
// its absolute path; a project.json picked instead of its folder names that folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './write-atomic.ts';

export const RECENT_LIMIT = 10;
const TAKE = /^[\w-]+\.wav$/;

const exists = (file: string): Promise<boolean> =>
  fs.access(file).then(
    () => true,
    () => false,
  );

/** the folder a picked path names: the folder itself, or the folder of a project.json */
export const folderOf = (picked: string): string =>
  path.basename(picked) === 'project.json' ? path.dirname(path.resolve(picked)) : path.resolve(picked);

export interface FolderEntry {
  path: string;
  name: string;
}
export interface RecentEntry extends FolderEntry {
  exists: boolean;
}

export interface ProjectFolders {
  load(): Promise<void>;
  /** a folder the user picked: the window may reach it, and it goes to the top of Open Recent */
  grant(picked: string): string;
  /** the projects directly inside a folder (Chordinal's own, in Documents), by name; the window may open each */
  listIn(parent: string): Promise<FolderEntry[]>;
  /** a project opened or saved goes to the top of Open Recent */
  used(dir: unknown): Promise<void>;
  /** Open Recent, newest first */
  recent(): Promise<RecentEntry[]>;
  forget(dir: unknown): Promise<void>;
  clear(): Promise<void>;
  exists(dir: unknown): Promise<boolean>;
  read(dir: unknown): Promise<string>;
  /** writes project.json through a temporary file, so a crash never leaves half a file */
  write(dir: unknown, text: unknown): Promise<void>;
  takes(dir: unknown): Promise<string[]>;
  readTake(dir: unknown, file: unknown): Promise<Uint8Array>;
  writeTake(dir: unknown, file: unknown, bytes: Uint8Array): Promise<void>;
  /** the file a Finder reveal shows */
  fileToShow(dir: unknown): string;
}

/** @param options.listFile where Open Recent is kept */
export function projectFolders({ listFile }: { listFile: string }): ProjectFolders {
  let recent: string[] = [];
  const granted = new Set<string>();
  let writing: Promise<void> = Promise.resolve();

  const keep = () => {
    const list = [...recent];
    writing = writing
      .then(() => writeAtomic(listFile, JSON.stringify(list)))
      .catch((e: unknown) => console.error('could not keep the recent projects', e));
    return writing;
  };
  /** the folder `dir` names, or an error when the window may not reach it */
  const reach = (dir: unknown) => {
    const d = path.resolve(String(dir));
    if (!granted.has(d) && !recent.includes(d))
      throw new Error(`${path.basename(d)} isn't a project this app opened`);
    return d;
  };
  const take = (dir: unknown, file: unknown) => {
    if (!TAKE.test(String(file))) throw new Error(`not a take: ${String(file)}`);
    return path.join(reach(dir), 'takes', String(file));
  };

  return {
    async load() {
      try {
        const list: unknown = JSON.parse(await fs.readFile(listFile, 'utf8'));
        recent = Array.isArray(list)
          ? list
              .filter((x): x is string => typeof x === 'string' && path.isAbsolute(x))
              .slice(0, RECENT_LIMIT)
          : [];
      } catch {
        recent = []; // a first run, or a list that could not be read
      }
    },
    grant(picked) {
      const d = folderOf(picked);
      granted.add(d);
      return d;
    },
    async listIn(parent) {
      const root = path.resolve(String(parent));
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      const found: FolderEntry[] = [];
      for (const e of entries) {
        const d = path.join(root, e.name);
        if (!e.isDirectory() || !(await exists(path.join(d, 'project.json')))) continue;
        granted.add(d);
        found.push({ path: d, name: e.name });
      }
      return found.sort((a, b) => a.name.localeCompare(b.name));
    },
    async used(dir) {
      const d = reach(dir);
      recent = [d, ...recent.filter((x) => x !== d)].slice(0, RECENT_LIMIT);
      await keep();
    },
    recent: async () =>
      Promise.all(
        recent.map(async (p) => ({
          path: p,
          name: path.basename(p),
          exists: await exists(path.join(p, 'project.json')),
        })),
      ),
    async forget(dir) {
      const d = path.resolve(String(dir));
      recent = recent.filter((x) => x !== d);
      await keep();
    },
    async clear() {
      recent = [];
      await keep();
    },
    exists: async (dir) => exists(path.join(reach(dir), 'project.json')),
    read: async (dir) => fs.readFile(path.join(reach(dir), 'project.json'), 'utf8'),
    async write(dir, text) {
      const d = reach(dir);
      await writeAtomic(path.join(d, 'project.json'), String(text));
      recent = [d, ...recent.filter((x) => x !== d)].slice(0, RECENT_LIMIT);
      await keep();
    },
    takes: async (dir) =>
      (await fs.readdir(path.join(reach(dir), 'takes')).catch((): string[] => [])).filter((f) =>
        TAKE.test(f),
      ),
    readTake: async (dir, file) => new Uint8Array(await fs.readFile(take(dir, file))),
    writeTake: async (dir, file, bytes) => writeAtomic(take(dir, file), Buffer.from(bytes)),
    fileToShow: (dir) => path.join(reach(dir), 'project.json'),
  };
}
