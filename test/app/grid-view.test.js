import test from 'node:test';
import assert from 'node:assert/strict';
import { gridGeometry, lineKind, playheadStep, betweenCells, GRID_GUTTER } from '../../src/app/components/grid-view.js';

test('cells under the pointer (PRD §4.5)', ()=>
{
    const G = gridGeometry(GRID_GUTTER + 160, 200, 10, 16);
    assert.equal(G.colW, 10);
    assert.equal(G.rowH, 20);
    assert.deepEqual(G.at(GRID_GUTTER + 15, 25), { row: 1, col: 1 });
    assert.deepEqual(G.at(5, 25), { row: 1, col: -1 }, 'the gutter: a row, no step');
    assert.equal(G.at(GRID_GUTTER + 15, 201), null);
    assert.equal(G.at(GRID_GUTTER + 165, 5), null);
    assert.equal(gridGeometry(400, 1000, 4, 16).rowH, 24, 'rows grow no taller than 24px');
    assert.equal(gridGeometry(400, 50, 20, 16).rowH, 12, 'nor shorter than 12px');
});

test('bar, beat and step lines', ()=>
{
    const four = [{ beat: 0, sig: '4/4' }];
    assert.deepEqual([0, 0.25, 1, 4].map(b => lineKind(b, four)), ['bar', 'step', 'beat', 'bar']);
    assert.deepEqual([0, 1 / 6, 1, 4].map(b => lineKind(b, four)), ['bar', 'step', 'beat', 'bar'], 'triplet steps');
    assert.equal(lineKind(3, [{ beat: 0, sig: '3/4' }]), 'bar', '3/4');
    assert.equal(lineKind(6, four), 'beat', 'a clip starting mid-bar keeps the song bar lines');
    assert.equal(lineKind(10, [{ beat: 0, sig: '4/4' }, { beat: 8, sig: '3/4' }]), 'beat');
    assert.equal(lineKind(11, [{ beat: 0, sig: '4/4' }, { beat: 8, sig: '3/4' }]), 'bar', 'after a meter change');
});

test('the playhead step, in any clip of the pattern (PRD §4.11)', ()=>
{
    const clips = [{ start: 0, beats: 4 }, { start: 8, beats: 4 }, { start: 12, beats: 4, mute: true }];
    assert.equal(playheadStep(clips, 1.3, 0.25, 16), 5);
    assert.equal(playheadStep(clips, 9, 0.25, 16), 4);
    assert.equal(playheadStep(clips, 5, 0.25, 16), -1);
    assert.equal(playheadStep(clips, 13, 0.25, 16), -1, 'a muted clip isn\'t heard');
});

test('a drag that jumps cells paints every cell between', ()=>
{
    assert.deepEqual(betweenCells({ row: 0, col: 0 }, { row: 0, col: 3 }), [[0, 1], [0, 2], [0, 3]]);
    assert.deepEqual(betweenCells({ row: 2, col: 5 }, { row: 0, col: 5 }), [[1, 5], [0, 5]]);
    assert.deepEqual(betweenCells({ row: 1, col: 1 }, { row: 1, col: 1 }), []);
    assert.equal(betweenCells({ row: 0, col: 0 }, { row: 2, col: 8 }).length, 8);
});
