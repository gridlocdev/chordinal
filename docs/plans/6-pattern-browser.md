# The pattern browser: slices

PRD §18 describes it. Each slice leaves `just check` and `just e2e-desktop` green, names the sections it implements, and updates `docs/features.md` and `docs/controls.md` for what it adds.

- [ ] **(a) Kept patterns in the model and the file** (§18.1, §18.8). A pattern holds its notes, length, step, swing and track, kept in step with its clips by every pattern edit, and stays when its last clip goes. Saving and reading unplaced patterns, a deleted track's patterns, and the random-edit test and invariants. Engine functions to place a clip of a pattern, make a new one, duplicate and delete one. No UI yet.
- [ ] **(b) The Patterns tab** (§18.2, §18.3, §18.5). The list grouped by track with its counts, the empty state and the section dropdown; click to pick and preview; double-click to open, placing a clip first when it's unplaced. Waits on (a).
- [ ] **(c) Dragging onto lanes** (§18.4). Drops on instrument and drum lanes, snapping to the bar (`Shift`: the beat), the drop outline, audio lanes refusing, and a new track below the tracks. Waits on (b).
- [ ] **(d) New, rename, duplicate and delete** (§18.6, §18.7). The commands in the catalog, the Track menu and ⌘K, the list's right-click menu, the New Pattern button, and Delete's question for a placed pattern. Waits on (b).
