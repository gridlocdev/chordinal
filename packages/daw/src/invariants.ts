// What must hold for every project an edit returns, whatever edits came before. The random-edit tests check it after
// every step; the app could check a project it read with it too. Pure.
import { patternProblems } from './project.ts';
import type { Note, Project } from './project.ts';
import { readProject, writeProject } from './project-format.ts';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** what is wrong with a note, or null */
function badNote(n: Note): string | null {
  if (!isNum(n.beat) || n.beat < 0) return `starts at ${n.beat}`;
  if (!isNum(n.beats) || n.beats <= 0) return `is ${n.beats} beats long`;
  if (!Number.isInteger(n.key) || n.key < 0 || n.key > 127) return `has key ${n.key}`;
  if (!isNum(n.vel) || n.vel < 0 || n.vel > 127) return `has velocity ${n.vel}`;
  return null;
}

/** a list sorted by beat that starts at beat 0, as the tempo map and the meters are */
function badTimeline(list: { beat: number }[]): string | null {
  if (list[0]?.beat !== 0) return 'does not start at beat 0';
  for (let i = 1; i < list.length; i++) if (list[i]!.beat < list[i - 1]!.beat) return 'is out of order';
  return null;
}

/**
 * What is wrong with a project, or [] when nothing is: every track and clip has an id of its own, a clip has a start
 * and a length, its notes can be written, a duck listens to a track that is there, the clips of a pattern agree, and
 * the project's file reads back to the same file.
 */
export function checkInvariants(project: Project): string[] {
  const problems: string[] = [];
  if (!isNum(project.length) || project.length <= 0) problems.push(`the length is ${project.length}`);
  const tempo = badTimeline(project.tempoMap);
  if (tempo) problems.push(`the tempo map ${tempo}`);
  const meters = badTimeline(project.meters);
  if (meters) problems.push(`the meters ${meters}`);

  const ids = new Set<string>();
  const own = (id: string, what: string) => {
    if (ids.has(id)) problems.push(`${what} ${id} shares its id`);
    ids.add(id);
  };
  const trackIds = new Set(project.tracks.map((t) => t.id));
  for (const t of project.tracks) {
    own(t.id, 'track');
    const duck = t.mixer.duck;
    if (duck && !trackIds.has(duck.from))
      problems.push(`track ${t.id} ducks to a missing track ${duck.from}`);
    for (const c of t.clips) {
      own(c.id, 'clip');
      if (!isNum(c.start) || c.start < 0) problems.push(`clip ${c.id} starts at ${c.start}`);
      if (!isNum(c.beats) || c.beats <= 0) problems.push(`clip ${c.id} is ${c.beats} beats long`);
      for (const [i, n] of c.notes.entries()) {
        const bad = badNote(n);
        if (bad) problems.push(`clip ${c.id}, note ${i + 1} ${bad}`);
      }
    }
  }
  problems.push(...patternProblems(project));

  // the file: what is written reads back, and writing that again gives the same text
  try {
    const text = writeProject(project);
    const again = writeProject(readProject(text));
    if (again !== text) problems.push('the file changes when it is read and written again');
  } catch (e) {
    problems.push(`the file does not read back: ${e instanceof Error ? e.message : String(e)}`);
  }
  return problems;
}
