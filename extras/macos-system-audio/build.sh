#!/bin/bash
# Builds the optional Calcifer system-audio helper next to this script. Calcifer's core starts it
# whenever a glass loads the app; delete the binary to turn it off.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
major=$(sw_vers -productVersion | cut -d. -f1); minor=$(sw_vers -productVersion | cut -d. -f2)
if [ "$major" -lt 14 ] || { [ "$major" -eq 14 ] && [ "$minor" -lt 2 ]; }; then
  echo "Needs macOS 14.2 or later (Core Audio process taps)." >&2; exit 1
fi
command -v swiftc >/dev/null || { echo "Needs the Swift compiler: xcode-select --install" >&2; exit 1; }
swiftc -O "$HERE/system-audio.swift" -o "$HERE/calcifer-system-audio"
echo "Built. Restart the glass to start it."
