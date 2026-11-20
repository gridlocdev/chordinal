// What the track headers and the browser do (Chordinal PRD §6, §7), apart from how they look: the instruments grouped
// by General MIDI family, the kits, opening a track's editor from its header, and adding tracks.
import { beat, selected, selectedClip, setSettings } from '../ui/store.js';
import { addNewTrack, newClipAt, assignPreset, trackOf } from '../ui/tracks.js';
import { isDrums } from '../daw/project.js';

/** the sixteen General MIDI families, eight programs each */
export const GM_FAMILIES = ['Piano', 'Chromatic Percussion', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass',
    'Reed', 'Pipe', 'Synth Lead', 'Synth Pad', 'Synth Effects', 'Ethnic', 'Percussive', 'Sound Effects'];

export const STANDARD_KIT = { bank: 128, program: 0 };

const isKit = (p)=> p.bank >= 128;

/** @returns {[string, any[]][]} the melodic presets by family, in family order, each in the library's order */
export function instrumentGroups(presets)
{
    const by = GM_FAMILIES.map(()=> /** @type {any[]} */ ([]));
    for (const p of presets) if (!isKit(p)) by[Math.floor(p.program / 8) % 16].push(p);
    return /** @type {[string, any[]][]} */ (GM_FAMILIES.map((f, i)=> [f, by[i]]).filter(([, list])=> list.length));
}

/** the drum kits */
export const kits = (presets)=> presets.filter(isKit);

/** a track header's double-click (§6.2): selects the track and opens its editor, first making a clip at the playhead if it has
 * none there (a 1-bar pattern on a drum track) */
export function openTrack(trackId)
{
    const t = trackOf(trackId);
    if (!t) return;
    selected.value = trackId;
    const at = beat.value;
    const c = t.clips.findLast(x => at >= x.start && at < x.start + x.beats);
    if (c) selectedClip.value = { track: trackId, clip: c.id };
    else newClipAt(trackId, at, isDrums(t) ? 1 : undefined);
    setSettings({ editorTab: isDrums(t) ? 'grid' : 'roll' });
}

/** + Add Track (§6.4): an instrument track below the selected one */
export const addInstrumentTrack = ()=> addNewTrack({ after: selected.value });

/** + Add Drums (§6.4): a drum track with the Standard kit */
export const addDrumTrack = ()=> addNewTrack({ instrument: STANDARD_KIT, after: selected.value, name: 'Drums' });

/** an instrument dropped on a track sets that track's; dropped below the tracks, it adds a track with it (§6.3) */
export function dropInstrument(trackId, preset)
{
    const instrument = { bank: preset.bank, program: preset.program };
    if (trackId) { assignPreset(trackId, instrument); selected.value = trackId; return trackId; }
    return addNewTrack({ instrument, name: preset.name });
}
