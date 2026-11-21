# Chordinal: one app, a TypeScript workspace

The repo becomes Chordinal alone, on the house stack: a pnpm workspace in strict TypeScript, pure engine packages, a Preact UI that reaches projects only through one store interface, one command catalog, one static Vite build for the browser and Electron, and a CLI on the engine. Each slice leaves the app working and `just check` green, keeps reading every existing `project.json`, and names what it waits on.

Decisions:

- Music Generator's window and app are dropped. Its composer stays, as an engine package used by Generate Part…, the CLI and the games.
- The repo is renamed everywhere: `~/src/apps/chordinal`, the GitHub repo `chordinal` (GitHub redirects the old URL), and the three games that render their music with it. Chordinal's settings and data folders stay where they are.
- Shells: desktop (Electron) and web (projects in the browser through `BrowserStore`), plus the CLI. No NAS server.
- Games render their soundtrack through the CLI (`chordinal render`), not by loading this repo's source files. Their render tools already point at `src/features/composer/`, which no longer exists.
- The look stays a dark, flat DAW and gains a light theme, a theme setting (System, Light, Dark), reduced motion and visible focus rings, after a design pass (slice 2).

## Slices

- [x] **1. Drop Music Generator.** Remove `src/app/`, `electron/main.js`'s window, its packaging config and icon, Open in Chordinal, and their tests and docs. Chordinal becomes the `main` entry. `chordinal-prd.md` §3 and §9 rewritten for one app; §12 keeps the games' API. Waits on nothing.
- [x] **2. Design pass.** A visual pass over the window (toolbar, transport, track list, arrangement, piano roll, step grid, mixer, channel rack, browser, dialogs): spacing, type scale, colour tokens, states, the light theme and the theme setting. Checked with headless screenshots in both themes. The stylesheet carries over into the workspace unchanged. Waits on 1.
- [~] **3. Rename.** Package and product names, `AGENTS.md`, README and docs; move the folder to `~/src/apps/chordinal`; rename the GitHub repo and its remote; update the pointer in the home repo. Waits on 1.
- [ ] **4. Workspace.** pnpm, `tsconfig.base.json`, ESLint with engine purity and deep-import bans, Prettier, Vitest, the root scripts and `just check`; the current code moved under `apps/desktop` and `packages/` as JavaScript, still building with esbuild. `node --test` tests keep running until they are ported. Waits on 3.
- [ ] **5. Engine packages.** `lib`, `daw`, `audio` (the pure parts), `composer` and `sketch` into `packages/*` as TypeScript, one module per commit, tests ported to Vitest, the project format byte-compatible (a round-trip test over every project in `projects/`). Audio code that needs Web Audio stays out of the pure packages. Waits on 4.
- [ ] **6. Store.** The project store interface with `MemoryStore`, `BrowserStore` and `NativeStore` (the Electron bridge), version tokens, atomic saves, `classifyFile`, the save session as a statechart, and the contract test. Waits on 5.
- [ ] **7. Commands.** Today's command list into a `CommandCatalog`: the keyboard, ⌘K, context menus, the native menu bar, the Keyboard Shortcuts window and the `docs/controls.md` drift test. Waits on 5.
- [ ] **8. UI.** The views ported to TSX in `packages/ui` and `apps/web` (Vite), view by view, with logic in tested modules; the browser build runs on its own. Waits on 6 and 7.
- [ ] **9. Electron shell.** `apps/desktop` in TypeScript: app:// scheme, one bridge, sender checks, headless mode; the userData path kept. Waits on 8.
- [ ] **10. CLI and the games.** `apps/cli`: `compose`, `export` and `render <songs.js> <folder>`, run headlessly with the real engine. Blast Complex, Comet and Little Lantern switched to it, one commit in each repo. Waits on 5 and 9.
- [ ] **11. Checks, docs and release.** Architecture test, random-operation tests for the engine and the save session, Playwright scenarios, `AGENTS.md`, README and `docs/`, CHANGELOG ("Before you update"), CI and the release workflow; version 1.0.0. Waits on 10.

The open slice from `2-chordinal.md` (7, a track's chain) waits until slice 5 has landed.
