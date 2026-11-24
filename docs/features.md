# Features

**Chordinal** is a DAW laid out like one (a transport, a browser, an arrangement, a step grid, a piano roll and a mixer), in a dark or a light theme, for writing and arranging songs by hand.

## Projects

A project is a folder with a `project.json`: tracks, clips of notes, instruments, the mixer, tempo, meter, markers and the names of its chords. Chordinal keeps projects anywhere, in `Documents/Chordinal/` unless you pick somewhere else.

## The window

On macOS the window has no separate title bar, as in the system's own apps: the browser runs to the top with the window buttons above its tabs, and the transport row beside it is the rest of the title bar; drag either to move the window. A status bar runs along the bottom: the latest notice at the left (errors stay until you dismiss them), and at the right what the letter keys play (`Keys C4–F5 · Grand Piano`, dimmed until the piano roll has the focus), the connected MIDI keyboard and whether the project is saved.

Each track's header in the arrangement has its mute, solo and a volume knob: double-click it to edit the track (a drum track opens the step grid), drag it to reorder, and drag instruments onto it from the browser at the left, where clicking an instrument or kit plays a preview and the dropdown under its tabs jumps to a section (an instrument family, or Recent and Documents/Chordinal).

## Humanize

A track can have a **Humanize** effect that adds ghost notes, swing, timing and ornaments as it plays, so every pass round a loop is a little different. Your own edits are played the same way. A section can swing on its own or play straight, and sit further behind or ahead of the beat, when its marker says so.

A note can be tuned off its key by a number of cents, written in the project file. It plays that way and stays under the note's other pitch moves (vibrato, scoops, slides). A note can also bend while it sounds: a curve of cents over its length, also written in the project file, so a held note can slide up a quarter tone and back.

## MIDI effects

A track's MIDI effects change its notes as they play, without changing the notes saved. Each mixer strip lists its track's effects above the pan: pick one from **+ MIDI FX** to add it, click its power button to bypass it, and click **×** to remove it. Right-click an effect in the desktop app to move it up or down the list.

- **Scale** moves every note outside the project's key to the nearest note in it, down when two are as near. With no key set, it leaves the notes alone.
- **Chord** plays a chord over every note. Pick its shape under its name: **In Key** builds the chord from the project's key on that note, so one finger plays the key's chords, and the others (**Major**, **Minor**, **7th**, **Major 7th**, **Minor 7th**, **Sus2**, **Sus4**, **Power**) are the same shape on every note. In the desktop app, its right-click menu moves the added notes an octave up or down.
- **Arpeggiator** (**Arp** in the strip) plays the notes held together one at a time, in steps that follow the tempo. Under its name, pick the **rate** (a step of 1/4 down to 1/32, `t` for triplets), the **direction** (**Up**, **Down**, **Up & Down**, **As Played**, or **Random**, which is the same every time), how many **octaves** it climbs (1 to 4), and the **gate**, how much of each step a note sounds. Each run of overlapping notes starts its steps on its first note. Put **Chord** before it and one held key plays the key's chord as an arpeggio; put **Chord** after it and every step is a chord.

**Apply to Notes** (**↧** on an effect, or its right-click menu) writes what the effect plays into the track's clips and takes it off the list, so you can edit the notes it made. Any note effects that are on above it are written in too, so the track plays the same as before. Humanize can't be applied: it plays differently every pass.

Effects play in the list's order, before **Humanize**. Play, the exports and the keys you play live all go through them, so you hear the same thing each way. A recording keeps the keys you pressed, not the effects' notes. Every change can be undone.

## Editing

Draw, move, resize and delete notes and their velocity in the piano roll, on a grid or free, or drum steps in the step grid. Move, copy, split and delete clips, add and delete tracks, and change the tempo and meter. Everything can be undone. The keys and mouse actions for each are in [Controls](controls.md).

## Drums and patterns

The **Step Grid** tab edits a drum clip as rows of drum sounds and columns of steps: click a step on, drag to paint a row, `Shift` click to accent. It opens by itself when you pick a drum clip. Notes placed off the steps (from the piano roll or a MIDI file) are shown greyed and left alone.

Make a clip a **pattern** and its copies stay linked: edit one, in the step grid or the piano roll, and every copy changes. A linked clip shows `⧉` and the pattern's name. **Make Unique** turns one copy back into an ordinary clip, and splitting or joining a copy does the same to the pieces.

## Mixing

Every track has mute, solo, a fader and pan. Put any instrument from the libraries on any track: click it in the browser, or drag it onto the track. The libraries are listed in [Credits](credits.md).

## Track effects

A track's audio effects change how it sounds. Each mixer strip lists them above its MIDI effects: pick one from **+ Effect** to add it at the end of the list, click its power button to bypass it, click **×** to remove it, and drag it up or down to change the order. Sound goes through them top to bottom, after the track's tone and before its fader.

