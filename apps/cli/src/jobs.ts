// What the CLI asks of its render page, which runs in a hidden Electron window (page/page.ts). The page takes jobs
// one at a time with GET /job and answers each with PUT /result/<id> (or PUT /error/<id> with what went wrong).

/** play a project offline and hand back the render: two channels, one after the other, as 32-bit floats */
export interface PlayJob {
  kind: 'play';
  id: number;
  /** the project file's text (project.json) */
  project: string;
  /** the beat to stop at; null for the project's end */
  until: number | null;
  /** seconds rendered after `until`, for reverb and release */
  tail: number;
}

/** decode an encoded file as the browser does, at `rate`, and hand back `count` frames of its left channel from `from` */
export interface DecodeJob {
  kind: 'decode';
  id: number;
  url: string;
  rate: number;
  from: number;
  count: number;
}

/** the CLI is done with the page */
export interface DoneJob {
  kind: 'done';
  id: number;
}

export type Job = PlayJob | DecodeJob | DoneJob;
