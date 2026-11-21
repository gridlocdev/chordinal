// The browser on the left (Chordinal PRD §5): its right edge drags, and the width is kept in the settings. B hides and
// shows it.
import { settings, setSettings } from '@chordinal/ui';
import { LibraryBrowser } from './LibraryBrowser.jsx';

export const LEFT_W = [200, 0.5];       // px, and at most this much of the window

export const clampWidth = (w, windowW)=> Math.round(Math.max(LEFT_W[0], Math.min(windowW * LEFT_W[1], w)));

export function SidePanel()
{
    const edge = (e)=>
    {
        e.currentTarget.setPointerCapture(e.pointerId);
        const x0 = e.clientX, w0 = settings.value.leftWidth;
        const move = (m)=> setSettings({ leftWidth: clampWidth(w0 + m.clientX - x0, innerWidth) });
        const up = ()=> { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
    };
    return (
        <div class="side-panel">
            <LibraryBrowser />
            <div class="edge" onPointerDown={edge} title="Drag to resize" />
        </div>
    );
}
