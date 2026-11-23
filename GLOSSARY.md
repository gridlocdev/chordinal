# Chordinal glossary

Chordinal is a general-purpose DAW for writing and arranging songs by hand. These are the words it uses for its own things.

## Language

### The song

**Project**:
A song and everything about it: its **tracks**, tempo, meter, **markers**, **chords** and **loop**, saved as a folder holding a `project.json`.
_Avoid_: song file, session, document

**Track**:
One row of the **arrangement**: an **instrument**, a mixer channel, its **Humanize** settings and the **clips** it plays. A track playing a drum **kit** is a drum track.
_Avoid_: channel, part, lane

**Clip**:
A stretch of **notes** on a **track**, with a start and a length. It can be muted, split, joined and copied.
_Avoid_: region, block, segment

**Note**:
One pitch in a **clip**: where it starts (from the clip's start), how long it lasts, its key and its velocity, and optionally its **detune**.

**Detune**:
How far a **note** is tuned off its key, in cents (100 to a semitone). A MIDI export writes it as pitch bend.
_Avoid_: microtone, pitch offset

**Pattern**:
A named set of linked **clips** that share their **notes**, length and **step**: editing one edits them all. **Make Unique** turns a clip back into an ordinary one.
_Avoid_: linked clip, ghost clip, instance

**Chords**:
The names of the chords at each stretch of the **project**, shown above the **piano roll**. They hold names, not sound: the Melody Composer writes them, and **Humanize** follows them.
_Avoid_: chord track, chord lane, harmony track

**Marker**:
A named point in the **project**, such as the start of a verse. The stretch from one marker to the next is a section.

**Loop**:
The stretch of the **project** that plays over and over, set from the **selection**, a section or the ruler.
_Avoid_: cycle, repeat

### The window

**Transport**:
The row across the top: play, stop, record, the **metronome**, tempo and meter.

**Browser**:
The panel at the left with the **Instruments**, kits, projects and **takes** to pick from, each in its own tab.
_Avoid_: library panel, sidebar, rack

**Arrangement**:
The middle of the window, where the **tracks** and their **clips** lie along a ruler of bars.
_Avoid_: timeline, song view

**Playhead**:
The line in the **arrangement** where playing starts, and that moves as it plays.
_Avoid_: cursor, position

**Selection**:
The **notes** or **clip** picked for the next edit.

**Piano roll**:
The editor tab that shows a **clip's** notes as bars against a keyboard, for drawing and editing them.

**Step grid**:
The editor tab that shows a drum **clip** as rows of drum sounds and columns of **steps**.
_Avoid_: drum grid, sequencer

**Step**:
One column of the **step grid**, a fixed length such as a sixteenth note.

**Mixer**:
The editor tab with each **track's** fader, pan, mute, solo, sends and **effects**.

**Effect**:
One step in a **track's** list of audio effects in its mixer strip, such as EQ, Reverb or Delay, that changes how the track sounds; its settings are set in its panel and can be **automated**. `Insert` in the code.
_Avoid_: plugin, insert, FX (that's a **MIDI effect**)

**Automation lane**:
A row under a **track** in the **arrangement** where one of its values (volume, pan, tone, a reverb or delay send, or a setting of one of its **effects**) is drawn as a line through points, and moves that way as it plays. `Automation` and `Keyframe` in the code.
_Avoid_: envelope, automation curve, keyframe track

**Command menu**:
The search box (`⌘K` or `Ctrl+K`) that finds any command by name and runs it.
_Avoid_: command palette

### Sound

**Instrument**:
The sound a **track** plays: one preset from a **sound library**.
_Avoid_: patch, preset, voice

**Kit**:
An **instrument** of drum sounds, one per key.
_Avoid_: drum set, drum bank

**Sound library**:
One SoundFont file of **instruments**: GeneralUser GS comes with the app, and FluidR3_GM and MuseScore_General download from the **Instruments** tab. `SoundFont library` in the code and the developer docs.
_Avoid_: bank, soundbank, sample pack

**Humanize**:
A **track's** **MIDI effect** that adds ghost notes, swing, timing and ornaments as it plays, so every pass round the **loop** is a little different. It changes how the **notes** play, not the notes saved.
_Avoid_: groove, randomize

**MIDI effect**:
One step in a **track's** list of effects that change its **notes** as they play: **Scale**, **Chord**, **Arpeggiator** or **Humanize**. The notes saved stay as written. `TrackFx` in the code, **+ MIDI FX** in the strip.
_Avoid_: plugin, insert, effect (that's an audio **effect**)

**Metronome**:
The click that plays on each beat while playing or recording (**♩**).
_Avoid_: click track

### Recording

**Take**:
One recording onto a **track**, played on the keys, a MIDI keyboard or sung into the microphone. A saved **project** keeps its microphone takes in `takes/`.
_Avoid_: recording, sketch

## Relationships

- A **Project** holds many **Tracks**, its **Chords**, any number of **Markers** and at most one **Loop**.
- A **Track** plays one **Instrument**, holds many **Clips** and has at most one **Automation lane** per value.
- A **Clip** holds many **Notes** and belongs to at most one **Pattern**; a **Pattern** links one or more **Clips**.
- An **Instrument** comes from one **Sound library**; a **Kit** is an **Instrument**.
- A **Take** becomes the **Notes** of one **Clip**.

## Flagged ambiguities

- "Library" meant both a **Sound library** and the **Browser** that lists them. The panel is the **Browser**; a library is one SoundFont file of **instruments**.
- "Sketch" was the name of the feature that reads microphone **takes** (the `sketch` package). In the app and the docs it is **Recording**, and a single recording is a **Take**.
