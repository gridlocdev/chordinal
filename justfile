# Chordinal — run `just` to list recipes.
set shell := ["bash", "-cu"]

app_name := "Chordinal"
dev_app := "build/dev/Chordinal.app"
entry := "apps/desktop/dist/chordinal.js"

default:
    @just --list --unsorted

# ── Run (dev) ─────────────────────────────────────────────────────────────

# On macOS it opens a renamed copy of Electron (build/dev/Chordinal.app, remade when Electron or the icon changes), so
# the menu bar, the Dock and the microphone prompt say Chordinal, not Electron or the terminal.
# Desktop app in its own window (builds first). Projects are folders anywhere, Documents/Chordinal/ by default.
[group('run')]
run-desktop: build _dev-app
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "$(uname)" = Darwin ]; then
        open -W -n "{{ dev_app }}"
    else
        npx electron "{{ entry }}"
    fi

# Desktop app in dev mode: rebuilds on every change and reloads the window.
[group('run')]
run-desktop-watch: build _dev-app
    #!/usr/bin/env bash
    set -euo pipefail
    node tools/build.mjs --watch & watcher=$!
    trap 'kill $watcher' EXIT INT TERM
    if [ "$(uname)" = Darwin ]; then
        open -W -n "{{ dev_app }}" --args --dev
    else
        npx electron "{{ entry }}" --dev
    fi

# The built page in your web browser, with soundfonts/ (http://127.0.0.1:8020 or the next free port). Ctrl-C stops it.
[group('run')]
preview-web: build
    node tools/serve-web.mjs

# Another repo runs it as: just -f <chordinal>/justfile cli render music/soundtrack.json music --data src/audio/tracks-data.js
# Run the chordinal CLI (`just cli help` lists its commands; paths resolve from where you run it; quoting is kept).
[group('run')]
[no-cd]
[positional-arguments]
cli *args: _deps
    @node "{{ justfile_directory() }}/tools/build.mjs" --cli
    node "{{ justfile_directory() }}/apps/cli/dist/chordinal.mjs" "$@"

# ── Build and package ─────────────────────────────────────────────────────

# Build everything: the page (apps/web/dist), the desktop app (apps/desktop/dist) and the CLI (apps/cli/dist).
[group('build')]
build: _deps
    pnpm build

# Build the CLI only.
[group('build')]
build-cli: _deps
    node tools/build.mjs --cli

# Regenerate the app icon files in apps/desktop/assets/icon from icon.svg (needs Inkscape; .icns needs macOS).
[group('build')]
icons:
    bash tools/make-icons.sh apps/desktop/assets/icon.svg apps/desktop/assets/icon --work build/chordinal-icons

# It comes with GeneralUser GS (downloaded first if missing); the app downloads the other libraries itself.
# Package the desktop app for this OS into release/chordinal (macOS .dmg and .zip, Windows installer, Linux .flatpak).
[group('build')]
package-desktop: build
    bash tools/fetch-soundfonts.sh generaluser
    cd apps/desktop && npx electron-builder --config electron-builder.json --publish never

# It runs the checkout's code and soundfonts/, so changes show up the next time it opens; run it again after moving the checkout.
# Install an app that runs this checkout: ~/Applications/Chordinal.app on macOS, a launcher on Linux.
[group('build')]
install-desktop: build
    bash tools/install-app.sh

# ── Quality ───────────────────────────────────────────────────────────────

# Everything CI checks: format, lint, typecheck, build, tests and browser scenarios.
[group('quality')]
check: _deps
    pnpm check