Click an effect's name to open its settings beside the strips: a slider for each setting, or a dropdown for one with named values, with the value in its units next to it. Double-click a slider to put it back to its starting value, or click **Reset** for all of them. Right-clicking an effect shows the same actions. Every change can be undone, and a slider's drag is one step.

- **EQ**: low and high shelves and a mid band, each with its frequency.
- **Compressor**: threshold, ratio, attack, release and makeup gain.
- **Filter**: low, high or band pass, with cutoff and resonance.
- **Distortion**: drive, tone, output level and mix.
- **Chorus** and **Flanger**: short delays swept by a slow wave, with rate, depth and mix (and feedback on the flanger).
- **Phaser**: a sweep of notches, with rate, depth, feedback and mix.
- **Delay**: echoes timed to the tempo (from 1/16 to a half note, some dotted or triplet), with feedback, tone and mix.
- **Reverb**: its own room, with size, decay, tone and mix, on top of the track's reverb send.
- **Tremolo**: the volume pulses at a rate timed to the tempo, with depth and a smooth or square shape.
- **Bitcrusher**: fewer bits and a lower sample rate, for a lo-fi or chip sound.
- **Limiter**: turns the track up and keeps its peaks under a ceiling.
- **Stereo Width**: from mono to twice as wide.
- **Gain**: turns the track up or down by up to 24 dB.

Play, the WAV and MP3 exports and the keys you play live all go through the effects, and Delay and Tremolo follow tempo changes.

## Automation

A track's volume, pan, tone, reverb and delay sends and the settings of its [effects](#track-effects) can change as the song plays: a fade-out, a filter sweep, a pan from left to right. **Track ▸ Show Automation** (`A`, or **Show Automation** in a track's right-click menu) opens the track's automation lane under its row, and the dropdown at its left picks the value it shows; a value that has points has a dot after its name. Click the lane to add a point and drag it into place, drag a point to move it, and double-click one to delete it. Points snap to the beat; hold `Shift` to place one between beats. Right-click a point for its curve into it (**Step**, **Linear**, or **Exponential** for tone), or right-click the lane to clear it. The value under the cursor shows next to the dropdown. Each edit can be undone, Play and the WAV and MP3 exports play the lane, and inserting or deleting bars moves the points with the clips.

A volume lane sets a gain on top of the track's fader, from silence up to +6 dB. A pan lane takes over from the mixer's pan while it has points (auto-pan still sways around it). Tone is a low-pass filter from 80 Hz to 20 kHz. An effect's lane is named after the effect (**Filter Cutoff**, or **Filter 2 Cutoff** when the track has two) and uses the setting's own range and units; it replaces the setting while it has points, and removing the effect removes its lanes. Settings picked from a dropdown, and Reverb's size and decay, can't be automated. Lanes belong to the track, not to its clips, so moving a clip leaves them where they are.

## Playing it like an instrument

Your computer keys (once you click the piano roll) or a MIDI keyboard, with velocity and a sustain pedal, play the selected track's instrument, through its [MIDI effects](#midi-effects) and its [track effects](#track-effects). Clicking a key on the piano roll's keyboard plays it too, and the row of every key sounding lights up.

## Recording

**Track ▸ Record Melody** (or **●**, or `R`) records a take onto the selected track over a click. Play it on the letter keys or a MIDI keyboard: the notes go into the clip the take starts in (the selected one first, so every clip of its pattern gets them, growing it to fit), or into a new clip if there's none. The notes appear in the piano roll as you play, and when you stop, the playhead goes back to the start of the clip they went into.

You can also record audio from the microphone instead: sing, hum or play one line on an instrument, vibrato included. Chordinal turns it into notes in the piano roll to fix by hand. It reads one note at a time anywhere from a low voice to a high flute (about 50 to 4,000 Hz), finding the take's register itself, and puts back the odd note it reads an octave out. A saved project keeps these takes in its folder's `takes/`, listed in the browser's **Takes** tab to read onto a track again, and an audio file dropped on a track is read the same way.

To read a clip's audio again without recording it again, pick **Track ▸ Convert Audio Again…** (or right-click the clip). Choose the **Grid** (quarter notes up to 16ths and triplets), tick **snap notes to the key** to move notes that fell between the key's notes onto it, and move **Sensitivity** up to hear quieter and shorter notes or down to drop breaths and noise. The clip's notes change as you go, and **Undo** takes back each change. The next take uses the same choices. A clip keeps its audio until you open another project; after that, read the take again from the **Takes** tab. [Recording audio into notes](guides/recording-audio-into-notes.md) walks through it step by step.

## Importing and exporting

Import a MIDI file as a new project from the File menu, or drop one on a track to add its tracks from that bar. Export the whole project, the loop or the selection as audio (the mix, or each track as its own WAV, normalized if you like) or as MIDI. A MIDI export writes a note's own tuning and its bend as pitch bend, giving tuned notes that overlap on one track channels of their own, and an import reads pitch bend back as each note's tuning and bend.
