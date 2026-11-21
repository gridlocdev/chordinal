// Where the scenarios and the driver find the app: the browser build (apps/web/dist, from `node tools/build.mjs`) served
// as static files on 127.0.0.1. There's no desktop bridge, so the page keeps its projects in IndexedDB (BrowserStore)
// and its settings in localStorage, both inside the test's own fresh browser profile: nothing here reads or writes
// the owner's projects or settings.
//
//   node e2e/server.ts    serve until stopped (Playwright's webServer starts it this way)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'apps/web/dist');
/** A port no other app's checks use, so two apps' checks can run at once. */
export const PORT = 8823;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
/** How Playwright and the driver start this server. */
export const SERVER_COMMAND = ['e2e/server.ts'];

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};

/**
 * Serve apps/web/dist and nothing else. The SoundFont libraries (`soundfonts/…`) are not served: they're large, not
 * in the repository, and the scenarios don't depend on hearing anything, so the page plays the instruments it can.
 */
export function serve(port = PORT): Server {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    throw new Error(`no build in ${DIST}: run \`node tools/build.mjs\` first`);
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', BASE_URL);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = serve();
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
