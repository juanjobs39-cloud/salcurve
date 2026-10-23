# SalCurve

**Fair-launch bonding-curve tokens on Salvium**: a pump.fun-style web app built on the
native `CURVE` transaction type proposed in
[salvium/salvium#139](https://github.com/salvium/salvium/pull/139).

> **Demo only.** CURVE is a proposal: it is not on Salvium mainnet. SalCurve runs against a
> private regtest chain built from that PR. Coins have no value, and each visitor gets a
> server-side test wallet.

## What it does

- **Launch** a token: ticker, name, description and image. The whole 100M supply is sold by the
  curve, with no presale and no team allocation; the launch fee is burned.
- **Trade** on the curve with live quotes, price impact and a slippage limit. If the price
  moves past the limit before the next block, the network refunds the burn automatically.
- **Browse** tokens (New, Trending, Top market cap) with a price chart, curve progress, trade
  history, a live trade feed, your portfolio and leaderboards.

Every price and payout is computed **by Salvium consensus**: buys burn SAL1 and the block's
protocol transaction mints tokens; sells burn tokens and mint SAL1 back from the curve's
reserve. The backend only indexes what the chain did. It cross-checks every trade against the
executable spec (`backend/curve_model.py`) and adopts the chain state if they ever disagree.

## Architecture

```
browser ──> FastAPI backend (port 8080) ──> salviumd --regtest        (CURVE build)
            │                           └─> salvium-wallet-rpc        (one wallet file per visitor)
            └─ serves the React build       SQLite: visitors, token metadata, indexed trades
```

- `backend/chain.py`:
  - produces a block every 3 s (and one right after each action);
  - indexes CURVE txs with `get_block` and `get_curve_tx`;
  - caches visitor balances.
- `backend/wallets.py`: the house wallet (block rewards, faucet) and visitor wallets.
  `salvium-wallet-rpc` keeps one wallet open, so access is serialised.
- `frontend/`: Vite + React + TypeScript + Tailwind. Charts use
  [lightweight-charts](https://github.com/tradingview/lightweight-charts) (MIT).

## Run it

You need `salviumd` and `salvium-wallet-rpc` built from
[salvium/salvium#139](https://github.com/salvium/salvium/pull/139), with wallet `--regtest`
support ([salvium/salvium#121](https://github.com/salvium/salvium/pull/121)).

The demo build also lowers the wallet's subaddress lookahead
(`SUBADDRESS_LOOKAHEAD_MAJOR/MINOR` in `src/wallet/wallet2.cpp`, 50/200 → 2/20). Opening a
wallet then takes ~3 s instead of ~30 s, which matters because the backend switches wallets
per visitor. This is a demo-only change and is not part of the PR.

```bash
cd frontend && npm install && npm run build && cd ..
FRESH=1 SALVIUM_BIN=/path/to/salvium/build/bin ./run_demo.sh   # new chain
SALVIUM_BIN=/path/to/salvium/build/bin ./run_demo.sh           # keep the chain
```

Then open http://127.0.0.1:8080. End-to-end check with two visitors:
`python3 backend/smoke_test.py`.

## Known limitations

- **Single wallet RPC:** visitor wallets are switched one at a time, so heavy concurrent use
  queues up.
- **Custodial test wallets:** the server holds every visitor wallet. A non-custodial version
  would connect the user's own `salvium-wallet-rpc`.
- **No accounts:** identity is a random key kept in the browser.
- **Lock times:** minted outputs unlock after 60 blocks (about 3 minutes at 3 s/block).

## License

MIT
