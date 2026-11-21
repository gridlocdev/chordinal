// Song spec → multi-instrument score. Pure and deterministic: the same spec always gives the same notes.
// Every choice is made by a rule from the *-data.ts tables; where rules tie, a hash of the song and position decides,
// so nothing is random. docs/composing.md describes the method and the spec format.
//
// The pipeline, top down:
//   1. song plan (plan.ts): form, keys, meters, energy curve, cadences, tempo map, loop; and the motif (melody.ts)
//   2. section plan (harmony.ts): the chords at the section's harmonic rhythm, ended on its cadence, passing chords
//   3. phrases: the melody from the motif, call and response, harmony voices, then the parts (parts.ts)
//   4. arrangement and rhythm passes (arrange.ts, syncopation.ts), and a chip song's echo (chip.ts)
// Detail and feel that a player adds (ghost notes, scoops, swing, ear candy) come later, in perform.ts.
import { degreeToKey, chordName, chordPitchClasses, pitchName } from '@chordinal/lib';
import { beatToSeconds, bpmAt } from '@chordinal/lib';
import { ARRANGEMENT, ROLES, ROLE_NAMES, MELODY_OCTAVE } from './composer-data.ts';
import { velocity, mod } from './meter.ts';
import { planSong, energyShape, genreProfile } from './plan.ts';
import { sectionChords, callAndResponse, cadenceChord } from './harmony.ts';
import { writeMelody, songMotif } from './melody.ts';
import { varyMelody, repeatPhrases } from './melody-repeats.ts';
import { notatedMelody } from './notation.ts';
import { writeChords, writePad, writeArp, writeCounter, writeBass, writeDrums } from './parts.ts';
import { arrangeSection } from './arrange.ts';
import { syncopate } from './syncopation.ts';
import { ornament } from './ornaments.ts';
import { echoTrack } from './chip.ts';
import { CHIP_BANK, CHIP_KIT_BANK, CHIP_ROLES, CHIP_INSTRUMENTS, CHIP_KITS } from '@chordinal/audio';
import type { Mode, TempoSegment } from '@chordinal/lib';
import type { Role } from './composer-data.ts';
import type { SectionSpec, SongSpec } from './plan.ts';
import type { Style } from './song-craft-data.ts';
import type { MelodyNote } from './notation.ts';
import type { PartMemory } from './parts.ts';

export { parseMelody } from './notation.ts';

/**
 * A note of the score.
 *   anticipates: the beat a note pulled a sixteenth early belongs on; cycle: a tracker arpeggio's semitones over the
 *   key, stepped through while the note sounds (the view and the MIDI file show the key alone); ornament: one of
 *   the quick notes of a trill, turn, mordent or grace note (ornaments.ts), before the note it decorates
 *   vibrato: marked `~` in a hand-written melody; the performance gives it vibrato (perform.ts)
 *   written: an ornamented note's own beat, before the ornament took the start of it
 */
export interface ScoreNote {
  key: number;
  beat: number;
  beats: number;
  vel: number;
  anticipates?: number;
  cycle?: number[];
  ornament?: boolean;
  vibrato?: true;
  written?: number;
}
/** a part of the score: one of the roles, or a chip song's echo */
export type TrackRole = Role | 'echo';
export interface ScoreTrack {
  role: TrackRole;
  name: string;
  program: number;
  bank: number;
  notes: ScoreNote[];
}
export interface ScoreSection {
  type: string;
  label: string;
  beat: number;
  beats: number;
  energy: number;
  scene: string;
  beatsPerBar: number;
  meter: string;
  tonic: number;
  mode: Mode;
  climax: boolean;
}
export interface ScoreChord {
  beat: number;
  beats: number;
  name: string;
  tones: number[];
}
/** compose()'s output. flats: the key is spelled with flats */
export interface Score {
  title: string;
  genre: string;
  story: string;
  emotion: string;
  sound: string;
  key: string;
  mode: Mode;
  tempo: number;
  beatsPerBar: number;
  beats: number;
  seconds: number;
  tracks: ScoreTrack[];
  sections: ScoreSection[];
  chords: ScoreChord[];
  tempoMap: TempoSegment[];
  loop: { from: number; to: number } | null;
  flats: boolean;
  swing: number;
  swingSub: number;
  style: Style;
  seed: string;
  motif: number[];
}

