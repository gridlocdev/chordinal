// What a project.json is, before the window shows it (Chordinal PRD §4.4, §12.3): a project this app reads, one saved
// by a newer Chordinal (left as it is, never overwritten with less), something else entirely, or a project that is
// damaged. The message for each is what the user sees.
import { FORMAT, PATTERN_VERSION, VERSION, readProject } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';

export type FileKind =
  | { kind: 'project'; project: Project }
  | { kind: 'newer'; version: number; message: string }
  | { kind: 'other'; message: string }
  | { kind: 'damaged'; message: string };

const READS = [VERSION, PATTERN_VERSION];

export function classifyFile(text: string): FileKind {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'damaged', message: 'its project.json is not complete JSON (it may have been cut short)' };
  }
  if (typeof data !== 'object' || data === null || !('format' in data) || data.format !== FORMAT)
    return { kind: 'other', message: 'it is not a Chordinal project' };
  const version = 'version' in data ? data.version : undefined;
  if (typeof version === 'number' && version > Math.max(...READS))
    return {
      kind: 'newer',
      version,
      message: `it was saved by a newer Chordinal (project version ${version}); update Chordinal to open it`,
    };
  try {
    return { kind: 'project', project: readProject(text) };
  } catch (e) {
    return { kind: 'damaged', message: e instanceof Error ? e.message : String(e) };
  }
}
