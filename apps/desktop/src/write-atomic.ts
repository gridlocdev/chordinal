// Writes a file whole or not at all: to a temporary file beside it, then swapped in, so a crash never leaves half a file.
import fs from 'node:fs/promises';
import path from 'node:path';

// Windows refuses to replace a file that another rename, a reader or a virus scanner has open (EPERM, EACCES, EBUSY);
// the lock lasts milliseconds, so the swap is tried again for up to about a second
const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRIES = 20,
  RETRY_MS = 50;

async function swapIn(temp: string, file: string): Promise<void> {
  for (let tries = 0; ; tries++) {
    try {
      await fs.rename(temp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (process.platform !== 'win32' || !LOCKED.has(code) || tries >= RETRIES) throw e;
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

export async function writeAtomic(file: string, bytes: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // a temporary name of its own, so two saves at once don't write into each other's file
  const temp = `${file}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temp, bytes);
    await swapIn(temp, file);
  } catch (e) {
    await fs.rm(temp, { force: true });
    throw e;
  }
}
