# Features

Music Generator is laid out like a DAW: a transport, a browser, an arrangement, a piano roll and a mixer. On top of that it composes, and it can turn whistling into notes.

## Projects

A project is a folder in `projects/` with a `project.json`: tracks, clips of notes, instruments, the mixer, tempo, meter, markers and a chord track. The 38 songs it ships with are projects you can open, edit and save.

## Composing

**New…** writes a project from a feeling, a genre or one of the songs: melody, countermelody, arpeggio, chords, pad, bass and drums, written by rule. Each choice always comes out the same; **Roll** a seed for another song in that style, and type a seed back in to get it again.

Twelve genre songs each tell a story, scene by scene: bossa nova, reggae, funk, synthwave, lo-fi hip hop, tango, country, celtic, chiptune, gospel, cinematic and blues, plus solo piano pieces with a left hand, rubato and ornaments. The game music loops; a boss fight switches into 7/4.

How the composer decides what to write is in [How it composes](composing.md).

## Humanize

Each composed track has a **Humanize** effect that adds ghost notes, swing, timing and ornaments as it plays, so every pass round a loop is a little different. Your own edits are played the same way.

## Editing

Draw, move, resize and delete notes and their velocity in the piano roll, on a grid or free, or drum steps in the step grid. Move, copy, split and delete clips, add and delete tracks, and change the tempo and meter. Everything can be undone. The keys and mouse actions for each are in [Controls](controls.md).

## Drums and patterns

The **Step Grid** tab edits a drum clip as rows of drum sounds and columns of steps: click a step on, drag to paint a row, `Shift` click to accent. It opens by itself when you pick a drum clip. Notes placed off the steps (from the piano roll or a MIDI file) are shown greyed and left alone.

Make a clip a **pattern** and its copies stay linked: edit one, in the step grid or the piano roll, and every copy changes. A linked clip shows `⧉` and the pattern's name. **Make Unique** turns one copy back into an ordinary clip, and splitting or joining a copy does the same to the pieces.

## Whistling

Press record and whistle a melody over a click onto any track, vibrato included. Pick a stretch of the chord track and whistle a chord's notes to set the chord there. **New from melody** composes a band around the selected clip.

A saved project keeps its takes in `projects/<name>/takes/`, and an audio file dropped on a track is read the same way.

## Mixing

Every track has mute, solo, a fader and pan. Put any instrument from the libraries on any track: click it in the browser, or drag it onto the track. The libraries are listed in [Credits](credits.md).

## Playing it like an instrument

Your computer keys or a MIDI keyboard, with velocity and a sustain pedal, play the selected track's instrument.

## Importing and exporting

Import a MIDI file as a new project from the File menu, or drop one on a track to add its tracks from that bar. Export the whole project, the loop or the selection as audio (the mix, or each track as its own WAV, normalized if you like) or as MIDI.
