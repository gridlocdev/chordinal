# Chordinal: a DAW for making music by hand (PRD)

Chordinal is the desktop app in this repo, built for making music by hand: pick sounds, click in beats, draw notes, arrange parts, mix. It runs on the repo's engine (projects, player, instruments, mixer, piano roll, step grid, patterns). It composes nothing itself: the composer, its songs and New from Melody moved to Chordinal Melody Composer, a separate repository that builds on these packages and writes projects Chordinal opens. Code that implements a section cites it (`Chordinal PRD §4.2`).

The patterns and step grid spec (`prd.md`, §3 to §7) stays in force. Chordinal uses it as written.

## §1 Goals

1. Start on an empty project or the last one. The main path is clicking things in by hand.
2. Work the way FL Studio and GarageBand users already work: a channel rack of instruments, a step grid for beats, a piano roll for melodies, a song built from patterns, and a mixer.
3. Projects made elsewhere (by Chordinal Melody Composer, or imported from MIDI) open and are edited like any other.
4. One engine, one project format, one place to fix bugs. The app shell sits on shared modules (`packages/ui/`) that hold no app-only code.

## §2 Non-goals

- FL-style multi-track patterns. Parts are per-track clips, reused through linked patterns (`prd.md` §3).
- Floating or detachable windows. Views are docked in one window.
- Third-party plugins (VST, AU), notation, time-stretching audio.
- Composing songs or parts. That is Chordinal Melody Composer's job.

## §3 One app, one repo

1. Chordinal is the repo's one Electron entry, page bundle, menu bar, settings file and package: `apps/web/src/main.jsx`, built by `just build`, run by `just run-desktop`.
2. Shared code:
   - `packages/ui/` holds the views and actions: the arrangement, piano roll, step grid, mixer, transport, browser parts, store, document, commands, clipboard and context menus.
   - `apps/web/` holds only the app's shell, layout, menus and app-only commands.
   - The layer rules put `ui` between the engine packages and `apps/web`.
3. electron-builder packages it from one config, with its own app id, icon and release flow.
4. It reads and writes `project.json` (versions 1 and 2), so projects saved before Music Generator was dropped still open.

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
   - A project is a folder holding `project.json`. Saving is atomic: a temporary file, then a swap.
   - If `project.json` changed on disk since it was opened or last saved, Save asks first: "<name> changed on disk since it was opened. Replace it with this version?", with Replace and Cancel. Cancel keeps both: the file on disk stays, the changes stay unsaved, and the next Save asks again. Nothing is ever overwritten without asking.
7. Closing the window or quitting with unsaved changes asks the same question as New.
8. The window title shows the project's name and a dot while it has unsaved changes.
9. In a browser (no desktop app), projects are kept in the browser by name. The first save asks only for a name ("Save the project as"); a name already saved asks "A project named <name> is already saved in this browser. Replace it?", with Replace and Cancel, and Cancel goes back to the name. Settings are kept in the browser too, and start-up reopens the last project as on the desktop. Open… and Open Recent don’t list the browser’s projects yet (§11).

## §5 The window

