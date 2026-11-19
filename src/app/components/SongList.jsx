// The songs in projects/: the ones Music Generator ships with and any saved since. Clicking one opens it to play.
import { projectName, projectList } from '../../ui/store.js';
import { openProject } from '../../ui/document.js';
import { newDialog } from '../../ui/dialogs.js';

export function SongList()
{
    const open = projectName.value;
    return (
        <div class="browser songs">
            <div class="foot"><button onClick={()=> { newDialog.value = true; }}>New song…</button></div>
            <div class="list">
                {projectList.value.length ? projectList.value.map(p => (
                    <div class={`item ${p.name === open ? 'on' : ''}`} title={`projects/${p.name}`} onClick={()=> p.name !== open && openProject(p.name)}>{p.title}</div>
                )) : <div class="empty">No songs yet. Write one with New song.</div>}
            </div>
        </div>
    );
}
