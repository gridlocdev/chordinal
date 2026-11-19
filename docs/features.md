# Features

This repo makes two apps. **Music Generator** writes songs and plays them. **Chordinal** is a DAW laid out like one (a transport, a channel rack, a browser, an arrangement, a step grid, a piano roll and a mixer) where you change those songs or make your own, and where whistling turns into notes.

## Projects

A project is a folder with a `project.json`: tracks, clips of notes, instruments, the mixer, tempo, meter, markers and a chord track. Music Generator keeps its songs in `projects/`, the 38 it ships with among them. Chordinal keeps projects anywhere, in `Documents/Chordinal/` unless you pick somewhere else. Both read the same file, so a song opens in either.

## Music Generator

The window is the songs at the left, a player across the top, and the open song: its sections along a bar you can click to move the playhead, and its tracks. **New…** writes a song (below), **Save** keeps it in `projects/`, and **Open in Chordinal** copies it into `Documents/Chordinal/<title>/` and opens it there to edit. If Chordinal isn't installed, the folder is shown in the Finder instead. Nothing in Music Generator edits a song.

## Chordinal

Everything from here on, except Composing and Humanize, is Chordinal's. The channel rack at the left lists the tracks: double-click one to edit it (a drum track opens the step grid), and drag instruments onto it from the browser below, where clicking an instrument or kit plays a preview. **Track ▸ Generate Part…** has the composer write one part (drums, bass, chords, pad, arpeggio, melody or countermelody) in a style you pick, over the chords already there, and **Generate Again** (`Cmd G`) writes it again from another seed.

## Composing

In Music Generator, **New…** writes a song from a feeling, a genre or one of the songs: melody, countermelody, arpeggio, chords, pad, bass and drums, written by rule. Each choice always comes out the same; **Roll** a seed for another song in that style, and type a seed back in to get it again.

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

**Track ▸ Record Melody** (or **●**, or `R`) and whistle a melody over a click onto any track, vibrato included. Pick a stretch of the chord track and whistle a chord's notes to set the chord there. **New from melody** composes a band around the selected clip.

A saved project keeps its takes in its folder's `takes/`, listed in the browser's **Takes** tab to read onto a track again, and an audio file dropped on a track is read the same way.

## Mixing

Every track has mute, solo, a fader and pan. Put any instrument from the libraries on any track: click it in the browser, or drag it onto the track. The libraries are listed in [Credits](credits.md).

## Playing it like an instrument

Your computer keys or a MIDI keyboard, with velocity and a sustain pedal, play the selected track's instrument.

## Importing and exporting

Import a MIDI file as a new project from the File menu, or drop one on a track to add its tracks from that bar. Export the whole project, the loop or the selection as audio (the mix, or each track as its own WAV, normalized if you like) or as MIDI.
