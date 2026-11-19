// Music Generator's bar across the top (Chordinal PRD §9.1): go to start, stop, play; where the playhead is; the song's
// tempo, meter and key; its title, with * when it isn't saved; New…, Save and Open in Chordinal; what's loading; the
// master volume. Nothing here edits the song: that is Chordinal's.
import { computed } from '@preact/signals';
import { audioEngine } from '../../platform/audio-engine.js';
import { meterAt } from '../../daw/meter.js';
import { bpmAt } from '../../lib/tempo-map.js';
import { noteName } from '../../lib/notes.js';
import { project, dirty, beat, playing, status, settings, setSettings } from '../../ui/store.js';
import { save } from '../../ui/document.js';
import { play, stop, seek } from '../../ui/player.js';
import { newDialog } from '../../ui/dialogs.js';
import { position, modeName } from '../../ui/components/Transport.jsx';
import { openInChordinal } from '../open-in-chordinal.js';

const bpmNow = computed(()=> Math.round(bpmAt(project.value.tempoMap, beat.value)));
const sigNow = computed(()=> meterAt(project.value.meters, beat.value).sig);

function Position()
{
    return <span class="pos">{position(project.value.meters, beat.value)}</span>;
}

export function Player()
{
    const p = project.value;
    return (
        <div class="transport">
            <div class="buttons">
                <button title="Go to the start" onClick={()=> seek(0)}>⏮</button>
                <button title="Stop (Space) · again to go to the start" onClick={stop}>■</button>
                <button class={`play ${playing.value ? 'on' : ''}`} title="Play (Space)" onClick={()=> play()}>▶</button>
            </div>
            <div class="lcd">
                <Position />
                <span>{bpmNow.value} bpm</span>
                <span>{sigNow.value}</span>
                {p.key && <span><b>{`${noteName(60 + p.key.tonic).replace(/-?\d+$/, '')} ${modeName(p.key.mode)}`}</b></span>}
            </div>
            <div class="title">{p.title}{dirty.value ? ' *' : ''}</div>
            <div class="buttons file">
                <button title="Write a new song (Cmd+N)" onClick={()=> { newDialog.value = true; }}>New…</button>
                <button title="Save (Cmd+S)" onClick={save}>Save</button>
                <button class="primary" title="Copy the song into Documents/Chordinal and open it there, to edit" onClick={openInChordinal}>Open in Chordinal</button>
            </div>
            {status.value && <div class="status" role="status">{status.value}</div>}
            <label class="master" title="Master volume">Vol
                <input type="range" min="0" max="1" step="0.01" value={settings.value.volume}
                    onInput={(e)=> { const v = Number(e.currentTarget.value); audioEngine.volume = v; setSettings({ volume: v }); }} />
            </label>
        </div>
    );
}
