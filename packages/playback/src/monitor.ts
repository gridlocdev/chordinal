// Input monitoring (Chordinal PRD §16.7): the microphone heard through an audio track's own strip (its effects,
// volume, pan and sends, then the master's effects) while the track's Monitor button is on. The mic must be on.
import type { Insert, Track } from '@chordinal/daw';
import { insertsOf } from '@chordinal/daw';
import { createMixer, dbToGain } from './mixer.ts';
import { mic } from './mic.ts';

/** a running monitor; stop() fades it out and lets the mic go on alone */
export interface Monitor {
  stop(): void;
}

/** the mic through `track`'s strip at `tempo`, with the master's effects */
export function monitorTrack(track: Track, tempo: number, master: Insert[] = []): Monitor {
  const input = mic.node;
  if (!input) throw new Error('the microphone is off');
  const mixer = createMixer({ tempo, master });
  const strip = mixer.channel({
    volumeDb: 0,
    pan: track.mixer.pan,
    lowCut: track.mixer.lowCut,
    reverb: track.mixer.sends.reverb,
    delay: track.mixer.sends.delay,
    autoPan: track.mixer.autoPan,
    inserts: insertsOf(track),
  });
  strip.user.gain.value = track.mixer.mute ? 0 : dbToGain(track.mixer.volumeDb);
  input.connect(strip.input);
  return {
    stop() {
      // a mic turned off since is disconnected already
      if (mic.node === input) input.disconnect(strip.input);
      mixer.dispose();
    },
  };
}
