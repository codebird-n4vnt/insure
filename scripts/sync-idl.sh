#!/usr/bin/env bash
# Copy the program's IDL and TypeScript types into the backend and frontend.
# Run after every `anchor build` that changes instructions, accounts or the program ID.
set -euo pipefail
cd "$(dirname "$0")/.."
IDL=insure/target/idl/insure.json
TYPES=insure/target/types/insure.ts
[ -f "$IDL" ] && [ -f "$TYPES" ] || { echo "No IDL found. Run: (cd insure && anchor build)"; exit 1; }
for dir in backend/types frontend/idl; do
  cp "$IDL" "$dir/insure.json"
  cp "$TYPES" "$dir/insure.ts"
done
echo "IDL synced (program $(python3 -c "import json;print(json.load(open('$IDL'))['address'])" 2>/dev/null || echo '?')) → backend/types, frontend/idl"
