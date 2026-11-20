# Chordinal: slices

Each slice leaves `just check` and `just test` green and names the Chordinal PRD sections it implements. Work starts on a new branch from `step-grid-and-patterns` once that is merged.

- [x] **1. Shared UI** (§3.2). Move the views and actions both apps use from `src/app/` to `src/ui/`, with no change in behaviour. Add the `ui` layer to the layer rules, and forbid the two apps from importing each other.
- [x] **2. The Chordinal shell** (§3.1, §4). Its entry, `just chordinal`, start-up, New, Open, Open Recent, Save As to a chosen folder, and the close questions. Waits on 1.
- [x] **3. The left panel** (§5, §6, §7). The channel rack and the browser tabs. Waits on 2.
- [x] **4. Generate Part…** (§8). Waits on 2.
- [x] **5. Music Generator slimmed down** (§9). Open in Chordinal, and whistling moved to Chordinal. Waits on 2.
- [x] **6. Packaging** (§3.3). Both apps and their icons. Waits on 5.
- [ ] **7. A track's chain: instrument, inserts, strip** (groundwork for §11.1, before its interview). Today the player only plays SoundFont instruments, and a channel strip (`input → user → low cut → tone → fader → pan`) has no place for an effect. The player reaches into the strip's nodes by name (`tone.frequency`, `fader.gain`, `delaySend.gain`, `panner`) and lists the automation targets itself, and the level meters are wired outside the mixer. With no change in sound:
  - Define an `Instrument` type (`noteOn`, `noteOff`, `glide`, `tapeStop`, `dispose`) that the SoundFont instrument meets, so a synth can meet it later.
  - `loadInstruments` adds a `create(destination)` to each result and keeps `font`, `preset` and `entry`, so the games' API (§12.1) is unchanged. The player makes each track's instrument through `create`.
  - Each strip has an insert slot: an input and output before the fader, wired straight through while it is empty. It also has a `params` map that automation, ducking and the send swell look up by name, and its own `meter`.
  - Tests: a strip with an empty slot sounds the same as today (an export with the same length, peak and loudness); a test insert in the slot is heard, and is gone after `dispose`; automation and ducking reach their params through the map; the games' API test still passes.
  - Waits on nothing. §11.1's effects and synth then plug into the slot and the `Instrument` type.
