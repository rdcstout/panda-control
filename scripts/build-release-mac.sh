#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
project_dir="${script_dir:h}"
notary_profile="${PANDA_NOTARY_PROFILE:-spooly-notary}"
signing_identity="${PANDA_MAC_SIGN_IDENTITY:-}"

if [[ -z "$signing_identity" ]]; then
  signing_identity="$(
    security find-identity -v -p codesigning \
      | awk '/Developer ID Application: Roger Stout \(W3WPVL2V32\)/ { identity=$2 } END { print identity }'
  )"
fi

if [[ -z "$signing_identity" ]]; then
  print -u2 "No Developer ID Application identity was found for team W3WPVL2V32"
  exit 1
fi

cd "$project_dir"
npm run test
npm run build
CSC_NAME="$signing_identity" ./node_modules/.bin/electron-builder --mac dmg --arm64

version="$(node -p "require('./package.json').version")"
app_path="release/mac-arm64/Panda Control.app"
dmg_path="release/Panda Control-${version}-arm64.dmg"

if [[ ! -d "$app_path" ]]; then
  print -u2 "Signed app was not created at $app_path"
  exit 1
fi
if [[ ! -f "$dmg_path" ]]; then
  print -u2 "DMG was not created at $dmg_path"
  exit 1
fi

codesign --verify --deep --strict --verbose=4 "$app_path"
signature_details="$(codesign -d --verbose=4 "$app_path" 2>&1)"
if [[ "$signature_details" != *"flags=0x10000(runtime)"* ]]; then
  print -u2 "Hardened runtime is missing from $app_path"
  exit 1
fi
if [[ "$signature_details" != *"TeamIdentifier=W3WPVL2V32"* ]]; then
  print -u2 "Unexpected signing team in $app_path"
  exit 1
fi

expected_uuid='4240842E-B3B0-5C3C-A628-978E8250D982'
actual_uuid="$(dwarfdump --uuid "$app_path/Contents/MacOS/Panda Control" | awk '{ print $2 }')"
if [[ "$actual_uuid" != "$expected_uuid" ]]; then
  print -u2 "Unexpected Panda Control executable UUID: $actual_uuid"
  exit 1
fi

codesign --force --sign "$signing_identity" --timestamp "$dmg_path"
codesign --verify --verbose=4 "$dmg_path"

xcrun notarytool submit "$dmg_path" \
  --keychain-profile "$notary_profile" \
  --wait

xcrun stapler staple "$dmg_path"
xcrun stapler validate "$dmg_path"
hdiutil verify "$dmg_path"
spctl --assess --type execute --verbose=4 "$app_path"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"

print "Signed, notarized, stapled, and verified: $dmg_path"
