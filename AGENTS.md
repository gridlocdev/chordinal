## Architecture

This app follows the layered layout in `docs/architecture.md`. Read it before adding or moving code. In short:

- A pnpm workspace: `packages/{lib,audio,daw,perform,sketch,playback,ui}`, `apps/web` (the page) and `apps/desktop` (Electron). Import a package by its name (`@chordinal/daw`), never by a path inside it.
- `lib → audio → daw → (perform, sketch) → playback → ui → apps/web`; imports only point down that chain. ESLint enforces it.
- `daw` is the generic DAW: projects, their file format, edits with undo, what playback schedules and the MIDI FX hook. It knows nothing of songs, specs or recording. `playback` holds everything on Web Audio.
- `perform` (the Humanize FX) and `sketch` (reading recorded takes) hold the music logic and know nothing of the UI. Composing songs is not part of Chordinal: it lives in Chordinal Melody Composer, a separate repository that builds on these packages. `ui` is the Preact UI: signals in `packages/ui/src/store.ts`, actions in `packages/ui/src/*.ts`, views in `packages/ui/src/components/`. `apps/web/src/` holds the app's shell: start-up, its menus, its files (New, Open, Open Recent, Save As to any folder) and its browser (`apps/web/src/rack.ts` and `apps/web/src/components/`). Where projects are kept is set in `packages/ui/src/place.ts` at start-up.
- The engine (`lib`, `audio`, `daw`, `perform`, `sketch`) imports no DOM, Node or Preact.
- Content (tables, tuning) goes in `*-data.ts` files.
- The page is built by Vite into `apps/web/dist/` and the desktop main process by esbuild (`just build`); the packages also run as-is in Node for the tools and tests.
- `apps/cli` is the `chordinal` command line (export, render), run with `just cli …`; it may use Node and the engine packages, and only its render page (`apps/cli/src/page/`) imports playback.
- A package's `src/index.ts` names what it exports (`export { a } from './x.ts'`, never `export *`).
- `test/architecture.test.ts` checks the layers, the pure engine, the desktop bridge, the store, the key listeners, the command ids, named exports and type escapes; each failure says how to fix it. `any`, `@ts-ignore`, `@ts-expect-error` and `eslint-disable` are allowed only through `test/architecture-exceptions.json`, which the user approves.
- Random-operation tests (`packages/daw/test/random-edits.test.ts`, `packages/ui/test/random-saving.test.ts`) print the seed of a failing run; replay it with `SEED=<n> npx vitest run <file>`. A seed that finds a bug becomes its own named test.
- After changes run `just check` (prettier, eslint with the layer rules, tsc, the bundle and the tests).

## Words

Use the terms in [GLOSSARY.md](GLOSSARY.md) in code, docs and commit messages, and add a term there when a new concept appears.
