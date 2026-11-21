// Sounding voices are listed per audio context (audit: an export's voices stayed in one global list after the render,
// and counted against the live voice limit, so live notes stole them). Run on a fake Web Audio context.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildChipFont } from '@chordinal/lib';
import { CHIP_BANK, CHIP_KIT_BANK, CHIP_INSTRUMENTS, CHIP_KITS } from '@chordinal/audio';

/** the parts of a Web Audio param the voices touch, doing nothing */
const param = () => ({
  value: 0,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  setTargetAtTime() {},
  cancelScheduledValues() {},
  cancelAndHoldAtTime() {},
});

/** a fake audio context with what an instrument's voices use, counting the sources stopped */
interface FakeContext extends Partial<BaseAudioContext> {
  currentTime: number;
  sampleRate: number;
  stops: number;
}

function fakeContext(): FakeContext {
  const node = <T extends object>(extra: T) => ({ connect: (n: unknown) => n, disconnect() {}, ...extra });
  const ctx: FakeContext = { currentTime: 0, sampleRate: 48000, stops: 0 };
  const parts = {
    createGain: () => node({ context: ctx, gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createBufferSource: () =>
      node({
        playbackRate: param(),
        detune: param(),
        start() {},
        stop() {
          ctx.stops++;
        },
      }),
  };
  return Object.assign(ctx, parts);
}

/** an instrument's destination on a fake context: only its context is read */
const destinationOn = (context: FakeContext) => ({ context }) as Partial<AudioNode> as AudioNode;

class FakeAudioBuffer {
  length: number;
  sampleRate: number;
  data: Float32Array;
  constructor({ length, sampleRate }: { length: number; sampleRate: number }) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = new Float32Array(length);
  }
  getChannelData() {
    return this.data;
  }
}
Object.assign(globalThis, { AudioBuffer: FakeAudioBuffer });

const { createInstrument, voicesIn } = await import('@chordinal/playback');
const font = {
  url: 'chip',
  ...buildChipFont({
    bank: CHIP_BANK,
    kitBank: CHIP_KIT_BANK,
    instruments: CHIP_INSTRUMENTS,
    kits: CHIP_KITS,
  }),
};
const preset = font.presets.find((p) => p.bank === CHIP_BANK);

test("an export's voices are listed with its own context, so live notes neither count nor steal them", () => {
  assert.ok(preset);
  const offline = fakeContext(),
    live = fakeContext();
  const exported = createInstrument(font, preset, destinationOn(offline));
  for (let i = 0; i < 120; i++) exported.noteOn(30 + (i % 60), 100, i);
  const sounding = voicesIn(offline as BaseAudioContext).length;
  assert.ok(sounding > 0);
  const stopsBefore = offline.stops;

  const keys = createInstrument(font, preset, destinationOn(live));
  keys.noteOn(60);
  assert.equal(offline.stops, stopsBefore, "a live note cut none of the export's voices");
  assert.equal(
    voicesIn(live as BaseAudioContext).length,
    voicesIn(live as BaseAudioContext).filter((v) => !v.stopping).length,
  );
  assert.ok(voicesIn(live as BaseAudioContext).length >= 1 && voicesIn(live as BaseAudioContext).length <= 2);
  assert.equal(
    voicesIn(offline as BaseAudioContext).length,
    sounding,
    "the export's list is its own, gone with its context",
  );
});
