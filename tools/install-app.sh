#!/usr/bin/env bash
# Installs Chordinal as a desktop app that runs this checkout (its code and soundfonts/), so changes here show up the
# next time it opens.
#
# On macOS: ~/Applications/Chordinal.app, a renamed copy of the Electron in node_modules with its own name and bundle
# id, so macOS asks for the microphone for it (Chordinal records whistling). On Linux: a launcher in
# ~/.local/share/applications. Run it again after moving the checkout or updating Electron.
#
# With --dev <folder> (macOS only), it writes the copy into that folder instead, under its own bundle id: `just
# run-desktop` opens it, so the menu bar and the Dock say Chordinal rather than Electron.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
id=chordinal name='Chordinal' entry=apps/desktop/dist/chordinal.js icon=apps/desktop/assets/icon
mic="$name listens to your whistling to write it out as notes."
folder="$HOME/Applications" bundle=$id
if [ "${1:-}" = --dev ]; then
    folder="${2:?--dev needs a folder}" bundle=$id.dev
    [ "$(uname)" = Darwin ] || { echo "--dev is for macOS" >&2; exit 1; }
fi

case "$(uname)" in
Darwin)
    dest="$folder/$name.app"
    mkdir -p "$folder"
    rm -rf "$dest"
    cp -R "$root/node_modules/electron/dist/Electron.app" "$dest"
    plist="$dest/Contents/Info.plist"
    set -- -c "Set :CFBundleName $name" -c "Set :CFBundleDisplayName $name" -c "Set :CFBundleIdentifier dev.gridloc.$bundle" \
        -c "Set :CFBundleIconFile icon.icns"
    if [ -n "$mic" ]; then set -- "$@" -c "Set :NSMicrophoneUsageDescription $mic"; fi
    /usr/libexec/PlistBuddy "$@" "$plist"
    # Electron runs Resources/app when it's there: a stub that loads the app's entry from the checkout
    res="$dest/Contents/Resources"
    rm -f "$res/default_app.asar" "$res/electron.icns"
    cp "$root/$icon/icon.icns" "$res/icon.icns"
    mkdir -p "$res/app"
    printf '{ "name": "%s", "productName": "%s", "main": "main.mjs" }\n' "$id" "$name" > "$res/app/package.json"
    printf "import '%s';\n" "$root/$entry" > "$res/app/main.mjs"
    codesign --force --deep --sign - "$dest" 2>/dev/null
    echo "installed $dest"
    ;;
Linux)
    dest="$HOME/.local/share/applications/$id.desktop"
    mkdir -p "$(dirname "$dest")"
    cat > "$dest" <<EOF
[Desktop Entry]
Type=Application
Name=$name
Exec="$root/node_modules/electron/dist/electron" "$root/$entry"
Path=$root
Icon=$root/$icon/icon.png
Categories=AudioVideo;Audio;
EOF
    echo "installed $dest"
    ;;
*)
    echo "run the app with: just run-desktop" >&2
    exit 1
    ;;
esac
