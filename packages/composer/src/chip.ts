// What a chip song (spec `sound: 'chip'`) writes into its score that other songs don't: the techniques the NES
// soundtracks measured in tools/nsf-report.mjs use, with the settings in CHIP (performance-data.ts).
import { bpmAt } from '@chordinal/lib';
import { STEP } from './meter.ts';
import type { TempoSegment } from '@chordinal/lib';
import { CHIP } from '@chordinal/perform';
import type { ScoreNote, ScoreTrack } from './compose.ts';

/**
 * The echo: a quieter copy of the lead a moment later, on a channel of its own, in the bars where the countermelody
 * rests. The NES's second pulse channel did this when it had nothing else to play: one channel, heard as a room.
 * beats: the song's length
 */
export function echoTrack(tracks: ScoreTrack[], beats: number, tempoMap: TempoSegment[]): ScoreTrack | null {
  const E = CHIP.echo,
    lead = tracks.find((t) => t.role === 'lead');
  if (!E || !lead?.notes.length) return null;
  const counter = tracks.find((t) => t.role === 'counter')?.notes ?? [];
  const busy = (from: number, to: number): boolean =>
    counter.some((n) => n.beat < to - 1e-9 && n.beat + n.beats > from + 1e-9);
  const notes: ScoreNote[] = [];
  for (const n of lead.notes) {
    const delay = Math.max(1, Math.round((E.seconds * bpmAt(tempoMap, n.beat)) / 60 / STEP)) * STEP;
    const beat = n.beat + delay,
      end = Math.min(beats, beat + n.beats);
    if (end - beat < 1e-6 || busy(beat, end)) continue;
    notes.push({ key: n.key, beat, beats: end - beat, vel: Math.max(1, Math.round(n.vel * E.vel)) });
  }
  return notes.length ? { role: 'echo', name: 'Echo', program: lead.program, bank: lead.bank, notes } : null;
}
