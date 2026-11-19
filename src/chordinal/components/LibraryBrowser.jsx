// The browser under the channel rack (Chordinal PRD §7): the instruments by General MIDI family, the drum kits, and the
// projects (Open Recent and those in Documents/Chordinal/). Click an instrument or a kit to hear it, double-click to put
// it on the selected track, or drag it onto a track or the channel rack.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { soundfontLibrary } from '../../audio/soundfont-library.js';
import { folderTitle, projectFolders } from '../../platform/project-folders.js';
import { settings, setSettings, selected, projectName } from '../../ui/store.js';
import { assignPreset } from '../../ui/tracks.js';
import { liveName } from '../../ui/live.js';
import { preview } from '../../ui/preview.js';
import { presetMenu } from '../../ui/context-menus.js';
import { LibraryPicker } from '../../ui/components/Browser.jsx';
import { recent, openRecent } from '../files.js';
import { instrumentGroups, kits } from '../rack.js';

const TABS = [['instruments', 'Instruments'], ['kits', 'Kits'], ['projects', 'Projects']];

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

export function LibraryBrowser()
{
    const tab = TABS.some(([id])=> id === settings.value.browserTab) ? settings.value.browserTab : 'instruments';
    return (
        <div class="browser">
            <div class="tabs">
                {TABS.map(([id, label])=> <button class={tab === id ? 'on' : ''} onClick={()=> setSettings({ browserTab: id })}>{label}</button>)}
            </div>
            {tab === 'projects' ? <Projects /> : <Presets kit={tab === 'kits'} />}
        </div>
    );
}
