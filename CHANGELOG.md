# Changelog

## Unreleased

### What's new

- **Automation lanes.** Track ▸ Show Automation (`A`) opens a lane under a track for its volume, pan, tone and reverb and delay sends. Click to add points and drag them, double-click to delete one, and right-click for step, linear or exponential curves. Play and the exports follow the lane, and every edit can be undone.

- **MIDI effects.** Each mixer strip lists its track's MIDI effects, with **+ FX** to add **Scale**, which moves notes into the project's key, **Chord**, which plays a chord over every note: a fixed shape, or the key's own chord on that note, and **Arpeggiator**, which plays held notes one at a time at a rate that follows the tempo, up, down, up and down, as played or at random, over up to four octaves. Bypass or remove one, and change its settings, in the strip, and **Apply to Notes** writes what it plays into the clips so you can edit those notes. Play, the exports and live playing all go through them, and recording keeps the keys you pressed.

### Bugs fixed

- Undo right after Save As no longer turns the project's name back to Untitled: it takes back only your last edit.

## 1.0.0

### Before you update

- Projects open as they are: the project format hasn't changed.
- Your settings and recent projects are kept: the app keeps its data in the same place.
- If you built and installed the app from a checkout (`just install-desktop`), run `just install-desktop` again: the app now starts from `apps/desktop/dist/chordinal.js`.
- Music Generator, the older song player, is gone, and so is composing: Generate Part, New from Melody, `just compose` and the songs moved to Chordinal Melody Composer, a separate project that writes Chordinal projects. Projects it made still open and play the same, Humanize included.

### What's new

- **Command menu.** `⌘K` lists every command with its shortcut; type to find one and press Return to run it. `⌘/` opens the Keyboard Shortcuts window.
- **Light theme.** Choose Light, Dark or the system's in Settings.
- **Runs in a browser.** The same page runs without the desktop app and keeps its projects and settings in the browser.
- **Command line.** `chordinal export` and `render` export projects to MIDI and WAV or MP3, and render a game's soundtrack from project folders with its timing data.

### Improvements

- A status bar along the bottom shows notices, what the letter keys play, the MIDI keyboard and whether the project is saved. On macOS the window has no separate title bar: the browser runs to the top, with the window buttons above it, and the transport row is the rest of the title bar.
- A new app icon: a chord on one stem with a flag. `just run-desktop` shows it, and the name Chordinal in the menu bar, instead of Electron's.
- A dropdown under the browser's tabs jumps to an instrument family or a group of projects, so you don't have to scroll.
- Changing the octave with `Z` or `X` scrolls the piano roll to the keys you're playing.
- While you record a melody, its notes appear in the piano roll as you play, and when you stop, the playhead goes back to the start of the clip.
- Recording isn't only for whistling: a melody recorded with no track selected goes on a new track called Melody. `just whistle` is now `just transcribe`.
- The chord track row above the tracks is gone, and so are Whistle a Chord and picking a stretch for it. A project still keeps its chords: the piano roll shows them and Humanize follows them.
- Soloing a track turns off any other solo, so you hear the track you soloed last.
- Saving is safer: a project changed on disk since you opened it asks before it's replaced, and saves and opens never overlap.
- Questions wait their turn instead of replacing one another.
- Pattern names lose stray spaces at either end.

### Bugs fixed

- Changing a mixer control to the value it already had added an undo step that did nothing.
- Splitting a note at its very start could leave a note starting before the beginning of the song.
- A save that finished after you opened another project could write into the wrong one.
- In Firefox, sliders and the mixer's faders showed a knob with no track.
