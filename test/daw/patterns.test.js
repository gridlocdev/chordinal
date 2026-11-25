import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip, updateClip, removeClip, moveClip, splitAt, joinClips,
    duplicateTrack, findClip, makePattern, makeUnique, renamePattern, nextPatternName, patternProblems, trackNotes } from '@chordinal/daw';
import { insertTime, deleteTime } from '@chordinal/daw';
import { scaleNotes } from '@chordinal/daw';
import { history, commit } from '@chordinal/daw';
import { writeProject, readProject } from '@chordinal/daw';
import fs from 'node:fs';

const KICK = 36, SNARE = 38;
const round = (x)=> Math.round(x * 1e3) / 1e3;

function kit()
{
    let p = emptyProject({ title: 'Beat' });
    p = addTrack(p, makeTrack(p, { name: 'Drums', instrument: { bank: 128, program: 0 } }));
    p = addTrack(p, makeTrack(p, { name: 'Bass' }));
    const [drums, bass] = p.tracks.map(t => t.id);
    p = addClip(p, drums, { id: 'c1', start: 0, beats: 4, notes: [{ beat: 0, beats: 0.25, key: KICK, vel: 100 }, { beat: 1, beats: 0.25, key: SNARE, vel: 100 }] });
    p = makePattern(p, drums, 'c1', nextPatternName(p, 'Drums'));
    p = moveClip(p, drums, 'c1', drums, 4, true);
    p = moveClip(p, drums, 'c1', drums, 8, true);
    return { p, drums, bass };
}

const clipsOf = (p, id)=> p.tracks.find(t => t.id === id).clips;

test('a pattern clip and its copies share notes, length and step (PRD §3.2, §3.3, §3.5)', ()=>
{
    const { p, drums } = kit();
    const id = p.patterns[0].id;
    assert.deepEqual(p.patterns, [{ id, name: 'Drums 1' }]);
    assert.deepEqual(clipsOf(p, drums).map(c => [c.start, c.pattern]), [[0, id], [4, id], [8, id]]);
    const edited = updateClip(p, drums, clipsOf(p, drums)[1].id, c => ({ ...c, step: 0.125, notes: [...c.notes, { beat: 2, beats: 0.25, key: KICK, vel: 127 }] }));
    for (const c of clipsOf(edited, drums)) assert.deepEqual([c.notes.length, c.step, c.beats], [3, 0.125, 4]);
    assert.deepEqual(patternProblems(edited), []);
    const moved = updateClip(p, drums, 'c1', { start: 12, mute: true });
    assert.deepEqual(clipsOf(moved, drums).map(c => [c.start, !!c.mute]), [[4, false], [8, false], [12, true]], 'start and mute are each clip\'s own (PRD §3.9)');
});

test('make unique, rename and cutting a pattern clip (PRD §3.6–3.8)', ()=>
{
    const { p, drums } = kit();
    const [a, b] = clipsOf(p, drums);
    const unique = makeUnique(p, drums, b.id);
    assert.equal(findClip(unique, drums, b.id).pattern, undefined);
    assert.deepEqual(findClip(unique, drums, b.id).notes, b.notes);
    assert.equal(makeUnique(unique, drums, b.id), unique, 'an ordinary clip: nothing changes');
    const after = updateClip(unique, drums, a.id, { notes: [] });
    assert.equal(findClip(after, drums, b.id).notes.length, 2, 'the unique clip no longer follows the pattern');

    assert.equal(renamePattern(p, p.patterns[0].id, 'Verse beat').patterns[0].name, 'Verse beat');
    assert.equal(renamePattern(p, p.patterns[0].id, '  '), p);
    assert.equal(renamePattern(p, p.patterns[0].id, 'Drums 1'), p);

    const id = p.patterns[0].id;
    const split = splitAt(p, 6);
    assert.deepEqual(clipsOf(split, drums).map(c => [c.start, c.beats, c.pattern ?? null]), [[0, 4, id], [4, 2, null], [6, 2, null], [8, 4, id]]);
    assert.equal(findClip(split, drums, 'c1').notes.length, 2, 'the other clips keep the whole pattern');
    const joined = joinClips(p, drums, clipsOf(p, drums).slice(0, 2).map(c => c.id));
    assert.deepEqual(clipsOf(joined, drums).map(c => c.pattern ?? null), [null, id]);
});