1. One window, docked, laid out like this:
   - Across the top: the browser's toggle and the project's title (a dot while there are changes to save) on the left; the transport buttons and a display (bar and beat, tempo, meter, key, section) in the middle; New, Save, Save as and the master volume on the right.
   - Left: the browser (§7).
   - Centre: the arrangement (ruler, markers, and a row per track whose header is the track's channel, §6).
   - Bottom: the editor, with tabs Piano Roll, Mixer and Step Grid (`Cmd 1`, `Cmd 2`, `Cmd 3`). The tabs and the open view's toolbar share one bar.
   - Along the bottom edge: the status bar (item 6).
2. The browser's width and the editor's height are draggable. Both are saved in Chordinal's settings. `B` hides and shows the browser.
3. Tab switching follows `prd.md` §4.2.
4. The look has a dark and a light theme. **View ▸ Theme** picks System (follows the OS), Light or Dark; the choice is saved in the settings. Motion stops when the OS asks for reduced motion, and the focused control has a visible ring.
5. **⌘K** opens the command menu: type part of a command's name, or another word for it, and press Enter to run it. Disabled commands stay in the list, greyed. With nothing typed, the recent commands come first. **Help ▸ Keyboard Shortcuts** (`Cmd /`) lists every command with its shortcut. Both come from the same command list as the menu bar and the keys, and `docs/controls.md` is checked against it.

6. The status bar runs along the bottom of the window. At its left is the latest notice: what just happened ("Saved Demo", "12 notes from the take"), what's under way ("Bouncing…", the count-in), or what went wrong ("Couldn't load Grand Piano: …"). A notice of what happened goes after 6 seconds; one under way stays until it's done; an error stays until it's dismissed (its ×) or the next notice. At its right: what the letter keys play, as `Keys C4–F5 · Grand Piano` (the lowest and highest key, and the instrument), dimmed while they don't play (the piano roll isn't the part last clicked, and no take is running), with a tip naming `Z` and `X`; the MIDI keyboard's name while one is connected; and "Not saved" while the project has changes to save.
7. Changing the octave (`Z`, `X`) scrolls the piano roll, when needed, so every key the letter keys play is in view.
8. On macOS the window has no title bar. The browser runs to the top of the window, and its top row holds the window's close, minimise and zoom buttons and, at its right, the browser's toggle; the top bar beside it is the rest of the title bar. With the browser hidden, the top bar makes room for the window's buttons and has the toggle. Dragging the empty parts of either row moves the window (double-clicking zooms it, as the system settings say). In full screen the room for the buttons goes. Windows, Linux and the browser keep their own frame.
9. A part of the window too wide for its space (the mixer's strips, the Sound tab's panels, a long editor toolbar, the browser's tabs) scrolls sideways inside that part and shows a scrollbar. It never widens the window or hides what's past the edge.
10. In the piano roll, `Alt`-drag slices: a line at the pointer's beat, snapped to the grid, runs across the keys from where the drag started to the pointer, and when the button is let go it cuts every note it goes through in two. `Cmd`-drag (`Ctrl` on Windows and Linux) deletes every note the pointer passes over. Each drag is one undo step. `Alt` held once a drag has started still moves, resizes or draws off the grid.

## §6 The track headers

1. Each track's row in the arrangement starts with its header: the track's colour, name and instrument name, mute and solo buttons, and a volume knob. Double-clicking the knob resets it to 0 dB. The tracks are listed once, here; there is no separate rack.
2. Clicking a header selects the track. Double-clicking opens its editor: the step grid for drums, the piano roll otherwise. If the track has no clip at the playhead, it first makes one, a 1-bar pattern on drum tracks. Double-clicking the name renames the track.
3. Dropping an instrument from the browser on a track sets its instrument. Dropping it below the tracks adds a track with it.
4. Below the tracks, **+ Track** (`Alt Cmd N`) adds an instrument track and **+ Drums** adds a drum track with the Standard kit.
5. Right-clicking a header shows the track menu, Delete Track among it.
6. Headers can be dragged into a new order, which reorders the tracks; dropped below the tracks, a header moves its track last.

## §7 The browser

1. The browser has tabs:
   - **Instruments**: the SoundFont libraries and the chip instruments, grouped by General MIDI family.
   - **Kits**: the drum kits.
   - **Projects**: the recent projects and the folder `Documents/Chordinal/`.
   - **Takes**: the open project's recorded takes (§9.3), to read onto a track again.
2. Clicking an instrument plays a short preview on middle C. Clicking a kit plays a kick, a snare and a closed hat.
3. When a tab's list has more than one section (the instrument families, or Recent and Documents/Chordinal), a dropdown across the full width under the tabs lists them. Picking one scrolls the list to that section's heading, and while the list scrolls the dropdown names the section at the top.
4. **Synths** lists the synth's presets (§13.10), **Effects** lists the audio effects (§15.5), and **Patterns** lists the project's patterns (§18.2). Later work adds a Samples tab (§11).

## §8 Generate Part… (removed)

Generate Part was removed with the composer. Composing lives in Chordinal Melody Composer.

## §9 Recording and the tools

1. Music Generator, the second app this section once described, was dropped, and so was the composer: `just compose` and the songs moved to Chordinal Melody Composer.
2. A folder handed over at start-up (from the command line or the Finder) opens instead of the last project; one handed over later asks first. A MIDI file handed over the same way (the Finder's Open With, where the desktop app is listed for `.mid`, `.midi` and `.smf` files) opens as a new project, as File → Import MIDI File does, asking first about unsaved changes.
3. Recording is a Chordinal feature: **Record Melody** on a track. (**Record a Chord** and the chord track were removed after 1.0.0's first builds.) While a melody take records, its notes appear in the arrangement and the piano roll as they're played or heard, and the piano roll follows the playhead. When it stops, the playhead goes back to the start of the clip the notes went into (or of the take, if nothing was kept).
   - A take from the microphone, or audio dropped on a track or read from the Takes tab, is read into one line of notes, about 50 to 4,000 Hz, at the project's tempo. Chords (more than one note at a time) aren't read.
   - **Convert Audio Again…** (the Track menu, ⌘K, or the clip's right-click menu) reads a clip's audio again without recording it again: the grid (quarter notes, 8ths, 8ths and triplets, 16ths, 16ths and triplets), **snap notes to the key** (the project's key, else the one guessed from the notes) and a sensitivity slider. Each change replaces the clip's notes as one undo step, and the choices are used for the next audio too. A clip keeps its audio only while its project is open; after that, read the take again from the Takes tab.
4. New from Melody moved to Chordinal Melody Composer, as a page of its own.
5. `just export`, `just transcribe` and the other tools keep working as they do now.

## §10 Patterns and the step grid

1. As `prd.md` §3 and §4, unchanged: per-track clips, linked pattern clips, and a drum step grid.
2. A track header's double-click (§6.2) is the FL-style way in. The arrangement's double-click on a drum lane (`prd.md` §3.4) still works.

## §11 Later work, in order

Each gets its own interview and PRD section before it's built. [4-small-daw.md](4-small-daw.md) plans the first of them, with automation lanes and MIDI effects.

1. **Synths and insert effects**, built together:
   - Each mixer channel gets an insert chain: EQ (3 bands), compressor, distortion, chorus, delay and reverb, reordered by drag and bypassed per effect.
   - A subtractive synth: two oscillators, noise, a filter with its own envelope, an amp envelope, an LFO and glide, with presets.
   - Synths and effects are saved in the project. The browser gains Synths and Effects tabs.
2. **Melodic step grid and per-step settings**: rows from the project's key over an octave range, a velocity lane, per-step length, probability and swing, and a strip of steps per drum row inline in the arrangement. Specified in §17.
3. **Audio tracks and samples**:
   - Record from a microphone, or drop audio files onto audio tracks, kept in the project folder.
   - Drum rows can play a one-shot sample (drop a `.wav` on a row) instead of a kit sound.
   - The browser gains a Samples tab.
4. **Pattern browser**: a list of the project's patterns, dragged onto lanes. Specified in §18.
5. **Opening projects in a browser**: Open… and Open Recent list the projects kept in the browser, with rename and delete (to a trash first).

## §12 What must not change

1. What Chordinal Melody Composer and the games use: `playProject`, `loadInstruments`, `registerFx`, the Humanize FX, `beatToSeconds` and `chordinal render`. Their signatures and output stay as they are.
2. Every project Chordinal Melody Composer writes opens and plays the same in Chordinal (the fixtures in `test/fixtures/projects/`).
3. A project saved by an older build still opens: the format id and versions 1 and 2 stay readable.

## §13 The synth

The first part of §11.1. Its slices are in [4-small-daw.md](4-small-daw.md), feature 4.

1. A synth is an instrument like a SoundFont preset: it plays live, on Play, in an exported WAV and in `chordinal render`. It plays up to 16 notes at once; a 17th cuts the oldest short.
2. Two oscillators, each a saw, square, triangle or sine wave, with an octave (−2 to +2), a detune (±100 cents) and a level, plus white noise with its own level.
3. A filter: low-pass, high-pass or band-pass, with a cutoff (20 Hz to 20 kHz) and a resonance. It has its own attack, decay, sustain and release envelope, which moves the cutoff by an amount (±4 octaves).
4. An amp envelope: attack, decay, sustain and release.
5. Velocity: a harder note is louder, and brighter by a velocity amount (0 to 1) that scales the filter envelope's amount.
6. An LFO: a sine, triangle, square or saw wave with a rate (0.1 to 20 Hz) and a depth, moving the pitch (in cents), the cutoff (in cents) or the volume.
7. Mono: a switch that plays one note at a time. A note played while another is held slides to its pitch over the glide time (0 jumps) without starting its envelopes again. Letting it go slides back to the last key still held. Glide does nothing when Mono is off.
8. A note's pitch moves (its tuning, bend, vibrato, scoop and fall, §9) and the sustain pedal work as on a SoundFont preset.
9. A track's instrument keeps a synth's settings beside its General MIDI bank and program: `{ bank, program, synth }`. The program is what a MIDI export names and what a build without synths plays instead. Older projects, which have no `synth`, open and play as before. A saved synth is read with defaults for anything it lacks.
10. The browser's **Synths** tab lists the synth's presets by group (Bass, Lead, Pad, Pluck and Keys), each with its General MIDI program. They work like the instruments: click to hear one, double-click to put it on the selected track, drag it onto a track or below them, or right-click for **Put on** and **New Track with It**. The track's header, the mixer and musical typing show the preset's name. Putting a SoundFont preset on a synth track takes the synth off it.
11. The editor's **Sound** tab (`⌘4`) sets the selected track's synth: a card per stage (Oscillator 1 and 2, Noise, Filter, Filter envelope, Amp envelope, LFO and Voice), with a slider per number and a dropdown per choice. Double-clicking a slider puts back the starting synth's value, and a slider dragged is one undo step. The LFO's depth is in cents for pitch and filter and a share for volume; moving it between them keeps its share of the range. Glide is greyed out until Mono is on. The synth's name is a field at the top, which the track's header and the mixer show, and **Reset** puts back every setting but the name. On a track playing a SoundFont preset, the tab offers **Use a Synth**, which keeps its General MIDI program; a drum track says synths play the other tracks.

## §14 The sampler

The second part of §11.1. Its slices are in [4-small-daw.md](4-small-daw.md), feature 4.

1. A sampler plays one audio file (WAV, AIFF or MP3) across the keys, as an instrument like a synth: live, on Play, in an exported WAV and in `chordinal render`. A note at the root key plays the file as recorded; each key above or below plays it a semitone faster or slower. It plays up to 32 notes at once; past that, the oldest is cut short.
2. Dropping an audio file on a track's header puts a sampler on the track. Dropping it on the track's lane still reads it as notes (§9.3). The **Sound** tab's **Load a Sample…** does the same as a drop, and **Replace Sample…** swaps the file and starts its settings again. A drum track refuses a sample on its header: its samples go on its rows (item 11).
3. The file is copied into the project's `samples/` folder, under its own name. The same file dropped again reuses its copy; a different file with a name already taken gets " 2", " 3" and so on. Save As copies the samples with the project. A project not yet saved keeps its samples in memory until it is saved. In the browser build, samples are kept in the browser's storage with the project, up to 16 MB each; a larger file is refused with a notice that the desktop app takes it. When the browser's storage is full, a save, a sample or a take is refused with a notice saying so, and nothing already kept changes.
4. The root key is guessed from the first 4 seconds of the file: the middle pitch of its clear frames. A file with no steady pitch (a drum hit, noise) starts at C4, and the notice says so. The **Root key** slider changes it.
5. Mode: **One-shot** plays the sample through whatever the key does; only a note on the same key cuts it. **Sustain loop** loops it from the start offset to its end while the key or the sustain pedal holds it, then lets it go over the release.
6. Start: where in the file a note starts, as a share of its length (0 to 99%).
7. An amp envelope: attack, decay, sustain and release.
8. A note's pitch moves (§9), glide between notes on a mono track, and the tape stop work as on a synth.
9. A track's instrument keeps a sampler's settings beside its General MIDI bank and program: `{ bank, program, sample }`, where `sample` is `{ name, file, root, mode, start, amp }`. A saved sampler is read with defaults for anything it lacks. A sampler whose file is missing plays nothing.
10. The **Sound** tab shows a sampler's name (a field, which the track's header and the mixer show), its file, **Replace Sample…**, and a card for the Sample (Root key, Mode, Start) and one for the Amp envelope. A slider dragged is one undo step. Putting a SoundFont preset or a synth on the track takes the sampler off it.
11. A drum row can play a sample in place of the kit's sound (§11.3). Dropping an audio file on a row of the step grid puts it there; the row's right-click menu (desktop app) has **Load a Sample for <row>…** and **Remove Sample <row>**. The file is kept as in item 3. A row's sample plays once through, at the pitch it was recorded, whatever the note's length: live, on Play, in an export and in `chordinal render`. The row shows the sample's name with ♪ in the accent colour. The track keeps them as `drumSamples: { "<key>": { name, file } }` beside its kit, and putting another kit on the track keeps them. A row whose file is missing plays nothing.

## §15 Track effects

The insert effects of §11.1. Their slices are in [4-small-daw.md](4-small-daw.md), feature 3.

1. Each track's mixer strip has a chain of audio effects, played in order after the track's tone and before its fader: live, on Play, in an exported WAV and in `chordinal render`. There are fourteen: EQ, Filter, Compressor, Limiter, Gain, Distortion, Bitcrusher, Chorus, Phaser, Flanger, Tremolo, Delay, Reverb and Stereo Width.
2. **+ Effect** in a strip adds one at the end and opens its settings in a panel. A row can be bypassed, dragged to another place or removed. Each change is one undo step, and a setting changed while playing glides to its new value.
3. The master strip has a chain of its own, after every track is mixed and before the mastering chain. It holds the same effects and works the same way, and the project keeps it as `masterInserts`. A project with none saves as it did.
4. An effect's settings can be automated on its track (§11.1's automation lanes); the master's can't.
5. The browser's **Effects** tab lists the effects by group: Tone, Dynamics, Drive, Modulation and Space. Hovering one says what it does. Double-clicking one adds it to the selected track; dragging one onto a strip in the mixer adds it there, at the row it is dropped on or at the end.
6. Keys played live go through the selected track's effects and the master's.

## §16 Audio tracks

The first part of §11.3. Its slices are in [4-small-daw.md](4-small-daw.md), feature 5.

1. A track is a MIDI track (every track until now) or an audio track. An audio track plays recordings and audio files instead of notes: it has no instrument, Humanize or MIDI effects, but it has the same mixer strip, track effects, sends and automation. **Track ▸ New Audio Track** adds one below the selected track.
2. An audio track holds audio clips. A clip starts at a beat and plays part of one file: from `offset` seconds into it, for `seconds` seconds, at its gain, with a fade in and a fade out, and it can be muted. The project keeps it as `{ id, start, file, offset, seconds, gain, fadeIn, fadeOut, mute? }`, on the track's `audio` list, and the track as `kind: "audio"`.
3. A clip plays at the file's own speed. A tempo change moves the beat where a clip starts to another time, but not how fast it plays; there is no time-stretching.
4. The files are copied into the project's `audio/` folder, as samples are into `samples/` (§14.3): the same file again reuses its copy, and another with a name already taken gets " 2", " 3" and so on. In the browser build, each file can be up to 64 MB; a larger one is refused with a notice that the desktop app takes it.
5. Dropping a WAV, AIFF or MP3 file on an audio track's lane puts a clip there, at the beat it is dropped on (snapped to the beat; `Shift` places it freely), as long as the whole file; several files dropped together go one after another. Dropping one on a MIDI track's lane still reads it as notes (§9.3), and on a MIDI track's header still puts a sampler on it (§14.2). Dropping one below the tracks makes an audio track for it, named after the file.
6. The arrangement draws each clip's waveform. Clicking a clip selects it. A clip moves (dragging it, to another audio track too; `Alt` copies), copies, cuts, pastes, duplicates, splits, mutes, nudges and deletes with the same commands and keys as a MIDI clip, snapped to the beat unless `Shift` is held. Dragging its left or right edge trims it (never past the file's ends), dragging the small squares at its top corners sets its fades, and its right-click menu sets its gain. Splitting a clip keeps its fade in on the left piece and its fade out on the right. Inserting or deleting time moves and removes audio clips as it does MIDI clips. A MIDI clip or notes can't be pasted onto an audio track, nor an audio clip onto a MIDI track.
7. **Record** with an audio track selected records the microphone onto it as a clip, from where the recording started, with the input's latency taken off. The project plays from the playhead meanwhile, on past its end and round no loop, with no count-in, until **Record** is pressed again or playing stops. The take is kept in the project's `audio/` folder as `Take.wav` (then `Take 2.wav` and so on). Input monitoring is off; the track's **Monitor** button plays the microphone through the track while it is on.
8. Audio clips play on Play, starting partway through a clip when Play starts inside it, and in the WAV and MP3 exports and `chordinal render`. `chordinal render` and `chordinal export` read the clips' files from the project folder's `audio/` and decode them as the app does, so WAV, AIFF and MP3 all play. A MIDI export leaves audio tracks out.
9. A project with an audio track is saved as format version 3, which older builds refuse with a notice instead of playing it wrongly. A project without one is saved as before, so older builds still open it (§12.3).

## §17 The melodic step grid and per-step settings

§11.2, built on the drum step grid (`prd.md` §4).

1. The Step Grid edits melodic tracks too. On a melodic track its rows are the notes of the project's key over two octaves, highest at the top, each labelled with its note name (C4, D4…). With no key, the rows are all twelve notes. Two toolbar buttons move the range an octave down or up, and a **Chromatic** toggle shows all twelve notes in place of the key's. A note in the clip outside the shown rows (another octave, or outside the key) gets a row of its own, as a drum key outside the kit does (`prd.md` §4.6). The range and the toggle are saved with the track.
2. A melodic step turns on as a drum step does (`prd.md` §4.7 and §4.8): a note at the step's start, one step long, velocity 100, on that row's pitch. A step can hold several rows at once, so chords work. Turning one on while the transport is stopped plays it once through the track's instrument.
3. **Which editor a clip opens in.** The Piano Roll stays the default for melodic tracks and the Step Grid for drum tracks. Choosing the other tab by hand while one of a track's clips is selected makes it that track's editor: its clips open there from then on. The track saves it as `editor: 'grid' | 'roll'`; with none saved, the default holds. The Mixer is never switched away from (`prd.md` §4.2).
4. **Length.** Dragging the right edge of an on step stretches its note across later steps, or shortens it, a step at a time (`Shift`: freely). The note is drawn as one bar across the steps it covers, and the steps under it stay off. This works on drum and melodic tracks. A note can't run past the clip's end.
5. **The lane** under the grid edits the on steps of the selected clip, one bar per step, with a switch between **Velocity** (1–127) and **Probability** (0–100%). Dragging across bars paints them; one drag is one undo step. A step holding several notes (a chord) sets them all. A step with probability under 100% is drawn with its fill cut down to that share.
6. **Probability** is the chance a note plays each time it comes round. The note keeps it as `chance` (0 to 1; none means 1). Whether a note plays is fixed by a seed: the clip's pattern (or the clip, without one), the note, the clip's start and how many times a loop has come round. So Play, the WAV and MP3 exports and `chordinal render` all play the same notes, and each loop pass rolls again. A MIDI export writes every note.
7. **Swing** is per clip, 0 to 75%, set by a **Swing** slider in the grid's toolbar, and shared by the clips of a pattern. It delays every second step as the clip plays (the clip's step size, `prd.md` §4.4, in pairs counted from the song's start, so a split clip keeps its swing): at 50% the off step lands two thirds of the way through its pair, at 75% three quarters. The notes don't move, so 0% gives back the straight timing exactly. Notes off the grid are delayed too, by where they fall in their pair of steps. The clip keeps it as `swing` (0 to 0.75; none means 0). Changing it is an edit.
8. **Inline steps.** A drum track's lane in the arrangement can show its rows as strips of steps, toggled by **Show Steps** in the track's right-click menu and the **Track** menu (and ⌘K, in the browser, which has no right-click menus). Clicking a step there turns it on or off in the clip under it, as in the grid. Its rows are the track's rows; the track saves the toggle.
9. Projects with `chance`, `swing`, `editor` or `showSteps` are saved at the same format version as before. An older build opens them, plays every note and plays them straight.

## §18 The pattern browser

§11.4, built on patterns (`prd.md` §3). Its slices are in [6-pattern-browser.md](6-pattern-browser.md).

1. **Kept patterns.** A pattern stays in the project until it's deleted (item 7), even with no clips left in the arrangement. This replaces `prd.md` §3.11. A pattern keeps its notes, length, step and swing, and its **track**: the track it was made on. When that track is deleted, the pattern stays and remembers whether it was a drum track.
2. **The Patterns tab.** The browser gets a **Patterns** tab after **Effects**. It lists the open project's patterns, grouped under their track's name in the order of the tracks, and then under **Other tracks** for patterns whose track was deleted. Within a group they're in name order. Each row shows the name, the length in bars, and how many clips play it (`3 clips`, or `Not placed`). The section dropdown (§7.3) lists the groups. With no patterns, the list reads: "No patterns yet. Right-click a clip and pick Make Pattern, or click New Pattern."
3. **Click** picks a pattern and plays it once on its track's instrument (a drum track's kit, an unplaced pattern's too) at the project's tempo, ignoring the track's mute and solo. Clicking it again, or another pattern, stops it. A pattern whose track was deleted previews on the selected track's instrument, or Grand Piano or the Standard kit without one. A preview isn't an edit and isn't undone.
4. **Drag** a pattern onto the lane of any instrument or drum track to place a clip of it there. The clip starts at the bar nearest the drop (`Shift`: the nearest beat), as a moved clip does, may overlap other clips as moved clips may, and is selected. The lane shows the drop outline while the pattern is over it. Audio tracks' lanes refuse the drop. Dropped below the tracks, a pattern makes a new track after the last one, named and sounding like the pattern's track (a copy of its instrument or kit, without its effects or mixer settings), or a Grand Piano track or a Standard kit drum track if its track was deleted, and places the clip on it. Each drop is one undo step.
5. **Double-click** opens a pattern for editing. If it's placed, its first clip (the earliest, then the highest track) is selected, the arrangement scrolls to it, and the track's editor shows it (§17.3). If it isn't placed, a clip of it is placed at the bar under the playhead on its track, or on the selected track if its track was deleted, and opened the same way, in one undo step. With neither, nothing happens and the notice says "Select a track to place <name> on."
6. **New Pattern** (a button at the foot of the Patterns tab, and a command in the Track menu and ⌘K) makes an empty one-bar pattern on the selected instrument or drum track, named as **Make Pattern** names it (`Drums 1`, `Drums 2`), places a clip of it at the bar under the playhead, and opens it as item 5 does, in one undo step. It's disabled without a selected instrument or drum track.
7. **Rename Pattern…**, **Duplicate Pattern** and **Delete Pattern** work on the pattern picked in the list, or, when the Patterns tab isn't showing, on the selected clip's pattern. They're on the list's right-click menu (desktop app) and in ⌘K, and Rename Pattern stays on a pattern clip's right-click menu.
   - **Rename Pattern…** works as `prd.md` §3.7 says.
   - **Duplicate Pattern** adds an unplaced copy on the same track with the same notes, named `<name> copy` (`<name> copy 2` if that's taken), and picks it in the list.
   - **Delete Pattern** on an unplaced pattern removes it. On a placed one it first asks "Delete the pattern <name> and its <n> clips?", with Delete and Cancel. Delete removes the pattern and every clip of it.
   - Each is one undo step, and undo brings back the pattern with its clips.
8. **Saving.** A project with any pattern, placed or not, is written as format version 2 (or 3 with an audio track, §16.9). Each pattern is written with its notes, length, step, swing and track, and an unplaced pattern is written the same way. The reader keeps an unplaced pattern, and a pattern naming a track the file doesn't have is read as one whose track was deleted. Older builds open these projects and ignore the unplaced patterns.

## Decisions

1. The track headers show no inline steps in 1.0. Double-clicking a header opens the step grid (§6.2). Inline steps come with the melodic grid, as the last slice of §17.
2. Music Generator is dropped, and the composer with it; composing lives in Chordinal Melody Composer (§9.1).
3. Recording lives in Chordinal (§9.3).
4. The master has its own insert chain in the first version, beside the mastering chain (§15.3).
5. Audio clips keep their own speed: a tempo change moves where a clip starts, not how fast it plays. No time-stretching.
6. The browser build keeps audio files up to 64 MB each; the desktop app has no limit of its own.
7. Patterns are kept until deleted, not dropped when their last clip goes (§18.1). The editor stays clip-based: opening a pattern with no clip places one first (§18.5).

The slices are in [2-chordinal.md](2-chordinal.md).
