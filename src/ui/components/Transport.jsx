// The bar across the top. On the left, the browser's toggle, the project's title (a dot when there are changes to save)
// and what's loading; in the middle, go to start, stop, play, record and the metronome, then a display of where the
// playhead is, the tempo and meter (both editable), the key and the section; on the right, New, Save, Save as and the
// master volume.
import { computed } from '@preact/signals';
import { audioEngine } from '../../platform/audio-engine.js';
import { barAt, meterAt, beatsPerBar } from '../../daw/meter.js';
import { setTempo, setMeter } from '../../daw/timeline.js';
import { bpmAt } from '../../lib/tempo-map.js';
import { noteName } from '../../lib/notes.js';
import { project, dirty, beat, playing, status, settings, setSettings } from '../store.js';
import { edit, save, saveAs } from '../document.js';
import { play, stop, seek } from '../player.js';
import { recording, record } from '../recording.js';

/** 'harmonicMinor' → 'harmonic minor' */
export const modeName = (mode)=> mode.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`);

/** '12.3' : bar and beat, from 1 */
export function position(meters, b)
{
    const at = barAt(meters, b);
    return `${at.bar + 1}.${Math.floor(b - at.start + 1e-6) + 1}`;
}

const validMeter = (s)=> /^\d{1,2}\/(2|4|8|16)$/.test(s) && beatsPerBar(s) > 0;

// what the playhead is in: these change a few times a song, so the bar re-renders then and not on every frame of
// playback (which would also undo typing in the tempo and meter boxes)
const bpmNow = computed(()=> Math.round(bpmAt(project.value.tempoMap, beat.value)));
const sigNow = computed(()=> meterAt(project.value.meters, beat.value).sig);
const markerNow = computed(()=> project.value.markers.findLast(m => m.beat <= beat.value + 1e-6)?.name ?? '');

/** where the playhead is, the one part that changes every frame */
function Position()
{
    return <span class="pos">{position(project.value.meters, beat.value)}</span>;
}

/** the transport's icons: 16px line drawings in the text colour */
const ICON = {
    start: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="1.8" height="10" rx=".6" /><path d="M13 3.6v8.8a.6.6 0 0 1-.92.5L5.6 8.5a.6.6 0 0 1 0-1l6.48-4.4a.6.6 0 0 1 .92.5Z" /></svg>,
    stop: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /></svg>,
    play: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.9v10.2a.7.7 0 0 0 1.06.6l8.3-5.1a.7.7 0 0 0 0-1.2l-8.3-5.1a.7.7 0 0 0-1.06.6Z" /></svg>,
    rec: <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4.6" /></svg>,
    click: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M5.6 2.5h4.8L13 13.5H3z" /><path d="M8 11 11 4.5" /></svg>,
    panel: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3v10" /></svg>,
    volume: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" /><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" /></svg>,
};

/** one labelled cell of the display */
const Cell = ({ label, children, title = '' })=> <div class="cell" title={title}>{children}<small>{label}</small></div>;

/**
 * @param {{ onNew: ()=> void, newLabel?: string }} props  what New does: the app's own new project
 */
export function Transport({ onNew, newLabel = 'New' })
{
    const p = project.value;
    const bpm = bpmNow.value, sig = sigNow.value, marker = markerNow.value;
    return (
        <div class="transport">
            <div class="side">
                <button class={`ghost panel-toggle ${settings.value.browserOpen ? '' : 'off'}`} title="Show or hide the browser (B)"
                    onClick={()=> setSettings({ browserOpen: !settings.value.browserOpen })}>{ICON.panel}</button>
                <div class="doc">
                    <div class="title" title={dirty.value ? 'Changes not saved yet' : ''}>{p.title}{dirty.value && <span class="dirty" aria-label="not saved" />}</div>
                    {status.value && <div class="status" role="status">{status.value}</div>}
                </div>
            </div>
            <div class="center">
                <div class="buttons">
                    <button title="Go to the start" aria-label="Go to the start" onClick={()=> seek(0)}>{ICON.start}</button>
                    <button title="Stop (Space) · again to go to the start" aria-label="Stop" onClick={stop}>{ICON.stop}</button>
                    <button class={`play ${playing.value ? 'on' : ''}`} title="Play (Space)" aria-label="Play" onClick={()=> play()}>{ICON.play}</button>
                    <button class={`rec ${recording.value ? 'on' : ''}`} aria-label="Record" title="Record a whistled melody on the selected track, or a chord over the stretch picked on the chord track (R)"
                        onClick={record}>{ICON.rec}</button>
                    <button class={`click ${settings.value.metronome ? 'on' : ''}`} aria-label="Metronome" title="Metronome: a click on every beat while playing"
                        onClick={()=> setSettings({ metronome: !settings.value.metronome })}>{ICON.click}</button>
                </div>
                <div class="lcd">
                    <Cell label="Bar · beat"><Position /></Cell>
                    <Cell label="Tempo"><span class="value"><input class="num" type="number" min="20" max="300" value={bpm} title="Tempo: changes the whole tempo map in proportion"
                        onChange={(e)=> { const v = Number(e.currentTarget.value); if (v >= 20 && v <= 300) edit(q => setTempo(q, v)); else e.currentTarget.value = String(bpm); }} /></span></Cell>
                    <Cell label="Meter"><span class="value"><input class="num meter" value={sig} title="Meter (the first one; 4/4, 6/8, 7/8…)"
                        onChange={(e)=> { const v = e.currentTarget.value.trim(); if (validMeter(v)) edit(q => setMeter(q, v)); else e.currentTarget.value = sig; }} /></span></Cell>
                    {p.key && <Cell label="Key"><span class="value key">{`${noteName(60 + p.key.tonic).replace(/-?\d+$/, '')} ${modeName(p.key.mode)}`}</span></Cell>}
                    {marker && <Cell label="Section"><span class="value key">{marker}</span></Cell>}
                </div>
            </div>
            <div class="side end">
                <div class="file">
                    <button class="ghost" title="New project (Cmd+N)" onClick={onNew}>{newLabel}</button>
                    <button class="ghost" title="Save (Cmd+S)" onClick={save}>Save</button>
                    <button class="ghost" title="Save as (Shift+Cmd+S)" onClick={saveAs}>Save as…</button>
                </div>
                <label class="master" title="Master volume">{ICON.volume}
                    <input type="range" min="0" max="1" step="0.01" value={settings.value.volume} aria-label="Master volume"
                        onInput={(e)=> { const v = Number(e.currentTarget.value); audioEngine.volume = v; setSettings({ volume: v }); }} />
                </label>
            </div>
        </div>
    );
}
