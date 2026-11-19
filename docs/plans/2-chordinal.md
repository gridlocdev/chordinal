# Chordinal: slices

Each slice leaves `just check` and `just test` green and names the Chordinal PRD sections it implements. Work starts on a new branch from `step-grid-and-patterns` once that is merged.

- [x] **1. Shared UI** (§3.2). Move the views and actions both apps use from `src/app/` to `src/ui/`, with no change in behaviour. Add the `ui` layer to the layer rules, and forbid the two apps from importing each other.
- [x] **2. The Chordinal shell** (§3.1, §4). Its entry, `just chordinal`, start-up, New, Open, Open Recent, Save As to a chosen folder, and the close questions. Waits on 1.
- [x] **3. The left panel** (§5, §6, §7). The channel rack and the browser tabs. Waits on 2.
- [x] **4. Generate Part…** (§8). Waits on 2.
- [x] **5. Music Generator slimmed down** (§9). Open in Chordinal, and whistling moved to Chordinal. Waits on 2.
- [ ] **6. Packaging** (§3.3). Both apps and their icons. Waits on 5.
