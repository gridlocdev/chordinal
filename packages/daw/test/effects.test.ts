// Track effects: the list of effect types and their settings, and the edits to a track's inserts.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, readProject, writeProject } from '@chordinal/daw';
import {
  EFFECTS,
  EFFECT_TYPES,
  addInsert,
  insertValue,
  insertValues,
  moveInsert,
  paramText,
  removeInsert,
  setInsertBypass,
  setInsertParams,
  trackLanes,
  laneParam,
  addKeyframe,
  insertsAt,
  MASTER,
} from '@chordinal/daw';
import type { Project } from '@chordinal/daw';

function oneTrack(): Project {
  const p = emptyProject();
  return addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't' });
}
const inserts = (p: Project) => p.tracks[0]!.inserts;

test('every effect type has settings whose starting values are in range', () => {
  assert.deepEqual(
    EFFECTS.map((e) => e.type),
    [...EFFECT_TYPES],
  );
  for (const e of EFFECTS) {
    assert.ok(e.params.length, e.type);
    assert.equal(
      new Set(e.params.map((p) => p.id)).size,
      e.params.length,
      `${e.type}'s settings have their own ids`,
    );
    for (const p of e.params) {
      assert.ok(p.min <= p.value && p.value <= p.max, `${e.type}.${p.id}`);
      if (p.choices) assert.equal(p.max, p.choices.length - 1);
      if (p.scale === 'log')
        assert.ok(p.min > 0, `${e.type}.${p.id} is drawn on octaves, so it stays above 0`);
      assert.ok(!p.id.includes('.'), 'a lane is `<insert>.<setting>`');
    }
  }
});

test('a track with no effects saves as before, and one with effects reads back the same', () => {
  const p = oneTrack();
  assert.equal(inserts(p), undefined);
  assert.ok(!writeProject(p).includes('inserts'));
  let q = addInsert(p, 't', 'eq');
  q = setInsertParams(q, 't', 'fx1', { low: 3 });
  assert.deepEqual(readProject(writeProject(q)).tracks[0]!.inserts, inserts(q));
});

test('effects are added at the end or in place, with ids of their own, and moved and removed', () => {
  let p = oneTrack();
  p = addInsert(p, 't', 'eq');
  p = addInsert(p, 't', 'compressor');
  p = addInsert(p, 't', 'reverb', 0);
  assert.deepEqual(
    inserts(p)?.map((x) => `${x.id}:${x.type}`),
    ['fx3:reverb', 'fx1:eq', 'fx2:compressor'],
  );
  p = moveInsert(p, 't', 'fx3', 2);
  assert.deepEqual(
    inserts(p)?.map((x) => x.id),
    ['fx1', 'fx2', 'fx3'],
  );
  assert.equal(moveInsert(p, 't', 'fx1', 0), p, 'a move to where it is changes nothing');
  p = removeInsert(p, 't', 'fx2');
  assert.deepEqual(
    inserts(p)?.map((x) => x.id),
    ['fx1', 'fx3'],
  );
  p = addInsert(p, 't', 'gain');
  assert.equal(inserts(p)?.[2]?.id, 'fx2', 'a freed id is used again');
  p = removeInsert(removeInsert(removeInsert(p, 't', 'fx1'), 't', 'fx2'), 't', 'fx3');
  assert.equal(inserts(p), undefined, 'with the last one gone, the track saves as it did');
});

test('removing an effect removes the automation of its settings', () => {
  let p = addInsert(oneTrack(), 't', 'filter');
  p = {
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      automation: {
        tone: [{ beat: 0, value: 500, curve: 'set' as const }],
        'fx1.cutoff': [{ beat: 0, value: 300, curve: 'set' as const }],
      },
    })),
  };
  p = removeInsert(p, 't', 'fx1');
  assert.deepEqual(Object.keys(p.tracks[0]!.automation), ['tone']);
});

