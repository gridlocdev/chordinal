// Where projects are kept (Chordinal PRD §4), behind one interface, so the document code never knows whether a project
// is in memory (tests), in the browser (the web build) or in a folder on disk (the desktop app). Each project is named
// by a string (a folder's path on the desktop) and holds its project.json text, its recorded takes and its samples.
//
// Every read hands back a version token. A write passes the token it last saw: if the project changed somewhere else
// since (another app, a sync, a second window), the write is refused with a ConflictError and nothing is overwritten.
// A write with no token (null) is for a project not saved there yet, or one the user agreed to replace.

/** a project's version token: changes whenever its project.json does */
export type Version = string;

/** what a read hands back */
export interface Stored {
  text: string;
  version: Version;
}

export interface ProjectStore {
  /** the project's project.json; rejects when there is none */
  read(name: string): Promise<Stored>;
  /** writes it whole (never half a file) and resolves to its new version; a ConflictError when `expected` is stale */
  write(name: string, text: string, expected: Version | null): Promise<Version>;
  /** the take files, take-1.wav …, or [] */
  takes(name: string): Promise<string[]>;
  readTake(name: string, file: string): Promise<ArrayBuffer>;
  writeTake(name: string, file: string, bytes: Uint8Array): Promise<void>;
  /** the audio files its samplers play (PRD §13), in samples/, or [] */
  samples(name: string): Promise<string[]>;
  readSample(name: string, file: string): Promise<ArrayBuffer>;
  writeSample(name: string, file: string, bytes: Uint8Array): Promise<void>;
  /** the largest sample it keeps, in bytes, where its room is small (the browser's storage); none on disk */
  sampleLimit?: number;
}

/** the project changed somewhere else since it was read or written here; nothing was written */
export class ConflictError extends Error {
  override name = 'ConflictError';
}

/** take files are named take-<n>.wav or the like: nothing that could leave the project */
export const TAKE_NAME = /^[\w-]+\.wav$/;

/** sample files keep the name they were dropped with, within the same bounds: kick 2.wav, Pad-C3.aiff */
export const SAMPLE_NAME = /^\w[\w .-]*\.(wav|aiff?|mp3)$/i;
