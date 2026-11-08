#!/bin/bash
# Builds the App Store version of Marea and uploads it to App Store Connect (TestFlight first, then review).
# Needs a paid Apple Developer membership, Xcode signed in to that Apple ID, and in local.env:
#   MAREA_TEAM=<team ID>   MAREA_BUNDLE=<the bundle ID registered in App Store Connect>
# Every upload needs a new build number, so this raises the second number in ios/VERSION first.
#   ./release-ipad.sh            build and upload
#   ./release-ipad.sh --no-upload  build the archive and the .ipa only
set -euo pipefail
cd "$(dirname "$0")"
[ -f local.env ] && set -a && . ./local.env && set +a
: "${MAREA_TEAM:?Set MAREA_TEAM in local.env}"
read -r VER BUILD < ios/VERSION
BUILD=$((BUILD + 1)); echo "$VER $BUILD" > ios/VERSION
echo "Marea $VER ($BUILD)"
python3 scripts/make_xcodeproj.py
ARCHIVE="$PWD/build/release/Marea.xcarchive"
rm -rf build/release; mkdir -p build/release
xcodebuild -project Marea.xcodeproj -scheme Marea -configuration Release -sdk iphoneos \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" -allowProvisioningUpdates GCC_PREPROCESSOR_DEFINITIONS='$(inherited) MAREA_STORE=1' archive 2>&1 \
  | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)" || true
[ -d "$ARCHIVE" ] || { echo "Archive failed"; exit 1; }
DEST=upload; [ "${1:-}" = "--no-upload" ] && DEST=export
cat > build/release/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>$DEST</string>
<key>teamID</key><string>$MAREA_TEAM</string>
<key>signingStyle</key><string>automatic</string>
<key>uploadSymbols</key><true/>
</dict></plist>
EOF
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath build/release -exportOptionsPlist build/release/ExportOptions.plist -allowProvisioningUpdates 2>&1 \
  | grep -E "error:|EXPORT (SUCCEEDED|FAILED)|Upload|uploaded" || true
echo "Done. If it uploaded, the build shows in App Store Connect > TestFlight after Apple processes it (about 10-30 minutes)."
