// Changing the base tempo back and forth leaves the later tempo changes where they were (audit: each change rounded
// every scaled tempo to hundredths, so after 30 changes a ramp's 141 had drifted to 141.01).
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../../src/daw/project.js';
import { setTempo, setTempoAt } from '../../src/daw/timeline.js';

test('changing the base tempo many times, then back, leaves the other tempos as they were', ()=>
{
    let p = setTempoAt(setTempoAt(emptyProject({ bpm: 120 }), 16, 141, { ramp: false }), 0, 120, { ramp: true });
    p = setTempoAt(p, 32, 97);
    const before = p.tempoMap;
    for (let i = 0; i < 30; i++) p = setTempo(p, 61 + (i * 37) % 120);
    p = setTempo(p, 120);
    assert.equal(p.tempoMap.length, before.length);
    p.tempoMap.forEach((s, i)=>
    {
        assert.ok(Math.abs(s.bpm - before[i].bpm) < 1e-4, `${s.bpm} vs ${before[i].bpm}`);
        if (before[i].to !== undefined) assert.ok(Math.abs(s.to - before[i].to) < 1e-4, `to ${s.to} vs ${before[i].to}`);
    });
    assert.equal(p.tempoMap[0].bpm, 120);
    assert.equal(setTempo(p, 97.5).tempoMap[0].bpm, 97.5, 'the base tempo is the one typed');
});
