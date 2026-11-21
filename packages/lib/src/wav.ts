// 16-bit PCM WAV files: mono for whistled takes, stereo for a bounced project, and their peak level. Pure.

/** samples -1..1 */
export const encodeWav = (samples: Float32Array, rate: number): Uint8Array =>
  encodeWavChannels([samples], rate);

/** channels interleaved, each -1..1 and the same length */
export function encodeWavChannels(channels: Float32Array[], rate: number): Uint8Array {
  const k = channels.length,
    n = channels[0]?.length ?? 0,
    bytes = n * k * 2;
  const out = new Uint8Array(44 + bytes),
    v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, k, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * k * 2, true);
  v.setUint16(32, k * 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, bytes, true);
  for (let i = 0, at = 44; i < n; i++)
    for (const c of channels) {
      v.setInt16(at, Math.round(Math.max(-1, Math.min(1, c[i]!)) * 0x7fff), true);
      at += 2;
    }
  return out;
}

/** the loudest sample across channels, 0..1 */
export function peakOf(channels: Float32Array[]): number {
  let peak = 0;
  for (const c of channels) for (const x of c) peak = Math.max(peak, Math.abs(x));
  return peak;
}

/** channels scaled so their peak is `dB` (−1: just under full scale); silence stays silent */
export function normalize(channels: Float32Array[], dB = -1, peak = peakOf(channels)): Float32Array[] {
  if (!peak) return channels;
  const k = 10 ** (dB / 20) / peak;
  return channels.map((c) => c.map((x) => x * k));
}
