// The panel under the arrangement: the piano roll for the selected track, the step grid for its clip, or the mixer.
// Its tabs and the open view's toolbar share the bar across its top.
import { settings, setSettings } from '../store.ts';
import { PianoRoll } from './PianoRoll.jsx';
import { RollToolbar } from './RollToolbar.jsx';
import { Mixer } from './Mixer.jsx';
import { StepGrid, GridToolbar } from './StepGrid.jsx';

const TABS = [['roll', 'Piano Roll'], ['mixer', 'Mixer'], ['grid', 'Step Grid']];

export function Editor()
{
    const tab = settings.value.editorTab;
    return (
        <div class="editor">
            <div class="bar">
                <div class="tabs seg" role="tablist">
                    {TABS.map(([id, label])=> <button role="tab" aria-selected={tab === id} class={tab === id ? 'on' : ''} onClick={()=> setSettings({ editorTab: id })}>{label}</button>)}
                </div>
                {tab === 'roll' ? <RollToolbar /> : tab === 'grid' ? <GridToolbar /> : null}
            </div>
            {tab === 'roll' ? <PianoRoll /> : tab === 'grid' ? <StepGrid /> : <Mixer />}
        </div>
    );
}
