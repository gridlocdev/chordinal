# Chordinal: from MIDI sketchpad to a small DAW

Five features that close most of the gap between Chordinal and a small DAW such as GarageBand: automation lanes, effects on every track, a synth and a sampler, audio tracks, and MIDI effects. Each feature below says what is there today, what to build, in which slices, and how to tell it's done. Every slice leaves `just check` and `just e2e-desktop` green.

These fill in the later work in [chordinal-prd.md](chordinal-prd.md) §11. Each feature still gets its own short interview and PRD section before it's built, as §11 asks. §12 still holds throughout: what Chordinal Melody Composer and the games use doesn't change, their projects open and play the same, and older project files stay readable.

## Order

1. **Automation lanes.** Needs nothing new in the engine, so it's the quickest win.
2. **MIDI effects.** Builds on the MIDI FX registry Humanize already uses.
3. **Track effects.** Starts with slice 7 of [2-chordinal.md](2-chordinal.md) (an insert slot in each strip and an `Instrument` type).
4. **Synth and sampler.** Uses slice 7's `Instrument` type.
5. **Audio tracks.** The largest change: a new kind of track, files in the project and a new format version.

Automation and MIDI effects can be built in either order or side by side. Track effects and the synth both wait on slice 7.

## 1. Automation lanes

**Today.** Each track has `automation` (`packages/daw/src/project.ts`) with keyframe lanes for `tone`, `reverb` and `delay`. `valueAt` in `packages/daw/src/automation.ts` reads them the way Web Audio ramps, and the player schedules them (`packages/playback/src/player.ts`) and the export plays them. Only the Melody Composer writes them: the app has no way to see or draw them.

**Build.**

- Add `volume` and `pan` lanes. Volume automation needs its own gain in the strip, after the user fader, so the fader stays the mixer's and ducking keeps its own node. Pan goes on the panner's `pan` param, which the auto-pan LFO already moves (decide which wins when both are set).
- Pure edits in `packages/daw`: add, move and remove a keyframe, set its curve, and delete the keyframes in a stretch. Each goes through `edit()` so it's undoable.
- A lane under a track's row in the arrangement, shown with **Track ▸ Show Automation** (and the track header's right-click menu). A dropdown picks the parameter. Click to add a point, drag to move it, `Delete` or double-click to remove it, right-click for the curve (step, linear, exponential).
- Insert and delete bars (`insertTime`, `deleteTime`) move and cut automation along with the clips.
- The lane draws a line through the keyframes, with the value at the cursor shown in the status bar.

**Slices.** (a) Edit functions with tests. (b) Volume and pan in the player and the export. (c) The lane, view only. (d) Editing in the lane. (e) Insert and delete bars carry automation.

**Status.** Built: (a) to (e); (e) was already there (`mapLanes` in `packages/daw/src/timeline.ts`). A pan lane wins over the mixer's pan while it has points, and auto-pan still adds on top. Lanes stay on the track. The value under the cursor shows in the lane's header rather than the status bar. Still to do: `Delete` to remove a selected point, and a box to select and move several points.

**Done when.** You can draw a volume fade and a filter sweep on a track, hear them on Play and in an exported WAV, undo them, and see that a Melody Composer project's automation shows in its lanes. An e2e test draws two points and checks the project's keyframes, and an export test checks that a fade lowers the peak.

## 2. MIDI effects

**Today.** `packages/daw/src/fx.ts` registers MIDI FX types, and a track lists the ones it uses in `track.fx`. Humanize (`packages/perform`) is the only one in the app. Notes played live (`packages/ui/src/live.ts`) go straight to the instrument and don't go through a track's FX.

**Build.**

- **Arpeggiator.** Plays held notes one at a time at a rate synced to the tempo (1/8, 1/16, triplets), in a direction (up, down, up and down, as played, random), over 1 to 4 octaves, with a gate length.
- **Chord.** Adds notes over each note played: a fixed shape (major, minor, 7th, sus, power), or the chord built from the project's key on that degree, so one finger plays the key's chords. This also gives back a quick way to play chords now that the chord track is gone.
- **Scale.** Moves notes outside the project's key (`project.key`) to the nearest note in it.
- Live playing goes through the selected track's FX, so you hear what Play will play. Recording keeps the notes you played, not the FX's output.
- **Apply to Notes** writes an effect's output into the clip and removes the effect, so the notes can then be edited.
- The mixer strip lists a track's MIDI FX with Humanize: add, remove, reorder, bypass, and a small panel for each one's settings.

**Slices.** (a) Scale and Chord as pure FX with tests. (b) The FX list in the strip. (c) Live playing through the FX. (d) Arpeggiator, which needs tempo-synced timing from the player. (e) Apply to Notes.

**Done when.** A track with Chord and Arpeggiator plays an arpeggiated chord from one held key, live and on Play, the same way twice, and Apply to Notes leaves the same notes in the clip. Humanize still plays as before (its tests and the fixture projects are unchanged).

## 3. Track effects

**Today.** A strip is `input → user → low cut → tone → fader → pan`, with sends to one shared reverb and delay (`packages/playback/src/mixer.ts`). The master runs through a fixed chain in `packages/playback/src/audio-engine.ts`. There's nowhere to put an effect.

**Build.**

- Slice 7 of [2-chordinal.md](2-chordinal.md) first: an insert slot in each strip, a `params` map that automation and ducking look up by name, and a meter per strip.
- An effect registry in `packages/playback`: each type makes `{ input, output, params, dispose }` from an `AudioContext`, so the offline export and the CLI render build the same chain.
- First effects, all from built-in Web Audio nodes: **EQ** (low shelf, peaking mid, high shelf), **Compressor** (`DynamicsCompressorNode` with makeup gain), **Filter** (low or high pass with resonance), **Distortion** (`WaveShaperNode` with a drive curve) and **Chorus** (two modulated delays).
- Saved per track as `inserts: { type, bypass, params }[]`, an optional field so older projects and the Melody Composer's are unchanged.
- In the mixer: an insert list on each strip (add, drag to reorder, bypass), and a panel of knobs for the effect clicked. The browser gains an **Effects** tab to drag effects from.
- Effect parameters become automation targets through the `params` map.
- Later: an insert slot on the master, before the mastering chain.

