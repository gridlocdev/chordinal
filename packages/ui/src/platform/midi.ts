// Web MIDI input: any connected keyboard, including ones plugged in later.
// Listeners get { type: 'noteon' | 'noteoff', key, velocity } or { type: 'cc', controller, value }.

/** a message from a MIDI keyboard: a key down or up, or a controller (the sustain pedal) moved */
export type MidiMessage =
  | { type: 'noteon' | 'noteoff'; key: number; velocity: number }
  | { type: 'cc'; controller: number; value: number };

const listeners = new Set<(m: MidiMessage) => void>();

export const midi = {
  available: 'requestMIDIAccess' in navigator,
  on(fn: (m: MidiMessage) => void): () => boolean {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /**
   * Asks for MIDI access and listens to every input. onInputs gets the input count now and whenever
   * a device is plugged in or removed. Resolves false when MIDI is unavailable or the user declined.
   */
  async init(onInputs?: (count: number) => void): Promise<boolean> {
    if (!this.available) return false;
    try {
      const access = await navigator.requestMIDIAccess();
      const attach = () => {
        let count = 0;
        access.inputs.forEach((input) => {
          input.onmidimessage = onMessage;
          count++;
        });
        onInputs?.(count);
      };
      attach();
      access.onstatechange = attach;
      return true;
    } catch {
      return false;
    }
  },
};

function onMessage({ data }: MIDIMessageEvent): void {
  if (!data) return;
  const [status = 0, a = 0, b = 0] = data;
  const type = status & 0xf0;
  const msg: MidiMessage | null =
    type === 0x90 && b > 0
      ? { type: 'noteon', key: a, velocity: b }
      : type === 0x80 || type === 0x90
        ? { type: 'noteoff', key: a, velocity: 0 }
        : type === 0xb0
          ? { type: 'cc', controller: a, value: b }
          : null;
  if (msg) for (const fn of listeners) fn(msg);
}
