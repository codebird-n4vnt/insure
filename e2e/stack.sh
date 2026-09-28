#!/usr/bin/env bash
# Local full stack for end-to-end tests:
#   surfpool (offline, time-travel) → program at its real address → local USDC mint,
#   oracle key, protocol config → backend keeper/API (:3001) → frontend (:3100).
#
#   bash stack.sh up | down | backend-start | backend-stop
#   bash stack.sh fund <WALLET_ADDRESS> [USDC=1000]   give a browser wallet local SOL + USDC
#   bash stack.sh warp <DAYS>                          fast-forward the chain clock
set -euo pipefail
cd "$(dirname "$0")"
E2E_DIR=$PWD
ROOT=$(cd .. && pwd)
STATE=$E2E_DIR/.state
BACKEND=$ROOT/backend
FRONTEND=$ROOT/frontend
AUTHORITY=${AUTHORITY:-$HOME/.config/solana/id.json}

free_port() { fuser -k -n tcp "$1" >/dev/null 2>&1 || true; for p in $(lsof -ti tcp:"$1" 2>/dev/null); do kill "$p" 2>/dev/null || true; done; }
wait_for() { for _ in $(seq 1 60); do curl -sf "$1" >/dev/null 2>&1 && return 0; sleep 1; done; echo "timeout waiting for $1"; exit 1; }
tsx() { (cd "$BACKEND" && AUTHORITY=$AUTHORITY E2E=$STATE NODE_PATH=$BACKEND/node_modules npx tsx "$@"); }

backend_start() {
  # Detached with its own stdio so callers (e.g. execSync) never wait on it.
  (cd "$BACKEND" && exec env RPC_URL=http://127.0.0.1:8899 WS_URL=ws://127.0.0.1:8900 CLUSTER=localnet \
    ORACLE_KEYPAIR=$STATE/oracle.json POLL_INTERVAL_SECONDS=10 EVIDENCE_DIR=$STATE/evidence PORT=3001 \
    SITE_URL=http://localhost:3100 ALLOWED_ORIGINS= setsid npx tsx index.ts) > "$STATE/backend.log" 2>&1 < /dev/null &
  echo $! > "$STATE/backend.pid"
  wait_for http://localhost:3001/health
}
backend_stop() {
  free_port 3001
  sleep 1
}

case "${1:-up}" in
  up)
    [ -f "$ROOT/insure/target/deploy/insure.so" ] || { echo "Build the program first: (cd insure && anchor build)"; exit 1; }
    for port in 3001 3100 8899; do free_port $port; done; sleep 2
    rm -rf "$STATE"; mkdir -p "$STATE"
    setsid surfpool start --offline --no-tui --no-studio --no-deploy -p 8899 -w 8900 \
      --airdrop-keypair-path "$AUTHORITY" > "$STATE/surfpool.log" 2>&1 < /dev/null &
    echo $! > "$STATE/surfpool.pid"
    for _ in $(seq 1 60); do
      curl -s localhost:8899 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok && break; sleep 1
    done
    tsx "$E2E_DIR/load-program.ts"
    tsx "$E2E_DIR/setup.ts" init
    (cd "$BACKEND" && RPC_URL=http://127.0.0.1:8899 ORACLE_KEYPAIR=$STATE/oracle.json \
      npx tsx scripts/init-config.ts --mint "$(cat "$STATE/mint.txt")" --authority "$AUTHORITY")
    backend_start
    MINT=$(cat "$STATE/mint.txt")
    (cd "$FRONTEND" && exec env NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899 NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8900 \
      NEXT_PUBLIC_CLUSTER=localnet NEXT_PUBLIC_BACKEND_URL=http://localhost:3001 \
      NEXT_PUBLIC_USDC_MINT="$MINT" setsid npx next dev -p 3100) > "$STATE/frontend.log" 2>&1 < /dev/null &
    echo $! > "$STATE/frontend.pid"
    wait_for http://localhost:3100
    echo "Stack up: app http://localhost:3100 · api http://localhost:3001 · rpc http://127.0.0.1:8899"
    ;;
  down)
    for port in 3001 3100 8899 8900; do free_port $port; done
    echo "Stack down"
    ;;
  fund)
    [ -n "${2:-}" ] || { echo "usage: stack.sh fund <WALLET_ADDRESS> [USDC]"; exit 1; }
    tsx "$E2E_DIR/setup.ts" fund "$2" "${3:-1000}"
    ;;
  warp)
    [ -n "${2:-}" ] || { echo "usage: stack.sh warp <DAYS>"; exit 1; }
    tsx "$E2E_DIR/setup.ts" warp "$2"
    ;;
  backend-start) backend_start ;;
  backend-stop) backend_stop ;;
  *) echo "usage: stack.sh up|down|fund <address> [usdc]|warp <days>|backend-start|backend-stop"; exit 1 ;;
esac
