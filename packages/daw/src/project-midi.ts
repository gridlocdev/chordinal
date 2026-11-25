// A project as a Standard MIDI File, to open in another DAW: a track per track with its written notes and General MIDI
// program (drum kits on channel 10), the tempo map's changes and the meters. Ramps become their starting tempo, and
// what MIDI FX add as the project plays isn't in it. And back: a MIDI file read as a new project, or as tracks added to
// one. Pure.
import { writeMidi, readMidi, readBend, shareSpareChannels } from '@chordinal/lib';
import type { MidiFile } from '@chordinal/lib';
import { barAt } from './meter.ts';
import { trackNotes, isDrums, emptyProject, makeTrack, addTrack, newId, projectEnd } from './project.ts';
import type { Clip, Project } from './project.ts';

export function projectMidi(p: Project): Uint8Array {
  let channel = 0;
  // an audio track has no notes to write (PRD §16.8)
  const tracks = p.tracks
    .filter((t) => t.kind !== 'audio')
    .map((t) => {
      const drums = isDrums(t);
      const ch = drums ? 9 : channel++ % 15;
      return {
        name: t.name,
        channel: ch < 9 || drums ? ch : ch + 1,
        program: drums ? 0 : t.instrument.program,
        // a note's detune mark is its tuning, written as pitch bend; its bend mark a curve of pitch bend over it
        notes: trackNotes(t).map(({ detune, bend, ...n }) => {
          const curve = readBend(bend);
          return {
            ...n,
            ...(typeof detune === 'number' && detune && { cents: detune }),
            ...(curve && { bend: curve }),
          };
        }),
      };
    });
  shareSpareChannels(tracks);
  const meters = p.meters.map((m) => {
    const [num = NaN, den = NaN] = m.sig.split('/').map(Number);
    return { beat: m.beat, num, den };
  });
  const first = p.tempoMap[0];
  if (!first) throw new TypeError('a tempo map needs a segment');
  return writeMidi({
    title: p.title,
    tempo: first.bpm,
    beatsPerBar: 4,
    tempos: p.tempoMap.map((s) => ({ beat: s.beat, bpm: s.bpm })),
    meters,
    tracks,
  });
}

/**
 * the MIDI file's tracks added to project p from the bar at `at`, one clip each, as General MIDI instruments (channel
 * 10 is the drum kit); the file's tempo and meters are left out, as the project has its own
 */
export function addMidiTracks(p: Project, midi: Uint8Array | MidiFile, at = 0): Project {
  const file = midi instanceof Uint8Array ? readMidi(midi) : midi;
  const start = barAt(p.meters, at).start;
  let q = p;
  for (const t of file.tracks) {
    const drums = t.channel === 9;
    const track = makeTrack(q, {
      name: t.name || (drums ? 'Drums' : `Track ${q.tracks.length + 1}`),
      instrument: { bank: drums ? 128 : 0, program: drums ? 0 : t.program },
    });
    q = addTrack(q, track);
    const last = Math.max(...t.notes.map((n) => n.beat + n.beats));
    const end = barAt(q.meters, start + last - 1e-6);
    const clip: Clip = {
      id: newId(q, 'c'),
      start,
      beats: end.start + end.beatsPerBar - start,
      // a note's pitch bend comes back as its tuning (detune) and its bend
      notes: t.notes.map(({ cents, ...n }) => ({ ...n, ...(cents && { detune: cents }) })),
    };
    q = { ...q, tracks: q.tracks.map((x) => (x.id === track.id ? { ...x, clips: [clip] } : x)) };
  }
  return { ...q, length: Math.max(q.length, projectEnd(q)) };
}

/** a new project from a MIDI file: its tempo changes, meters and tracks; `title` is for a file that names none */
export function midiProject(bytes: Uint8Array, title: string): Project {
  const file = readMidi(bytes);
  const round = (bpm: number) => Math.round(bpm * 100) / 100;
  const tempo = file.tempos[0] ?? { beat: 0, bpm: 120 };
  const meter = file.meters[0] ?? { beat: 0, num: 4, den: 4 };
  const p = {
    ...emptyProject({ title: file.title || title, bars: 1 }),
    tempoMap: [
      { beat: 0, bpm: round(tempo.bpm) },
      ...file.tempos.filter((t) => t.beat > 0).map((t) => ({ beat: t.beat, bpm: round(t.bpm) })),
    ],
    meters: [
      { beat: 0, sig: `${meter.num}/${meter.den}` },
      ...file.meters.filter((m) => m.beat > 0).map((m) => ({ beat: m.beat, sig: `${m.num}/${m.den}` })),
    ],
  };
  const q = addMidiTracks({ ...p, length: 0 }, file, 0);
  const end = barAt(q.meters, Math.max(0, projectEnd(q) - 1e-6));
  return { ...q, length: end.start + end.beatsPerBar };
}
