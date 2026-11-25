// The synth (PRD §13) rendered through a real offline audio context in Chromium: its pitch, velocity, filter, voice
// limit, LFO and mono glide, measured in the rendered samples. The synth is bundled on its own into a blank page, so
// this needs no build of the app.
import path from 'node:path';
import { build } from 'esbuild';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { ROOT } from './server.ts';

/** a call to the synth: a note on (key, velocity, time) or a note off (key, time), made in this order */
type Call = ['on', number, number, number] | ['off', number, number];

/** what a stretch of the render measures: its peak and RMS, its pitch from upward zero crossings, how bright it is
 * (the RMS of its slope over its own RMS), and the RMS of what's left under about 200 Hz */
interface Stats {
  peak: number;
  rms: number;
  hz: number;
  bright: number;
  low: number;
}

let bundle = '';
test.beforeAll(async () => {
  const out = await build({
    stdin: {
      contents: [
        `import { createSynth, loadInstruments, playProject, audioEngine, LEAD_IN } from '@chordinal/playback';`,
        `import { emptyProject, makeTrack, addTrack, addClip } from '@chordinal/daw';`,
        `window.createSynth = createSynth;`,
        `window.chordinal = { loadInstruments, playProject, audioEngine, LEAD_IN, emptyProject, makeTrack, addTrack, addClip };`,
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    absWorkingDir: path.resolve(ROOT),
    bundle: true,
    write: false,
    format: 'iife',
    logLevel: 'silent',
  });
  bundle = out.outputFiles[0]!.text;
});

/** what the bundle puts on the page, as far as the tests use it */
interface Bundle {
  emptyProject(o: { bars: number }): ProjectLike;
  makeTrack(p: ProjectLike, o: object): { id: string };
  addTrack(p: ProjectLike, t: object): ProjectLike;
  addClip(p: ProjectLike, track: string, clip: object): ProjectLike;
  loadInstruments(tracks: unknown[]): Promise<unknown[]>;
  playProject(p: ProjectLike, instruments: unknown[], o: object): unknown;
  audioEngine: { render(seconds: number, start: () => () => void): Promise<AudioBuffer> };
  LEAD_IN: number;
}
type ProjectLike = { tracks: unknown[] };

/** puts the synth on a blank page, once */
async function setUp(page: Page) {
  if (await page.evaluate(() => 'createSynth' in window)) return;
  await page.setContent('<!doctype html><title>synth</title>');
  await page.addScriptTag({ content: bundle });
}

/** renders `calls` on a synth playing `settings` for `seconds`, and measures each [from, to] stretch of it */
async function render(
  page: Page,
  settings: unknown,
  calls: Call[],
  seconds: number,
  windows: [number, number][],
) {
  await setUp(page);
  return page.evaluate(
    async ({ settings, calls, seconds, windows }) => {
      const rate = 48000;
      const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
      const make = (window as unknown as { createSynth: (p: unknown, d: AudioNode) => Instrument })
        .createSynth;
      type Instrument = {
        noteOn(k: number, v: number, w: number): void;
        noteOff(k: number, f: boolean, w: number): void;
      };
      const synth = make(settings, ctx.destination);
      for (const c of calls)
        if (c[0] === 'on') synth.noteOn(c[1], c[2], c[3]);
        else synth.noteOff(c[1], false, c[2]);
      const x = (await ctx.startRendering()).getChannelData(0);
      const smooth = Math.round(rate * 0.004);
      return windows.map(([from, to]) => {
        const a = Math.floor(from * rate),
          b = Math.floor(to * rate);
        let peak = 0,
          sum = 0,
          slope = 0,
          ups = 0,
          low = 0,
          run = 0;
        for (let i = a; i < b; i++) {
          const v = x[i]!;
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          if (i > a) {
            slope += (v - x[i - 1]!) ** 2;
            if (x[i - 1]! < 0 && v >= 0) ups++;
          }
          run += v - (i - smooth >= a ? x[i - smooth]! : 0);
          if (i - smooth >= a) low += (run / smooth) ** 2;
        }
        const n = b - a,
          rms = Math.sqrt(sum / n);
        return {
          peak,
          rms,
          hz: ups / (to - from),
          bright: rms ? Math.sqrt(slope / n) / rms : 0,
          low: Math.sqrt(low / Math.max(1, n - smooth)),
        };
      });
    },
    { settings, calls, seconds, windows },
  ) as Promise<Stats[]>;
}

const OPEN = { type: 'lowpass', cutoff: 20000, amount: 0 };
const SINE = { osc1: { wave: 'sine', level: 1 }, filter: OPEN };

test.describe('The synth', () => {
  test('plays a note at its pitch, louder for a harder note, and stops after its release', async ({
    page,
  }) => {
    const [a4, after] = await render(
      page,
      SINE,
      [
        ['on', 69, 127, 0],
        ['off', 69, 0.5],
      ],
      1.5,
      [
        [0.2, 0.4],
        [1.2, 1.4],
      ],
    );
    expect(a4!.hz).toBeGreaterThan(435);
    expect(a4!.hz).toBeLessThan(445);
    expect(after!.peak).toBeLessThan(1e-4);

    const up = { ...SINE, osc1: { wave: 'sine', level: 1, octave: 1 } };
    const [a5] = await render(page, up, [['on', 69, 127, 0]], 0.5, [[0.2, 0.4]]);
    expect(a5!.hz).toBeGreaterThan(870);
    expect(a5!.hz).toBeLessThan(890);

    const [soft] = await render(page, SINE, [['on', 69, 40, 0]], 0.5, [[0.2, 0.4]]);
    expect(a4!.peak / soft!.peak).toBeGreaterThan(5); // the level goes with the velocity squared
  });

  test('the filter darkens or thins a saw, and its envelope opens wider for a harder note', async ({
    page,
  }) => {
    const saw = (filter: object, velocity = 0) => ({ osc1: { wave: 'saw', level: 1 }, velocity, filter });
    const at = async (settings: unknown, vel = 127) =>
      (await render(page, settings, [['on', 48, vel, 0]], 0.6, [[0.4, 0.6]]))[0]!.bright;
    const dark = await at(saw({ type: 'lowpass', cutoff: 300, amount: 0 }));
    const open = await at(saw({ type: 'lowpass', cutoff: 12000, amount: 0 }));
    const thin = await at(saw({ type: 'highpass', cutoff: 3000, amount: 0 }));
    expect(open).toBeGreaterThan(dark * 2);
    expect(thin).toBeGreaterThan(open);
    expect(await at(saw({ type: 'bandpass', cutoff: 1000, resonance: 4, amount: 0 }))).toBeGreaterThan(dark);

    const swept = saw(
      { type: 'lowpass', cutoff: 200, amount: 4800, env: { attack: 0, decay: 1, sustain: 1 } },
      1,
    );
    expect(await at(swept, 127)).toBeGreaterThan((await at(swept, 30)) * 1.5);
  });

  test('plays 16 notes at once, cutting the oldest for a 17th', async ({ page }) => {
    // a low note under 16 high ones: only the low note leaves anything under 200 Hz
    const highs = (n: number): Call[] => Array.from({ length: n }, (_, i): Call => ['on', 96 + i, 100, 0.1]);
    const deep = { ...SINE, amp: { attack: 0, decay: 0, sustain: 1, release: 0.05 } };
    const [kept] = await render(page, deep, [['on', 21, 127, 0], ...highs(15)], 0.6, [[0.3, 0.6]]);
    const [cut] = await render(page, deep, [['on', 21, 127, 0], ...highs(16)], 0.6, [[0.3, 0.6]]);
    expect(kept!.low).toBeGreaterThan(0.05);
    expect(cut!.low).toBeLessThan(kept!.low / 20);
  });

  test('its LFO moves the volume, and noise plays with no oscillator', async ({ page }) => {
    const tremolo = { ...SINE, lfo: { wave: 'sine', rate: 4, depth: 1, target: 'volume' } };
    const parts = await render(page, tremolo, [['on', 69, 127, 0]], 1, [
      [0.5, 0.5625],
      [0.5625, 0.625],
      [0.625, 0.6875],
      [0.6875, 0.75],
    ]);
    const levels = parts.map((p) => p.rms);
    expect(Math.min(...levels)).toBeLessThan(Math.max(...levels) * 0.5);

    const noise = { osc1: { level: 0 }, noise: 1, filter: OPEN };
    const [hiss] = await render(page, noise, [['on', 60, 127, 0]], 0.4, [[0.2, 0.4]]);
    expect(hiss!.rms).toBeGreaterThan(0.01);
  });

  test('mono slides between held keys without starting the note again, and back to a key still held', async ({
    page,
  }) => {
    const mono = {
      ...SINE,
      mono: true,
      glide: 0.1,
      amp: { attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.1 },
    };
    const [first, attack, second, back] = await render(
      page,
      mono,
      [
        ['on', 60, 127, 0],
        ['on', 72, 127, 0.5], // 60 still held: slide up
        ['off', 72, 1], // back down to 60
        ['off', 60, 1.5],
      ],
      2,
      [
        [0.3, 0.45],
        [0.5, 0.56],
        [0.7, 0.95],
        [1.2, 1.45],
      ],
    );
    expect(first!.hz).toBeGreaterThan(255);
    expect(first!.hz).toBeLessThan(268);
    expect(second!.hz).toBeGreaterThan(515);
    expect(second!.hz).toBeLessThan(530);
    expect(back!.hz).toBeGreaterThan(255);
    expect(back!.hz).toBeLessThan(268);
    // the envelope stayed at its sustain level: no second attack up to the peak
    expect(attack!.peak).toBeLessThan(first!.peak * 1.2);
  });

  test('a project plays a track with a synth on it, as Play and an export do', async ({ page }) => {
    await setUp(page);
    const hz = await page.evaluate(async (synth) => {
      const c = (window as unknown as { chordinal: Bundle }).chordinal;
      let p = c.emptyProject({ bars: 1 });
      const t = c.makeTrack(p, { name: 'Lead', instrument: { bank: 0, program: 80, synth } });
      p = c.addTrack(p, t);
      p = c.addClip(p, t.id, {
        id: 'c1',
        start: 0,
        beats: 4,
        notes: [{ beat: 0, beats: 2, key: 69, vel: 127 }],
      });
      const instruments = await c.loadInstruments(p.tracks);
      const buffer = await c.audioEngine.render(1.5, () => {
        let tick = () => {};
        c.playProject(p, instruments, {
          until: 4,
          ticker: (_ms: number, fn: () => void) => {
            tick = fn;
            return () => {};
          },
        });
        return () => tick();
      });
      const x = buffer.getChannelData(0),
        rate = buffer.sampleRate;
      const a = Math.floor((c.LEAD_IN + 0.2) * rate),
        b = Math.floor((c.LEAD_IN + 0.7) * rate);
      let ups = 0;
      for (let i = a + 1; i < b; i++) if (x[i - 1]! < 0 && x[i]! >= 0) ups++;
      return ups / 0.5;
    }, SINE);
    expect(hz).toBeGreaterThan(430);
    expect(hz).toBeLessThan(450);
  });
});
