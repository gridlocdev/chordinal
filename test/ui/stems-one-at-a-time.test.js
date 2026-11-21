// Stems are written one at a time, so a long song with many tracks never holds every stem in memory at once (audit:
// every stem was rendered before any was written). A normalized export still gives them all one gain.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

const { writeStems } = await import('@chordinal/ui');

/** stems whose peaks are `peaks`; logs each render and write, and how many rendered stems are still held */
function fake(peaks)
{
    const log = [], held = new Set();
    let most = 0;
    return {
        log, most: ()=> most,
        render: async (n)=>
        {
            log.push(`render ${n}`);
            const c = new Float32Array(4).fill(peaks[n]);
            held.add(n); most = Math.max(most, held.size);
            return { channels: [c, c], rate: 8000 };
        },
        write: async (n, bytes)=> { log.push(`write ${n}`); held.delete(n); return bytes; },
    };
}

/** the first sample of a 16-bit WAV */
const firstSample = (bytes)=> new DataView(bytes.buffer, bytes.byteOffset).getInt16(44, true);

test('each stem is written before the next is rendered', async ()=>
{
    const f = fake([0.5, 0.25, 0.1]);
    await writeStems({ count: 3, render: f.render, write: f.write, normalized: false, say: ()=> {} });
    assert.deepEqual(f.log, ['render 0', 'write 0', 'render 1', 'write 1', 'render 2', 'write 2']);
    assert.equal(f.most(), 1);
});

test('a normalized export measures every stem first, then writes each with the one gain', async ()=>
{
    const f = fake([0.5, 0.25]);
    const written = [];
    const said = [];
    await writeStems({ count: 2, render: f.render, write: async (n, b)=> { written[n] = b; }, normalized: true, say: (n, m)=> said.push([n, m]) });
    assert.deepEqual(said, [[0, true], [1, true], [0, false], [1, false]]);
    const top = Math.round(10 ** (-1 / 20) * 32767);
    assert.ok(Math.abs(firstSample(written[0]) - top) <= 1, 'the loudest stem peaks at −1 dB');
    assert.ok(Math.abs(firstSample(written[1]) - top / 2) <= 1, 'the quieter one keeps its balance');
});
