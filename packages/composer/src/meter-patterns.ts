// Patterns in any meter. A groove is written in one meter; in another its drums, bass and comping are built from
// that meter's beat groups instead of being stretched. Also the drum feels (half-time, double-time, a snare build),
// the roll that marks an odd meter's bar line, and the melody's rhythm cells.
import { METERS, GROUP_CELLS, BASS, COMPING, OFFBEAT_COMPS } from './patterns-data.ts';
import type { BassHit, CompHit, DrumLevel, DrumPattern, Groove, Meter } from './patterns-data.ts';
import { RHYTHMS } from './composer-data.ts';
import type { DrumFeel, Rhythms } from './composer-data.ts';
import { groupStarts } from './meter.ts';

/** a METERS entry with its name */
export type NamedMeter = Meter & { name: string };
/** a drum level, or simple: a plain accented bar, after a change of meter */
export type DrumBarLevel = DrumLevel | 'simple';

/** a METERS entry with its name */
export function meterOf(name: string): NamedMeter {
  const m = METERS[name];
  if (!m) throw new Error(`unknown meter: ${name}`);
  return { name, ...m };
}

/** the meter a groove is written in */
export const nativeMeter = (groove: { beats: number }): string => (groove.beats === 3 ? '3/4' : '4/4');

const stepsOf = (meter: Meter): number => Math.round(meter.beats * 4);
const startSteps = (meter: Meter): number[] => groupStarts(meter).map((b) => Math.round(b * 4));
const mapRows = (pattern: DrumPattern, fn: (row: string, voice: string) => string): DrumPattern =>
  Object.fromEntries(Object.entries(pattern).map(([k, v]) => [k, fn(v, k)]));
// "two bars of 4/4 with the last beat cut": a 4/4 pattern doubled and truncated
const cut = (meter: NamedMeter, groove: Groove): boolean | undefined =>
  meter.cut && nativeMeter(groove) === '4/4';

/** the melody's rhythm cells and cadence bars for a meter */
export function rhythmsFor(meter: NamedMeter): Rhythms {
  const own = RHYTHMS[meter.name];
  if (own) return own;
  let cells: number[][] = [[]];
  for (const g of meter.groups)
    cells = cells.flatMap((c) => (GROUP_CELLS[g] ?? [[g]]).map((x) => [...c, ...x]));
  const last = meter.groups.length > 1 ? meter.groups.at(-1)! : meter.beats / 2;
  return { cells, cadence: { half: [meter.beats - last, last], full: [meter.beats], final: [meter.beats] } };
}

/** One bar of drums in a meter: { voice: 'X..x…' }, or null for none. */
export function drumBar(groove: Groove, meter: NamedMeter, level: DrumBarLevel): DrumPattern | null {
  if (!groove.low) return null; // a groove with no drums has none in any meter
  const steps = stepsOf(meter);
  if (level !== 'simple' && meter.name === nativeMeter(groove)) return groove[level] ?? null;
  const written = level === 'simple' ? undefined : groove[level];
  if (written && cut(meter, groove)) return mapRows(written, (h) => (h + h).slice(0, steps));
  return groupedDrums(meter, level, !!groove.electronic);
}

// a kick on beat 1, a backbeat on each later group's start, hats on the beat, eighth or sixteenth by level
function groupedDrums(meter: NamedMeter, level: DrumBarLevel, electronic: boolean): DrumPattern {
  const steps = stepsOf(meter),
    starts = startSteps(meter);
  const row = (): string[] => Array<string>(steps).fill('.');
  const kick = row(),
    snare = row(),
    hat = row();
  const plain = level === 'low' || level === 'simple';
  const noSnare = electronic && !!meter.roll; // "house in 7": no snare, so it doesn't matter where the bar loops
  starts.forEach((s, i) => {
    if (i === 0) kick[s] = 'X';
    else if (plain || noSnare) kick[s] = level === 'simple' ? 'X' : 'x';
    else snare[s] = 'X';
  });
  if (starts.length === 1 && !plain && !noSnare)
    // one group: oom-pah-pah, or a march's 1-2
    for (let s = 4; s < steps; s += 4) snare[s] = level === 'high' ? 'x' : 'o';
  if (electronic && !plain) for (let s = 0; s < steps; s += 4) kick[s] = 'X';
  // quiet compound meters keep time on the dotted quarters; busier ones on eighths
  const lilt = meter.groups.some((g) => !Number.isInteger(g));
  if (plain && lilt) for (const s of starts) hat[s] = 'x';
  else {
    const sub = plain ? 4 : level === 'mid' || lilt ? 2 : 1;
    for (let s = 0; s < steps; s += sub) hat[s] = s % 4 === 0 || sub === 2 ? 'x' : 'o';
  }
  if (level === 'fill') {
    const from = starts.at(-1)!;
    for (let s = from; s < steps; s++) {
      snare[s] = s >= steps - 2 ? 'X' : 'x';
      hat[s] = '.';
    }
  }
  const out: DrumPattern = { kick: kick.join(''), hat: hat.join('') };
  if (snare.includes('X') || snare.includes('x') || snare.includes('o')) out.snare = snare.join('');
  return out;
}

