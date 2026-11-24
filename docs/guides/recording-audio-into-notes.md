# Recording audio into notes

Sing, hum, whistle or play an idea on an instrument, one note at a time, and Chordinal writes it into the piano roll as notes you can edit, play on any instrument and build a song around.

1. **Set the tempo and meter first.** The take is read on the project's grid, so a tune you hum at 92 BPM lands at 92 BPM. Put the playhead in the bar you want the take to start in.
2. **Select a track**, or none: Chordinal adds a Melody track for the take.
3. **Press `R`** (or **●**, or **Track ▸ Record Melody**). A bar of click counts you in. Wear headphones, so the microphone hears only you.
4. **Sing or play the line**, then press `R` (or **●**) again to stop. The notes appear in a new clip from the bar you started in.
5. **Fix how it was read.** Pick **Track ▸ Convert Audio Again…** (or right-click the clip). Choose the **Grid** that matches what you sang: quarter notes, 8ths, 16ths, with or without triplets. Tick **snap notes to the key** if some notes fell between the key's notes. Move **Sensitivity** up if quiet or short notes were missed, or down if breaths and noise became notes. Each change rewrites the clip, and **Undo** takes it back.
6. **Edit the rest by hand** in the piano roll: drag a note to its pitch or length, or delete a stray one.
7. **Save the project.** The take's audio is kept in the project folder's `takes/`, listed in the browser's **Takes** tab, so you can read it onto a track again later.

An audio file dropped on a track is read the same way, and Convert Audio Again works on it too. A clip keeps its audio until you open another project; after that, read the take again from the **Takes** tab.

## Tips

- One line at a time: Chordinal reads a single melody, not chords.
- Low voices, bass and high whistles all work (about 50 to 4,000 Hz). Chordinal finds the take's register itself.
- Clear starts help. Sing "da" or "ta" on each note rather than sliding from one to the next, so each note is read as its own.
- A take sung slower than the song is fine: set a slow tempo to record, then raise it afterwards.
- The notes are saved in the project's `project.json` like any others, so other tools can read them. Chordinal Melody Composer's `just seed` prints a recorded clip in its notation, to start a song from.
