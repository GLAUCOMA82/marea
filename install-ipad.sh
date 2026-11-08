#!/bin/bash
# Builds Marea for iPad, signs it with your Apple ID and installs it on a connected iPad.
set -euo pipefail
cd "$(dirname "$0")"
# Your iPad and Apple team live in local.env (not shared): MAREA_DEVICE=<iPad UDID>, MAREA_TEAM=<team ID>.
[ -f local.env ] && set -a && . ./local.env && set +a
DEV="${1:-${MAREA_DEVICE:?Set MAREA_DEVICE in local.env or pass the iPad UDID: xcrun devicectl list devices}}"
python3 scripts/make_xcodeproj.py
xcodebuild -project Marea.xcodeproj -target Marea -configuration Release -sdk iphoneos -allowProvisioningUpdates -destination "id=$DEV" SYMROOT="$PWD/build/ios" build 2>&1 | grep -E "error:|warning: .*provision|BUILD|Signing Identity|Provisioning Profile" || true
APP="$PWD/build/ios/Release-iphoneos/Marea.app"
[ -d "$APP" ] || { echo "Build failed"; exit 1; }
xcrun devicectl device install app --device "$DEV" "$APP"
xcrun devicectl device process launch --device "$DEV" com.francisco.marea
