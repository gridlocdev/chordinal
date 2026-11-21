# Changelog

## 1.0.0

### Before you update

- Projects open as they are: the project format hasn't changed.
- Your settings and recent projects are kept: the app keeps its data in the same place.
- If you built and installed the app from a checkout (`just install`), run `just install` again: the app now starts from `apps/desktop/dist/chordinal.js`.
- Music Generator, the older song player, is gone. Its songs are still there: the command line's `compose <song>` composes one as MIDI or as a Chordinal project.

### What's new

- **Command menu.** `⌘K` lists every command with its shortcut; type to find one and press Return to run it. `⌘/` opens the Keyboard Shortcuts window.
- **Light theme.** Choose Light, Dark or the system's in Settings.
- **Runs in a browser.** The same page runs without the desktop app and keeps its projects and settings in the browser.
- **Command line.** `chordinal compose`, `export` and `render` compose songs, export projects to MIDI and WAV or MP3, and render a game's soundtrack with its timing data.

### Improvements

- Saving is safer: a project changed on disk since you opened it asks before it's replaced, and saves and opens never overlap.
- Questions wait their turn instead of replacing one another.
- Pattern names lose stray spaces at either end.

### Bugs fixed

- Changing a mixer control to the value it already had added an undo step that did nothing.
- Splitting a note at its very start could leave a note starting before the beginning of the song.
- A save that finished after you opened another project could write into the wrong one.
