// The panel under the arrangement: the piano roll for the selected track, the step grid for its clip, or the mixer.
import { settings, setSettings } from '../store.js';
import { PianoRoll } from './PianoRoll.jsx';
import { Mixer } from './Mixer.jsx';
import { StepGrid } from './StepGrid.jsx';

const TABS = [['roll', 'Piano Roll'], ['mixer', 'Mixer'], ['grid', 'Step Grid']];

export function Editor()
{
    const tab = settings.value.editorTab;
    return (
        <div class="editor">
            <div class="tabs">
                {TABS.map(([id, label])=> <button class={tab === id ? 'on' : ''} onClick={()=> setSettings({ editorTab: id })}>{label}</button>)}
            </div>
            {tab === 'roll' ? <PianoRoll /> : tab === 'grid' ? <StepGrid /> : <Mixer />}
        </div>
    );
}
