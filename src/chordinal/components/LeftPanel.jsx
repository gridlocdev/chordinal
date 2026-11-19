// The left panel (Chordinal PRD §5): the channel rack above the browser. The divider between them and the panel's
// right edge drag; both sizes are kept in the settings. B hides and shows the panel.
import { settings, setSettings } from '../../ui/store.js';
import { ChannelRack } from './ChannelRack.jsx';
import { LibraryBrowser } from './LibraryBrowser.jsx';

export const LEFT_W = [180, 0.5];       // px, and at most this much of the window
export const RACK_H = [80, 0.8];        // px, and at most this much of the panel

/** a drag that reports how far the pointer moved, in px */
function dragging(e, along, fn)
{
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = along === 'x' ? e.clientX : e.clientY;
    const move = (m)=> fn((along === 'x' ? m.clientX : m.clientY) - start);
    const up = ()=> { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

export const clampWidth = (w, windowW)=> Math.round(Math.max(LEFT_W[0], Math.min(windowW * LEFT_W[1], w)));
export const clampRack = (h, panelH)=> Math.round(Math.max(RACK_H[0], Math.min(panelH * RACK_H[1], h)));

export function LeftPanel()
{
    const s = settings.value;
    const divider = (e)=>
    {
        const panelH = /** @type {HTMLElement} */ (e.currentTarget.parentElement).clientHeight, h0 = s.rackHeight;
        dragging(e, 'y', d => setSettings({ rackHeight: clampRack(h0 + d, panelH) }));
    };
    const edge = (e)=> { const w0 = s.leftWidth; dragging(e, 'x', d => setSettings({ leftWidth: clampWidth(w0 + d, innerWidth) })); };
    return (
        <div class="left" style={{ '--rack-h': `${s.rackHeight}px` }}>
            <ChannelRack />
            <div class="divider" onPointerDown={divider} title="Drag to resize" />
            <LibraryBrowser />
            <div class="edge" onPointerDown={edge} title="Drag to resize" />
        </div>
    );
}
