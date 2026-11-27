# Music Generator: patterns and the step grid (PRD)

Music Generator is already a small DAW: tracks with SoundFont instruments, a piano roll, an arrangement of clips, a mixer, and projects saved as `project.json`. This document specifies what it needs to cover the parts of a pattern-based DAW that it doesn't yet: a step grid for drums, patterns reused across the arrangement, and the later pieces listed in §9. Code that implements a section cites it (`PRD §4.2`).

## §1 Goals

1. Build a drum part the way a pattern sequencer does: a grid of steps per kit piece, clicked on and off, heard as it loops.
2. Reuse a part across the song: place a pattern many times, edit it once, and every copy changes.
3. Keep everything else working as it does now: the piano roll, the composer, recording melodies, import and export, and the games' use of the composer (§8).

## §2 Non-goals for this work

- Multi-track patterns (one block holding drums and bass together, placed in a playlist). Patterns here belong to one track's clips (§3).
- Third-party plugins (VST, AU), audio time-stretching, notation view.
- A separate app. The step grid and patterns go into Music Generator, which already has the tracks, instruments, mixer and file format they need. A second app would copy the piano roll, mixer, player and project format and then drift from them.

## §3 Patterns

1. A **pattern** is a named part that one or more clips play. A clip that plays a pattern is a **pattern clip**; the others are ordinary clips, as now.
2. All pattern clips of one pattern have the same notes, the same length in beats and the same step size (§4.4). Each keeps its own start, track and mute.
3. An edit to the notes, length or step size of one pattern clip changes every clip of that pattern, in one undo step. This includes the piano roll, the step grid, quantize, humanize, transpose, speed, reverse, paste into it, recording into it and the clip length menu.
4. Making patterns:
   - **Make Pattern** (Edit menu and the clip's right-click menu, `Cmd P`) turns the selected ordinary clip into a pattern clip of a new pattern. The pattern is named after the track and a number: "Drums 1", "Drums 2".
   - On a drum track, double-clicking an empty lane makes a pattern clip of a new pattern, not an ordinary clip.
5. Copies of a pattern clip are pattern clips of the same pattern: `Alt` drag, Duplicate (`Cmd D`), and copy and paste within one project. Pasted into a project that doesn't have that pattern (after New or Open), the copy is an ordinary clip.
6. **Make Unique** (Edit menu and right-click) turns one pattern clip into an ordinary clip with the same notes. Nothing else changes.
7. **Rename Pattern…** (right-click a pattern clip) renames the pattern; every clip of it shows the new name. An empty name is refused, as track names are.
8. Edits that cut a pattern clip turn the pieces into ordinary clips: Split, Join, Insert Bars and Delete Bars across it. The pattern's other clips are untouched.
9. Ordinary-clip edits that move or remove a clip (move, nudge, mute, delete) work on pattern clips as on any clip and affect only that clip.
10. In the arrangement a pattern clip shows the pattern's name and a link mark (`⧉`) in its corner, so linked copies are easy to tell apart from independent ones.
11. A pattern with no clips left stays in the project until it's deleted (replaced by Chordinal PRD §18.1).

## §4 The step grid

1. The editor at the bottom gets a third tab, **Step Grid**, beside Piano Roll and Mixer: View ▸ Step Grid, `Cmd 3`. It edits the selected clip, pattern clip or not.
2. Selecting a clip on a drum track while the Piano Roll is showing switches to the Step Grid; selecting a clip on another track while the Step Grid is showing switches to the Piano Roll. The Mixer is never switched away from. Choosing a tab by hand always works, so a drum clip can still be edited in the piano roll.
3. In this work the grid edits drum tracks. On a melodic track the tab says "The step grid edits drum tracks. Use the piano roll for this track." With no clip selected it says "Click one of the track’s clips in the arrangement to edit its steps." and the toolbar names the selected track (with no track selected, "Select a clip to edit its steps.").
4. **Step size** is per clip: 1/8, 1/16 (the default), 1/32 or 1/16 triplet, picked in the grid's toolbar. Changing it is an edit (undo takes it back) and changes no notes. The clip stores it as `step` (§7).
5. **Columns** are the clip's steps, from its start to its length; bar lines and beat lines are drawn heavier than step lines.
6. **Rows** are drum sounds by General MIDI key, labelled with their names: the core kit (Kick 36, Snare 38, Clap 39, Closed Hat 42, Open Hat 46, Low Tom 43, Mid Tom 47, High Tom 50, Crash 49, Ride 51), then any other key the clip has notes on, then any key added to the track. **Add Row…** (right-click a row label) adds a GM drum key to the track's rows; **Hide Row** removes one, unless the clip has notes on it. The track stores its rows as `stepRows` (§7); with none stored it shows the core kit.
7. A **step is on** when the clip has a note on that row whose start is exactly on that step (within a thousandth of a beat). A note on that row starting elsewhere inside the step is **off the grid**: it is drawn greyed in that cell and the grid never moves, resizes or deletes it.
8. Clicking an off step turns it on: a note at the step's start, one step long, velocity 100. Clicking an on step turns it off (removes the on-grid note). Dragging along a row or across rows paints: every cell the pointer enters is set to what the first click did (on or off). One click or one drag is one undo step.
9. `Shift` click an on step toggles its **accent**: velocity 127, or back to 100. An accented step is drawn brighter. Velocities other than 100 and 127 (from the piano roll or an import) are kept and drawn by their level.
10. Turning a step on while the transport is stopped plays that drum sound once through the track's instrument.
11. While playing, the column under the playhead is highlighted when the playhead is inside the selected clip (for a pattern clip: inside any clip of that pattern, since they share the grid).
12. Edits restart playback the same way piano-roll edits do now, so a looped pattern is heard as it is edited.

## §5 Commands, menus and keys

| Command | Where | Key |
| --- | --- | --- |
| Step Grid | View menu, editor tab | `Cmd 3` |
| Make Pattern | Edit menu, clip right-click | `Cmd P` |
| Make Unique | Edit menu, pattern clip right-click | |
| Rename Pattern… | pattern clip right-click | |
| Add Row…, Hide Row | step grid row label right-click | |
| Step size | step grid toolbar | |

All of them go through `src/app/commands.js` and the existing context menus, and `docs/controls.md` lists them.

## §6 Undo, errors and saving

1. Every change in §3 and §4 is one undo step. A drag paint is one step. An edit that changes nothing (clicking Make Unique on an ordinary clip, picking the step size already set) isn't a step.
2. Saving, Save As, the dirty mark and the save errors are as now: patterns add no new failure.
3. Opening a version 2 file in an older Music Generator shows its existing message, "project version 2; this app reads version 1", and opens nothing.

## §7 The project file

1. A project with no pattern clips is written as version 1, exactly as now, so projects made by the composer, `just projects` and MIDI import don't change.
2. A project with pattern clips is written as version 2: a top-level `patterns: [{ id, name, beats, step?, notes }]`, and each pattern clip as `{ id, start, pattern, mute? }` with no notes or length of its own. The notes use the same compact one-line form as clip notes.
3. The reader takes versions 1 and 2. Reading version 2 gives every pattern clip its pattern's notes, length and step. A clip naming a pattern the file doesn't have is an error: "clip c4 plays pattern p2, which the project doesn't have".
4. Clips may carry `step` (§4.4) and tracks `stepRows` (§4.6) in either version; a version 1 reader keeps them as they are.
5. In memory, every pattern clip holds its pattern's notes, length and step itself, and the project holds `patterns: [{ id, name }]`. So the player, export, MIDI export, the Humanize FX and everything else that reads `clip.notes` work unchanged.

## §8 What must not change

1. The composer API games use: `compose` and `toProject` (`src/composer/`), `playProject` (`src/daw/player.js`), `loadInstruments` (`src/daw/instruments.js`), `registerFx` (`src/daw/fx.js`), the Humanize FX (`src/composer/humanize-fx.js`) and `beatToSeconds` (`src/lib/tempo-map.js`). Their signatures and output stay as they are; a project from `toProject` has no patterns and writes as version 1.
2. Every existing project in `projects/` opens and plays the same.

## §9 Later work

Each item gets its own interview and PRD section before it is built.

1. **Melodic step grid**: rows are the notes of the project's key (or chromatic without one) over a chosen octave range, for bass lines and arpeggios.
2. **Per-step parameters**: a velocity lane under the grid, per-step note length, probability, and per-pattern swing.
3. **Pattern browser**: a Patterns tab in the browser listing the project's patterns, dragged onto lanes to place them; unused patterns kept until deleted there.
4. **Effects per track**: insert effects on each channel strip (EQ, compressor, distortion, chorus), saved in the track's mixer settings.
5. **Synth instruments**: a subtractive synth with its own controls, beside the SoundFonts and the chip instruments.
6. **Audio tracks**: clips of audio (dropped files, or recorded from the microphone), kept in the project folder.

## Open questions

None for §3 to §8.
