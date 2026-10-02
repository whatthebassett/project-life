#!/bin/bash
# Builds Project Life for the Mac: "Project Life.app", and a zip of it for
# sharing (it's also what updates download). Apple silicon only: Intel Macs
# aren't supported.
#   npm run mac
set -euo pipefail
if [ "$(uname -m)" != "arm64" ]; then
  echo "Project Life for Mac builds on Apple silicon only." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
# Rust installed with rustup isn't always on the path.
command -v cargo >/dev/null || . "$HOME/.cargo/env"

npx tauri build --bundles app

version=$(node -p "require('./src-tauri/tauri.conf.json').version")
out="portable/mac"
app="$out/Project Life.app"
zip="portable/Project-Life-$version-mac-arm64.zip"

rm -rf "$app" "$zip"
mkdir -p "$out"
# ditto keeps what a Mac app needs: which files can run, and its signature.
ditto "src-tauri/target/release/bundle/macos/Project Life.app" "$app"
cp CHANGELOG.md "$out/CHANGELOG.md"
ditto -c -k --keepParent "$app" "$zip"

echo "Project Life for Mac: $app"
echo "Zipped: $zip"