test('settings are kept in range, choices are whole, and a bypass can be turned on and off', () => {
  let p = addInsert(oneTrack(), 't', 'filter');
  p = setInsertParams(p, 't', 'fx1', { cutoff: 99999, mode: 1.4 });
  const x = inserts(p)![0]!;
  assert.equal(insertValue(x, 'cutoff'), 20000);
  assert.equal(insertValue(x, 'mode'), 1);
  assert.equal(insertValue(x, 'resonance'), 1, 'a setting not changed has its starting value');
  assert.deepEqual(Object.keys(insertValues(x)), ['mode', 'cutoff', 'resonance']);
  assert.equal(
    setInsertParams(p, 't', 'fx1', { cutoff: 20000 }),
    p,
    'setting a value it has changes nothing',
  );
  p = setInsertBypass(p, 't', 'fx1', true);
  assert.equal(inserts(p)![0]!.bypass, true);
  p = setInsertBypass(p, 't', 'fx1', false);
  assert.equal('bypass' in inserts(p)![0]!, false);
});

test('settings read in their units', () => {
  const eq = EFFECTS.find((e) => e.type === 'eq')!;
  const at = (id: string) => eq.params.find((p) => p.id === id)!;
  assert.equal(paramText(at('low'), -6), '−6.0 dB');
  assert.equal(paramText(at('midFreq'), 1200), '1.20 kHz');
  assert.equal(paramText(at('lowFreq'), 150), '150 Hz');
  const delay = EFFECTS.find((e) => e.type === 'delay')!;
  assert.equal(paramText(delay.params[0]!, 3), '1/8 D');
  assert.equal(
    paramText(
      delay.params.find((p) => p.id === 'mix')!,
      0.3,
    ),
    '30%',
  );
});

test("an effect's automatable settings are lanes of its track, kept in the setting's range", () => {
  let p = addInsert(addInsert(addInsert(oneTrack(), 't', 'filter'), 't', 'reverb'), 't', 'filter');
  const lanes = trackLanes(p.tracks[0]!).map((l) => l.id);
  assert.ok(lanes.includes('volume'), "the mixer's lanes come first");
  assert.ok(lanes.includes('fx1.cutoff') && lanes.includes('fx3.cutoff'));
  assert.ok(lanes.includes('fx2.mix') && !lanes.includes('fx2.size'), "a reverb's size can't be automated");
  const cutoff = laneParam('fx3.cutoff', p.tracks[0]);
  assert.equal(cutoff.label, 'Filter 2 Cutoff', 'two of a kind are numbered');
  assert.equal(cutoff.scale, 'log');
  assert.equal(cutoff.exp, true);
  assert.equal(cutoff.text?.(1200), '1.20 kHz');
  p = addKeyframe(p, 't', 'fx1.cutoff', 0, 99999);
  assert.equal(p.tracks[0]!.automation['fx1.cutoff']![0]!.value, 20000);
  p = setInsertParams(p, 't', 'fx2', { mix: 0.4 });
  assert.equal(
    laneParam('fx2.mix', p.tracks[0]).rest(p.tracks[0]!),
    0.4,
    "a lane rests at the effect's setting",
  );
});

test("the master's effects are edited as a track's are, saved on the project, and dropped when none are left", () => {
  let p = oneTrack();
  assert.deepEqual(insertsAt(p, MASTER), []);
  p = addInsert(p, MASTER, 'compressor');
  p = addInsert(p, MASTER, 'eq', 0);
  assert.deepEqual(
    p.masterInserts?.map((x) => `${x.id}:${x.type}`),
    ['fx2:eq', 'fx1:compressor'],
  );
  assert.equal(inserts(p), undefined, "the track's own chain is untouched");
  assert.equal(insertsAt(p, MASTER), p.masterInserts);
  p = moveInsert(p, MASTER, 'fx2', 1);
  p = setInsertParams(p, MASTER, 'fx1', { threshold: -30 });
  p = setInsertBypass(p, MASTER, 'fx2', true);
  assert.deepEqual(
    p.masterInserts?.map((x) => x.id),
    ['fx1', 'fx2'],
  );
  assert.equal(insertValue(p.masterInserts![0]!, 'threshold'), -30);
  assert.equal(p.masterInserts![1]!.bypass, true);
  assert.deepEqual(readProject(writeProject(p)).masterInserts, p.masterInserts);
  p = removeInsert(removeInsert(p, MASTER, 'fx1'), MASTER, 'fx2');
  assert.ok(!('masterInserts' in p));
  assert.ok(!writeProject(p).includes('masterInserts'));
});
