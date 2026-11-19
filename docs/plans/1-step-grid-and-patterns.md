# Step grid and patterns: slices

Each slice leaves `just check` and `just test` green and names the PRD sections it implements.

- [x] **1. Patterns in the model and the file** (PRD §3.2–3.3, §3.5–3.9, §3.11, §6.1, §7, §8). `src/daw/project.js`: `patterns` on the project, `updateClip` spreading notes, length and step to every clip of a pattern, `makePattern`, `makeUnique`, `renamePattern`, cutting edits unlinking. `src/daw/project-format.js`: version 2 writing and reading, version 1 when there are no pattern clips. Tests: an invariant check (clips of a pattern agree; every pattern clip's pattern exists) after seeded random edits, the file round trip, version 1 output for every composed project, the error for a missing pattern.
- [x] **2. Patterns in the app** (PRD §3.4, §3.10, §5 for the pattern commands). Make Pattern, Make Unique, Rename Pattern, double-click on a drum lane, Alt drag, duplicate and paste keeping the link, the name and link mark on clips. Waits on 1.
- [x] **3. The drum step grid** (PRD §4, §5 for the grid, §6.1). The Step Grid tab and `Cmd 3`, auto switching, rows and Add Row/Hide Row, step sizes, painting, accents, off-grid notes, the preview sound, the playhead column. Pure geometry and cell logic in their own modules with tests. Waits on 1.
- [x] **4. Docs** (PRD §5). `docs/controls.md`, `docs/features.md`, `docs/architecture.md` (the file format and the new files).

Slices 1 to 4 make the first working slice; later work is PRD §9.
