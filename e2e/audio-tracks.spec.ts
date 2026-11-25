// Audio tracks (PRD §16): a clip rendered through a real offline audio context in Chromium plays its stretch of the
// file at its start; an audio file dropped below the tracks becomes a new audio track with the file as a clip, drawn
// with its waveform, and saving keeps the file in the project's audio/ folder; a clip is moved, copied, trimmed, faded,
// muted and deleted with the mouse and keys.
import path from 'node:path';
import { build } from 'esbuild';
import type { Page } from '@playwright/test';
import { expect, openApp, saveAs, storedProject, test, trackHeader, watchErrors } from './fixtures.ts';
import { ROOT } from './server.ts';

let bundle = '';
test.beforeAll(async () => {
  const out = await build({
    stdin: {
      contents: [
        `import { loadInstruments, playProject, audioEngine, LEAD_IN } from '@chordinal/playback';`,
        `import { emptyProject, makeAudioTrack, addTrack, addAudioClip } from '@chordinal/daw';`,
        `window.chordinal = { loadInstruments, playProject, audioEngine, LEAD_IN, emptyProject, makeAudioTrack, addTrack, addAudioClip };`,
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

/** whether a key is in the browser store */
async function storedKey(page: Page, key: string): Promise<boolean> {
  return page.evaluate(
    (k) =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open('chordinal', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('projects', 'readonly').objectStore('projects').get(k);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result !== undefined);
          };
        };
      }),
    key,
  );
}

/** puts a WAV file below the tracks, which makes an audio track for it */
async function dropBelow(page: Page, name: string, bytes: Buffer): Promise<void> {
  const below = page.locator('.add-track');
  const data = await page.evaluateHandle(
    ([n, b]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], n, { type: 'audio/wav' }));
      return dt;
    },
    [name, [...bytes]] as const,
  );
  await below.dispatchEvent('dragover', { dataTransfer: data });
  await below.dispatchEvent('drop', { dataTransfer: data });
}

/** the left and right edges of each clip drawn in the first audio lane, in page px, read from its name strips */
async function clipSpans(page: Page): Promise<[number, number][]> {
  const canvas = page.locator('.lane.audio canvas').first();
  const box = (await canvas.boundingBox())!;
  const spans = await canvas.evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext('2d')!,
      ratio = c.width / c.clientWidth;
    const row = g.getImageData(0, Math.round(8 * ratio), c.width, 1).data;
    const out: [number, number][] = [];
    let from = -1;
    for (let x = 0; x <= c.width; x++) {
      const on = x < c.width && row[x * 4 + 3]! > 0;
      if (on && from < 0) from = x;
      if (!on && from >= 0) {
        out.push([from / ratio, x / ratio]);
        from = -1;
      }
    }
    return out;
  });
  return spans.map(([a, b]) => [box.x + a, box.x + b]);
}

