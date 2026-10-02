#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Panda Control's Debian package must be assembled on Linux." >&2
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
payload_dir="${1:-$project_root/release/linux-unpacked}"
version="${PANDA_VERSION:-$(node -p "require('$project_root/package.json').version")}"
output_file="${2:-$project_root/release/Panda-Control-${version}-Linux-amd64.deb}"
icon_file="${PANDA_ICON:-$project_root/build/icon-256.png}"

if [[ ! -x "$payload_dir/panda-control" ]]; then
  echo "Missing Linux application payload: $payload_dir/panda-control" >&2
  exit 1
fi

if [[ ! -f "$icon_file" ]]; then
  echo "Missing application icon: $icon_file" >&2
  exit 1
fi

stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT
deb_root="$stage_dir/panda-control"

install -d \
  "$deb_root/DEBIAN" \
  "$deb_root/opt/panda-control" \
  "$deb_root/usr/share/applications" \
  "$deb_root/usr/share/icons/hicolor/256x256/apps"

cp -a "$payload_dir/." "$deb_root/opt/panda-control/"
install -m 0644 "$icon_file" \
  "$deb_root/usr/share/icons/hicolor/256x256/apps/panda-control.png"

cat > "$deb_root/DEBIAN/control" <<EOF
Package: panda-control
Version: $version
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Extrusion Therapy
Depends: libgtk-3-0t64 | libgtk-3-0, libnss3, libgbm1, libasound2t64 | libasound2, libxss1, libxtst6, libsecret-1-0
Description: Local-network manager for installed BIQU Panda accessories
 Panda Control discovers and manages supported Panda devices without replacing
 their factory setup workflow.
EOF

cat > "$deb_root/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if [ -f /opt/panda-control/chrome-sandbox ]; then
  chown root:root /opt/panda-control/chrome-sandbox
  chmod 4755 /opt/panda-control/chrome-sandbox
fi
exit 0
EOF
chmod 0755 "$deb_root/DEBIAN/postinst"

cat > "$deb_root/usr/share/applications/panda-control.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Panda Control
Comment=Manage installed BIQU Panda accessories
Exec=/opt/panda-control/panda-control
Icon=panda-control
Terminal=false
Categories=Utility;
StartupNotify=true
StartupWMClass=panda-control
EOF

mkdir -p "$(dirname "$output_file")"
dpkg-deb -Zgzip -z1 --root-owner-group --build "$deb_root" "$output_file"
dpkg-deb --info "$output_file" >/dev/null
dpkg-deb --contents "$output_file" >/dev/null
echo "$output_file"
