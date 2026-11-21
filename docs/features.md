# Features

**Chordinal** is a DAW laid out like one (a transport, a browser, an arrangement, a step grid, a piano roll and a mixer), in a dark or a light theme, where you make music by hand, have the composer write parts, and turn whistling into notes.

## Projects

A project is a folder with a `project.json`: tracks, clips of notes, instruments, the mixer, tempo, meter, markers and a chord track. Chordinal keeps projects anywhere, in `Documents/Chordinal/` unless you pick somewhere else. The 38 songs the composer writes are in the checkout's `projects/` folder as projects too, and open with **File ▸ Open…**.

## The window

On macOS the window has no separate title bar, as in the system's own apps: the browser runs to the top with the window buttons above its tabs, and the transport row beside it is the rest of the title bar; drag either to move the window. A status bar runs along the bottom: the latest notice at the left (errors stay until you dismiss them), and at the right what the letter keys play (`Keys C4–F5 · Grand Piano`, dimmed until the piano roll has the focus), the connected MIDI keyboard and whether the project is saved.

Each track's header in the arrangement has its mute, solo and a volume knob: double-click it to edit the track (a drum track opens the step grid), drag it to reorder, and drag instruments onto it from the browser at the left, where clicking an instrument or kit plays a preview and the dropdown under its tabs jumps to a section (an instrument family, or Recent and Documents/Chordinal). **Track ▸ Generate Part…** has the composer write one part (drums, bass, chords, pad, arpeggio, melody or countermelody) in a style you pick, over the chords already there, and **Generate Again** (`Cmd G`) writes it again from another seed.

## Composing

The composer writes whole songs from a feeling, a genre or one of its songs: melody, countermelody, arpeggio, chords, pad, bass and drums, written by rule. Each choice always comes out the same, and a seed gives another song in that style. In Chordinal it writes one part at a time (**Generate Part…**); whole songs come from the command line (`just compose`, `just projects`) and go to the games.

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

**Track ▸ Record Melody** (or **●**, or `R`) and whistle a melody over a click onto any track, vibrato included. Or play it on the letter keys or a MIDI keyboard during the take, with no microphone needed: the notes go into the clip the take starts in (the selected one first, so every clip of its pattern gets them, growing it to fit), or into a new clip if there's none. Pick a stretch of the chord track and whistle a chord's notes to set the chord there. **New from melody** composes a band around the selected clip.

A saved project keeps its takes in its folder's `takes/`, listed in the browser's **Takes** tab to read onto a track again, and an audio file dropped on a track is read the same way.

## Mixing

Every track has mute, solo, a fader and pan. Put any instrument from the libraries on any track: click it in the browser, or drag it onto the track. The libraries are listed in [Credits](credits.md).

## Playing it like an instrument

Your computer keys (once you click the piano roll) or a MIDI keyboard, with velocity and a sustain pedal, play the selected track's instrument. Clicking a key on the piano roll's keyboard plays it too, and the row of every key sounding lights up.

## Importing and exporting

Import a MIDI file as a new project from the File menu, or drop one on a track to add its tracks from that bar. Export the whole project, the loop or the selection as audio (the mix, or each track as its own WAV, normalized if you like) or as MIDI.
