#!/usr/bin/env bash
# Build the Salvium binaries SalCurve needs, on Ubuntu 22.04/24.04 (or WSL2 Ubuntu on Windows):
#   - salvium/salvium#139  native bonding-curve tokens (CURVE)
#   - salvium/salvium#121  wallet --regtest support
#   - a smaller wallet subaddress lookahead (demo-only: opening a wallet takes ~3 s, not ~30 s)
#
#   ./setup_salvium.sh [target_dir]      # default: ../salvium-curve next to this repo
#
# Result: <target_dir>/build/bin/{salviumd,salvium-wallet-rpc}. Takes 30-90 minutes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-$HERE/../salvium-curve}"
JOBS="${JOBS:-$(nproc)}"

echo "== installing build dependencies (sudo)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git build-essential cmake pkg-config \
  libssl-dev libzmq3-dev libunbound-dev libsodium-dev libunwind8-dev liblzma-dev libreadline-dev \
  libexpat1-dev libpgm-dev libhidapi-dev libusb-1.0-0-dev libprotobuf-dev protobuf-compiler \
  libudev-dev libboost-all-dev python3 python3-venv curl ccache gperf

if [ ! -d "$DIR/.git" ]; then
  echo "== cloning salvium into $DIR"
  git clone -q https://github.com/salvium/salvium.git "$DIR"
fi
cd "$DIR"
echo "== fetching the CURVE proposal (#139) and wallet regtest support (#121)"
git fetch -q origin pull/139/head:pr139 pull/121/head:pr121
git checkout -q -B salcurve-demo pr139
git -c user.name=salcurve -c user.email=salcurve@localhost merge -q --no-edit pr121
git submodule update --init --recursive --depth 1 -q

echo "== demo-only tweak: smaller subaddress lookahead"
sed -i 's/^#define SUBADDRESS_LOOKAHEAD_MAJOR 50/#define SUBADDRESS_LOOKAHEAD_MAJOR 2   \/\/ SalCurve demo build only/; s/^#define SUBADDRESS_LOOKAHEAD_MINOR 200/#define SUBADDRESS_LOOKAHEAD_MINOR 20  \/\/ SalCurve demo build only/' src/wallet/wallet2.cpp
grep -q "SUBADDRESS_LOOKAHEAD_MAJOR 2 " src/wallet/wallet2.cpp

echo "== building salviumd and salvium-wallet-rpc with $JOBS jobs (this takes a while)"
mkdir -p build && cd build
cmake -D CMAKE_BUILD_TYPE=Release -D USE_CCACHE=ON .. > /dev/null
make -j"$JOBS" daemon wallet_rpc_server

echo
echo "Done. Start the demo with:"
echo "  SALVIUM_BIN=$DIR/build/bin FRESH=1 $HERE/run_demo.sh"
