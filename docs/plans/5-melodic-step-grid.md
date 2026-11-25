# The melodic step grid and per-step settings: slices

PRD §17 describes it. Each slice leaves `just check` and `just e2e-desktop` green and names the sections it implements.

- [ ] **(a) Probability and swing in the model and the player** (§17.6, §17.7, §17.9). `chance` on notes and `swing` on clips, kept through saving, pattern edits and the random-edit test. The player rolls each note from its seed and delays swung steps, live, on Play, in the exports and in `chordinal render`; a MIDI export writes every note. Tests: the same notes play twice running and in an export, a loop pass rolls again, 0% swing is exactly straight, a project with neither plays as before.
- [ ] **(b) Melodic rows** (§17.1–§17.3). Rows from the key over two octaves, the octave buttons and **Chromatic**, rows for notes outside them, painting and preview on melodic tracks, and the editor each track remembers. Pure row logic in its own module with tests. Waits on nothing.
- [ ] **(c) Step length** (§17.4). Dragging a step's edge on drum and melodic tracks, drawn as one bar. Waits on (b) for melodic tracks.
- [ ] **(d) The lane** (§17.5). Velocity and Probability bars under the grid, painted by dragging. Waits on (a).
- [ ] **(e) The Swing slider** (§17.7). In the grid's toolbar, one undo step per drag. Waits on (a).
- [ ] **(f) Inline steps** (§17.8). **Show Steps** on drum tracks' lanes in the arrangement. Last; can be left for later if the rest runs long.

Each slice updates `docs/features.md` and `docs/controls.md` for what it adds.
