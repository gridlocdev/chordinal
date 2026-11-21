// General MIDI's drum sounds by key (channel 10), and the kit the step grid shows by default (PRD §4.6).

/** @type {Record<number, string>} */
export const GM_DRUMS = {
    35: 'Acoustic Kick', 36: 'Kick', 37: 'Side Stick', 38: 'Snare', 39: 'Clap', 40: 'Electric Snare', 41: 'Low Floor Tom',
    42: 'Closed Hat', 43: 'Low Tom', 44: 'Pedal Hat', 45: 'Low Tom 2', 46: 'Open Hat', 47: 'Mid Tom', 48: 'Hi-Mid Tom',
    49: 'Crash', 50: 'High Tom', 51: 'Ride', 52: 'China', 53: 'Ride Bell', 54: 'Tambourine', 55: 'Splash', 56: 'Cowbell',
    57: 'Crash 2', 58: 'Vibraslap', 59: 'Ride 2', 60: 'Hi Bongo', 61: 'Low Bongo', 62: 'Mute Hi Conga', 63: 'Open Hi Conga',
    64: 'Low Conga', 65: 'High Timbale', 66: 'Low Timbale', 67: 'High Agogo', 68: 'Low Agogo', 69: 'Cabasa', 70: 'Maracas',
    71: 'Short Whistle', 72: 'Long Whistle', 73: 'Short Guiro', 74: 'Long Guiro', 75: 'Claves', 76: 'Hi Wood Block',
    77: 'Low Wood Block', 78: 'Mute Cuica', 79: 'Open Cuica', 80: 'Mute Triangle', 81: 'Open Triangle',
};

/** the core kit, top row first */
export const CORE_ROWS = [36, 38, 39, 42, 46, 43, 47, 50, 49, 51];
