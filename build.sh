#!/bin/bash
# Builds Marea with nothing but Xcode's command line tools.
#   ./build.sh           build both products into build/
#   ./build.sh install   also install the plugin and the app for this user
set -euo pipefail
cd "$(dirname "$0")"
ARCH="-arch arm64 -arch x86_64"
FLAGS="-std=c++20 -O2 -fobjc-arc -fvisibility=hidden -mmacosx-version-min=12.0 -Wall -Wno-unused-private-field -Wno-deprecated-declarations -Wno-deprecated-anon-enum-enum-conversion $ARCH"
FW_CORE="-framework Foundation -framework AudioToolbox -framework CoreImage -framework CoreGraphics -framework ImageIO"
mkdir -p build/obj
for f in src/engine.cpp src/analysis.cpp src/core.mm src/server.mm; do
  o="build/obj/$(basename "$f").o"
  clang++ $FLAGS -c "$f" -o "$o" &
done; wait

AU=build/Marea.component
rm -rf "$AU"; mkdir -p "$AU/Contents/MacOS" "$AU/Contents/Resources"
clang++ $FLAGS -bundle src/au.mm build/obj/*.o $FW_CORE -framework Cocoa -framework WebKit -framework AudioUnit -framework CoreAudioKit -framework CoreMIDI -o "$AU/Contents/MacOS/Marea"
cp scripts/Info-au.plist "$AU/Contents/Info.plist"
cp -R web "$AU/Contents/Resources/web"
codesign --force --sign - "$AU" 2>/dev/null

APP=build/Marea.app
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
clang++ $FLAGS src/app.mm src/midi_input.mm build/obj/*.o $FW_CORE -framework CoreAudio -framework Cocoa -framework WebKit -framework CoreMIDI -o "$APP/Contents/MacOS/Marea"
cp scripts/Info-app.plist "$APP/Contents/Info.plist"
cp -R web "$APP/Contents/Resources/web"
[ -f assets/Marea.icns ] && cp assets/Marea.icns "$APP/Contents/Resources/"
codesign --force --sign - "$APP" 2>/dev/null

clang++ $FLAGS tools/render_test.mm src/midi_input.mm build/obj/*.o $FW_CORE -framework CoreMIDI -o build/render_test

if [ "${1:-}" = "install" ]; then
  mkdir -p ~/Library/Audio/Plug-Ins/Components ~/Applications
  rm -rf ~/Library/Audio/Plug-Ins/Components/Marea.component ~/Applications/Marea.app
  cp -R "$AU" ~/Library/Audio/Plug-Ins/Components/
  cp -R "$APP" ~/Applications/
  killall -9 AudioComponentRegistrar 2>/dev/null || true
  echo "Installed: ~/Library/Audio/Plug-Ins/Components/Marea.component and ~/Applications/Marea.app"
fi