/**
 * A part's bank and program. With `sound: 'chip'` every part plays a chip instrument: the band's program when the
 * chip bank has it, else the role's usual one (CHIP_ROLES), so a band written for General MIDI still works.
 */
export function instrumentFor(
  role: string,
  program: number,
  sound = 'gm',
): { bank: number; program: number } {
  const drums = role === 'drums';
  if (sound !== 'chip') return { bank: drums ? 128 : 0, program };
  const has = (drums ? CHIP_KITS : CHIP_INSTRUMENTS).some((i) => i.program === program);
  return { bank: drums ? CHIP_KIT_BANK : CHIP_BANK, program: has ? program : CHIP_ROLES[role]! };
}

/** spec: see docs/composing.md, "The song spec" */
export function compose(spec: SongSpec): Score {
  const plan = planSong(spec);
  const { song, band, feel } = plan;
  const motif = songMotif(spec, plan);

  const tracks: ScoreTrack[] = [];
  for (const role of ROLES) {
    const program = band[role];
    if (program != null)
      tracks.push({ role, name: ROLE_NAMES[role], ...instrumentFor(role, program, song.sound), notes: [] });
  }
  const track = Object.fromEntries(tracks.map((t) => [t.role, t]));

  const sections: ScoreSection[] = [],
    chords: ScoreChord[] = [],
    themes: Record<string, MelodyNote[]> = {};
  const memory: PartMemory = { chords: null, pad: null, arp: null, bass: 40, counter: null };

  plan.sections.forEach((sec, index) => {
    const { type, over, base } = sec;
    // a hand-written melody keeps its own ending: no cadence it doesn't fit
    const written = typeof over.melody === 'string' ? notatedMelody(over.melody, sec.beats) : null;
    if (written?.length && sec.endOn) {
      const last = written.at(-1)!;
      if (
        !chordPitchClasses(cadenceChord(sec)).includes(
          mod(degreeToKey(sec.tonic, sec.mode, last.degree, MELODY_OCTAVE, last.accidental), 12),
        )
      )
        sec.endOn = null;
    }
    const timeline = (sec.timeline = sectionChords(sec));
    sections.push({
      type,
      label: sec.label,
      beat: sec.beat,
      beats: sec.beats,
      energy: sec.energy,
      scene: sec.scene,
      beatsPerBar: sec.beatsPerBar,
      meter: sec.meter.name,
      tonic: mod(sec.tonic, 12),
      mode: sec.mode,
      climax: sec.climax,
    });
    for (const c of timeline)
      chords.push({
        beat: c.beat,
        beats: c.beats,
        name: chordName(c.chord, c.chord.flat ?? (/^b[IV]/.test(c.chord.symbol) || song.flats)),
        tones: chordPitchClasses(c.chord),
      });
    const marks = tracks.map((t) => t.notes.length);

    // melody: written once per section type (and variant), then replayed; a composed one varies on repeats,
    // a hand-written one is played as written every time
    let lead: ScoreNote[] = [];
    const melodyCfg =
      over.melody === false
        ? null
        : base.melody && {
            ...base.melody,
            contour: over.contour ?? feel.contour?.[type] ?? base.melody.contour,
            ...pick(over, ['register', 'density']),
          };
    if (track.lead && (melodyCfg || typeof over.melody === 'string')) {
      const variant = ['chorus', 'post', 'drop'].includes(type) ? 0 : sec.n;
      const id = `${type}:${variant}`;
      // the lead's last note, when it ended within a bar of this section: the new tune leads on from it
      const end = track.lead.notes.at(-1);
      const before = end && sec.beat - (end.beat + end.beats) <= sec.beatsPerBar ? end.key : null;
      const theme = (themes[id] ??=
        written ??
        repeatPhrases(writeMelody(sec, melodyCfg!, variant, motif, timeline, before), sec, timeline));
      lead = (written ? theme : varyMelody(theme, sec, timeline)).map((m): ScoreNote => ({
        key: degreeToKey(sec.tonic, sec.mode, m.degree, MELODY_OCTAVE, m.accidental),
        beat: sec.beat + m.beat,
        beats: m.beats * (m.last ? 1 : song.legato),
        vel: velocity(sec, 'lead', sec.energy, m.beat),
        ...(m.vibrato && { vibrato: true as const }),
      }));
    }
    let answers: ScoreNote[] | null = null;
    if (lead.length && sec.answer && track.counter && !sec.mute.includes('counter'))
      ({ lead, counter: answers } = callAndResponse(lead, sec, timeline));
    // the lead is played ornamented; the parts that follow it (a harmony line, a left hand kept under it) follow the plain tune
    track.lead?.notes.push(...ornament(lead, sec, bpmAt(plan.tempoMap, sec.beat)));

    // which parts play: by fullness, unless muted; a solo is the melody alone (or the pad, with no melody);
    // polyphony brings the countermelody in whatever the fullness
    // a genre may set its own thresholds: a piano's left hand (the arp) plays whatever the fullness
    const at = { ...ARRANGEMENT, ...sec.genre.arrange };
    const on = (role: Exclude<Role, 'lead'>): boolean =>
      !!track[role] &&
      !sec.mute.includes(role) &&
      (sec.texture === 'solo'
        ? role === 'pad' && !lead.length
        : role === 'drums'
          ? sec.fullness >= at.drums || sec.ending
          : sec.fullness >= at[role] || (role === 'counter' && sec.texture === 'polyphonic'));
    const { counter, arp, chords: comp, pad, bass, drums } = track;
    if (answers) counter?.notes.push(...answers);
    else if (on('counter') && counter && !sec.ending) writeCounter(sec, counter, memory, lead);
    // a part that shares the lead's instrument family keeps under it, or the tune is lost in it
    const under = (part: ScoreTrack): ScoreNote[] =>
      track.lead && Math.floor(part.program / 8) === Math.floor(track.lead.program / 8) ? lead : [];
    // a left hand plays to the last chord; an arpeggio leaves the ending to the others
    if (on('arp') && arp && (!sec.ending || sec.arp.hand)) writeArp(sec, arp, memory, under(arp));
    if (on('chords') && comp) writeChords(sec, comp, memory, under(comp));
    if (on('pad') && pad) writePad(sec, pad, memory);
    if (on('bass') && bass) writeBass(sec, bass, memory, plan.sections[index + 1] ? null : sec.tonic);
    if (on('drums') && drums) writeDrums(sec, drums);
    arrangeSection(sec, tracks, marks);
  });

  syncopate(tracks, plan.sections, song);
  for (const t of tracks) t.notes.sort((a, b) => a.beat - b.beat || a.key - b.key);
  // a part the genre (or the spec) plays octaves away from where it's written: a jazz tenor an octave below a voice
  const octaves: Partial<Record<TrackRole, number>> = {
    ...genreProfile(spec.genre).octaves,
    ...spec.octaves,
  };
  for (const t of tracks) {
    const by = octaves[t.role];
    if (by) for (const n of t.notes) n.key += 12 * by;
  }
  const echo = song.sound === 'chip' ? echoTrack(tracks, plan.beats, plan.tempoMap) : null;
  if (echo) tracks.push(echo);

  return {
    title: spec.title ?? spec.id ?? 'Untitled',
    genre: spec.genre ?? '',
    story: spec.story ?? '',
    emotion: plan.emotion,
    sound: song.sound,
    key: plan.keyName,
    mode: song.mode,
    tempo: song.tempo,
    beatsPerBar: plan.sections[0]!.beatsPerBar,
    beats: plan.beats,
    seconds: beatToSeconds(plan.tempoMap, plan.beats),
    tracks: tracks.filter((t) => t.notes.length),
    sections,
    chords,
    flats: song.flats,
    tempoMap: plan.tempoMap,
    loop: plan.loop,
    swing: song.swing,
    swingSub: song.swingSub,
    style: song.style,
    seed: song.seed,
    motif: motif.notes.map((n) => motif.start + n.step),
  };
}

