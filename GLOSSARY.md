# Chordinal glossary

Chordinal is a general-purpose DAW for writing and arranging songs by hand. These are the words it uses for its own things.

## Language

### The song

**Project**:
A song and everything about it: its **tracks**, tempo, meter, **markers**, **chords** and **loop**, saved as a folder holding a `project.json`.
_Avoid_: song file, session, document

**Track**:
One row of the **arrangement**, with a mixer channel and its **clips**: a MIDI track plays **notes** on an **instrument**, with its **MIDI effects**, and an **audio track** plays **audio clips**. A track playing a drum **kit** is a drum track.
_Avoid_: channel, part, lane

**Clip**:
A stretch of **notes** on a **track**, with a start and a length. It can be muted, split, joined and copied.
_Avoid_: region, block, segment

**Audio track**:
A **track** that plays **audio clips** instead of **notes**. It has a mixer strip, **effects** and **automation lanes** like any track, but no **instrument** or **MIDI effects**.

**Audio clip**:
A stretch of one audio file on an **audio track**, with a start, a gain and fades in and out. Its file is kept in the project's `audio/` folder.
_Avoid_: sample, region

**Note**:
One pitch in a **clip**: where it starts (from the clip's start), how long it lasts, its key and its velocity, and optionally its **detune** and its **bend**.

**Detune**:
How far a **note** is tuned off its key, in cents (100 to a semitone). A MIDI export writes it as pitch bend.
_Avoid_: microtone, pitch offset

**Bend**:
How a **note**'s pitch moves while it sounds: points of cents over its **detune**, each at a number of beats into the note, joined by straight lines, up to two octaves either way. A MIDI export writes it as pitch bend that moves over the note.
_Avoid_: pitch curve, glide (a glide is one note sliding into the next)

**Pattern**:
A named set of **notes**, a length and a **step**, kept in the **project** and played by every **clip** linked to it: editing one of those clips edits them all. A pattern stays in the project when no clip plays it. **Make Unique** turns a clip back into an ordinary one.
_Avoid_: linked clip, ghost clip, instance

**Chords**:
The names of the chords at each stretch of the **project**, shown above the **piano roll**. They hold names, not sound: Chordinal Melody Composer, a separate app that writes **projects**, writes them, and **Humanize** follows them.
_Avoid_: chord track, chord lane, harmony track

**Marker**:
A named point in the **project**, such as the start of a verse.

**Section**:
The stretch of the **project** from one **marker** to the next. The **transport** shows the one the **playhead** is in.

**Loop**:
The stretch of the **project** that plays over and over, set from the **selection**, a section or the ruler.
_Avoid_: cycle, repeat

### The window

**Transport**:
The bar across the top: the **project**'s title, play, stop, record, the **metronome**, where the **playhead** is, the tempo, meter, key and **section**, New, Save and Save as, and the master volume.

**Browser**:
The panel at the left with tabs of things to pick from: Instruments, Synths, Kits, Effects, Projects and Takes. A long list has a dropdown to go to one of its sections.
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

**Show Steps**:
A drum **track**'s rows drawn as strips of **steps** under its **clips** in the **arrangement**, where steps can be turned on and off as in the **step grid**.

**Mixer**:
The editor tab with a strip for each **track**: its **effects**, **MIDI effects**, pan, fader, mute and solo, and the master volume.

**Sound**:
The editor tab with the selected **track**'s **synth** or **sampler** settings, a section for each stage of the sound.

**Effect**:
One step in a **track's** list of audio effects in its mixer strip, such as EQ, Reverb or Delay, that changes how the track sounds; its settings are set in its panel and can be **automated**. `Insert` in the code.
_Avoid_: plugin, insert, FX (that's a **MIDI effect**)

**Automation lane**:
A row under a **track** in the **arrangement** where one of its values (volume, pan, tone, a reverb or delay send, or a setting of one of its **effects**) is drawn as a line through points, and moves that way as it plays. `Automation` and `Keyframe` in the code.
_Avoid_: envelope, automation curve, keyframe track

**Command menu**:
The search box (`⌘K` or `Ctrl+K`) that finds any command by name and runs it.
_Avoid_: command palette

**Keyboard Shortcuts window**:
The window (`⌘/` or `Ctrl+/`) that lists every command and its keys. **Press a Shortcut** in it shows what a key runs without running it.

### Sound

**Instrument**:
The sound a **track** plays: one preset from a **sound library**, a **synth** or a **sampler**.
_Avoid_: patch, preset, voice

**Synth**:
An **instrument** Chordinal makes itself from two oscillators and noise, a filter, envelopes and an LFO, set by its settings rather than read from a **sound library**.
_Avoid_: patch, synthesizer

**Sampler**:
An **instrument** that plays one audio file, a **sample**, across the keys from its root key: the key it sounds at as recorded.
_Avoid_: sample player

**Sample**:
An audio file a **sampler** or a drum row plays, kept in the project's `samples/` folder. Not a **take**, which is a recording kept with the project, and not an **audio clip**, which an **audio track** plays.
_Avoid_: one-shot

**Kit**:
An **instrument** of drum sounds, one per key.
_Avoid_: drum set, drum bank

**Sound library**:
One SoundFont file of **instruments**: GeneralUser GS comes with the app, and FluidR3_GM and MuseScore_General download from the **Instruments** tab. `SoundFont library` in the code and the developer docs.
_Avoid_: bank, soundbank, sample pack

**Humanize**:
A **track's** **MIDI effect** that adds ghost notes, swing, timing and ornaments as it plays, so every pass round the **loop** is a little different. It changes how the **notes** play, not the notes saved. The **Humanize** command in the Edit menu is a different thing: it loosens the timing and velocity of the selected notes themselves.
_Avoid_: groove, randomize

**MIDI effect**:
One step in a **track's** list of effects that change its **notes** as they play: Scale, Chord or Arpeggiator, added with **+ MIDI FX**, and then **Humanize**, which always plays after them. The notes saved stay as written. `TrackFx` in the code, **+ MIDI FX** in the strip.
_Avoid_: plugin, insert, effect (that's an audio **effect**)

**Monitor**:
An **audio track**'s button that plays the microphone through the track while it is on.

**Metronome**:
The click that plays on each beat while playing or recording (**♩**).
_Avoid_: click track

### Recording

**Take**:
One recording onto a **track**, played on the keys, a MIDI keyboard or sung into the microphone. A saved **project** keeps a MIDI track's microphone takes in `takes/`; a recording onto an **audio track** becomes an **audio clip** in `audio/`. A **clip** read from a microphone take or a dropped audio file keeps that audio while its project is open, so **Convert Audio Again** can read it into **notes** again.
_Avoid_: recording, sketch

## Relationships

- A **Project** holds many **Tracks**, its **Chords**, any number of **Markers** and at most one **Loop**.
- A MIDI **Track** plays one **Instrument** and holds many **Clips**; an **Audio track** holds many **Audio clips**. Every track has at most one **Automation lane** per value.
- A **Clip** holds many **Notes** or plays one **Pattern**; a **Pattern** is played by any number of **Clips**, none included.
- A **Section** runs from one **Marker** to the next.
- An **Instrument** comes from one **Sound library**; a **Kit** is an **Instrument**.
- A **Take** becomes the **Notes** of one **Clip**.

## Flagged ambiguities

- "Library" meant both a **Sound library** and the **Browser** that lists them. The panel is the **Browser**; a library is one SoundFont file of **instruments**.
- "Sketch" was the name of the feature that reads microphone **takes** (the `sketch` package). In the app and the docs it is **Recording**, and a single recording is a **Take**.