test('a project with patterns writes as version 2 and reads back the same (PRD §7)', ()=>
{
    const { p, drums } = kit();
    const text = writeProject(p);
    const file = JSON.parse(text.replace(/\n/g, ''));
    const id = p.patterns[0].id;
    assert.equal(file.version, 2);
    assert.deepEqual(file.patterns.map(x => [x.id, x.name, x.beats, x.notes.length]), [[id, 'Drums 1', 4, 2]]);
    assert.deepEqual(file.tracks[0].clips[1], { id: clipsOf(p, drums)[1].id, start: 4, pattern: id });
    assert.deepEqual(readProject(text), p);
    assert.match(text, /\[1,0\.25,38,100\]/, 'pattern notes keep the one-line form');

    const gone = clipsOf(p, drums).reduce((q, c)=> removeClip(q, drums, c.id), p);
    const plain = JSON.parse(writeProject(gone));
    assert.equal(plain.version, 1, 'no pattern clips: version 1 (PRD §7.1, §3.11)');
    assert.equal(plain.patterns, undefined);

    const broken = text.replace('"patterns": [', '"unused": [');
    assert.throws(()=> readProject(broken), new RegExp(`clip c1 plays pattern ${id}, which the project doesn't have`));
    assert.throws(()=> readProject(JSON.stringify({ format: 'music-generator-project', version: 4 })), /version 4; this app reads versions 1 to 3/);
});

test('projects without patterns stay version 1 (PRD §8)', ()=>
{
    const dir = new URL('../fixtures/projects/', import.meta.url);
    for (const name of fs.readdirSync(dir))
    {
        const project = readProject(fs.readFileSync(new URL(`${name}/project.json`, dir), 'utf8'));
        assert.equal(project.patterns, undefined);
        const text = writeProject(project);
        assert.equal(JSON.parse(text).version, 1);
        const rounded = (p)=> p.tracks.map(t => trackNotes(t).map(n => [round(n.beat), round(n.beats), n.key, n.vel]));
        assert.deepEqual(rounded(readProject(text)), rounded(project));
    }
});

// ── random edits ────────────────────────────────────────────────────────────────────────────────────────────────────

