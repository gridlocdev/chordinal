// Writes a file whole or not at all: to a temporary file beside it, then swapped in, so a crash never leaves half a file.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeAtomic(file: string, bytes: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // a temporary name of its own, so two saves at once don't write into each other's file
  const temp = `${file}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, file);
  } catch (e) {
    await fs.rm(temp, { force: true });
    throw e;
  }
}
