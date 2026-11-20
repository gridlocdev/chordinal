// While playing, the step grid redraws once a step, not on every frame (audit: it read the playhead's beat, so the
// whole grid was drawn again on every animation frame of playback).
import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, effect } from '@preact/signals';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

const { playingStep } = await import('../../src/ui/steps.js');
const { beat, playing } = await import('../../src/ui/store.js');

test('a frame of playback inside one step changes nothing the grid draws from', ()=>
{
    const clip = { id: 'c1', start: 0, beats: 4, step: 0.25, notes: [] };
    const now = computed(()=> playingStep(clip));
    let draws = 0;
    const stop = effect(()=> { now.value; draws++; });
    playing.value = true;
    try
    {
        const after = draws;
        for (let f = 0; f < 60; f++) beat.value = f / 60;      // a beat of 60 frames: 4 steps
        assert.equal(draws - after, 3, 'once on entering each of steps 1, 2 and 3');
        assert.equal(now.value, 3);
        beat.value = 5;
        assert.equal(now.value, -1, 'past the clip');
    }
    finally { stop(); playing.value = false; beat.value = 0; }
    assert.equal(now.value, -1, 'stopped');
});