# With no arguments it also runs node --test (test/, with the headless Electron tests); arguments go to Vitest alone.
# Run the tests once (pass a file or -t "name" to narrow them).
[group('quality')]
[positional-arguments]
test *args: build
    #!/usr/bin/env bash
    set -euo pipefail
    if [ $# -eq 0 ]; then node --test 'test/**/*.test.js'; fi
    pnpm vitest run "$@"

# Run the Vitest tests in watch mode.
[group('quality')]
test-watch *args: _deps
    pnpm vitest {{ args }}

# Lint with ESLint.
[group('quality')]
lint: _deps
    pnpm lint

# Typecheck every package.
[group('quality')]
typecheck: _deps
    pnpm typecheck

# Format every file.
[group('quality')]
fmt: _deps
    pnpm format

# Check formatting without changing anything.
[group('quality')]
fmt-check: _deps
    pnpm format:check

# Architecture rules only: layers, the pure engine, the bridge, the store, keys, command ids, exports. Part of `check`.
[group('quality')]
check-arch: _deps
    pnpm vitest run test/architecture.test.ts

# Random-operation tests on many seeds (SEED=<n> just fuzz repeats one; SEED_BASE picks where to start).
[group('quality')]
fuzz runs="500": _deps
    RUNS={{ runs }} pnpm vitest run -t random --testTimeout=0

# `"$@"` keeps quoting, so `just e2e -g "two words"` stays one pattern.
# Browser scenarios against the built page in headless, muted Chromium (just e2e drums · SEED=4 just e2e random-ui).
[group('quality')]
[positional-arguments]
e2e *args: build
    pnpm exec playwright test -c e2e/playwright.config.ts "$@"

# Drive the page headlessly for a quick look: just drive cmd:Mixer shot:mixer · just drive --dark aria
[group('quality')]
[positional-arguments]
drive *steps: build
    node e2e/drive.ts "$@"

# Long random runs on new seeds, on this machine: before a release, or while you're away. No CI.
[group('quality')]
soak runs="1000": build
    #!/usr/bin/env bash
    # Not -e: a failure in the unit half still runs random use, and the recipe fails at the end.
    set -uo pipefail
    status=0
    base=$(date +%s)
    echo "Seeds start at $base (SEED=<n> replays one)."
    RUNS={{ runs }} SEED_BASE=$base pnpm vitest run -t random --testTimeout=0 --silent=passed-only || status=1
    # Its own folder: a replay or the next soak clears .e2e-results, not this run's screenshots and traces.
    echo "Random-use failures keep their screenshots and traces in .e2e-soak/$base."
    RUNS=25 SEED_BASE=$base pnpm exec playwright test -c e2e/playwright.config.ts -g random --output=".e2e-soak/$base" || status=1
    exit $status

# Desktop tests: the built Electron app, headless (no window, no Dock icon), each file on a throwaway profile.
[group('quality')]
e2e-desktop: build
    node --test 'test/electron/*.test.js'

# ── Music ─────────────────────────────────────────────────────────────────

# e.g. just export ~/Documents/Chordinal/Lanterns · just export some/song other/song --mp3 --library fluidr3
# Export project folders to export/<name>.mid and .wav; --mp3 adds an MP3 (ffmpeg).
[group('music')]
[positional-arguments]
export +args: build-cli
    node apps/cli/dist/chordinal.mjs export "$@" --out export

# e.g. just transcribe scratch/hook.m4a --tempo 60 --meter 3/4 · --key Eb --mode major to skip the key guess
# Transcribe a recorded melody into scale-degree notation (any file ffmpeg reads, or a folder of them).
[group('music')]
[positional-arguments]
transcribe +args:
    node tools/transcribe.mjs "$@"

# Report how an NSF file's songs are built (keep the files in reference/, which git ignores).
[group('music')]
[positional-arguments]
nsf file *songs:
    node tools/nsf-report.mjs "$@"

# Report how recorded game music's lead moves (any file ffmpeg reads; keep them in reference/).
[group('music')]
[positional-arguments]
audio +files:
    node tools/audio-report.mjs "$@"

# Rebuild the SoundFont catalog after adding or replacing .sf2 files (packages/audio/src/soundfont-*-data.ts).
[group('music')]
catalog:
    node tools/sf2-catalog.mjs

# ── Housekeeping ──────────────────────────────────────────────────────────

# Install dependencies (pnpm via corepack) and Electron's binary.
[group('housekeeping')]
setup:
    corepack enable
    pnpm install
    @[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js

# e.g. just soundfonts · just soundfonts generaluser
# Download the openly licensed SoundFont libraries into soundfonts/ (all, or those named; ones there are skipped).
[group('housekeeping')]
[positional-arguments]
soundfonts *ids:
    bash tools/fetch-soundfonts.sh "$@"

# Remove build output.
[group('housekeeping')]
clean:
    rm -rf apps/web/dist apps/desktop/dist apps/cli/dist packages/*/dist build release .e2e-results .e2e-soak
    find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete

# Remove build output and every node_modules (run `just setup` after).
[group('housekeeping')]
clean-all: clean
    find . -name node_modules -type d -prune -exec rm -rf {} +

# Install on first use: every recipe that runs code depends on this, so a fresh clone needs no `just setup`.
[private]
_deps:
    @[ -d node_modules/preact ] && [ -d node_modules/esbuild ] && [ -d node_modules/electron ] && [ -d node_modules/typescript ] || pnpm install
    @[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js

# The macOS copy of Electron that run-desktop opens, remade when it's missing or older than Electron, the icon or the
# script that makes it.
[private]
_dev-app:
    #!/usr/bin/env bash
    set -euo pipefail
    [ "$(uname)" = Darwin ] || exit 0
    plist="{{ dev_app }}/Contents/Info.plist"
    for f in node_modules/electron/dist/Electron.app/Contents/Info.plist apps/desktop/assets/icon/icon.icns tools/install-app.sh; do
        if [ ! -f "$plist" ] || [ "$f" -nt "$plist" ]; then
            bash tools/install-app.sh --dev "$(dirname "{{ dev_app }}")" >/dev/null
            break
        fi
    done

# Earlier names, kept so nothing that uses them breaks.
alias chordinal := run-desktop
alias dev := run-desktop-watch
alias web := preview-web
alias package := package-desktop
alias install := install-desktop
alias deps := setup
