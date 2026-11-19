// The open song, to listen to (Chordinal PRD §9.1): its sections along a bar that shows and moves the playhead, and
// its tracks. Editing it is Chordinal's: Open in Chordinal.
import { project, beat } from '../../ui/store.js';
import { projectEnd } from '../../daw/project.js';
import { beatToSeconds } from '../../lib/tempo-map.js';
import { seek } from '../../ui/player.js';
import { rgba } from '../../ui/components/canvas.js';

const clock = (s)=> `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function Song()
{
    const p = project.value, end = projectEnd(p) || 1;
    const at = (b)=> `${(100 * Math.min(1, b / end)).toFixed(2)}%`;
    const click = (e)=>
    {
        const box = e.currentTarget.getBoundingClientRect();
        seek(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * end);
    };
    return (
        <div class="song">
            <h1>{p.title}</h1>
            <p class="length">{clock(beatToSeconds(p.tempoMap, end))} · {p.tracks.length} tracks</p>
            <div class="timeline" title="Click to move the playhead" onPointerDown={click}>
                {p.markers.map(m => <span class="marker" style={{ left: at(m.beat) }}>{m.name}</span>)}
                <div class="done" style={{ width: at(beat.value) }} />
            </div>
            <ul class="tracks">
                {p.tracks.map(t => <li class={t.mixer.mute ? 'muted' : ''}><span class="swatch" style={{ background: rgba(t.color) }} />{t.name}</li>)}
            </ul>
            <p class="hint">To change the song, Open in Chordinal.</p>
        </div>
    );
}
