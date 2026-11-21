// The metronome's clicks follow the meter: one per beat unit (a quarter in x/4, an eighth in x/8), the first of each
// bar accented, across meter changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clickBeats } from '@chordinal/daw';

const show = (list)=> list.map(c => `${c.first ? '|' : ''}${c.beat}`).join(' ');

test('4/4 clicks every quarter, accenting each bar', ()=>
{
    assert.equal(show(clickBeats([{ beat: 0, sig: '4/4' }], 0, 8)), '|0 1 2 3 |4 5 6 7');
});

test('7/8 clicks every eighth and accents the bar starts, which fall between quarters', ()=>
{
    assert.equal(show(clickBeats([{ beat: 0, sig: '7/8' }], 0, 7)), '|0 0.5 1 1.5 2 2.5 3 |3.5 4 4.5 5 5.5 6 6.5');
});

test('6/8 clicks six eighths a bar; a meter change starts its own bar', ()=>
{
    const meters = [{ beat: 0, sig: '6/8' }, { beat: 3, sig: '3/4' }];
    assert.equal(show(clickBeats(meters, 0, 6)), '|0 0.5 1 1.5 2 2.5 |3 4 5');
});

test('only the clicks from `from` up to `to`', ()=>
{
    assert.equal(show(clickBeats([{ beat: 0, sig: '4/4' }], 2.5, 5)), '3 |4');
});
