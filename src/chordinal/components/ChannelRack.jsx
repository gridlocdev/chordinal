// The channel rack (Chordinal PRD §6): a row per track, in track order, with its colour, name, instrument, mute, solo
// and a volume knob. Click a row to select the track, double-click to open its editor, drag rows to reorder them, and
// drop an instrument on a row (or below the rows) to play it there (or on a new track).
import { useState } from 'preact/hooks';
import { presetFor } from '../../daw/instruments.js';
import { setMixer } from '../../daw/project.js';
import { project, selected, settings, FADER_FLOOR_DB } from '../../ui/store.js';
import { edit } from '../../ui/document.js';
import { toggleMute, toggleSolo, moveTrackTo } from '../../ui/tracks.js';
import { trackMenu } from '../../ui/context-menus.js';
import { rgba } from '../../ui/components/canvas.js';
import { openTrack, addInstrumentTrack, addDrumTrack, dropInstrument } from '../rack.js';

const DB = [FADER_FLOOR_DB, 6];
const DB_PER_PX = 0.25;
const SWEEP = 270;                      // degrees from the knob's lowest to its highest
const PRESET = 'application/x-preset', TRACK = 'application/x-track';
const has = (e, type)=> !!e.dataTransfer?.types.includes(type);

/** a track's volume: drag up or down, double-click for 0 dB. A drag is one undo step. */
function Knob({ track })
{
    const v = track.mixer.volumeDb;
    const set = (db)=> edit(p => setMixer(p, track.id, { volumeDb: db }), `mix:${track.id}:volumeDb`);
    const down = (e)=>
    {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const y0 = e.clientY, start = v;
        const move = (m)=> set(Math.round(Math.max(DB[0], Math.min(DB[1], start - (m.clientY - y0) * DB_PER_PX)) * 2) / 2);
        const up = ()=> { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
    };
    const turn = -SWEEP / 2 + SWEEP * (v - DB[0]) / (DB[1] - DB[0]);
    return (
        <div class="knob" role="slider" aria-label={`${track.name} volume`} aria-valuenow={v} aria-valuemin={DB[0]} aria-valuemax={DB[1]}
            title={`Volume ${v > 0 ? '+' : ''}${v.toFixed(1)} dB (double-click for 0 dB)`}
            onPointerDown={down} onDblClick={(e)=> { e.stopPropagation(); set(0); }}>
            <div class="mark" style={{ transform: `rotate(${turn}deg)` }} />
        </div>
    );
}

function Row({ track, index })
{
    const [drop, setDrop] = useState(false);
    const m = track.mixer;
    const over = (e)=> { if (has(e, PRESET) || has(e, TRACK)) { e.preventDefault(); setDrop(true); } };
    const dropped = (e)=>
    {
        setDrop(false);
        e.preventDefault();
        e.stopPropagation();
        if (has(e, PRESET)) dropInstrument(track.id, JSON.parse(e.dataTransfer.getData(PRESET)));
        else if (has(e, TRACK)) moveTrackTo(e.dataTransfer.getData(TRACK), index);
    };
    return (
        <div class={`row ${selected.value === track.id ? 'on' : ''} ${drop ? 'drop' : ''}`} data-id={track.id} style={{ '--track': rgba(track.color) }}
            draggable onDragStart={(e)=> e.dataTransfer?.setData(TRACK, track.id)}
            onClick={()=> { selected.value = track.id; }} onDblClick={()=> openTrack(track.id)}
            onContextMenu={(e)=> { e.preventDefault(); trackMenu(track.id); }}
            onDragOver={over} onDragLeave={()=> setDrop(false)} onDrop={dropped}>
            <span class="swatch" />
            <span class="names">
                <span class="name">{track.name}</span>
                <span class="inst">{presetFor(track.instrument.bank, track.instrument.program).name}</span>
            </span>
            <span class="ms" onClick={(e)=> e.stopPropagation()} onDblClick={(e)=> e.stopPropagation()}>
                <button class={`mute ${m.mute ? 'on' : ''}`} title="Mute" onClick={()=> toggleMute(track.id)}>M</button>
                <button class={`solo ${m.solo ? 'on' : ''}`} title="Solo" onClick={()=> toggleSolo(track.id)}>S</button>
            </span>
            <Knob track={track} />
        </div>
    );
}

export function ChannelRack()
{
    settings.value.library;
    const [drop, setDrop] = useState(false);
    const tracks = project.value.tracks;
    return (
        <div class="rack">
            <div class="rows">
                {tracks.map((t, i)=> <Row key={t.id} track={t} index={i} />)}
                <div class={`below ${drop ? 'drop' : ''}`}
                    onDragOver={(e)=> { if (has(e, PRESET) || has(e, TRACK)) { e.preventDefault(); setDrop(true); } }}
                    onDragLeave={()=> setDrop(false)}
                    onDrop={(e)=>
                    {
                        setDrop(false);
                        e.preventDefault();
                        if (has(e, PRESET)) dropInstrument(null, JSON.parse(e.dataTransfer.getData(PRESET)));
                        else if (has(e, TRACK)) moveTrackTo(e.dataTransfer.getData(TRACK), tracks.length - 1);
                    }}>
                    {tracks.length ? '' : 'No tracks yet'}
                </div>
            </div>
            <div class="add">
                <button onClick={addInstrumentTrack} title="Add an instrument track (⌥⌘N)">+ Add Track</button>
                <button onClick={addDrumTrack} title="Add a drum track with the Standard kit">+ Add Drums</button>
            </div>
        </div>
    );
}