const pick = (o: SectionSpec, keys: ('register' | 'density')[]): { register?: number; density?: number } =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/**
 * The beat to jump to from `beat` when stepping through sections: +1 the next section's start, -1 this
 * section's start, or the previous section's when within `grace` beats of this one's start (like a track skip).
 * Returns null past the last section.
 */
export function sectionSeek(
  sections: { beat: number }[],
  beat: number,
  step: number,
  grace = 0,
): number | null {
  const i = Math.max(
    0,
    sections.findLastIndex((s) => s.beat <= beat),
  );
  if (step > 0) return sections[i + 1]?.beat ?? null;
  return beat - sections[i]!.beat > grace ? sections[i]!.beat : sections[Math.max(0, i - 1)]!.beat;
}

/** a short text summary of a score: sections, chords, the energy curve and each part's range and note count */
export function describe(score: Score): string {
  const meters = new Set(score.sections.map((s) => s.meter));
  const tempos =
    score.tempoMap.length > 1
      ? `${score.tempo}–${Math.round(Math.max(...score.tempoMap.map((t) => t.bpm)))} bpm`
      : `${score.tempo} bpm`;
  const lines = [
    `${score.title} — ${score.genre ? `${score.genre}, ` : ''}${score.emotion}, ${score.key} ${score.mode}, ${tempos}, ${[...meters].join(' ')}, ${score.seconds.toFixed(0)} s${score.loop ? ', loops' : ''}`,
  ];
  let bar = 1;
  for (const s of score.sections) {
    const names = score.chords
      .filter((c) => c.beat >= s.beat && c.beat < s.beat + s.beats)
      .map((c) => c.name);
    const meter = s.meter !== score.sections[0]!.meter ? ` ${s.meter}` : '';
    const key =
      s.tonic !== score.sections[0]!.tonic || s.mode !== score.mode
        ? ` (${pitchName(s.tonic, score.flats)} ${s.mode})`
        : '';
    lines.push(
      `  ${s.label.padEnd(14)} bar ${String(bar).padStart(3)}  ${'█'.repeat(Math.round(s.energy * 10)).padEnd(10, '·')} ${s.energy.toFixed(2)}${s.climax ? ' peak' : '     '}${meter}${key}  ${names.join(' ')}`,
    );
    if (s.scene) lines.push(`  ${''.padEnd(14)} “${s.scene}”`);
    bar += Math.round(s.beats / s.beatsPerBar);
  }
  const shape = energyShape(score.sections);
  lines.push(
    `  energy peaks ${Math.round(shape.peak * 100)}% of the way in, ${shape.dips} dip${shape.dips === 1 ? '' : 's'}${shape.dips ? '' : ' (no contrast: add a quieter section)'}`,
  );
  if (score.story) lines.splice(1, 0, `  ${score.story}`);
  for (const t of score.tracks) {
    const keys = t.notes.map((n) => n.key);
    lines.push(
      `  ${t.name.padEnd(14)} program ${t.bank >= 128 ? 'kit ' : ''}${t.bank && t.bank !== 128 ? `${t.bank}:` : ''}${t.program}, ${t.notes.length} notes, keys ${Math.min(...keys)}–${Math.max(...keys)}`,
    );
  }
  return lines.join('\n');
}
