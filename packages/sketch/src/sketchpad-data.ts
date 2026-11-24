// Recording a take: its count-in and length, how it is read as it comes in, the click, and the band a
// melody is composed for when it's heard alone.

export const RECORD = {
  countInBars: 1,
  maxSeconds: 180,
  lookahead: 0.25, // seconds of clicks scheduled ahead
};

// reading a take as it comes in
export const LIVE = {
  gate: 0.004, // a frame quieter than this, or than gateOfPeak of the take's loudest so far, is silence
  gateOfPeak: 0.06,
  follow: 5, // voiced frames the note at the playhead is the median of
  firmEvery: 0.25, // seconds between readings of the notes so far
  behindBeats: 1, // notes are read up to this many beats behind the playhead: the smoothing needs 1/6 s past a note
};

// a short tick of noise, high-passed (lower on a bar's first beat): it has no pitch, so a click the mic hears through
// speakers isn't read as a note anywhere in the pitch tracker's range
export const CLICK = { highpassHz: 2000, accentHighpassHz: 900, seconds: 0.04, gain: 0.5, accentGain: 0.8 };
