// Sounding voices are listed per audio context (audit: an export's voices stayed in one global list after the render,
// and counted against the live voice limit, so live notes stole them). Run on a fake Web Audio context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChipFont } from '../../src/lib/chip-synth.js';
import { CHIP_BANK, CHIP_KIT_BANK, CHIP_INSTRUMENTS, CHIP_KITS } from '../../src/audio/chip-instruments-data.js';

const param = ()=> ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
function fakeContext()
{
    const ctx = { currentTime: 0, sampleRate: 48000, stops: 0 };
    const node = (extra = {})=> ({ connect: (n)=> n, disconnect() {}, ...extra });
    ctx.createGain = ()=> node({ context: ctx, gain: param() });
    ctx.createBiquadFilter = ()=> node({ frequency: param(), Q: param() });
    ctx.createStereoPanner = ()=> node({ pan: param() });
    ctx.createBufferSource = ()=> node({ playbackRate: param(), detune: param(), start() {}, stop() { ctx.stops++; } });
    return ctx;
}
globalThis.AudioBuffer = class { constructor({ length, sampleRate }) { this.length = length; this.sampleRate = sampleRate; this.data = new Float32Array(length); } getChannelData() { return this.data; } };

const { createInstrument, voicesIn } = await import('../../src/audio/soundfont.js');
const font = { url: 'chip', ...buildChipFont({ bank: CHIP_BANK, kitBank: CHIP_KIT_BANK, instruments: CHIP_INSTRUMENTS, kits: CHIP_KITS }) };
const preset = font.presets.find(p => p.bank === CHIP_BANK);

test('an export\'s voices are listed with its own context, so live notes neither count nor steal them', ()=>
{
    const offline = fakeContext(), live = fakeContext();
    const exported = createInstrument(font, preset, { context: offline });
    for (let i = 0; i < 120; i++) exported.noteOn(30 + (i % 60), 100, i);
    const sounding = voicesIn(offline).length;
    assert.ok(sounding > 0);
    const stopsBefore = offline.stops;

    const keys = createInstrument(font, preset, { context: live });
    keys.noteOn(60);
    assert.equal(offline.stops, stopsBefore, 'a live note cut none of the export\'s voices');
    assert.equal(voicesIn(live).length, voicesIn(live).filter(v => !v.stopping).length);
    assert.ok(voicesIn(live).length >= 1 && voicesIn(live).length <= 2);
    assert.equal(voicesIn(offline).length, sounding, 'the export\'s list is its own, gone with its context');
});
