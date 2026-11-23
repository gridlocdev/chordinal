// A note's detune plays as a constant offset on the voice's detune, under its other pitch moves, and stops with the
// voice. Run on fake Web Audio nodes.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { startPitchMoves } from '@chordinal/playback';

/** a fake ConstantSourceNode that records what it was given and what it was connected to */
class FakeConstant {
  static made: FakeConstant[] = [];
  offset: { value: number; setValueAtTime(): void; linearRampToValueAtTime(): void };
  to: unknown = null;
  started = -1;
  stopped = false;
  constructor(_ctx: unknown, opts: { offset: number }) {
    this.offset = { value: opts.offset, setValueAtTime() {}, linearRampToValueAtTime() {} };
    FakeConstant.made.push(this);
  }
  connect(to: unknown) {
    this.to = to;
    return to;
  }
  disconnect() {}
  start(t: number) {
    this.started = t;
  }
  stop() {
    this.stopped = true;
  }
}

const globals = globalThis as unknown as Record<string, unknown>;
const ctx = {} as BaseAudioContext;
const detune = { setValueAtTime() {}, linearRampToValueAtTime() {} } as unknown as AudioParam;

afterEach(() => {
  delete globals.ConstantSourceNode;
  FakeConstant.made = [];
});

test("a note's detune is a constant offset on the voice's detune, stopped with the voice", () => {
  globals.ConstantSourceNode = FakeConstant;
  const stop = startPitchMoves(ctx, detune, 2, { detune: -13.7 });
  const [base] = FakeConstant.made;
  assert.ok(base);
  assert.equal(base.offset.value, -13.7);
  assert.equal(base.to, detune);
  assert.equal(base.started, 2);
  stop();
  assert.equal(base.stopped, true);
});

test('no detune, or a mark that is not a number, adds nothing', () => {
  globals.ConstantSourceNode = FakeConstant;
  startPitchMoves(ctx, detune, 0, {});
  startPitchMoves(ctx, detune, 0, { detune: 0 });
  startPitchMoves(ctx, detune, 0, { detune: '50' as unknown as number });
  assert.equal(FakeConstant.made.length, 0);
});
