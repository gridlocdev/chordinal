## Architecture

This app follows the layered layout in `docs/architecture.md`. Read it before adding or moving code. In short:

- A pnpm workspace: `packages/{lib,audio,daw,composer,sketch,playback,ui}`, `apps/web` (the page) and `apps/desktop` (Electron). Import a package by its name (`@chordinal/daw`), never by a path inside it.
- `lib → audio → daw → (composer, sketch) → playback → ui → apps/web`; imports only point down that chain. ESLint enforces it.
- `daw` is the generic DAW: projects, their file format, edits with undo, what playback schedules and the MIDI FX hook. It knows nothing of songs, specs or whistling. `playback` holds everything on Web Audio.
- `composer` and `sketch` hold the music logic and know nothing of the UI, and don't import each other. `ui` is the Preact UI: signals in `packages/ui/src/store.js`, actions in `packages/ui/src/*.js`, views in `packages/ui/src/components/`. `apps/web/src/` holds the app's shell: start-up, its menus, its files (New, Open, Open Recent, Save As to any folder) and its browser (`apps/web/src/rack.js` and `apps/web/src/components/`). Where projects are kept is set in `packages/ui/src/place.js` at start-up.
- The engine (`lib`, `audio`, `daw`, `composer`, `sketch`) imports no DOM, Node or Preact.
- Content (songs, tables, tuning) goes in `*-data.js` files.
- The page is built by Vite into `apps/web/dist/` and the desktop main process by esbuild (`just build`); the packages also run as-is in Node for the tools and tests.
- `apps/cli` is the `chordinal` command line (compose, export, render), run with `just cli …`; it may use Node and the engine packages, and only its render page (`apps/cli/src/page/`) imports playback.
- After changes run `just check` (prettier, eslint with the layer rules, tsc, the bundle and the tests).
