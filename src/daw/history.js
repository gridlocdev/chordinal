// Undo history: a list of earlier projects, since every edit returns a new one. Pure.

/** @typedef {import('./project.js').Project} Project */

const DEPTH = 200;

/** @typedef {{ past: Project[], present: Project, future: Project[] }} History */

/** @returns {History} */
export const history = (project)=> ({ past: [], present: project, future: [] });

/** the project after an edit; an edit that changed nothing isn't a step */
export const commit = (h, next)=> next === h.present ? h : { past: [...h.past, h.present].slice(-DEPTH), present: next, future: [] };

export const undo = (h)=> h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future] } : h;

export const redo = (h)=> h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
