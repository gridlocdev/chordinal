# list recipes
default:
    @just --list

# install the desktop app (~/Applications/Chordinal.app on macOS) that runs this checkout
install: build
    bash tools/install-app.sh

# install the workspace's pinned packages (pnpm) and Electron
deps:
    @[ -d node_modules/preact ] && [ -d node_modules/esbuild ] && [ -d node_modules/electron ] && [ -d node_modules/typescript ] || pnpm install
    @[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js

# build the page (apps/web/src/main.jsx) into apps/web/dist/
build: deps
    node tools/build.mjs

# on macOS it starts through `open`, so macOS asks for the microphone for the app, not for the terminal
# build and run Chordinal, the DAW for making music by hand: its projects are folders anywhere (Documents/Chordinal/ by default)
chordinal: build
    #!/usr/bin/env sh
    if [ "$(uname)" = Darwin ]; then
        open -W -n node_modules/electron/dist/Electron.app --args "$PWD/apps/desktop/dist/chordinal.js"
    else
        npx electron apps/desktop/dist/chordinal.js
    fi

# run it while working on it: rebuilds on every change and reloads the window
dev: build
    #!/usr/bin/env bash
    set -euo pipefail
    node tools/build.mjs --watch & watcher=$!
    trap 'kill $watcher' EXIT INT TERM
    if [ "$(uname)" = Darwin ]; then
        open -W -n node_modules/electron/dist/Electron.app --args "$PWD/apps/desktop/dist/chordinal.js" --dev
    else
        npx electron apps/desktop/dist/chordinal.js --dev
    fi

# everything a commit must pass: formatting, lint (with the layer rules), types, the page's bundle and the tests
check: deps
    npx prettier --check .
    npx eslint .
    npx tsc -b
    node tools/build.mjs
    node --test 'test/**/*.test.js'
    npx vitest run

# run the tests: node --test for the JavaScript, Vitest for the TypeScript
test: build
    node --test 'test/**/*.test.js'
    npx vitest run

# report how an NSF file's songs are built (keep the files in reference/, which git ignores)
nsf file *songs:
    node tools/nsf-report.mjs {{file}} {{songs}}

# report how recorded game music's lead moves (any file ffmpeg reads; keep them in reference/)
audio +files:
    node tools/audio-report.mjs {{files}}

# transcribe a whistled melody into a section's `melody:` notation (any file ffmpeg reads, or a folder of them)
# e.g. just whistle scratch/hook.m4a --tempo 60 --meter 3/4   ·   --key Eb --mode major to skip the key guess
whistle +args:
    node tools/whistle.mjs {{args}}

# rebuild src/audio/soundfont-catalog-data.js after adding or replacing .sf2 files (libraries: src/audio/soundfont-libraries-data.js)
catalog:
    node tools/sf2-catalog.mjs

# apps/desktop/assets/icon.svg goes to apps/desktop/assets/icon/; needs Inkscape
# render the app's icon as icon.icns, icon.ico and icon.png
icons:
    bash tools/make-icons.sh apps/desktop/assets/icon.svg apps/desktop/assets/icon --work build/chordinal-icons

# into release/chordinal/ (macOS: .dmg and .zip; Windows: installer; Linux: .flatpak)
# it comes with GeneralUser GS (downloaded first if missing); the other libraries are downloaded in the app
# build the installable app for this OS
package: build
    bash tools/fetch-soundfonts.sh generaluser
    cd apps/desktop && npx electron-builder --config electron-builder.json --publish never

# download the openly licensed SoundFont libraries into soundfonts/ (all, or those named); ones already there are skipped
# e.g. just soundfonts   ·   just soundfonts generaluser
soundfonts *ids:
    bash tools/fetch-soundfonts.sh {{ids}}

# compose a song without the app: print its plan, optionally its melody and a .mid file
# e.g. just compose first-light --melody --midi first-light.mid   ·   just compose feel:tender
compose *args:
    node tools/compose.mjs {{args}}

# report how alike the harmony is: each genre's triads, colours and cadences, then the written songs' shared progressions
# e.g. just harmony   ·   just harmony first-light lighthouse
harmony *songs:
    node tools/harmony-report.mjs {{songs}}

# write the written songs as project files in projects/ (all of them, or the ones named); overwrites edits made in the app
# e.g. just projects   ·   just projects first-light
projects *songs:
    node tools/make-projects.mjs {{songs}}

# export songs from projects/ to export/<name>.mid and .wav (all of them without names); --mp3 adds an MP3 (ffmpeg)
# e.g. just export   ·   just export first-light creaking-halls --mp3
export *args: deps
    node tools/export.mjs {{args}}

# A/B listening: render each song with an older commit and with this checkout, side by side
# e.g. just ab   ·   just ab a913205   (then open the URL it prints; port 8010 or the next free one)
ab rev="main": deps
    node tools/ab-server.mjs {{rev}}
