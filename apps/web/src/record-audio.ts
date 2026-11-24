// Recording in Chordinal (Chordinal PRD §9.3): Record Melody on a track records a melody from the microphone, or the
// keys played, into a new clip there, from the playhead's bar. It runs the shared recorder (packages/ui/src/recording.ts).
import { selected } from '@chordinal/ui';
import { record, recording } from '@chordinal/ui';

/** Record Melody: on `trackId`, or the selected track (a new Melody track when there is none); again to stop */
export function recordMelody(trackId: string | null = selected.value): Promise<void> {
  if (recording.value) return record();
  if (trackId) selected.value = trackId;
  return record();
}
