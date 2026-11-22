import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Packages are used through their entry points, never through their other source files. `@chordinal/ui/native-bridge` is the desktop bridge's interface, which the preload imports as types alone. */
const DEEP_IMPORTS = {
  regex: '^(@chordinal/[^/]+/(?!components$|ui\\.css$|mic-worklet\\.js$|native-bridge$)|(\\.\\./)+packages/)',
  message: "Import from the package's entry point (@chordinal/daw, @chordinal/ui, …), not from its files.",
};

/** what each package may import: the layers, low to high */
const LAYERS = {
  lib: [],
  audio: ['lib'],
  daw: ['lib'],
  sketch: ['lib', 'daw'],
  playback: ['lib', 'audio', 'daw', 'sketch'],
  ui: ['lib', 'audio', 'daw', 'sketch', 'playback'],
};
const ALL = Object.keys(LAYERS);
const PURE = ['lib', 'audio', 'daw', 'sketch'];
/** the apps, which nothing imports from */
const APPS = { group: ['@chordinal/ui', '@chordinal/ui/*', '@chordinal/desktop', '@chordinal/web'], message: 'The CLI uses the engine, never the UI or another app.' };
const APP_PATHS = { regex: '^(\\.\\./)+(apps/)?(web|desktop)/', message: 'The CLI uses the engine, never the UI or another app.' };

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out/**', '**/release/**', 'build/**', 'export/**', 'reference/**', 'scratch/**', '.ab/**', '.e2e-results/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      'no-restricted-imports': ['error', { patterns: [DEEP_IMPORTS] }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
  {
    // an AudioWorklet runs in its own scope
    files: ['packages/playback/src/mic-worklet.js'],
    languageOptions: { globals: { ...globals.audioWorklet } },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // the layers: a package imports only those below it
  ...Object.entries(LAYERS).map(([name, may]) => ({
    files: [`packages/${name}/src/**`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            DEEP_IMPORTS,
            ...(ALL.some((p) => p !== name && !may.includes(p))
              ? [
                  {
                    group: ALL.filter((p) => p !== name && !may.includes(p)).map((p) => `@chordinal/${p}`),
                    message: `@chordinal/${name} may import only ${may.map((p) => `@chordinal/${p}`).join(', ') || 'no other package'}.`,
                  },
                ]
              : []),
            ...(PURE.includes(name)
              ? [{ group: ['node:*', 'preact', 'preact/*', '@preact/*'], message: 'The engine stays pure: no Node, no Preact.' }]
              : []),
          ],
        },
      ],
      ...(PURE.includes(name)
        ? { 'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'AudioContext', 'OfflineAudioContext'] }
        : {}),
    },
  })),
  // the CLI: Node and the engine packages; its render page (src/page/) runs in the browser, so it plays through
  // playback instead of Node
  {
    files: ['apps/cli/src/**', 'apps/cli/test/**'],
    ignores: ['apps/cli/src/page/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            DEEP_IMPORTS,
            APP_PATHS,
            { ...APPS, group: [...APPS.group, '@chordinal/playback'], message: 'The CLI runs in Node: it uses the engine packages, never playback, the UI or another app.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/cli/src/page/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [DEEP_IMPORTS, APP_PATHS, APPS, { group: ['node:*'], message: 'The render page runs in the browser: no Node.' }] },
      ],
    },
  },
);