/** a small seeded generator (mulberry32), so a failing run can be repeated */
function seeded(seed)
{
    let a = seed >>> 0;
    return ()=>
    {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const OPS = [
    ['add a note', (p, r, pick)=> { const [t, c] = pick(); return c ? updateClip(p, t.id, c.id, x => ({ ...x, notes: [...x.notes, { beat: Math.floor(r() * 16) / 4, beats: 0.25, key: KICK + Math.floor(r() * 10), vel: 100 }] })) : p; }],
    ['clear notes', (p, r, pick)=> { const [t, c] = pick(); return c ? updateClip(p, t.id, c.id, { notes: [] }) : p; }],
    ['change length', (p, r, pick)=> { const [t, c] = pick(); return c ? updateClip(p, t.id, c.id, { beats: 2 + Math.floor(r() * 4) * 2 }) : p; }],
    ['change step', (p, r, pick)=> { const [t, c] = pick(); return c ? updateClip(p, t.id, c.id, { step: [0.5, 0.25, 0.125][Math.floor(r() * 3)] }) : p; }],
    ['double speed', (p, r, pick)=> { const [t, c] = pick(); return c ? updateClip(p, t.id, c.id, x => ({ ...x, beats: x.beats / 2, notes: scaleNotes(x.notes, 0.5) })) : p; }],
    ['copy', (p, r, pick)=> { const [t, c] = pick(); return c ? moveClip(p, t.id, c.id, p.tracks[Math.floor(r() * p.tracks.length)].id, Math.floor(r() * 32), true) : p; }],
    ['move', (p, r, pick)=> { const [t, c] = pick(); return c ? moveClip(p, t.id, c.id, t.id, Math.floor(r() * 32)) : p; }],
    ['delete', (p, r, pick)=> { const [t, c] = pick(); return c ? removeClip(p, t.id, c.id) : p; }],
    ['make pattern', (p, r, pick)=> { const [t, c] = pick(); return c ? makePattern(p, t.id, c.id, nextPatternName(p, t.name)) : p; }],
    ['make unique', (p, r, pick)=> { const [t, c] = pick(); return c ? makeUnique(p, t.id, c.id) : p; }],
    ['split', (p, r)=> splitAt(p, Math.floor(r() * 64) / 2)],
    ['join', (p, r, pick)=> { const [t] = pick(); return joinClips(p, t.id, t.clips.slice(0, 2).map(c => c.id)); }],
    ['insert bars', (p, r)=> insertTime(p, Math.floor(r() * 8) * 4, 4)],
    ['delete bars', (p, r)=> { const at = Math.floor(r() * 8) * 4; return deleteTime(p, at, at + 4); }],
    ['duplicate track', (p, r, pick)=> p.tracks.length < 4 ? duplicateTrack(p, pick()[0].id) : p],
];

test('seeded random edits keep every pattern\'s clips alike and survive a save (PRD §3.2)', ()=>
{
    for (let seed = 1; seed <= 60; seed++)
    {
        const r = seeded(seed);
        let { p } = kit();
        let h = history(p);
        const log = [];
        const pick = ()=>
        {
            const t = p.tracks[Math.floor(r() * p.tracks.length)];
            return [t, t.clips.length ? t.clips[Math.floor(r() * t.clips.length)] : null];
        };
        for (let step = 0; step < 40; step++)
        {
            const [name, op] = OPS[Math.floor(r() * OPS.length)];
            log.push(name);
            p = op(p, r, pick);
            h = commit(h, p);
            assert.deepEqual(patternProblems(p), [], `seed ${seed} after ${log.join(', ')}`);
        }
        const back = readProject(writeProject(p));
        assert.deepEqual(patternProblems(back), [], `seed ${seed}: read back`);
        assert.deepEqual(back.tracks.map(trackNotes), readProject(writeProject(p)).tracks.map(trackNotes));
        assert.deepEqual(back.tracks.map(t => t.clips.map(c => [c.id, c.start, c.beats, c.pattern ?? null])),
            p.tracks.map(t => t.clips.map(c => [c.id, c.start, Math.round(c.beats * 1e4) / 1e4, c.pattern ?? null])), `seed ${seed}: clips read back`);
    }
});

test('a pasted pattern clip follows its pattern, or is ordinary where the pattern is missing (PRD §3.5)', ()=>
{
    const { p, drums } = kit();
    const stale = { ...clipsOf(p, drums)[0], id: 'c9', start: 20, notes: [] };
    const pasted = addClip(p, drums, stale);
    assert.equal(findClip(pasted, drums, 'c9').notes.length, 2, 'the pattern\'s notes, not the clipboard\'s');
    const elsewhere = addClip(emptyProjectWith(drums), drums, stale);
    assert.equal(findClip(elsewhere, drums, 'c9').pattern, undefined);
});

function emptyProjectWith(trackId)
{
    const p = emptyProject();
    return { ...p, tracks: [{ ...makeTrack(p, { name: 'Drums' }), id: trackId }] };
}

test('a pattern clip copied from one project and pasted into another never joins an unrelated pattern (PRD §3.5)', ()=>
{
    const a = kit(), b = kit();
    const copied = clipsOf(a.p, a.drums)[0];
    assert.notEqual(a.p.patterns[0].id, b.p.patterns[0].id, 'every new pattern gets its own id');
    const pasted = addClip(b.p, b.drums, { ...copied, id: 'pasted', start: 16, notes: [] });
    assert.equal(findClip(pasted, b.drums, 'pasted').pattern, undefined, 'pasted as an ordinary clip');

    // undo drops a pattern; the next one made must not reuse its id, or an old copy would join it
    const { p, drums } = kit();
    const old = p.patterns[0].id;
    let q = clipsOf(p, drums).reduce((x, c)=> makeUnique(x, drums, c.id), p);
    q = { ...q, patterns: [] };
    q = makePattern(q, drums, 'c1', 'Drums 1');
    assert.notEqual(q.patterns[0].id, old);
});
