// The Sound tab's controls for a sampler (Chordinal PRD §14), as data, in the shape of the synth's (synth-controls.ts).
import { envelope, num, withValue, type SynthSection } from './synth-controls.ts';
import { samplerSettings, type SamplerSettings } from './sampler-settings.ts';

/** the Sound tab's sections for a sampler */
export const SAMPLER_SECTIONS: readonly SynthSection<SamplerSettings>[] = [
  {
    title: 'Sample',
    controls: [
      num<SamplerSettings>('root', 'Root key', 0, 127, 'linear', 'key', { whole: true }),
      {
        kind: 'choice',
        path: 'mode',
        label: 'Mode',
        choices: [
          ['oneshot', 'One-shot'],
          ['loop', 'Sustain loop'],
        ],
      },
      num<SamplerSettings>('start', 'Start', 0, 0.99, 'curve', '%'),
    ],
  },
  { title: 'Amp envelope', controls: envelope<SamplerSettings>('amp') },
];

/** new settings with `path` set to `value`, held in range */
export const withSamplerValue = (s: SamplerSettings, path: string, value: unknown): SamplerSettings =>
  samplerSettings(withValue(s, path, value));
