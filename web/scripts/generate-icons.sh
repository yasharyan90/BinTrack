#!/usr/bin/env bash
# Regenerates every icon size from the master logo. macOS `sips`; on other
# platforms use ImageMagick: convert web/assets-src/logo-source.png -resize 512x512 web/public/pwa-512.png
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets-src/logo-source.png
for spec in "512 public/pwa-512.png" "192 public/pwa-192.png" "180 public/apple-touch-icon.png" \
            "64 public/favicon-64.png" "32 public/favicon-32.png" "256 public/images/logo-256.png" "96 public/images/logo-96.png"; do
  set -- $spec
  sips -s format png -z "$1" "$1" "$SRC" --out "$2" >/dev/null
  echo "wrote $2 ($1x$1)"
done
