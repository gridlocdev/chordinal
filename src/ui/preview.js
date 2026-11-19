// Hearing an instrument before choosing it: a short note on middle C, or a kick, a snare and a closed hat for a kit
// (Chordinal PRD §7.2). One preview sounds at a time; a new one cuts the last.
import { loadSoundFont, findPreset, createInstrument } from '../audio/soundfont.js';
import { audioEngine } from '../platform/audio-engine.js';
import { status } from './store.js';

const MIDDLE_C = 60, VELOCITY = 100;
const NOTE_S = 0.6;                     // how long the note is held
const KIT = [36, 38, 42];               // kick, snare, closed hat (General MIDI)
const KIT_STEP_S = 0.25;
const TAIL_S = 1.5;                     // after the last note-off, before the instrument is let go

/** the notes a preview plays: [key, start s, length s] */
export const previewNotes = (preset)=> preset.bank >= 128
    ? KIT.map((key, i)=> [key, i * KIT_STEP_S, KIT_STEP_S])
    : [[MIDDLE_C, 0, NOTE_S]];

let current = null, asked = 0;

/** plays a preset ({ url, bank, program, name }) briefly */
export async function preview(preset)
{
    const id = ++asked;
    try
    {
        const font = await loadSoundFont(preset.url);
        if (id !== asked || audioEngine.rendering) return;
        const found = findPreset(font, preset.bank, preset.program);
        if (!found) throw new Error(`no preset ${preset.bank}:${preset.program}`);
        stop();
        const inst = createInstrument(font, found);
        const timers = [];
        const notes = previewNotes(preset);
        for (const [key, at, len] of notes)
        {
            timers.push(setTimeout(()=> inst.noteOn(key, VELOCITY), at * 1000));
            timers.push(setTimeout(()=> inst.noteOff(key), (at + len) * 1000));
        }
        const end = Math.max(...notes.map(([, at, len])=> at + len)) + TAIL_S;
        timers.push(setTimeout(()=> { if (current?.inst === inst) stop(); }, end * 1000));
        current = { inst, timers };
    }
    catch (e) { if (id === asked) status.value = `Couldn't play ${preset.name}: ${e.message}`; }
}

function stop()
{
    if (!current) return;
    for (const t of current.timers) clearTimeout(t);
    current.inst.dispose();
    current = null;
}
