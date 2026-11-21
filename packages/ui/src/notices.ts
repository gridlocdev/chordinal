// The status bar's notices (PRD §5.6): one of what just happened goes after NOTICE_MS; one of what's under way stays
// until it's done, and an error until it's dismissed or replaced.
import { effect } from '@preact/signals';
import { status, statusTone } from './store.ts';

export const NOTICE_MS = 6000;

/** clears each 'done' notice NOTICE_MS after it's shown, unless another has replaced it; returns a function to stop */
export function startNotices(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return effect(() => {
    const text = status.value,
      tone = statusTone.value;
    clearTimeout(timer);
    if (!text || tone !== 'done') return;
    timer = setTimeout(() => {
      if (status.value === text) status.value = '';
    }, NOTICE_MS);
  });
}
