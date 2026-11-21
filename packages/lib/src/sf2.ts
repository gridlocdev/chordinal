// SoundFont 2 (.sf2) parser. Pure: takes an ArrayBuffer, returns presets resolved to playable regions.
// No engine, no DOM, no Web Audio, so it runs under node --test and in tools/.
//
// parseSf2(buffer) → {
//   name,                               INFO/INAM
//   sampleData: Int16Array,             all 16-bit sample frames (sdta/smpl)
//   samples: [{ name, start, end, loopStart, loopEnd, sampleRate, originalPitch, pitchCorrection, type }],
//   presets: [{ name, bank, program, regions: [region] }],   sorted by bank, program
// }
// A region is one sample played over a key/velocity range:
//   { keyLo, keyHi, velLo, velHi, sample, gen: Int16Array(61), mods: [mod] }  where gen holds final generator values
//   (instrument value + preset offset), indexed by GEN ids below, and mods are the zone's modulators:
//   { src, dest, amount, amountSrc }, src and amountSrc in the spec's 16-bit source encoding (SF2.04 §8.2).
//   An instrument's local modulator replaces its global zone's identical one (same src, dest, amountSrc); the
//   preset's modulators are added after the instrument's, as offsets.

export const GEN = {
  startAddrsOffset: 0,
  endAddrsOffset: 1,
  startloopAddrsOffset: 2,
  endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4,
  initialFilterFc: 8,
  initialFilterQ: 9,
  modEnvToFilterFc: 11,
  endAddrsCoarseOffset: 12,
  pan: 17,
  delayModEnv: 25,
  attackModEnv: 26,
  holdModEnv: 27,
  decayModEnv: 28,
  sustainModEnv: 29,
  releaseModEnv: 30,
  keynumToModEnvHold: 31,
  keynumToModEnvDecay: 32,
  delayVolEnv: 33,
  attackVolEnv: 34,
  holdVolEnv: 35,
  decayVolEnv: 36,
  sustainVolEnv: 37,
  releaseVolEnv: 38,
  keynumToVolEnvHold: 39,
  keynumToVolEnvDecay: 40,
  instrument: 41,
  keyRange: 43,
  velRange: 44,
  startloopAddrsCoarseOffset: 45,
  keynum: 46,
  velocity: 47,
  initialAttenuation: 48,
  endloopAddrsCoarseOffset: 50,
  coarseTune: 51,
  fineTune: 52,
  sampleID: 53,
  sampleModes: 54,
  scaleTuning: 56,
  exclusiveClass: 57,
  overridingRootKey: 58,
} as const;
const GEN_COUNT = 61;

/** a sample header: frames are absolute indexes into the font's sampleData */
export interface Sf2Sample {
  name: string;
  start: number;
  end: number;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
  originalPitch: number;
  pitchCorrection: number;
  type: number;
}

/** a modulator: src and amountSrc in the spec's 16-bit source encoding (SF2.04 §8.2) */
export interface Sf2Modulator {
  src: number;
  dest: number;
  amount: number;
  amountSrc: number;
}

/** one sample played over a key/velocity range, with its final generator values indexed by GEN ids */
export interface Sf2Region {
  keyLo: number;
  keyHi: number;
  velLo: number;
  velHi: number;
  sample: Sf2Sample;
  gen: Int16Array;
  mods: Sf2Modulator[];
}

export interface Sf2Preset {
  name: string;
  bank: number;
  program: number;
  regions: Sf2Region[];
}

/** a parsed font, or one built in code in the same shape (chip-synth.ts) */
export interface Sf2Font {
  name: string;
  sampleData: Int16Array;
  samples: Sf2Sample[];
  presets: Sf2Preset[];
}

// spec defaults (SF2.04 §8.1.3); everything not listed defaults to 0
const DEFAULTS = new Int16Array(GEN_COUNT);
DEFAULTS[GEN.initialFilterFc] = 13500;
for (const g of [21, 23, 25, 26, 27, 28, 30, 33, 34, 35, 36, 38]) DEFAULTS[g] = -12000; // envelope/LFO times
DEFAULTS[GEN.scaleTuning] = 100;
DEFAULTS[GEN.overridingRootKey] = -1;
DEFAULTS[GEN.keynum] = -1;
DEFAULTS[GEN.velocity] = -1;

/** a fresh generator list holding the spec defaults, for building regions in code */
export const defaultGenerators = (): Int16Array => Int16Array.from(DEFAULTS);

