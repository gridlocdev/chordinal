// A waveform to draw (Chordinal PRD §16.6): a stretch of audio as one peak per column, so a clip of any length draws
// in as many steps as it is wide.

/**
 * the loudest sample (0..1, either sign) in each of `columns` equal parts of `channels` from sample `from` to sample
 * `to`, all channels taken together; a part past the audio's end is 0
 */
export function waveformPeaks(
  channels: readonly Float32Array[],
  from: number,
  to: number,
  columns: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, Math.floor(columns)));
  const length = channels[0]?.length ?? 0;
  const step = (to - from) / out.length;
  for (let i = 0; i < out.length; i++) {
    const a = Math.max(0, Math.floor(from + i * step)),
      b = Math.min(length, Math.max(a + 1, Math.floor(from + (i + 1) * step)));
    let peak = 0;
    for (const ch of channels)
      for (let k = a; k < b; k++) {
        const v = Math.abs(ch[k] ?? 0);
        if (v > peak) peak = v;
      }
    out[i] = Math.min(1, peak);
  }
  return out;
}
