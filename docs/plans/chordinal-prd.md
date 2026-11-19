# Chordinal: a DAW for making music by hand (PRD)

Chordinal is a second desktop app in this repo, built for making music by hand: pick sounds, click in beats, draw notes, arrange parts, mix. It runs on Music Generator's engine (projects, player, instruments, mixer, piano roll, step grid, patterns) and offers the composer as one optional action, **Generate Part…**. Music Generator becomes a small generator app that hands its songs to Chordinal for editing. Code that implements a section cites it (`Chordinal PRD §4.2`).

The patterns and step grid spec (`prd.md`, §3 to §7) stays in force. Chordinal uses it as written.

## §1 Goals

1. Start on an empty project or the last one, never on a list of generated songs. The main path is clicking things in by hand.
2. Work the way FL Studio and GarageBand users already work: a channel rack of instruments, a step grid for beats, a piano roll for melodies, a song built from patterns, and a mixer.
3. Generating is optional: a part generated into a track, edited by hand afterwards like any other clip.
4. One engine, one project format, one place to fix bugs. Music Generator and Chordinal share every module below the UI shell.

## §2 Non-goals

- FL-style multi-track patterns. Parts are per-track clips, reused through linked patterns (`prd.md` §3).
- Floating or detachable windows. Views are docked in one window.
- Third-party plugins (VST, AU), notation, time-stretching audio.
- Any change to the composer API that games use (§12).

## §3 Two apps, one repo

1. Each app is its own Electron entry, page bundle, menu bar, settings file and package:
   - Music Generator: `src/app/main.jsx`, built by `just build`, run by `just app`.
   - Chordinal: `src/chordinal/main.jsx`, built by `just build`, run by `just chordinal`.
2. Shared code:
   - The views and actions both apps use move from `src/app/` to `src/ui/`: the arrangement, piano roll, step grid, mixer, transport, browser parts, store, document, commands, clipboard and context menus.
   - `src/app/` and `src/chordinal/` hold only each app's shell, layout, menus and app-only commands.
   - The layer rules gain `ui` between `daw` and the two apps, and the two apps may not import each other.
3. Each app is packaged separately by electron-builder (two configs). Each has its own app id and icon, and each has a release flow, so a fix to the shared code ships in both.
4. Both apps read and write the same `project.json` (versions 1 and 2), so a project made in one opens in the other.

## §4 Starting up and files

1. On start-up, Chordinal reopens the project that was open when it last quit.
2. On the first run, or if that project is gone, it opens a new project (§4.3) and says nothing.
3. **New** (`Cmd N`) opens a new project at once, with no dialog: 120 bpm, 4/4, 8 bars, a drum track (Standard kit) and a Grand Piano track. If the open project has unsaved changes, it asks first: "Save changes to <name>?", with Save, Don't Save and Cancel.
4. **Open…** (`Cmd O`) picks a project folder or its `project.json`, anywhere on disk.
5. **Open Recent** lists the last 10 projects opened or saved, newest first, plus **Clear Menu**.
   - A recent project that no longer exists is greyed out.
   - Choosing a missing project shows a notice, "<name> was moved or deleted", and removes it from the list.
6. **Save** (`Cmd S`) and **Save As…** (`Shift Cmd S`):
   - The first save of a new project asks for a name and a location. The default location is `Documents/Chordinal/`.
   - A project is a folder holding `project.json`, as in Music Generator. Saving is atomic: a temporary file, then a swap.
7. Closing the window or quitting with unsaved changes asks the same question as New.
8. The window title shows the project's name and a dot while it has unsaved changes.

## §5 The window

1. One window, docked, laid out like this:
   - Transport across the top.
   - Left panel: the channel rack (§6) above the browser (§7).
   - Centre: the arrangement (tracks, clips, ruler, markers, chord track).
   - Bottom: the editor, with tabs Piano Roll, Step Grid and Mixer (`Cmd 1`, `Cmd 3`, `Cmd 2`).
2. The divider between the channel rack and the browser, and the left panel's width, are draggable. Both are saved in Chordinal's settings. `B` hides and shows the left panel.
3. Tab switching follows `prd.md` §4.2.

## §6 The channel rack

1. The rack has one row per track, in track order. Each row has the track's colour, name and instrument name, mute and solo buttons, and a volume knob. Double-clicking the knob resets it to 0 dB.
2. Clicking a row selects the track. Double-clicking opens its editor: the step grid for drums, the piano roll otherwise. If the track has no clip at the playhead, it first makes one, a 1-bar pattern on drum tracks.
3. Dropping an instrument from the browser on a row sets that track's instrument. Dropping it on the empty space below the rows adds a track with it.
4. **+ Add Track** (`Alt Cmd N`) adds an instrument track. **+ Add Drums** adds a drum track with the Standard kit.
5. Right-clicking a row shows the track menu, the same menu as the arrangement's track header.
6. Rows can be dragged into a new order, which reorders the tracks.

