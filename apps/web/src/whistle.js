// Whistling in Chordinal (Chordinal PRD §9.3): Record Melody on a track records a whistled melody into a new clip there,
// from the playhead's bar; Whistle a Chord records an arpeggio over the stretch picked on the chord track and names the
// chord. Both are the shared recorder (src/ui/recording.js); this picks which one runs.
import { selected, chordRange } from '@chordinal/ui';
import { record, recording } from '@chordinal/ui';

/** Record Melody: on `trackId`, or the selected track (a new Whistle track when there is none); again to stop */
export function recordMelody(trackId = selected.value)
{
    if (recording.value) return record();
    if (trackId) selected.value = trackId;
    chordRange.value = null;
    return record();
}

/** Whistle a Chord: over the stretch picked on the chord track; again to stop */
export function whistleChord()
{
    if (recording.value || chordRange.value) return record();
}
