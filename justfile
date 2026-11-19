# list recipes
default:
    @just --list

# install both desktop apps (~/Applications/Music Generator.app and Chordinal.app on macOS) that run this checkout
install: build
    bash tools/install-app.sh music-generator
    bash tools/install-app.sh chordinal

# install the pinned Preact, esbuild and Electron into node_modules
deps:
    @[ -d node_modules/preact ] && [ -d node_modules/esbuild ] && [ -d node_modules/electron ] || npm install
    @[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js

# bundle each app's UI (src/app/main.jsx, src/chordinal/main.jsx) into dist/app.js and dist/chordinal.js
build: deps
    node tools/build.mjs

# build and run Music Generator without installing: projects save into projects/
app: build
    #!/usr/bin/env sh
    if [ "$(uname)" = Darwin ]; then
        open -W -n node_modules/electron/dist/Electron.app --args "$PWD"
    else
        npx electron .
    fi

# on macOS it starts through `open`, so macOS asks for the microphone for the app, not for the terminal
# build and run Chordinal, the DAW for making music by hand: its projects are folders anywhere (Documents/Chordinal/ by default)
chordinal: build
    #!/usr/bin/env sh
    if [ "$(uname)" = Darwin ]; then
        open -W -n node_modules/electron/dist/Electron.app --args "$PWD/electron/chordinal.js"
    else
        npx electron electron/chordinal.js
    fi

# run it while working on it: rebuilds on every change and reloads the window
dev: build
    #!/usr/bin/env bash
    set -euo pipefail
    node tools/build.mjs --watch & watcher=$!
    trap 'kill $watcher' EXIT INT TERM
    if [ "$(uname)" = Darwin ]; then
        open -W -n node_modules/electron/dist/Electron.app --args "$PWD" --dev
    else
        npx electron . --dev
    fi

# syntax-check every module, bundle the UI (which checks the .jsx), and check the layer rules
check: deps
    @for f in $(find src -name '*.js'); do node --check "$f" || exit 1; done
    @node tools/build.mjs --check
    node tools/coupling-report.mjs --strict

# run the unit tests for lib/ and *-data.js files
test:
    node --test

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

# assets/icon.svg goes to assets/icon/, assets/chordinal.svg to assets/chordinal-icon/; needs Inkscape
# render each app's icon as icon.icns, icon.ico and icon.png
icons:
    bash tools/make-icons.sh assets/icon.svg assets/icon
    bash tools/make-icons.sh assets/chordinal.svg assets/chordinal-icon --work build/chordinal-icons

# into release/music-generator/ and release/chordinal/ (macOS: .dmg and .zip; Windows: installer; Linux: .flatpak)
# each comes with GeneralUser GS (downloaded first if missing); the other libraries are downloaded in the app
# e.g. just package   ·   just package chordinal
# build both installable apps for this OS, or the ones named
package *apps="music-generator chordinal": build
    #!/usr/bin/env sh
    set -e
    bash tools/fetch-soundfonts.sh generaluser
    for a in {{apps}}; do npx electron-builder --config "packaging/$a.json" --publish never; done

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