// generators a preset zone may not set, or that don't add (ranges are intersected separately)
const NOT_ADDITIVE = new Set([0, 1, 2, 3, 4, 12, 41, 43, 44, 45, 46, 47, 50, 53, 54, 57, 58]);

type Range = [number, number];

// one zone of a preset or instrument
interface Zone {
  gens: Map<number, number>;
  mods: Sf2Modulator[];
  key: Range | null;
  vel: Range | null;
}

interface Bag {
  gen: number;
  mod: number;
}

interface Generator {
  op: number;
  amount: number;
  lo: number;
  hi: number;
}

interface Split {
  global: Zone | null;
  local: Zone[];
}

export function parseSf2(buffer: ArrayBuffer): Sf2Font {
  const view = new DataView(buffer);
  const tag = (o: number) =>
    String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'sfbk') throw new Error('not a SoundFont 2 file');

  // collect the sub-chunks of each top-level LIST (INFO, sdta, pdta) by id
  const chunks = new Map<string, { offset: number; size: number }>();
  for (let o = 12; o + 8 <= view.byteLength;) {
    const size = view.getUint32(o + 4, true);
    if (tag(o) === 'LIST') {
      for (let c = o + 12, end = o + 8 + size; c + 8 <= end;) {
        const csize = view.getUint32(c + 4, true);
        chunks.set(tag(c), { offset: c + 8, size: csize });
        c += 8 + csize + (csize & 1);
      }
    }
    o += 8 + size + (size & 1);
  }
  const chunk = (id: string) => {
    const c = chunks.get(id);
    if (!c) throw new Error(`SoundFont is missing its ${id} chunk`);
    return c;
  };
  for (const id of ['smpl', 'phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr']) chunk(id);

  const text = (o: number, n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = view.getUint8(o + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  // fixed-size records; the last one in each list is a terminator that only bounds the one before it
  const records = <R>(id: string, size: number, read: (o: number) => R): R[] => {
    const { offset, size: total } = chunk(id);
    const out: R[] = [];
    for (let i = 0; i < total / size; i++) out.push(read(offset + i * size));
    return out;
  };

  const smpl = chunk('smpl');
  // Int16Array needs an even byte offset; RIFF word alignment gives one, but copy if a file breaks the rule
  const sampleData =
    smpl.offset % 2 === 0
      ? new Int16Array(buffer, smpl.offset, smpl.size >> 1)
      : new Int16Array(buffer.slice(smpl.offset, smpl.offset + (smpl.size & ~1)));

  const phdr = records('phdr', 38, (o) => ({
    name: text(o, 20),
    program: view.getUint16(o + 20, true),
    bank: view.getUint16(o + 22, true),
    bag: view.getUint16(o + 24, true),
  }));
  const bag = (o: number): Bag => ({ gen: view.getUint16(o, true), mod: view.getUint16(o + 2, true) });
  const gen = (o: number): Generator => ({
    op: view.getUint16(o, true),
    amount: view.getInt16(o + 2, true),
    lo: view.getUint8(o + 2),
    hi: view.getUint8(o + 3),
  });
  const pbag = records('pbag', 4, bag);
  const pgen = records('pgen', 4, gen);
  const inst = records('inst', 22, (o) => ({ name: text(o, 20), bag: view.getUint16(o + 20, true) }));
  const ibag = records('ibag', 4, bag);
  const igen = records('igen', 4, gen);
  // modulator lists are optional; a font without them plays with the defaults
  const mod = (o: number): Sf2Modulator => ({
    src: view.getUint16(o, true),
    dest: view.getUint16(o + 2, true),
    amount: view.getInt16(o + 4, true),
    amountSrc: view.getUint16(o + 6, true),
  });
  const pmod = chunks.has('pmod') ? records('pmod', 10, mod) : [];
  const imod = chunks.has('imod') ? records('imod', 10, mod) : [];
  const samples = records('shdr', 46, (o): Sf2Sample => ({
    name: text(o, 20),
    start: view.getUint32(o + 20, true),
    end: view.getUint32(o + 24, true),
    loopStart: view.getUint32(o + 28, true),
    loopEnd: view.getUint32(o + 32, true),
    sampleRate: view.getUint32(o + 36, true),
    originalPitch: view.getUint8(o + 40),
    pitchCorrection: view.getInt8(o + 41),
    type: view.getUint16(o + 44, true),
  })).slice(0, -1);

  // zones of one preset or instrument
  const zones = (bags: Bag[], gens: Generator[], mods: Sf2Modulator[], from: number, to: number): Zone[] => {
    const out: Zone[] = [];
    for (let b = from; b < to; b++) {
      const here = bags[b],
        next = bags[b + 1];
      if (!here || !next) throw new Error('SoundFont zone list is cut short');
      const z: Zone = {
        gens: new Map(),
        mods: mods.slice(here.mod, next.mod).filter((m) => m.src || m.dest || m.amount || m.amountSrc),
        key: null,
        vel: null,
      };
      for (const { op, amount, lo, hi } of gens.slice(here.gen, next.gen)) {
        if (op === GEN.keyRange) z.key = [lo, hi];
        else if (op === GEN.velRange) z.vel = [lo, hi];
        else z.gens.set(op, amount);
      }
      out.push(z);
    }
    return out;
  };
  // a first zone without its terminal generator (instrument / sampleID) is the global zone
  const splitGlobal = (list: Zone[], terminal: number): Split => {
    const [head] = list;
    return head && !head.gens.has(terminal)
      ? { global: head, local: list.slice(1) }
      : { global: null, local: list };
  };
  // the index of the bag that ends a record's zones: the next record's first
  const nextBag = (list: { bag: number }[], i: number) => list[i + 1]?.bag ?? 0;

  const instruments = inst
    .slice(0, -1)
    .map((ins, i) => splitGlobal(zones(ibag, igen, imod, ins.bag, nextBag(inst, i)), GEN.sampleID));

  const presets = phdr
    .slice(0, -1)
    .map((p, i): Sf2Preset => {
      const { global: pGlobal, local: pZones } = splitGlobal(
        zones(pbag, pgen, pmod, p.bag, nextBag(phdr, i)),
        GEN.instrument,
      );
      const regions: Sf2Region[] = [];
      for (const pz of pZones) {
        const ins = instruments[pz.gens.get(GEN.instrument) ?? -1];
        if (!ins) continue;
        for (const iz of ins.local) {
          const sample = samples[iz.gens.get(GEN.sampleID) ?? -1];
          if (!sample) continue;
          // a local zone's range overrides its global zone's; preset and instrument ranges intersect
          const [ikLo, ikHi] = range(iz, ins.global, 'key'),
            [pkLo, pkHi] = range(pz, pGlobal, 'key');
          const [ivLo, ivHi] = range(iz, ins.global, 'vel'),
            [pvLo, pvHi] = range(pz, pGlobal, 'vel');
          const keyLo = Math.max(ikLo, pkLo),
            keyHi = Math.min(ikHi, pkHi);
          const velLo = Math.max(ivLo, pvLo),
            velHi = Math.min(ivHi, pvHi);
          if (keyLo > keyHi || velLo > velHi) continue;

          const g = Int16Array.from(DEFAULTS);
          for (const [op, v] of ins.global?.gens ?? []) g[op] = v;
          for (const [op, v] of iz.gens) g[op] = v;
          const offsets = new Map(pGlobal?.gens);
          for (const [op, v] of pz.gens) offsets.set(op, v);
          for (const [op, v] of offsets)
            if (!NOT_ADDITIVE.has(op) && op < GEN_COUNT) g[op] = clamp16(g[op]! + v);
          const mods = [...merge(ins.global?.mods, iz.mods), ...merge(pGlobal?.mods, pz.mods)];
          regions.push({ keyLo, keyHi, velLo, velHi, sample, gen: g, mods });
        }
      }
      return { name: p.name, bank: p.bank, program: p.program, regions };
    })
    .sort((a, b) => a.bank - b.bank || a.program - b.program);

  const inam = chunks.get('INAM');
  const name = inam ? text(inam.offset, inam.size) : '';
  return { name, sampleData, samples, presets };
}

// a global zone's modulators with the local zone's replacing identical ones
const merge = (global: Sf2Modulator[] = [], local: Sf2Modulator[] = []): Sf2Modulator[] => [
  ...global.filter(
    (g) => !local.some((l) => l.src === g.src && l.dest === g.dest && l.amountSrc === g.amountSrc),
  ),
  ...local,
];

// a zone's key or velocity range: its own if set, else its global zone's, else everything
const range = (z: Zone, global: Zone | null, k: 'key' | 'vel'): Range => z[k] ?? global?.[k] ?? [0, 127];
const clamp16 = (v: number) => Math.max(-32768, Math.min(32767, v));

// the regions of a preset that sound for this key and velocity
export function regionsFor<R extends { keyLo: number; keyHi: number; velLo: number; velHi: number }>(
  preset: { regions: R[] },
  key: number,
  velocity: number,
): R[] {
  return preset.regions.filter(
    (r) => key >= r.keyLo && key <= r.keyHi && velocity >= r.velLo && velocity <= r.velHi,
  );
}
