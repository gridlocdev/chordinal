// The sampler (PRD §14): an audio file played across the keys. Rendered through a real offline audio context in
// Chromium (its pitch from the root key, a one-shot playing through note-off, a loop held while the key is), and put
// on a track from the Sound tab, saved with its file and reopened. A drum row plays a sample in place of the kit's sound.
import path from 'node:path';
import { build } from 'esbuild';
import type { Page } from '@playwright/test';
import {
  expect,
  openApp,
  saveAs,
  storedProject,
  storedSettings,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';
import { ROOT } from './server.ts';

let bundle = '';
test.beforeAll(async () => {
  const out = await build({
    stdin: {
      contents: [
        `import { createSampler, withDrumRows, loadInstruments, playProject, audioEngine, LEAD_IN } from '@chordinal/playback';`,
        `import { emptyProject, makeTrack, addTrack, addClip } from '@chordinal/daw';`,
        `window.chordinal = { createSampler, withDrumRows, loadInstruments, playProject, audioEngine, LEAD_IN, emptyProject, makeTrack, addTrack, addClip };`,
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

async function setUp(page: Page) {
  if (await page.evaluate(() => 'chordinal' in window)) return;
  await page.setContent('<!doctype html><title>sampler</title>');
  await page.addScriptTag({ content: bundle });
}

/** a note on (key, time) or off (key, time) */
type Call = ['on' | 'off', number, number];

/**
 * renders a sampler playing a sine of `hz` lasting `length` seconds, recorded at key 69, through `calls`, and measures
 * each [from, to] stretch: its RMS and its pitch from upward zero crossings
 */
async function render(
  page: Page,
  settings: object,
  sine: { hz: number; length: number },
  calls: Call[],
  seconds: number,
  windows: [number, number][],
): Promise<{ rms: number; hz: number }[]> {
  await setUp(page);
  return page.evaluate(
    ({ settings, sine, calls, seconds, windows }) => {
      type Instrument = {
        noteOn(k: number, v: number, w: number): void;
        noteOff(k: number, f: boolean, w: number): void;
      };
      const c = (
        window as unknown as {
          chordinal: { createSampler(s: object, b: AudioBuffer, d: AudioNode): Instrument };
        }
      ).chordinal;
      const rate = 48000;
      const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
      const buffer = ctx.createBuffer(1, Math.round(sine.length * rate), rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = 0.8 * Math.sin((2 * Math.PI * sine.hz * i) / rate);
      const sampler = c.createSampler({ root: 69, ...settings }, buffer, ctx.destination);
      for (const [kind, key, when] of calls)
        if (kind === 'on') sampler.noteOn(key, 127, when);
        else sampler.noteOff(key, false, when);
      return ctx.startRendering().then((out) => {
        const x = out.getChannelData(0);
        return windows.map(([from, to]) => {
          const a = Math.floor(from * rate),
            b = Math.floor(to * rate);
          let sum = 0,
            ups = 0;
          for (let i = a; i < b; i++) {
            sum += x[i]! ** 2;
            if (i > a && x[i - 1]! < 0 && x[i]! >= 0) ups++;
          }
          return { rms: Math.sqrt(sum / (b - a)), hz: ups / (to - from) };
        });
      });
    },
    { settings, sine, calls, seconds, windows },
  );
}

/** a 16-bit mono WAV of a sine */
function wav(hz: number, seconds: number, rate = 44100): Buffer {
  const n = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.round(16000 * Math.sin((2 * Math.PI * hz * i) / rate)), 44 + i * 2);
  return b;
}

test.describe('The sampler', () => {
  test('plays its sample at the root key as recorded, and an octave up an octave higher', async ({
    page,
  }) => {
    const [root, up] = await render(
      page,
      {},
      { hz: 440, length: 2 },
      [
        ['on', 69, 0],
        ['on', 81, 1],
      ],
      1.6,
      [
        [0.2, 0.8],
        [1.2, 1.5],
      ],
    );
    expect(root!.hz).toBeGreaterThan(430);
    expect(root!.hz).toBeLessThan(450);
    // the first note plays on beside the second: both pitches sound, the higher one's crossings counted
    expect(up!.hz).toBeGreaterThan(860);
    expect(up!.hz).toBeLessThan(900);
  });

  test('a one-shot plays through its note-off to the end of the sample', async ({ page }) => {
    const [held, after] = await render(
      page,
      { mode: 'oneshot' },
      { hz: 440, length: 0.6 },
      [
        ['on', 69, 0],
        ['off', 69, 0.05],
      ],
      1.2,
      [
        [0.3, 0.5],
        [0.8, 1.1],
      ],
    );
    expect(held!.rms).toBeGreaterThan(0.1);
    expect(after!.rms).toBeLessThan(0.001);
  });

  test('a sustain loop holds the note past the sample while the key is down, then lets it go', async ({
    page,
  }) => {
    const [held, released] = await render(
      page,
      { mode: 'loop', amp: { attack: 0.002, decay: 0, sustain: 1, release: 0.05 } },
      { hz: 440, length: 0.3 },
      [
        ['on', 69, 0],
        ['off', 69, 1],
      ],
      1.6,
      [
        [0.6, 0.9],
        [1.3, 1.5],
      ],
    );
    expect(held!.rms).toBeGreaterThan(0.1);
    expect(released!.rms).toBeLessThan(0.001);
  });

  test('a project plays a track with a sample on it, read as Play and an export read it', async ({
    page,
  }) => {
    await setUp(page);
    const hz = await page.evaluate(async () => {
      const c = (window as unknown as { chordinal: Record<string, (...a: unknown[]) => unknown> })
        .chordinal as unknown as {
        emptyProject(o: object): { tracks: unknown[] };
        makeTrack(p: object, o: object): { id: string };
        addTrack(p: object, t: object): { tracks: unknown[] };
        addClip(p: object, id: string, clip: object): { tracks: unknown[] };
        loadInstruments(
          t: unknown[],
          s: unknown,
          read: (f: string) => Promise<AudioBuffer | null>,
        ): Promise<unknown[]>;
        playProject(p: object, i: unknown[], o: object): unknown;
        audioEngine: {
          context: BaseAudioContext;
          render(s: number, start: () => () => void): Promise<AudioBuffer>;
        };
        LEAD_IN: number;
      };
      let p = c.emptyProject({ bars: 1 });
      const t = c.makeTrack(p, {
        name: 'Vox',
        instrument: { bank: 0, program: 0, sample: { name: 'Vox', file: 'vox.wav', root: 57 } },
      });
      p = c.addTrack(p, t);
      p = c.addClip(p, t.id, {
        id: 'c1',
        start: 0,
        beats: 4,
        notes: [{ beat: 0, beats: 2, key: 69, vel: 127 }],
      });
      const asked: string[] = [];
      const instruments = await c.loadInstruments(p.tracks, undefined, (file) => {
        asked.push(file);
        const rate = 48000;
        const b = new AudioBuffer({ length: rate * 2, sampleRate: rate });
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = 0.8 * Math.sin((2 * Math.PI * 220 * i) / rate);
        return Promise.resolve(b);
      });
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
      return { hz: ups / 0.5, asked };
    });
    // a 220 Hz sample recorded at A3 (57), played at A4 (69)
    expect(hz.asked).toEqual(['vox.wav']);
    expect(hz.hz).toBeGreaterThan(430);
    expect(hz.hz).toBeLessThan(450);
  });

  test('the Sound tab loads a sample onto a track, guesses its root key, and saves its file with the project', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('ControlOrMeta+4');
    const editor = page.locator('.editor');
    await editor.getByLabel('Load a Sample…').setInputFiles({
      name: 'tone.wav',
      mimeType: 'audio/wav',
      buffer: wav(440, 1),
    });
    await expect(page.getByText('Grand Piano plays tone.wav, root key A4')).toBeVisible();
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('tone');
    await expect(editor.getByRole('slider', { name: 'Sample Root key' })).toHaveAttribute(
      'aria-valuetext',
      'A4',
    );
    await editor.getByRole('combobox', { name: 'Sample Mode' }).selectOption('loop');

    await saveAs(page, 'Sampled');
    const saved = JSON.parse((await storedProject(page, 'Sampled')) ?? '{}') as {
      tracks: { name: string; instrument: { sample?: { file: string; root: number; mode: string } } }[];
    };
    expect(saved.tracks.find((t) => t.name === 'Grand Piano')?.instrument.sample).toMatchObject({
      file: 'tone.wav',
      root: 69,
      mode: 'loop',
    });
    const bytes = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open('chordinal', 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const get = open.result
              .transaction('projects', 'readonly')
              .objectStore('projects')
              .get('sample:Sampled:tone.wav');
            get.onsuccess = () => {
              open.result.close();
              resolve(get.result instanceof Uint8Array ? get.result.length : -1);
            };
            get.onerror = () => reject(get.error);
          };
        }),
    );
    expect(bytes).toBe(44 + 44100 * 2);

    await expect.poll(async () => (await storedSettings(page)).project).toBe('Sampled');
    await openApp(page);
    await expect(page).toHaveTitle('Sampled — Chordinal');
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('tone');
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('ControlOrMeta+4');
    await expect(editor.getByRole('region', { name: 'Grand Piano sampler' })).toBeVisible();
    await expect(editor.locator('.sample-file')).toHaveText('tone.wav');
    await expect(editor.getByRole('combobox', { name: 'Sample Mode' })).toHaveValue('loop');
    expect(errors).toEqual([]);
  });

  test('the browser keeps no sample over 16 MB, and says the desktop app takes it', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('ControlOrMeta+4');
    await page
      .locator('.editor')
      .getByLabel('Load a Sample…')
      .setInputFiles({
        name: 'long.wav',
        mimeType: 'audio/wav',
        buffer: wav(440, 200), // 17.6 MB
      });
    await expect(page.getByRole('status')).toHaveText(
      'long.wav: over 16 MB, more than the browser keeps; the desktop app takes it×',
    );
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('Grand Piano');
    expect(errors).toEqual([]);
  });

  test("a drum row's sample plays as recorded on its key, and the kit plays the other keys", async ({
    page,
  }) => {
    await setUp(page);
    const { hz, kit } = await page.evaluate(async () => {
      type Instrument = {
        noteOn(k: number, v: number, w: number): void;
        noteOff(k: number, f: boolean, w: number): void;
        output: GainNode;
      };
      const c = (
        window as unknown as {
          chordinal: {
            withDrumRows(
              kit: object,
              rows: { key: number; sample: object; buffer: AudioBuffer }[],
              d: AudioNode,
            ): Instrument;
          };
        }
      ).chordinal;
      const rate = 48000;
      const ctx = new OfflineAudioContext(1, rate, rate);
      const buffer = ctx.createBuffer(1, rate, rate);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.8 * Math.sin((2 * Math.PI * 330 * i) / rate);
      const kit: number[] = [];
      const fake = {
        noteOn: (k: number) => kit.push(k),
        noteOff: () => {},
        glide: () => false,
        tapeStop: () => {},
        output: ctx.createGain(),
        setSustain: () => {},
        dispose: () => {},
      };
      const drums = c.withDrumRows(
        fake,
        [{ key: 36, sample: { name: 'Boom', file: 'boom.wav' }, buffer }],
        ctx.destination,
      );
      drums.noteOn(36, 127, 0);
      drums.noteOn(38, 127, 0);
      drums.noteOff(36, false, 0.05); // a one-shot: it plays on
      const x = (await ctx.startRendering()).getChannelData(0);
      let ups = 0;
      for (let i = Math.floor(0.2 * rate) + 1; i < Math.floor(0.7 * rate); i++)
        if (x[i - 1]! < 0 && x[i]! >= 0) ups++;
      return { hz: ups / 0.5, kit };
    });
    expect(hz).toBeGreaterThan(320);
    expect(hz).toBeLessThan(340);
    expect(kit).toEqual([38]);
  });

  test('a sample dropped on a step grid row plays there, saved with the project', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Drums').dblclick();
    const grid = page.getByTestId('step-grid');
    await expect(grid).toBeVisible();
    const data = await page.evaluateHandle(
      (bytes) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(bytes)], 'boom.wav', { type: 'audio/wav' }));
        return dt;
      },
      [...wav(110, 0.5)],
    );
    const box = await grid.boundingBox();
    if (!box) throw new Error('the step grid has no size');
    // the first row, Kick (36), in the names left of the steps
    const at = { clientX: box.x + 40, clientY: box.y + 6, dataTransfer: data };
    // every notice shown: with no SoundFonts here, the live kit reloading for the new row replaces this one
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { notices: string[] }).notices = seen;
      new MutationObserver(() => {
        const t = document.querySelector('[role=status]')?.textContent ?? '';
        if (t) seen.push(t);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await grid.dispatchEvent('dragover', at);
    await grid.dispatchEvent('drop', at);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { notices: string[] }).notices.join('|')))
      .toContain('Kick on Drums plays boom.wav');
    // Save As, read from the notices: saving moves the row's file into the project, and the kit reloads with it
    const save = async (name: string) => {
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const ask = page.getByRole('dialog', { name: 'Save the project as' });
      await expect(ask.getByRole('textbox')).toBeFocused();
      await page.keyboard.press('ControlOrMeta+KeyA');
      await page.keyboard.type(name);
      await page.keyboard.press('Enter');
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { notices: string[] }).notices.join('|')))
        .toContain(`Saved “${name}”`);
    };

    await save('Boom');
    const saved = JSON.parse((await storedProject(page, 'Boom')) ?? '{}') as {
      tracks: {
        name: string;
        instrument: { drumSamples?: Record<string, { name: string; file: string }> };
      }[];
    };
    expect(saved.tracks.find((t) => t.name === 'Drums')?.instrument.drumSamples).toEqual({
      36: { name: 'boom', file: 'boom.wav' },
    });
    // a kit from the Kits tab keeps the row's sample
    await page.locator('.browser').getByRole('button', { name: 'Kits', exact: true }).click();
    await page.locator('.browser .item').nth(1).dblclick();
    await page.evaluate(() => (window as unknown as { notices: string[] }).notices.splice(0));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { notices: string[] }).notices.join('|')))
      .toContain('Saved “Boom”');
    const again = JSON.parse((await storedProject(page, 'Boom')) ?? '{}') as typeof saved;
    expect(again.tracks.find((t) => t.name === 'Drums')?.instrument.drumSamples).toEqual({
      36: { name: 'boom', file: 'boom.wav' },
    });
    expect(errors).toEqual([]);
  });
});
