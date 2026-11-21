// A tiny soundtrack for test/cli/cli.test.js: two short chip tracks at a quick tempo, one looping and one not.
const HOME = { sound: 'chip', key: 'A', mode: 'dorian', emotion: 'serene', groove: 'rock', push: 0 };

export const TRACKS = [
    {
        id: 'loop', loop: [1, 3], level: 0.5,
        spec: {
            title: 'Test Loop', ...HOME, tempo: 180, comp: 'eighths', arp: 'updown',
            form: ['intro', 'A', 'B', 'A'],
            band: { lead: null, counter: null, arp: 85, chords: null, pad: 90, bass: 38, drums: 0 },
            sections: {
                intro: { bars: 1, progression: 'i', energy: 0.3 },
                A: { bars: 2, progression: 'i IV', energy: 0.4 },
                B: { bars: 2, progression: 'VII i', energy: 0.4 },
            },
        },
    },
    {
        id: 'sting', loop: null,
        spec: {
            title: 'Test Sting', ...HOME, mode: 'minor', tempo: 160, comp: 'eighths', arp: 'tracker',
            form: ['A', 'outro'],
            band: { lead: 85, counter: null, arp: null, chords: null, pad: 90, bass: 38, drums: null },
            sections: {
                A: { bars: 1, progression: 'i', melody: '1:0.5 3:0.5 5:1 8:2', energy: 0.6 },
                outro: { bars: 1, progression: 'i', melody: '1:4', energy: 0.5 },
            },
        },
    },
];
