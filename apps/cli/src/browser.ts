// The browser the CLI renders sound in: Chordinal's Electron, hidden, loading the render page (page/page.ts) from a
// server on 127.0.0.1 that serves the page, the SoundFonts in this checkout's soundfonts/ and the files the CLI
// shares with it. The page plays what it's asked (jobs.ts) and sends back the sound.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { DecodeJob, Job, PlayJob } from './jobs.ts';

/** this checkout: the CLI runs from apps/cli/dist/ (or apps/cli/src/) */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = path.join(ROOT, 'apps/cli/dist');
const SOUNDFONTS = path.join(ROOT, 'soundfonts');

/** a project played offline: two channels, and where its first beat falls (seconds) */
export interface Rendered {
  channels: [Float32Array, Float32Array];
  rate: number;
  leadIn: number;
}

/** a file decoded as the browser decodes it: its length and a stretch of its left channel */
export interface Decoded {
  frames: number;
  part: Float32Array;
}

export interface Browser {
  /** plays project.json's text to `until` (beats; null for its end) and `tail` seconds after */
  play(project: string, until: number | null, tail: number): Promise<Rendered>;
  /** decodes `file` at `rate` and hands back `count` frames of its left channel from `from` */
  decode(file: string, rate: number, from: number, count: number): Promise<Decoded>;
  /** ends the browser and the server */
  close(): Promise<void>;
}

type JobBody = Omit<PlayJob, 'id'> | Omit<DecodeJob, 'id'>;

interface Answer {
  body: Buffer;
  query: URLSearchParams;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Render</title><base href="/"></head>
<body><script type="module" src="/page.js"></script></body>
</html>
`;

/** where Chordinal's Electron is: from this checkout's node_modules, wherever the CLI is run from */
function electronPath(): string {
  const found: unknown = createRequire(import.meta.url)('electron');
  if (typeof found !== 'string') throw new Error("can't find Electron in this checkout: run `just setup`");
  return found;
}

/** the environment, without the variable that would start Electron as plain Node */
function withoutRunAsNode(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _, ...rest } = env;
  return rest;
}

const floats = (b: Buffer): Float32Array =>
  new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const bodyOf = (req: http.IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (d: Buffer) => parts.push(d));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });

/**
 * starts the server and the hidden browser. library: the SoundFont library (null: the app's default); rate: the
 * sample rate to render at (null: the sound device's, as the app renders)
 */
export async function openBrowser({
  library,
  rate,
}: {
  library: string | null;
  rate: number | null;
}): Promise<Browser> {
  for (const file of ['page.js', 'electron.mjs'])
    if (!fs.existsSync(path.join(DIST, file)))
      throw new Error(`apps/cli/dist/${file} is missing: build the CLI first (just build)`);

  const queue: Job[] = [];
  const waiting: http.ServerResponse[] = [];
  const pending = new Map<number, { resolve: (a: Answer) => void; reject: (e: Error) => void }>();
  const shared = new Map<string, string>(); // url path → file
  let nextId = 1;
  let electron: ChildProcess | null = null;
  let closing = false;

  const send = (res: http.ServerResponse, job: Job): void => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(job));
  };
  const ask = (job: JobBody): Promise<Answer> => {
    const full: Job = { ...job, id: nextId++ };
    const answer = new Promise<Answer>((resolve, reject) => pending.set(full.id, { resolve, reject }));
    const res = waiting.shift();
    if (res) send(res, full);
    else queue.push(full);
    return answer;
  };
  const failAll = (e: Error): void => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
  };
  const serveFile = (res: http.ServerResponse, file: string): void => {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x'),
        p = decodeURIComponent(url.pathname);
      const answer = /^\/(result|error)\/(\d+)$/.exec(p);
      if (req.method === 'PUT' && answer) {
        const body = await bodyOf(req);
        res.writeHead(204);
        res.end();
        const id = Number(answer[2]),
          waiter = pending.get(id);
        if (!waiter) return;
        pending.delete(id);
        if (answer[1] === 'error') waiter.reject(new Error(body.toString('utf8')));
        else waiter.resolve({ body, query: url.searchParams });
        return;
      }
      if (p === '/job') {
        const job = queue.shift();
        if (job) send(res, job);
        else waiting.push(res);
        return;
      }
      if (p === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(PAGE);
        return;
      }
      if (p === '/page.js') return serveFile(res, path.join(DIST, 'page.js'));
      const file = shared.get(p) ?? path.join(ROOT, p);
      const ok =
        shared.has(p) ||
        (file.startsWith(SOUNDFONTS + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile());
      if (!ok) {
        res.writeHead(404);
        res.end();
        return;
      }
      serveFile(res, file);
    })().catch((e: unknown) => {
      res.writeHead(500);
      res.end(String(e));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('the render server has no port');
  const { port } = address;
  const query = new URLSearchParams({ ...(library && { library }), ...(rate && { rate: String(rate) }) });
  const page = `http://127.0.0.1:${port}/?${query}`;

  const proc = spawn(electronPath(), [path.join(DIST, 'electron.mjs'), page], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: withoutRunAsNode(process.env),
  });
  electron = proc;
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
  proc.once('exit', (code, signal) => {
    electron = null;
    if (!closing) failAll(new Error(`the render browser quit (${code ?? signal}) before it was done`));
  });
  // never leave it running when the CLI ends
  const kill = (): void => {
    electron?.kill('SIGKILL');
  };
  process.once('exit', kill);

  return {
    async play(project, until, tail) {
      const { body, query } = await ask({ kind: 'play', project, until, tail });
      const all = floats(body),
        n = all.length / 2;
      return {
        channels: [all.slice(0, n), all.slice(n)],
        rate: Number(query.get('rate')),
        leadIn: Number(query.get('leadIn')),
      };
    },
    async decode(file, rate, from, count) {
      const key = `/shared/${shared.size}/${encodeURIComponent(path.basename(file))}`;
      shared.set(decodeURIComponent(key), file);
      const { body, query } = await ask({ kind: 'decode', url: key, rate, from, count });
      return { frames: Number(query.get('frames')), part: floats(body) };
    },
    async close() {
      closing = true;
      failAll(new Error('the render browser closed'));
      for (const res of waiting.splice(0)) send(res, { kind: 'done', id: 0 });
      if (electron) {
        electron.kill();
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
        kill();
      }
      process.removeListener('exit', kill);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
