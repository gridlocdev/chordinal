#!/usr/bin/env node
// Serves the browser build on this computer: the page (apps/web/dist, from `node tools/build.mjs`) and the SoundFont
// libraries you have in soundfonts/, at http://127.0.0.1:<port>/. Without the desktop app the page keeps its projects
// and settings in the browser.
//
//   node tools/serve-web.mjs [--port 8020]   (the next free port if that one is taken)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'apps/web/dist');
const FONTS = path.join(ROOT, 'soundfonts');
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
let port = portArg >= 0 ? Number(args[portArg + 1]) : 8020;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`no build in ${DIST}: run \`just build\` first`);
  process.exit(1);
}

/** the file a URL path names: soundfonts/… from the libraries, the rest from the build; null outside them */
function fileFor(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  const [base, inner] = rel.startsWith('soundfonts/') ? [FONTS, rel.slice('soundfonts/'.length)] : [DIST, rel];
  const file = path.join(base, inner);
  if (!file.startsWith(base + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

const server = http.createServer((req, res) => {
  const file = fileFor(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'content-length': fs.statSync(file).size,
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  port += 1;
  server.listen(port, '127.0.0.1');
});
server.on('listening', () => {
  const fonts = fs.existsSync(FONTS) ? '' : ' (no soundfonts/ yet: `just soundfonts` fetches them; chip sounds play without)';
  console.log(`Chordinal in the browser: http://127.0.0.1:${port}/${fonts}\nCtrl+C stops it.`);
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