## §7 The browser

1. The browser has tabs:
   - **Instruments**: the SoundFont libraries and the chip instruments, grouped by General MIDI family.
   - **Kits**: the drum kits.
   - **Projects**: the recent projects and the folder `Documents/Chordinal/`.
   - **Takes**: the open project's whistled takes (§9.3), to read onto a track again.
2. Clicking an instrument plays a short preview on middle C. Clicking a kit plays a kick, a snare and a closed hat.
3. Later work adds the Synths, Effects and Samples tabs (§11).

## §8 Generate Part…

1. **Track ▸ Generate Part…** (and the channel rack and track header right-click menus) opens a dialog. Choose:
   - **Part**: drums, bass, chords, pad, arpeggio, melody or countermelody. The default comes from the track: drums on a drum track, melody otherwise.
   - **Style**: the composer's feelings and genres.
   - **Seed**: shown, with **Roll** to pick another.
   - **Range**: the selection, the loop, or the whole project, defaulting to the first that exists.
2. Generate Part uses the project's tempo, meter and key. If the project has no key, the dialog shows a key picker (default C major). If the project has a chord track over the range, the part follows those chords. If not, the composer writes chords for the range, and for parts that need them it fills the chord track too, in the same undo step.
3. The result is one new clip on the selected track over the range: a pattern clip on a drum track, an ordinary clip otherwise. Clips already there are kept, and the new clip is laid over them. With no track selected, it adds a track with the part's usual instrument.
4. Generating is one undo step. **Generate Again** (same dialog, `Cmd G` while it's open) rolls a new seed and replaces the last generated clip, if it hasn't been edited since.
5. If the composer can't write the part for the meter (for example a style that doesn't support 7/8), the dialog says "<Style> can't write <part> in <meter>." and adds nothing.
6. This uses the composer through a new function beside `compose` and `toProject`. Their signatures and output don't change.

## §9 Music Generator, slimmed down

1. Music Generator's window becomes: the New dialog (feeling, genre or song, seed), the list of shipped songs, a transport to play the selected song, and **Open in Chordinal**.
2. **Open in Chordinal** saves the song into `Documents/Chordinal/<title>/` (adding " 2", " 3" if the name is taken), then opens it in Chordinal. If Chordinal isn't installed, it reveals the folder in the Finder.
3. The piano roll, step grid, mixer, recording (whistling) and editing move out of Music Generator's window. Whistling becomes a Chordinal feature: **Record Melody** on a track, and the chord track's whistle-a-chord.
4. `just compose`, `just projects`, `just export`, `just whistle` and the other tools keep working as they do now.

## §10 Patterns and the step grid

1. As `prd.md` §3 and §4, unchanged: per-track clips, linked pattern clips, and a drum step grid.
2. The channel rack's double-click (§6.2) is the FL-style way in. The arrangement's double-click on a drum lane (`prd.md` §3.4) still works.

## §11 Later work, in order

Each gets its own interview and PRD section before it's built.

1. **Synths and insert effects**, built together:
   - Each mixer channel gets an insert chain: EQ (3 bands), compressor, distortion, chorus, delay and reverb, reordered by drag and bypassed per effect.
   - A subtractive synth: two oscillators, noise, a filter with its own envelope, an amp envelope, an LFO and glide, with presets.
   - Synths and effects are saved in the project. The browser gains Synths and Effects tabs.
2. **Melodic step grid and per-step settings**: rows from the project's key over an octave range, a velocity lane, per-step length, probability and swing, and a strip of steps per drum row inline in the channel rack.
3. **Audio tracks and samples**:
   - Record from a microphone, or drop audio files onto audio tracks, kept in the project folder.
   - Drum rows can play a one-shot sample (drop a `.wav` on a row) instead of a kit sound.
   - The browser gains a Samples tab.
4. **Pattern browser**: a list of the project's patterns, dragged onto lanes.

## §12 What must not change

1. The games' API, exactly as `prd.md` §8: `compose`, `toProject`, `playProject`, `loadInstruments`, `registerFx`, the Humanize FX and `beatToSeconds`. Their signatures and output stay as they are.
2. Every project in `projects/` opens and plays the same in both apps.
3. A project saved by Chordinal opens in Music Generator, and the reverse, as long as it uses only features both apps have.

## Decisions

1. The channel rack shows no inline steps in 1.0. Double-clicking a row opens the step grid (§6.2). Inline steps come with the melodic grid (§11.2).
2. The slimmed Music Generator plays a song and opens it in Chordinal. It shows no piano roll (§9.1).
3. Whistling lives in Chordinal only (§9.3).

The slices are in [2-chordinal.md](2-chordinal.md).