/** a mouse drag from one point to another, in steps, with Alt held when `alt` */
async function drag(page: Page, from: [number, number], to: [number, number], alt = false): Promise<void> {
  await page.mouse.move(...from);
  await page.mouse.down();
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

test.describe('Audio tracks', () => {
  test('a clip plays its stretch of the file from its start, and nothing outside it', async ({ page }) => {
    await page.setContent('<!doctype html><title>audio clips</title>');
    await page.addScriptTag({ content: bundle });
    const heard = await page.evaluate(async () => {
      const c = (window as unknown as { chordinal: Record<string, never> }).chordinal as unknown as {
        emptyProject(o: object): object & { tracks: unknown[] };
        makeAudioTrack(p: object, o: object): { id: string };
        addTrack(p: object, t: object): object & { tracks: unknown[] };
        addAudioClip(p: object, id: string, clip: object): object & { tracks: unknown[] };
        loadInstruments(
          t: unknown[],
          s: unknown,
          readSample: unknown,
          readAudio: (f: string) => Promise<AudioBuffer | null>,
        ): Promise<unknown[]>;
        playProject(p: object, i: unknown[], o: object): unknown;
        audioEngine: { render(s: number, start: () => () => void): Promise<AudioBuffer> };
        LEAD_IN: number;
      };
      let p = c.emptyProject({ bars: 2 });
      // no reverb send, so nothing rings on after the clip ends
      const made = c.makeAudioTrack(p, { name: 'Vox' }) as { id: string; mixer: object };
      const t = { ...made, mixer: { ...made.mixer, sends: { reverb: 0, delay: 0 } } };
      p = c.addTrack(p, t);
      // at 120 BPM, beat 2 is 1 s in: half a second of the file, from a quarter of a second into it
      p = c.addAudioClip(p, t.id, { start: 2, file: 'vox.wav', offset: 0.25, seconds: 0.5 });
      const asked: string[] = [];
      const instruments = await c.loadInstruments(p.tracks, undefined, undefined, (file) => {
        asked.push(file);
        const rate = 48000;
        const b = new AudioBuffer({ length: rate * 2, sampleRate: rate });
        const d = b.getChannelData(0);
        // silent for its first quarter second, so a clip that ignored its offset would start silent
        for (let i = rate / 4; i < d.length; i++) d[i] = 0.8 * Math.sin((2 * Math.PI * 220 * i) / rate);
        return Promise.resolve(b);
      });
      const buffer = await c.audioEngine.render(2.5, () => {
        let tick = () => {};
        c.playProject(p, instruments, {
          until: 8,
          ticker: (_ms: number, fn: () => void) => {
            tick = fn;
            return () => {};
          },
        });
        return () => tick();
      });
      const x = buffer.getChannelData(0),
        rate = buffer.sampleRate;
      const at = (s: number) => Math.floor((c.LEAD_IN + s) * rate);
      const rms = (a: number, b: number) => {
        let sum = 0;
        for (let i = at(a); i < at(b); i++) sum += x[i]! ** 2;
        return Math.sqrt(sum / (at(b) - at(a)));
      };
      let ups = 0;
      for (let i = at(1.1) + 1; i < at(1.4); i++) if (x[i - 1]! < 0 && x[i]! >= 0) ups++;
      return { before: rms(0, 0.95), during: rms(1.05, 1.45), after: rms(1.6, 2), hz: ups / 0.3, asked };
    });
    expect(heard.asked).toEqual(['vox.wav']);
    expect(heard.before).toBeLessThan(0.001);
    expect(heard.during).toBeGreaterThan(0.1);
    expect(heard.after).toBeLessThan(0.001);
    expect(heard.hz).toBeGreaterThan(205);
    expect(heard.hz).toBeLessThan(235);
  });

  test('an audio file dropped below the tracks becomes an audio track with a clip, kept when saved', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await dropBelow(page, 'tone.wav', wav(220, 1));
    await expect(trackHeader(page, 'tone')).toBeVisible();
    await expect(trackHeader(page, 'tone')).toContainText('Audio');
    // the clip's waveform: the lane's canvas has the sine drawn in it
    const lane = page.locator('.lane.audio canvas');
    await expect
      .poll(() =>
        lane.evaluate((c: HTMLCanvasElement) => {
          const g = c.getContext('2d');
          if (!g) return 0;
          const px = g.getImageData(0, 0, c.width, c.height).data;
          let drawn = 0;
          for (let i = 3; i < px.length; i += 4) if (px[i]! > 0) drawn++;
          return drawn;
        }),
      )
      .toBeGreaterThan(200);

    await saveAs(page, 'Tone');
    const saved = JSON.parse((await storedProject(page, 'Tone')) ?? '{}') as {
      tracks: { name: string; kind?: string; audio?: { file: string; start: number; seconds: number }[] }[];
    };
    const track = saved.tracks.find((t) => t.name === 'tone');
    expect(track?.kind).toBe('audio');
    expect(track?.audio).toHaveLength(1);
    expect(track?.audio?.[0]).toMatchObject({ file: 'tone.wav', start: 0 });
    expect(track?.audio?.[0]?.seconds).toBeCloseTo(1, 2);
    expect(await storedKey(page, 'audio:Tone:tone.wav')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a clip is moved, trimmed, faded, muted, copied and deleted with the mouse and keys', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await dropBelow(page, 'tone.wav', wav(220, 2));
    await expect(trackHeader(page, 'tone')).toBeVisible();
    // 2 s at 120 BPM: beats 0 to 4
    await expect.poll(async () => (await clipSpans(page)).length).toBe(1);
    const [a0, b0] = (await clipSpans(page))[0]!;
    const ppb = (b0 - a0 + 2) / 4;
    const lane = (await page.locator('.lane.audio').first().boundingBox())!;
    const body = lane.y + lane.height - 8,
      strip = lane.y + 6;

    // drag the clip 2 beats later
    await drag(page, [a0 + 1.5 * ppb, body], [a0 + 3.5 * ppb, body]);
    await expect.poll(async () => (await clipSpans(page))[0]![0]).toBeCloseTo(a0 + 2 * ppb, -1);
    // drag its right edge a beat earlier: beats 2 to 5
    const end = a0 + 6 * ppb - 2;
    await drag(page, [end, body], [end - ppb, body]);
    await expect.poll(async () => (await clipSpans(page))[0]![1]).toBeCloseTo(a0 + 5 * ppb, -1);
    // drag its fade-in square from the clip's start a beat in: half a second
    const start = a0 + 2 * ppb + 2;
    await drag(page, [start, strip], [start + ppb, strip]);
    await page.keyboard.press('KeyM');
    // Alt-drag a copy 4 beats on, then delete it and take that back
    await drag(page, [start + 1.5 * ppb, body], [start + 5.5 * ppb, body], true);
    await expect.poll(async () => (await clipSpans(page)).length).toBe(2);
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await clipSpans(page)).length).toBe(1);
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect.poll(async () => (await clipSpans(page)).length).toBe(2);

    await saveAs(page, 'Edited');
    const saved = JSON.parse((await storedProject(page, 'Edited')) ?? '{}') as {
      tracks: {
        name: string;
        audio?: { start: number; offset: number; seconds: number; fadeIn: number; mute?: boolean }[];
      }[];
    };
    const clips = saved.tracks.find((t) => t.name === 'tone')?.audio ?? [];
    expect(clips).toHaveLength(2);
    for (const [c, at] of [
      [clips[0], 2],
      [clips[1], 6],
    ] as const) {
      expect(c?.start).toBe(at);
      expect(c?.offset).toBe(0);
      expect(c?.seconds).toBeCloseTo(1.5, 2);
      expect(c?.fadeIn).toBeCloseTo(0.5, 1);
      expect(c?.mute).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});