**Slices.** (a) Slice 7. (b) The registry and EQ, saved and played. (c) The mixer's insert list and panel. (d) Compressor, Filter, Distortion and Chorus. (e) Effect parameters in the automation lane's dropdown. (f) The Effects tab.

**Done when.** An EQ and a compressor on a track change how it sounds on Play, in an exported WAV and in `chordinal render`. A project with no inserts exports identical audio to today's (same length, peak and loudness). Bypass and undo work.

## 4. Synth and sampler

**Today.** Every instrument is a SoundFont preset, and `track.instrument` is `{ bank, program }`. The chip instruments (`packages/audio/src/chip-instruments-data.ts`) are waves, envelopes and filters that `packages/lib/src/chip-synth.ts` builds into a SoundFont in memory, so they play like any other preset.

**Build.**

- **Synth.** A subtractive synth, as in PRD §11.1: two oscillators (saw, square, triangle, sine, with detune and octave), noise, a low-pass filter with its own envelope and resonance, an amp envelope, an LFO (to pitch, filter or volume) and glide. 16 voices, stealing the oldest. It meets slice 7's `Instrument` type, so the player, live playing and the export use it like a SoundFont instrument.
- **Sampler.** Drop a WAV, AIFF or MP3 on a track header to play it across the keys. The file is copied into the project's `samples/` folder. The root key is guessed with `packages/lib/src/pitch-track.ts` and can be changed. It has an amp envelope, one-shot or sustain-loop modes, and a start offset. A drum row can play a sample in place of its kit sound (PRD §11.3).
- Saved with a `source` on the track's instrument: `{ bank, program }` stays a SoundFont preset, and a new `synth` or `sample` kind sits beside it. Older projects and the games' `loadInstruments` are unchanged.
- Presets for the synth (bass, lead, pad, pluck, keys) in a `-data.ts` file in `packages/audio`, listed in a **Synths** tab in the browser.
- A **Sound** tab in the editor, next to the piano roll, step grid and mixer, for the selected track's synth or sampler settings.
- In the browser build, samples are kept in the browser's storage with the project.

**Slices.** (a) The synth voice and the `Instrument` it meets, with tests through an offline context. (b) Saving, the Synths tab and presets. (c) The Sound tab. (d) The sampler on a track. (e) Samples on drum rows. (f) Samples in the browser build.

**Done when.** A synth track and a sampled track play live, on Play, in an export and in `chordinal render`, with their settings saved and reopened. Projects and games that use only SoundFont presets sound the same as before.

**A cheaper first step to consider.** The chip synth already turns wave and envelope settings into a SoundFont in memory. The same trick could ship a set of synth presets without a new voice engine, but the filter envelope and LFO wouldn't move per note, so it can't replace the real synth.

## 5. Audio tracks

**Today.** Every track holds MIDI notes. The microphone (`packages/playback/src/mic.ts`) records takes, and Chordinal turns them into notes and keeps the audio in `takes/`. An audio file dropped on a track is turned into notes too.

**Build.**

- A track `kind`: `midi` (today's tracks, the default) or `audio`. An audio track has no instrument, Humanize or MIDI FX, but has the same strip, inserts, sends and automation.
- Audio clips: `{ id, start, file, offset, seconds, gain, fadeIn, fadeOut }`. They start at a beat but play at the file's own speed, so a tempo change moves where they start, not how fast they play (no time-stretching in the first version).
- Files are kept in the project's `audio/` folder (and the browser's storage in the browser build). Saving the project copies in any file that lives outside it.
- **Recording.** Record on an audio track saves the microphone's audio as a clip, at the take's start with the input latency taken off (the latency `takeClock` already measures). Input monitoring is off by default, with a button on the track to turn it on.
- **Playing.** The player schedules each clip as an `AudioBufferSourceNode` on the audio clock, starting partway through when Play starts inside a clip. The export renders them the same way.
- **Editing.** Move, trim either edge, split, copy, fade handles at the corners, and clip gain. The arrangement draws each clip's waveform from peaks worked out once and cached.
- Dropping audio on an audio track places it as a clip. Dropping it on a MIDI track still turns it into notes, as now.
- MIDI export skips audio tracks. `chordinal render` reads WAV files with `packages/lib/src/wav.ts`, and other formats only in the app.
- A new project format version, since an older build can't play audio clips. Older versions still open (§12.3).

**Slices.** (a) The track kind, audio clips and the format version, with tests that old projects open unchanged. (b) Playing and exporting audio clips. (c) Dropping files and drawing waveforms. (d) Editing clips. (e) Recording onto an audio track. (f) The browser build's storage. (g) `chordinal render`.

**Done when.** You can record a vocal onto an audio track, move, trim and fade it, put an EQ on it, and hear it in place on Play and in an exported WAV. A saved project reopens with its audio, and Melody Composer projects are unchanged.

## Open questions

- Effects: does the master need inserts in the first version, or is the mastering chain enough?
- Synth: one voice engine in Web Audio nodes, or an `AudioWorklet`? Nodes are simpler; a worklet is cheaper with many voices.
- Audio tracks: is time-stretching needed for songs that change tempo, or is "audio keeps its own speed" enough?
- Browser build: how much audio and sample storage is reasonable before asking you to use the desktop app?
