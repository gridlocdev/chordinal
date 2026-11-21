// The bar along the bottom of the window (PRD §5.6). On the left, the latest notice: what just happened, what's under
// way, or an error with a button to dismiss it. On the right, what the letter keys play (dimmed while they don't),
// the MIDI keyboard when one is connected, and "Not saved" while the project has changes to save.
import { noteName } from '@chordinal/lib';
import { status, statusTone, notify, settings, dirty } from '../store.ts';
import { liveName, midiInputs, typedRange } from '../live.ts';
import { musicalTyping } from '../focus.ts';

const KEYS_TIP =
  'What the letter keys play. They play while the piano roll is the part last clicked; Z and X move them an octave down or up.';

export function StatusBar() {
  const text = status.value,
    tone = statusTone.value;
  const { lo, hi } = typedRange(settings.value.octave);
  const playing = musicalTyping();
  const midi = midiInputs.value;
  return (
    <footer class="status-bar">
      <div class={`notice ${tone}`} role="status">
        {text && <span class="text">{text}</span>}
        {text && tone === 'error' && (
          <button class="ghost dismiss" aria-label="Dismiss" title="Dismiss" onClick={() => notify('')}>
            ×
          </button>
        )}
      </div>
      <div class="facts">
        <span class={`keys ${playing ? '' : 'idle'}`} title={KEYS_TIP}>
          Keys {noteName(lo)}–{noteName(hi)}
          {liveName.value && ` · ${liveName.value}`}
        </span>
        {midi.length > 0 && <span class="midi">MIDI: {midi.join(', ')}</span>}
        {dirty.value && <span class="unsaved">Not saved</span>}
      </div>
    </footer>
  );
}
