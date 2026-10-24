#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${PANDA_VERSION:-$(node -p "require('$project_root/package.json').version")}"
stage_dir="${1:-$project_root/release/publish}"

mkdir -p "$stage_dir"

copy_stable_asset() {
  versioned="$1"
  stable="$2"
  source_path="$stage_dir/$versioned"
  stable_path="$stage_dir/$stable"
  if [[ ! -f "$source_path" ]]; then
    echo "Missing release asset: $source_path" >&2
    exit 1
  fi
  cp -p "$source_path" "$stable_path"
  cmp -s "$source_path" "$stable_path"
}

copy_stable_asset "Panda-Control-${version}-macOS-arm64.dmg" "Panda-Control-macOS-arm64.dmg"
copy_stable_asset "Panda-Control-${version}-Windows-x64.exe" "Panda-Control-Windows-x64.exe"
copy_stable_asset "Panda-Control-${version}-Linux-x86_64.AppImage" "Panda-Control-Linux-x86_64.AppImage"
copy_stable_asset "Panda-Control-${version}-Linux-amd64.deb" "Panda-Control-Linux-amd64.deb"

(
  cd "$stage_dir"
  shasum -a 256 \
    "Panda-Control-${version}-macOS-arm64.dmg" "Panda-Control-macOS-arm64.dmg" \
    "Panda-Control-${version}-Windows-x64.exe" "Panda-Control-Windows-x64.exe" \
    "Panda-Control-${version}-Linux-x86_64.AppImage" "Panda-Control-Linux-x86_64.AppImage" \
    "Panda-Control-${version}-Linux-amd64.deb" "Panda-Control-Linux-amd64.deb" \
    > SHA256SUMS.txt
)

echo "$stage_dir"
