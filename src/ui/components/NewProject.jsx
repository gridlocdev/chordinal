// Music Generator's File → New: a song the composer writes from a feeling, a genre or one of its songs. The composer
// picks by a seed, so one choice always writes the same song; a seed of your own (or a rolled one) writes another in
// the same style, named after it so it can be written again.
import { useState } from 'preact/hooks';
import { CATALOG } from '../../composer/catalog.js';
import { EMOTIONS } from '../../composer/composer-data.js';
import { GENRES } from '../../composer/genre-data.js';
import { newProject } from '../document.js';
import { newDialog as dialog } from '../dialogs.js';

const KINDS = [['feeling', 'Feeling'], ['genre', 'Genre'], ['song', 'Song']];
const cap = (s)=> `${s[0].toUpperCase()}${s.slice(1)}`;
const SONGS = CATALOG.filter(c => c.group !== 'Feelings');

/** a short seed, easy to read back and type in again */
export const rollSeed = ()=> Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');

function make(kind, choice, seed)
{
    const song = kind === 'song' ? SONGS.find(s => s.id === choice) : null;
    const name = song ? song.spec.title ?? song.label : cap(choice);
    const spec = song ? song.spec : kind === 'feeling' ? { id: choice, emotion: choice } : { id: choice, genre: choice };
    // no seed: the song as it always comes out; a seed: another one, titled with it
    return seed ? newProject({ title: `${name} #${seed}`, spec: { ...spec, seed } }) : newProject({ title: name, spec });
}

export function NewProject()
{
    const [kind, setKind] = useState('feeling');
    const [choice, setChoice] = useState('');
    const [seed, setSeed] = useState('');
    if (!dialog.value) return null;
    const options = kind === 'feeling' ? Object.keys(EMOTIONS).map(e => [e, cap(e)])
        : kind === 'genre' ? Object.keys(GENRES).map(g => [g, cap(g)])
        : SONGS.map(s => [s.id, `${s.group} · ${s.label}`]);
    const pick = choice && options.some(o => o[0] === choice) ? choice : options[0]?.[0] ?? '';
    const close = ()=> { dialog.value = false; };
    const create = ()=> { close(); make(kind, pick, seed.trim()); };
    return (
        <div class="dialog-back" onPointerDown={(e)=> e.target === e.currentTarget && close()}>
            <div class="dialog" role="dialog" aria-label="New song" onKeyDown={(e)=> { if (e.key === 'Escape') close(); if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) create(); }}>
                <h2>New song</h2>
                <div class="tabs">
                    {KINDS.map(([id, label])=> <button class={kind === id ? 'on' : ''} onClick={()=> setKind(id)}>{label}</button>)}
                </div>
                <div class="list">
                    {options.map(([id, label])=> <div class={`item ${id === pick ? 'on' : ''}`} onClick={()=> setChoice(id)} onDblClick={()=> { setChoice(id); close(); make(kind, id, seed.trim()); }}>{label}</div>)}
                </div>
                <div class="seed">
                    <label>Seed <input value={seed} placeholder="none: the usual one" spellcheck={false} onInput={(e)=> setSeed(e.currentTarget.value)} /></label>
                    <button title="A random seed: another song in the same style" onClick={()=> setSeed(rollSeed())}>Roll</button>
                </div>
                <p class="hint">{seed.trim()
                    ? `Another take, written from seed ${seed.trim()}: its own key, chords and melody. The same seed writes it again.`
                    : 'The composer writes it: notes in clips, a mix, and Humanize on each track for the feel. Roll a seed for another one.'}</p>
                <div class="actions">
                    <button onClick={close}>Cancel</button>
                    <button class="primary" onClick={create}>Create</button>
                </div>
            </div>
        </div>
    );
}
