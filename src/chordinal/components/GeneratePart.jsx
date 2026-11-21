// The Generate Part… dialog (Chordinal PRD §8): the part, the style, the seed (with Roll), the range, and a key when
// the project has none. Generate writes it and keeps the dialog open; Generate Again (⌘G) rolls a new seed and
// replaces the last generated clip.
import { useState } from 'preact/hooks';
import { EMOTIONS } from '../../composer/composer-data.js';
import { GENRES } from '../../composer/genre-data.js';
import { styleName } from '../../composer/part.js';
import { MODES, pitchName } from '../../lib/music-theory.js';
import { project } from '../../ui/store.js';
import { trackOf } from '../../ui/tracks.js';
import { generating, closeGenerate, generatePart, defaultPart, rangeChoices, canAgain, PARTS } from '../generate.js';

/** a short seed, easy to read back and type in again */
export const rollSeed = ()=> Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');

const cap = (s)=> `${s[0].toUpperCase()}${s.slice(1)}`;
const MODE_NAMES = Object.keys(MODES);

function Dialog({ trackId })
{
    const track = trackId ? trackOf(trackId) : null;
    const ranges = rangeChoices();
    const [form, setForm] = useState(()=> ({ part: defaultPart(track), style: 'feeling:hopeful', seed: rollSeed(), range: ranges[0].id, tonic: 0, mode: 'major' }));
    const [message, setMessage] = useState('');
    const set = (patch)=> setForm({ ...form, ...patch });
    const range = (ranges.find(r => r.id === form.range) ?? ranges[0]).range;
    const run = (again)=>
    {
        const seed = again ? rollSeed() : form.seed;
        if (again) set({ seed });
        const r = generatePart({ part: form.part, style: form.style, seed, range, trackId, key: { tonic: form.tonic, mode: form.mode } }, { again });
        setMessage(r.ok ? `Wrote ${form.part} with ${styleName(form.style)}, seed ${seed}.` : r.message);
    };
    const keys = (e)=>
    {
        if (e.key === 'Escape') closeGenerate();
        else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') { e.preventDefault(); e.stopPropagation(); run(true); }
        else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); run(false); }
    };
    return (
        <div class="dialog-back" onPointerDown={(e)=> e.target === e.currentTarget && closeGenerate()}>
            <div class="dialog generate" role="dialog" aria-label="Generate part" onKeyDown={keys}>
                <h2>Generate Part{track ? ` on ${track.name}` : ''}</h2>
                <div class="form">
                    <label>Part <select name="part" value={form.part} onChange={(e)=> set({ part: e.currentTarget.value })}>
                        {Object.keys(PARTS).map(p => <option value={p}>{cap(p)}</option>)}
                    </select></label>
                    <label>Style <select name="style" value={form.style} onChange={(e)=> set({ style: e.currentTarget.value })}>
                        <optgroup label="Feelings">{Object.keys(EMOTIONS).map(f => <option value={`feeling:${f}`}>{cap(f)}</option>)}</optgroup>
                        <optgroup label="Genres">{Object.keys(GENRES).map(g => <option value={`genre:${g}`}>{styleName(g)}</option>)}</optgroup>
                    </select></label>
                    <label>Seed <span class="seed">
                        <input name="seed" value={form.seed} onInput={(e)=> set({ seed: e.currentTarget.value })} />
                        <button onClick={()=> set({ seed: rollSeed() })}>Roll</button>
                    </span></label>
                    <label>Range <select name="range" value={form.range} onChange={(e)=> set({ range: e.currentTarget.value })}>
                        {ranges.map(r => <option value={r.id}>{r.label}</option>)}
                    </select></label>
                    {!project.value.key && (
                        <label>Key <span class="seed">
                            <select name="tonic" value={form.tonic} onChange={(e)=> set({ tonic: Number(e.currentTarget.value) })}>
                                {Array.from({ length: 12 }, (_, i)=> <option value={i}>{pitchName(i)}</option>)}
                            </select>
                            <select name="mode" value={form.mode} onChange={(e)=> set({ mode: e.currentTarget.value })}>
                                {MODE_NAMES.map(m => <option value={m}>{m}</option>)}
                            </select>
                        </span></label>
                    )}
                </div>
                <p class="hint message" role="status">{message || (track ? '' : 'No track selected: the part goes on a new track.')}</p>
                <div class="actions">
                    <button class="other" onClick={closeGenerate}>Close</button>
                    <button class="again" disabled={!canAgain(trackId)} title="A new seed, in place of the last generated clip (⌘G)" onClick={()=> run(true)}>Generate Again</button>
                    <button class="primary" onClick={()=> run(false)}>Generate</button>
                </div>
            </div>
        </div>
    );
}

export function GeneratePart()
{
    const g = generating.value;
    return g ? <Dialog trackId={g.trackId} /> : null;
}
