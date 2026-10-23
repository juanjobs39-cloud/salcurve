#!/usr/bin/env bash
# Start the SalCurve demo: a regtest salviumd built from the CURVE proposal, a wallet RPC for
# the demo wallets, and the web app on port 8080.
#
#   SALVIUM_BIN=/path/to/build/bin ./run_demo.sh            # keep the existing demo chain
#   FRESH=1 SALVIUM_BIN=/path/to/build/bin ./run_demo.sh    # start a brand new chain
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${SALVIUM_BIN:-/workspaces/salvium/build/debug/bin}"
DATA="${SALCURVE_DATA:-$HOME/salcurve-data}"
PORT="${PORT:-8080}"

# stop a previous run and wait until its ports are really free (the wallet RPC stores on exit)
pkill -f "[u]vicorn app:app" || true
pkill -x salviumd || true
pkill -x salvium-wallet- || true
for i in $(seq 1 60); do
  pgrep -x salviumd >/dev/null || pgrep -x salvium-wallet- >/dev/null || break
  sleep 1
done

# only now that nothing can write to it again
if [ "${FRESH:-0}" = 1 ]; then rm -rf "$DATA"; fi
mkdir -p "$DATA/chain" "$DATA/wallets" "$DATA/logs"

"$BIN/salviumd" --regtest --offline --fixed-difficulty 1 --keep-fakechain \
  --data-dir "$DATA/chain" --rpc-bind-port 28101 --p2p-bind-port 28180 --zmq-rpc-bind-port 28182 \
  --non-interactive --log-level 0 > "$DATA/logs/daemon.log" 2>&1 &
for i in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:28101/get_info && break; sleep 1
done

"$BIN/salvium-wallet-rpc" --regtest --daemon-address 127.0.0.1:28101 --rpc-bind-port 28230 \
  --disable-rpc-login --wallet-dir "$DATA/wallets" --log-level 0 > "$DATA/logs/wallet.log" 2>&1 &
for i in $(seq 1 60); do
  curl -sf -o /dev/null -d '{"jsonrpc":"2.0","id":0,"method":"get_version"}' http://127.0.0.1:28230/json_rpc && break; sleep 1
done

# a fresh chain needs mature coins in the house wallet before the faucet can pay
cd "$HERE/backend"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt

export SALCURVE_DB="$DATA/salcurve.db"
if [ -n "${CODESPACE_NAME:-}" ]; then
  export SALCURVE_PUBLIC_URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
python3 - <<'PY'
import json, urllib.request
def rpc(url, m, **p):
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(
        {"jsonrpc": "2.0", "id": "0", "method": m, "params": p}).encode(),
        headers={"Content-Type": "application/json"}), timeout=600))
    if "error" in r: raise RuntimeError(r["error"])
    return r["result"]
D, W = "http://127.0.0.1:28101/json_rpc", "http://127.0.0.1:28230/json_rpc"
try: rpc(W, "open_wallet", filename="house", password="")
except RuntimeError: rpc(W, "create_wallet", filename="house", password="", language="English")
a = rpc(W, "get_address", account_index=0)
addr = a["addresses"][0].get("address_carrot") or a["address"]
h = rpc(D, "get_block_count")["count"]
if h < 1000:  # ~80k SAL1 of mature block rewards for the faucet (the seed graduates a token)
    rpc(D, "generateblocks", amount_of_blocks=1000 - h, wallet_address=addr)
print("chain height", rpc(D, "get_block_count")["count"])
PY

echo "SalCurve on http://127.0.0.1:${PORT} ${SALCURVE_PUBLIC_URL:-}"
exec uvicorn app:app --host 0.0.0.0 --port "$PORT" --log-level warning
