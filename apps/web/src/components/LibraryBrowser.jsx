// The browser under the channel rack (Chordinal PRD §7): the instruments by General MIDI family, the drum kits, the
// projects (Open Recent and those in Documents/Chordinal/), and the open project's whistled takes (§9.3). Click an
// instrument or a kit to hear it, double-click to put it on the selected track, or drag it onto a track or the channel
// rack. Click a take to read it onto the selected track at the playhead, or drag it onto a track.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { soundfontLibrary } from '@chordinal/audio';
import { folderTitle, projectFolders } from '@chordinal/ui';
import { settings, setSettings, selected, selectedTrack, projectName, beat } from '@chordinal/ui';
import { place } from '@chordinal/ui';
import { dropTake, takesKept } from '@chordinal/ui';
import { assignPreset } from '@chordinal/ui';
import { liveName } from '@chordinal/ui';
import { preview } from '@chordinal/ui';
import { presetMenu, takeMenu } from '@chordinal/ui';
import { LibraryPicker } from '@chordinal/ui/components';
import { recent, openRecent } from '../files.js';
import { instrumentGroups, kits } from '../rack.js';

const TABS = [['instruments', 'Instruments'], ['kits', 'Kits'], ['projects', 'Projects'], ['takes', 'Takes']];

/** the open project's takes, as last listed */
const takes = signal(/** @type {string[]} */ ([]));

function Preset({ p })
{
    return (
        <div class={`item ${p.name === liveName.value ? 'on' : ''}`} draggable title="Click to hear it, double-click to put it on the selected track"
            onDragStart={(e)=> e.dataTransfer?.setData('application/x-preset', JSON.stringify({ bank: p.bank, program: p.program, name: p.name }))}
            onClick={()=> preview(p)}
            onDblClick={()=> selected.value && assignPreset(selected.value, p)}
            onContextMenu={(e)=> { e.preventDefault(); presetMenu(p); }}>{p.name}</div>
    );
}

function Presets({ kit })
{
    const presets = useMemo(()=> soundfontLibrary.presets(), [settings.value.library]);
    const groups = kit ? [['Drum kits', kits(presets)]] : instrumentGroups(presets);
    return (
        <>
            <div class="list">
                {groups.map(([group, list])=> (
                    <>
                        {!kit && <div class="group">{group}</div>}
                        {list.map(p => <Preset p={p} />)}
                    </>
                ))}
            </div>
            <div class="foot"><LibraryPicker /></div>
        </>
    );
}

function Projects()
{
    const open = projectName.value;
    const [library, setLibrary] = useState(/** @type {{ path: string, name: string }[]} */ ([]));
    useEffect(()=> { let live = true; projectFolders.library().then(l => { if (live) setLibrary(l); }, ()=> {}); return ()=> { live = false; }; }, [open, recent.value]);
    const item = (p, missing = false)=> (
        <div class={`item ${p.path === open ? 'on' : ''} ${missing ? 'missing' : ''}`} title={p.path}
            onClick={()=> p.path !== open && openRecent(p.path)}>{folderTitle(p.path)}</div>
    );
    return (
        <div class="list">
            <div class="group">Recent</div>
            {recent.value.length ? recent.value.map(p => item(p, !p.exists)) : <div class="empty">Projects you open or save show here.</div>}
            <div class="group">Documents/Chordinal</div>
            {library.length ? library.map(p => item(p)) : <div class="empty">No projects saved there yet.</div>}
        </div>
    );
}

function Takes()
{
    const name = projectName.value;
    const kept = takesKept.value;
    // a late answer for a project no longer shown is dropped
    useEffect(()=> { let live = true; if (name) place.files.takes(name).then(t => { if (live) takes.value = t; }, ()=> {}); else takes.value = []; return ()=> { live = false; }; }, [name, kept]);
    const track = selectedTrack.value;
    if (!name) return <div class="list"><div class="empty">Save the project to keep its whistled takes.</div></div>;
    return (
        <>
            <div class="foot">{track ? `Click to read a take onto ${track.name} at the playhead` : 'Select a track to read a take onto it'}</div>
            <div class="list">
                {takes.value.length ? takes.value.map(f => (
                    <div class="item" draggable onDragStart={(e)=> e.dataTransfer?.setData('application/x-take', f)}
                        onClick={()=> track && dropTake(track.id, f, beat.value)}
                        onContextMenu={(e)=> { e.preventDefault(); takeMenu(f, beat.value); }}>{f}</div>
                )) : <div class="empty">Takes you record (●) are kept here.</div>}
            </div>
        </>
    );
}

export function LibraryBrowser()
{
    const tab = TABS.some(([id])=> id === settings.value.browserTab) ? settings.value.browserTab : 'instruments';
    return (
        <div class="browser">
            <div class="tabs">
                {TABS.map(([id, label])=> <button class={tab === id ? 'on' : ''} onClick={()=> setSettings({ browserTab: id })}>{label}</button>)}
            </div>
            {tab === 'projects' ? <Projects /> : tab === 'takes' ? <Takes /> : <Presets kit={tab === 'kits'} />}
        </div>
    );
}
