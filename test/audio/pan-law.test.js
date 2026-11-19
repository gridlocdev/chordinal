// The mixer's pan law (audit: panning a track made it up to 6 dB louder on the near side, because the stereo panner
// added the far channel into the near one). A centred part now keeps its power wherever it's panned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { panGains, panCurves } from '../../src/audio/mixer.js';

const near = (a, b, what)=> assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

test('centre leaves both sides as they are; hard left is √2 and 0, hard right 0 and √2', ()=>
{
    const [l, r] = panGains(0);
    near(l, 1, 'left'); near(r, 1, 'right');
    near(panGains(-1)[0], Math.SQRT2, 'hard left'); near(panGains(-1)[1], 0, 'hard left, right side');
    near(panGains(1)[0], 0, 'hard right, left side'); near(panGains(1)[1], Math.SQRT2, 'hard right');
});

test('a centred part has the same power at every pan, and never louder than +3 dB on one side', ()=>
{
    for (let pan = -1; pan <= 1; pan += 0.05)
    {
        const [l, r] = panGains(pan);
        near(l * l + r * r, 2, `power at ${pan.toFixed(2)}`);
        assert.ok(Math.max(l, r) <= Math.SQRT2 + 1e-9);
    }
    near(panGains(5)[0], panGains(1)[0], 'past the ends it holds at the end');
});

test('the wave-shaper curves follow the law from -1 to 1', ()=>
{
    const [left, right] = panCurves();
    assert.equal(left.length, right.length);
    const mid = (left.length - 1) / 2;
    near(left[mid], 1, 'middle'); near(right[0], 0, 'hard left'); near(left.at(-1), 0, 'hard right');
});
