// Every song the app offers: the written songs by group, then one song per feeling composed from its defaults alone.
import { SONGS } from './songs-data.ts';
import { GENRE_SONGS } from './genre-songs-data.ts';
import { GAME_SONGS } from './game-songs-data.ts';
import { CHIP_SONGS } from './chip-songs-data.ts';
import { CLASSICAL_SONGS } from './classical-songs-data.ts';
import { EMOTIONS } from './composer-data.ts';
import type { SongSpec } from './plan.ts';

/** a song the app offers: label is its name in the list, story what it's about */
export interface CatalogEntry {
  id: string;
  group: string;
  label: string;
  story?: string;
  spec: SongSpec;
}

/** 'hopeful' → 'Hopeful' */
const capital = (e: string): string => `${e.charAt(0).toUpperCase()}${e.slice(1)}`;

export const CATALOG: CatalogEntry[] = [
  ...GAME_SONGS.map((spec) => ({
    id: spec.id,
    group: 'Game music',
    label: `${spec.genre}: ${spec.title}`,
    story: spec.story,
    spec,
  })),
  ...CHIP_SONGS.map((spec) => ({
    id: spec.id,
    group: 'Chiptune',
    label: `${spec.genre}: ${spec.title}`,
    story: spec.story,
    spec,
  })),
  ...CLASSICAL_SONGS.map((spec) => ({
    id: spec.id,
    group: 'Classical',
    label: spec.title,
    story: spec.story,
    spec,
  })),
  ...GENRE_SONGS.map((spec) => ({
    id: spec.id,
    group: 'Genres',
    label: `${spec.genre}: ${spec.title}`,
    story: spec.story,
    spec,
  })),
  ...SONGS.map((spec) => ({
    id: spec.id,
    group: 'Written songs',
    label: spec.title,
    story: spec.story,
    spec,
  })),
  ...Object.keys(EMOTIONS).map((e) => ({
    id: `feel:${e}`,
    group: 'Feelings',
    label: capital(e),
    spec: { id: e, title: capital(e), emotion: e },
  })),
];
