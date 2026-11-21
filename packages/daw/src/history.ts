// Undo history: a list of earlier projects, since every edit returns a new one. Pure.
import type { Project } from './project.ts';

const DEPTH = 200;

export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}

export const history = (project: Project): History => ({ past: [], present: project, future: [] });

/** the project after an edit; an edit that changed nothing isn't a step */
export const commit = (h: History, next: Project): History =>
  next === h.present ? h : { past: [...h.past, h.present].slice(-DEPTH), present: next, future: [] };

export function undo(h: History): History {
  const last = h.past.at(-1);
  return last ? { past: h.past.slice(0, -1), present: last, future: [h.present, ...h.future] } : h;
}

export function redo(h: History): History {
  const [next, ...future] = h.future;
  return next ? { past: [...h.past, h.present], present: next, future } : h;
}