/**
 * A drum feel over a bar's pattern.
 *   half    the backbeat moves to the middle of the bar: half as fast, twice as heavy
 *   double  the snare on every beat and sixteenth hats: twice as fast
 *   roll    a build: kick on every beat and a snare that goes from quarters to eighths to sixteenths across the section
 */
export function withFeel(
  pattern: DrumPattern | null,
  feel: DrumFeel | null,
  meter: NamedMeter,
  bar: number,
  bars: number,
): DrumPattern | null {
  if (!pattern || !feel) return pattern;
  const steps = stepsOf(meter);
  const at = (fn: (step: number) => string): string =>
    Array.from({ length: steps }, (_, s) => fn(s)).join('');
  const mid = Math.round(steps / 8) * 4;
  if (feel === 'half') {
    const { snare, clap, ...rest } = pattern;
    return {
      ...rest,
      kick: (pattern.kick ?? '')
        .padEnd(steps, '.')
        .split('')
        .map((h, s) => (s < mid ? h : '.'))
        .join(''),
      snare: at((s) => (s === mid ? 'X' : '.')),
    };
  }
  if (feel === 'double')
    return {
      kick: at((s) => (s === 0 || s === mid ? 'X' : '.')),
      snare: at((s) => (s % 4 === 0 && s > 0 ? 'X' : '.')),
      hat: at((s) => (s % 2 ? 'o' : 'x')),
    };
  if (feel === 'roll') {
    const p = bar / bars;
    const every = p < 0.5 ? 4 : p < 0.75 ? 2 : 1,
      hit = p < 0.5 ? 'o' : p < 0.75 ? 'x' : 'X';
    return { kick: at((s) => (s % 4 === 0 ? 'X' : '.')), snare: at((s) => (s % every === 0 ? hit : '.')) };
  }
  throw new Error(`unknown drum feel: ${String(feel)}`);
}

/** the tom roll over an odd meter's last beat: the turn back to beat 1 sounds deliberate */
export function withRoll(pattern: DrumPattern | null, meter: NamedMeter): DrumPattern {
  const steps = stepsOf(meter);
  const from = steps - Math.min(4, Math.round(meter.groups.at(-1)! * 4));
  const cleared = mapRows(pattern ?? {}, (h, voice) =>
    voice === 'kick'
      ? h
      : h
          .split('')
          .map((x, s) => (s >= from ? '.' : x))
          .join(''),
  );
  const toms = (['tomHi', 'tomHi', 'tomMid', 'tomLow'] as const).slice(4 - (steps - from));
  const roll: DrumPattern = {};
  toms.forEach((voice, i) => {
    const row = (roll[voice] ?? cleared[voice] ?? '.'.repeat(steps)).split('');
    row[from + i] = i === toms.length - 1 ? 'X' : 'x';
    roll[voice] = row.join('');
  });
  return { ...cleared, ...roll };
}

/** One bar of bass hits, [step, tone, length], in a meter. busy: the high-energy pattern */
export function bassBar(grooveName: string, groove: Groove, meter: NamedMeter, busy: boolean): BassHit[] {
  const steps = stepsOf(meter);
  const patterns = BASS[grooveName] ?? BASS.pop;
  const p = busy ? patterns.high : patterns.low;
  if (meter.name === nativeMeter(groove)) return p.filter(([s]) => s < steps);
  if (cut(meter, groove))
    return [...p, ...p.map(([s, t, l]): BassHit => [s + 16, t, l])]
      .filter(([s]) => s < steps)
      .map(([s, t, l]): BassHit => [s, t, Math.min(l, steps - s)]);
  // the root on each group's start; when busy, the fifth on every other group and an approach into the next bar
  const starts = startSteps(meter);
  const out = starts.map((s, i): BassHit => [s, busy && i % 2 ? '5' : 'R', (starts[i + 1] ?? steps) - s]);
  const last = out.at(-1)!;
  if (busy && last[2] > 2) {
    last[2] -= 2;
    out.push([steps - 2, 'A', 2]);
  }
  return out;
}

/** one bar of chord hits, [step, length, velocity factor?], for a comping style in a meter */
export function compBar(style: string, meter: NamedMeter, groove: Groove): CompHit[] {
  const steps = stepsOf(meter);
  const written = COMPING[style] ?? COMPING.sustain;
  if (style === 'sustain') return [[0, steps]];
  if (meter.name === '4/4' || meter.name === '3/4') return written.filter(([s]) => s < steps);
  if (cut(meter, groove))
    return [...written, ...written.map(([s, l, v]): CompHit => [s + 16, l, v])].filter(([s]) => s < steps);
  const starts = startSteps(meter);
  const compoundMeter = meter.groups.some((g) => !Number.isInteger(g));
  const pulse = compoundMeter ? 2 : 4;
  if (OFFBEAT_COMPS.includes(style)) {
    const hits: CompHit[] = [];
    for (let s = 0; s < steps; s += pulse) if (!starts.includes(s)) hits.push([s, Math.min(2, steps - s)]);
    return hits;
  }
  return starts.map((s, i): CompHit => [s, (starts[i + 1] ?? steps) - s]);
}
