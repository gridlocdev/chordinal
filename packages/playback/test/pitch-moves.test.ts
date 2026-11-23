// A note's detune plays as a constant offset on the voice's detune, under its other pitch moves, and stops with the
// voice. Run on fake Web Audio nodes.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { startPitchMoves } from '@chordinal/playback';

/** a fake ConstantSourceNode that records what it was given and what it was connected to */
class FakeConstant {
  static made: FakeConstant[] = [];
  offset: {
    value: number;
    setValueAtTime(v: number, t: number): unknown;
    linearRampToValueAtTime(v: number, t: number): unknown;
  };
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

test("a note's curve moves the detune's offset: from its first point, in straight lines, on top of the detune", () => {
  const calls: [string, number, number][] = [];
  class Recording extends FakeConstant {
    constructor(c: unknown, opts: { offset: number }) {
      super(c, opts);
      this.offset = {
        value: opts.offset,
        setValueAtTime: (v: number, t: number) => calls.push(['set', v, t]),
        linearRampToValueAtTime: (v: number, t: number) => calls.push(['ramp', v, t]),
      };
    }
  }
  globals.ConstantSourceNode = Recording;
  startPitchMoves(ctx, detune, 2, {
    detune: 10,
    curve: [
      { at: 0, cents: 0 },
      { at: 0.5, cents: 40 },
      { at: 1, cents: 0 },
    ],
  });
  assert.equal(FakeConstant.made.length, 1, 'one source for the detune and the curve');
  assert.deepEqual(calls, [
    ['set', 10, 2],
    ['ramp', 50, 2.5],
    ['ramp', 10, 3],
  ]);
  startPitchMoves(ctx, detune, 0, { curve: [{ at: 0, cents: 25 }] });
  assert.equal(FakeConstant.made.length, 2, 'a curve with no detune still bends');
});
