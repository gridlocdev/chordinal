// A canvas that redraws itself: `draw` runs inside a signal effect, so it runs again whenever a signal it read
// changes, whenever the component renders (new props), and whenever the canvas is resized. Drawing is in CSS
// pixels; the backing store follows the screen's density.
import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { effect, signal } from '@preact/signals';

/** draws on a canvas of w × h CSS pixels */
export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export function useCanvas(draw: Draw): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const rendered = useRef(signal(0)).current;
  useEffect(() => {
    rendered.value++;
  });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const size = signal({ w: 0, h: 0 });
    const observer = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      size.value = { w: Math.round(r.width), h: Math.round(r.height) };
    });
    observer.observe(canvas);
    const stop = effect(() => {
      const { w, h } = size.value;
      void rendered.value;
      if (!w || !h) return;
      const dpr = devicePixelRatio || 1;
      const W = Math.round(w * dpr),
        H = Math.round(h * dpr); // a fractional density (1.25) would resize every time
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      drawRef.current(g, w, h);
    });
    return () => {
      stop();
      observer.disconnect();
    };
  }, []);
  return ref;
}

/** a track's colour as CSS, from its role's rgb 0..1 */
export const rgba = ([r = 0, g = 0, b = 0]: readonly number[], a = 1): string =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
