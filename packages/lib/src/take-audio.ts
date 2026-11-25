// A take recorded onto an audio track (Chordinal PRD §16.7): the mic's blocks, each stamped with the audio time of its
// first sample, laid out from the moment the take begins, as heard.

/** a block of mic samples and the audio time of its first */
export interface StampedBlock {
  samples: Float32Array;
  time: number;
}

/**
 * the samples from audio time `from` on, at `rate`, laid out by their stamps: a gap between blocks is silence, and
 * what came before `from` is left out
 */
export function takeSamples(
  blocks: readonly StampedBlock[],
  from: number,
  rate: number,
): Float32Array<ArrayBuffer> {
  let length = 0;
  for (const b of blocks) length = Math.max(length, Math.round((b.time - from) * rate) + b.samples.length);
  const out = new Float32Array(Math.max(0, length));
  for (const b of blocks) {
    const at = Math.round((b.time - from) * rate),
      skip = Math.max(0, -at);
    if (skip < b.samples.length) out.set(b.samples.subarray(skip), at + skip);
  }
  return out;
}
