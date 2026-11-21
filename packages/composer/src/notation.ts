// Melodies written by hand in scale-degree notation, for sections, motifs and stingers. Pure.

/** a melody note in scale degrees: degree 1 is the tonic, accidental a semitone up or down; last: the melody's last */
export interface MelodyNote {
  beat: number;
  beats: number;
  degree: number;
  accidental: number;
  vibrato?: boolean;
  last?: boolean;
}

/**
 * A melody written out by hand: space-separated tokens `degree[:beats]`. Degrees are scale steps (1 = tonic,
 * 8 = tonic an octave up), with b/# for accidentals and ' or , for an octave up/down, then `~` for vibrato on
 * that note (`5~:2`); `r` is a rest. A length can be a fraction, `5:1/3` for a triplet 8th. Default length 1 beat; '|' is ignored. The line repeats to fill the section.
 */
export function parseMelody(text: string): { notes: MelodyNote[]; beats: number } {
  const out: MelodyNote[] = [];
  let t = 0;
  for (const token of text.split(/\s+/).filter((x) => x && x !== '|')) {
    const m = /^(?:(r)|(b|#)?(-?\d+)('*|,*)(~)?)(?::([\d.]+(?:\/\d+)?))?$/.exec(token);
    if (!m) throw new Error(`bad melody token: ${token}`);
    const beats = !m[6]
      ? 1
      : m[6].includes('/')
        ? Number(m[6].split('/')[0]) / Number(m[6].split('/')[1])
        : Number(m[6]);
    if (!(beats > 0)) throw new Error(`bad melody length: ${token}`);
    if (!m[1]) {
      const mark = m[4]!;
      const octaves = mark.startsWith("'") ? mark.length : -mark.length;
      const note: MelodyNote = {
        beat: t,
        beats,
        degree: Number(m[3]) + 7 * octaves,
        accidental: m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0,
      };
      if (m[5]) note.vibrato = true;
      out.push(note);
    }
    t += beats;
  }
  return { notes: out, beats: t };
}

export function notatedMelody(text: string, total: number): MelodyNote[] {
  const { notes, beats } = parseMelody(text);
  const out: MelodyNote[] = [];
  for (let start = 0; start < total && beats > 0; start += beats)
    for (const n of notes)
      if (start + n.beat < total)
        out.push({ ...n, beat: start + n.beat, beats: Math.min(n.beats, total - start - n.beat) });
  const end = out.at(-1);
  if (end) end.last = true;
  return out;
}
