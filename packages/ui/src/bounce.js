// Export as Audio File: the project, or a stretch of it, played into an offline context, faster than it would play,
// and saved as a stereo WAV: the mix, or each track on its own into a folder (stems, all the same length). It plays
// as Play would (instruments, mixer, automation, Humanize) but once through, with no loop.
import { signal } from '@preact/signals';
import { loadInstruments } from '@chordinal/playback';
import { playProject, LEAD_IN } from '@chordinal/playback';
import { projectEnd } from '@chordinal/daw';
import { beatToSeconds } from '@chordinal/lib';
import { encodeWavChannels, normalize, peakOf } from '@chordinal/lib';
import { audioEngine } from '@chordinal/playback';
import { appMenu } from './platform/app-menu.js';
import { project, projectName, mix, status, exporting } from './store.js';
import { stop } from './player.js';

/** whether the Export dialog is open */
export const exportDialog = signal(false);

export const TAIL = 3;          // seconds after the last beat, for reverb and release
const PEAK_DB = -1;             // a normalized export's peak

/** a file name without the characters a file system won't take */
const fileName = (s)=> s.replace(/[/\\:*?"<>|]/g, '-').trim() || 'untitled';

/** the stretch `from`–`to` (beats) played with `gains`, then `tail` seconds: two channels */
async function render(p, instruments, from, to, tail, gains)
{
    const seconds = LEAD_IN + beatToSeconds(p.tempoMap, to) - beatToSeconds(p.tempoMap, from) + tail;
    let handle = null;
    const buffer = await audioEngine.render(seconds, ()=>
    {
        let tick = ()=> {};
        handle = playProject(p, instruments, { from, until: to, mix: gains, ticker: (ms, fn)=> { tick = fn; return ()=> {}; } });
        return ()=> tick();
    });
    try { handle?.stop(); } catch { /* its nodes went with the offline context */ }
    const skip = Math.round(LEAD_IN * buffer.sampleRate);
    return { channels: [0, 1].map(c => buffer.getChannelData(c).slice(skip)), rate: buffer.sampleRate };
}

/**
 * renders each of `count` stems and writes it before the next is rendered, so only one stem is held at a time. A
 * normalized export needs one gain for them all, so it first renders every stem to find the loudest peak, then
 * renders each again to write it.
 * @param {{ count: number, render: (n: number)=> Promise<{ channels: Float32Array[], rate: number }>,
 *   write: (n: number, bytes: Uint8Array)=> Promise<unknown>, normalized: boolean, say: (n: number, measuring: boolean)=> void }} o
 */
export async function writeStems({ count, render, write, normalized, say })
{
    let peak = 0;
    if (normalized)
        for (let n = 0; n < count; n++) { say(n, true); peak = Math.max(peak, peakOf((await render(n)).channels)); }
    for (let n = 0; n < count; n++)
    {
        say(n, false);
        const { channels, rate } = await render(n);
        await write(n, encodeWavChannels(normalized ? normalize(channels, PEAK_DB, peak) : channels, rate));
    }
}

/**
 * exports the project as audio
 * @param {{ range?: { from: number, to: number } | null, stems?: boolean, normalized?: boolean, tail?: number }} [options]
 *   range: the beats to export (the whole project without one); stems: each audible track into a folder of its own
 *   files rather than the mix; normalized: the loudest peak brought to −1 dB (for stems, one gain for them all, so
 *   they keep their balance); tail: seconds after the end, for reverb and release
 */
export async function bounce(options = {})
{
    if (exporting.value) return;
    stop();
    exporting.value = true;
    try { await exportAudio(options); }
    finally { exporting.value = false; }
}

async function exportAudio({ range = null, stems = false, normalized = false, tail = TAIL })
{
    const p = { ...project.value, loop: null };
    const name = fileName(projectName.value || p.title || 'untitled');
    const from = range?.from ?? 0, to = range?.to ?? projectEnd(p);
    const gains = mix.value;
    try
    {
        const instruments = await loadInstruments(p.tracks, text => { status.value = text; });
        if (!stems)
        {
            status.value = 'Bouncing…';
            const { channels, rate } = await render(p, instruments, from, to, tail, gains);
            const file = await appMenu.saveFile(`${name}.wav`, encodeWavChannels(normalized ? normalize(channels, PEAK_DB) : channels, rate));
            status.value = file ? `Exported ${file}` : '';
            return;
        }
        // a track is exported if it is heard and has a clip in the range
        const audible = p.tracks.map((t, i)=> i).filter(i => gains[i]?.gain > 0 && p.tracks[i].clips.some(c => c.start < to && c.start + c.beats > from && c.notes.length && !c.mute));
        if (!audible.length) { status.value = 'No track to export: none is heard in that range'; return; }
        const folder = await appMenu.chooseFolder(`${name} stems`);
        if (!folder) { status.value = ''; return; }
        const used = new Set();
        const names = audible.map(i =>
        {
            let file = `${name} - ${fileName(p.tracks[i].name)}`;
            for (let k = 2; used.has(file); k++) file = `${name} - ${fileName(p.tracks[i].name)} ${k}`;
            used.add(file);
            return `${file}.wav`;
        });
        await writeStems({
            count: audible.length,
            render: (n)=> render(p, instruments, from, to, tail, gains.map((g, k)=> k === audible[n] ? g : { ...g, gain: 0 })),
            write: (n, bytes)=> appMenu.writeInFolder(names[n], bytes),
            normalized,
            say: (n, measuring)=> { status.value = `${measuring ? 'Measuring' : 'Bouncing'} ${p.tracks[audible[n]].name} (${n + 1} of ${audible.length})…`; },
        });
        status.value = `Exported ${audible.length} tracks to ${folder}`;
    }
    catch (e) { status.value = `Couldn't export: ${e.message}`; }
}
