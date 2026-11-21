import { createRequire } from 'node:module';
import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

const require = createRequire(import.meta.url);

// The microphone's AudioWorklet is loaded by URL, so it ships as its own file next to the page, unbundled.
const micWorklet: Plugin = {
  name: 'chordinal-mic-worklet',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'mic-worklet.js',
      source: fs.readFileSync(require.resolve('@chordinal/playback/mic-worklet.js'), 'utf8'),
    });
  },
};

// `base: './'` keeps every URL relative, so one build serves from Electron's app:// scheme and from any folder on a
// web server. The fixed names (chordinal.js, chordinal.css) are what the desktop app and its tests look for.
export default defineConfig({
  base: './',
  plugins: [preact(), micWorklet],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome140',
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: 'chordinal.js',
        chunkFileNames: 'chordinal-[name].js',
        assetFileNames: (info) =>
          info.names.some((n) => n.endsWith('.css')) ? 'chordinal.css' : '[name][extname]',
      },
    },
  },
});
