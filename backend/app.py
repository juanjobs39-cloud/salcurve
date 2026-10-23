"""SalCurve demo backend: a pump.fun-style front end for Salvium CURVE tokens (regtest demo)."""
import json
import logging
import os
import re
import secrets
import threading
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import curve_model as M
from chain import Chain
from db import Db, now
from rpc import Rpc, RpcError
from wallets import Wallets

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

COIN = M.COIN
SUPPLY_TOKENS = M.CURVE_TOKEN_SUPPLY // COIN
FAUCET_AMOUNT = int(os.environ.get("SALCURVE_FAUCET", 5000)) * COIN
FAUCET_EVERY = 24 * 3600
MAX_IMAGE = 512 * 1024
PREMIUM = set("USDT USDC WBTC DOGE SHIB AVAX ATOM NEAR TRON HBAR AAVE FLOW EGLD KLAY LUNA DASH NANO "
              "CORE BEAM DYDX COMP SAND MANA RUNE PYTH ARKM BLUR STRK PEPE BONK VIUM GOLD SILV CASH "
              "EURO PESO BOND FUND BANK SWAP LEND LOAN NOTE HOLD BULL BEAR TECH DATA HASH NODE BYTE "
              "GRID CODE META WEB3 NFTS DEFI LAND REAL RENT FARM OILX ENRG FUEL VOTE PASS LOCK".split())
ADJ = "brave calm eager fuzzy happy jolly lucky mellow nimble proud quick shiny sleepy witty zesty".split()
ANIMAL = "otter panda koala lynx falcon gecko heron ibis llama moose narwhal orca quokka raven yak".split()

daemon = Rpc(os.environ.get("SALCURVE_DAEMON", "127.0.0.1:28101"))
wallet_rpc = Rpc(os.environ.get("SALCURVE_WALLET", "127.0.0.1:28230"), timeout=300)
db = Db(os.environ.get("SALCURVE_DB", str(Path(__file__).with_name("salcurve.db"))))
wallets = Wallets(wallet_rpc, daemon)
chain = Chain(daemon, wallets, db, float(os.environ.get("SALCURVE_BLOCK_SECONDS", 3)))
PUBLIC_URL = os.environ.get("SALCURVE_PUBLIC_URL", "")

app = FastAPI(title="SalCurve", docs_url="/api/docs", openapi_url="/api/openapi.json")


def faucet_retry_loop():
    """Pay the welcome faucet to visitors whose first payment failed."""
    import time
    while True:
        time.sleep(15)
        for u in db.q("SELECT key, address FROM users WHERE faucet_at=0 AND created_at < ?", now() - 30):
            try:
                wallets.faucet(u["address"], FAUCET_AMOUNT)
                db.x("UPDATE users SET faucet_at=? WHERE key=?", now(), u["key"])
                chain.mine_now.set()
            except Exception as e:
                logging.warning("faucet retry for %s: %s", u["key"][:8], e)


@app.on_event("startup")
def startup():
    wallets.setup_house()
    chain.start()
    threading.Thread(target=faucet_retry_loop, daemon=True).start()


# ------------------------------------------------------------------------------------- helpers
def launch_price(ticker: str) -> int:
    return (10000 if ticker in PREMIUM else 1000) * COIN


def to_atomic(value: str) -> int:
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        raise HTTPException(400, "invalid amount")
    if d <= 0:
        raise HTTPException(400, "amount must be positive")
    atomic = int(d * COIN)
    if atomic <= 0:
        raise HTTPException(400, "amount too small")
    return atomic


def user_for(key: str | None) -> dict:
    u = db.one("SELECT * FROM users WHERE key=?", key or "")
    if not u:
        raise HTTPException(401, "unknown session")
    db.x("UPDATE users SET last_seen=? WHERE key=?", now(), u["key"])
    return u


FRIENDLY_ERRORS = {
    "no input candidates": "Your coins from the previous transaction are still locked. Wait about 10 blocks (~30 s) and try again.",
    "not enough unlocked money": "Not enough unlocked balance yet. Coins unlock a few blocks after they arrive.",
    "not enough money": "Not enough balance for this amount plus the network fee.",
}


def rpc_error(e: RpcError):
    msg = e.error.get("message", str(e)) if isinstance(e.error, dict) else str(e)
    for needle, friendly in FRIENDLY_ERRORS.items():
        if needle in msg.lower():
            raise HTTPException(400, friendly)
    raise HTTPException(400, msg)


def token_row(t: dict, st: dict | None, vol: int, trades: int) -> dict:
    state = M.state_from_row(st)
    price = M.spot_price(state)
    graduated = state.phase == M.PHASE_POOL
    return {
        "ticker": t["ticker"],
        "name": t["name"],
        "description": t.get("description", ""),
        "has_image": bool(t.get("image_type")),
        "creator": t.get("creator_nick"),
        "launch_height": t.get("launch_height"),
        "created_at": t["created_at"],
        "price": price,                                   # SAL1 atomic per whole token
        "market_cap": price * SUPPLY_TOKENS,              # SAL1 atomic
        "reserve": state.reserve,
        "sold": state.sold,
        "progress": 1.0 if graduated else state.sold / M.CURVE_SALE_SUPPLY,   # towards graduation
        "graduated": graduated,
        "graduation_height": st["graduation_height"] if st else None,
        "pool_sal": state.pool_sal,                       # SAL1 locked in the pool forever
        "pool_tokens": state.pool_tokens,
        "circulating": M.circulating(state),
        "volume_24h": vol,
        "trades": trades,
        "live": st is not None,
        "asset_type": "sal" + t["ticker"],               # the token's on-chain identifier
        "launch_tx": t.get("launch_tx"),
    }


def tokens_with_stats() -> list:
    since = now() - 86400
    toks = db.q("SELECT t.*, u.nickname AS creator_nick FROM tokens t LEFT JOIN users u ON u.key=t.creator")
    states = {r["ticker"]: r for r in db.q("SELECT * FROM curve_state")}
    vols = {r["ticker"]: r for r in db.q(
        "SELECT ticker, SUM(CASE WHEN op='buy' THEN amount_in ELSE amount_out END) AS vol, COUNT(*) AS n "
        "FROM trades WHERE filled=1 AND ts>? GROUP BY ticker", since)}
    counts = {r["ticker"]: r["n"] for r in db.q("SELECT ticker, COUNT(*) AS n FROM trades WHERE filled=1 GROUP BY ticker")}
    out = []
    for t in toks:
        v = vols.get(t["ticker"], {})
        out.append(token_row(t, states.get(t["ticker"]), v.get("vol") or 0, counts.get(t["ticker"], 0)))
    return out


# ---------------------------------------------------------------------------------- session
class SessionIn(BaseModel):
    key: str | None = None


@app.post("/api/session")
def session(body: SessionIn):
    if body.key:
        u = db.one("SELECT * FROM users WHERE key=?", body.key)
        if u:
            db.x("UPDATE users SET last_seen=? WHERE key=?", now(), u["key"])
            return {"key": u["key"], "nickname": u["nickname"], "address": u["address"]}
    key = secrets.token_hex(16)
    name = "v_" + key[:16]
    try:
        address = wallets.create_visitor(name)
    except RpcError as e:
        rpc_error(e)
    nick = f"{secrets.choice(ADJ)}-{secrets.choice(ANIMAL)}-{secrets.randbelow(900) + 100}"
    db.x("INSERT INTO users(key,wallet,address,nickname,created_at,last_seen) VALUES(?,?,?,?,?,?)",
         key, name, address, nick, now(), now())

    def pay_faucet():
        try:
            wallets.faucet(address, FAUCET_AMOUNT)
            db.x("UPDATE users SET faucet_at=? WHERE key=?", now(), key)
            chain.mine_now.set()
        except Exception as e:
            logging.warning("faucet failed for %s: %s", key[:8], e)

    threading.Thread(target=pay_faucet, daemon=True).start()
    return {"key": key, "nickname": nick, "address": address}


@app.post("/api/faucet")
def faucet(x_key: str | None = Header(None)):
    u = user_for(x_key)
    if now() - u["faucet_at"] < FAUCET_EVERY:
        raise HTTPException(429, "faucet already used in the last 24 hours")
    try:
        wallets.faucet(u["address"], FAUCET_AMOUNT)
    except RpcError as e:
        rpc_error(e)
    db.x("UPDATE users SET faucet_at=? WHERE key=?", now(), u["key"])
    chain.mine_now.set()
    return {"ok": True, "amount": FAUCET_AMOUNT}


@app.get("/api/me")
def me(x_key: str | None = Header(None)):
    u = user_for(x_key)
    balances = json.loads(u["balances"])
    tok_rows = db.q("SELECT ticker, name, image_type FROM tokens")
    names = {t["ticker"]: t["name"] for t in tok_rows}
    has_image = {t["ticker"]: bool(t["image_type"]) for t in tok_rows}
    states = {r["ticker"]: r for r in db.q("SELECT * FROM curve_state")}
    holdings = []
    for asset, (total, unlocked, blocks) in balances.items():
        if asset.startswith("sal") and total > 0:
            ticker = asset[3:]
            st = states.get(ticker)
            price = M.spot_price(M.state_from_row(st)) if st else 0
            holdings.append({"ticker": ticker, "name": names.get(ticker, ticker),
                             "has_image": has_image.get(ticker, False), "amount": total,
                             "unlocked": unlocked, "blocks_to_unlock": blocks,
                             "value": total * price // COIN})
    sal1 = balances.get("SAL1", [0, 0, 0])
    trades = db.q("SELECT * FROM trades WHERE user=? ORDER BY height DESC LIMIT 50", u["key"])
    pending = db.q("SELECT tx_hash, ticker, op, amount_in, created_at FROM pending WHERE user=? AND "
                   "tx_hash NOT IN (SELECT tx_hash FROM trades) AND created_at>? ORDER BY created_at DESC",
                   u["key"], now() - 600)
    return {"nickname": u["nickname"], "address": u["address"],
            "sal1": {"total": sal1[0], "unlocked": sal1[1], "blocks_to_unlock": sal1[2]},
            "holdings": holdings, "trades": trades, "pending": pending,
            "faucet_available_in": max(0, FAUCET_EVERY - (now() - u["faucet_at"])),
            "balances_at": u["balances_at"]}


# ----------------------------------------------------------------------------------- tokens
TICKER_RE = re.compile(r"^[A-Z0-9]{4}$")


@app.get("/api/launch-price")
def get_launch_price(ticker: str):
    return {"ticker": ticker.upper(), "price": launch_price(ticker.upper())}


@app.post("/api/tokens")
async def launch(ticker: str = Form(...), name: str = Form(...), description: str = Form(""),
                 image: UploadFile | None = File(None), x_key: str | None = Header(None)):
    u = user_for(x_key)
    ticker = ticker.strip().upper()
    name = name.strip()[:32]
    if not TICKER_RE.match(ticker) or ticker.startswith("SAL"):
        raise HTTPException(400, "ticker must be 4 letters/digits and must not start with SAL")
    if not name:
        raise HTTPException(400, "name is required")
    if db.one("SELECT 1 FROM tokens WHERE ticker=?", ticker) or \
            daemon.call("get_token_info", asset_type="sal" + ticker).get("status") == "OK":
        raise HTTPException(409, "ticker already exists")
    img, img_type = None, None
    if image is not None and image.filename:
        img = await image.read()
        if len(img) > MAX_IMAGE:
            raise HTTPException(413, "image too large (max 512 KB)")
        img_type = image.content_type if image.content_type in ("image/png", "image/jpeg", "image/gif", "image/webp") else None
        if not img_type:
            raise HTTPException(415, "image must be png, jpeg, gif or webp")
    url = f"{PUBLIC_URL}/t/{ticker}" if PUBLIC_URL else f"/t/{ticker}"
    try:
        tx = wallets.launch(u["wallet"], ticker, name, url)
    except RpcError as e:
        rpc_error(e)
    db.x("INSERT INTO tokens(ticker,name,description,image,image_type,creator,launch_tx,created_at) "
         "VALUES(?,?,?,?,?,?,?,?)", ticker, name, description.strip()[:500], img, img_type, u["key"], tx, now())
    db.x("INSERT OR IGNORE INTO pending(tx_hash,user,ticker,op,amount_in,created_at) VALUES(?,?,?,?,?,?)",
         tx, u["key"], ticker, "launch", launch_price(ticker), now())
    chain.mine_now.set()
    return {"tx_hash": tx, "ticker": ticker}


@app.get("/api/tokens")
def list_tokens(sort: str = "new"):
    toks = tokens_with_stats()
    key = {"new": lambda t: -t["created_at"], "top": lambda t: -t["market_cap"],
           "trending": lambda t: -t["volume_24h"]}.get(sort, lambda t: -t["created_at"])
    return sorted(toks, key=key)


def swap_match(t: dict, q: str) -> int:
    """0 = no match; higher = better (exact id > exact ticker > prefix > substring)."""
    ql = q.lower()
    tx = (t.get("launch_tx") or "").lower()
    if tx and (ql == tx or (len(ql) >= 8 and tx.startswith(ql))):
        return 5
    if ql == t["asset_type"].lower():
        return 5
    if ql.lstrip("$") == t["ticker"].lower():
        return 4
    if t["ticker"].lower().startswith(ql.lstrip("$")) or t["name"].lower().startswith(ql):
        return 3
    if ql in t["name"].lower() or ql in t["ticker"].lower():
        return 2
    return 0


@app.get("/api/swap/tokens")
def swap_tokens(q: str = ""):
    """Graduated tokens for the swap picker, searchable by name, ticker, asset type or launch tx hash.
    Tokens that match but are still on their curve come back in `on_curve`."""
    q = q.strip()[:80]
    toks = [t for t in tokens_with_stats() if t["live"]]
    if q:
        scored = [(swap_match(t, q), t) for t in toks]
        scored = sorted([s for s in scored if s[0]], key=lambda s: (-s[0], -s[1]["pool_sal"]))
        toks = [t for _, t in scored]
    else:
        toks = sorted(toks, key=lambda t: -t["pool_sal"])
    return {"tokens": [t for t in toks if t["graduated"]],
            "on_curve": [t for t in toks if not t["graduated"]][:5] if q else []}


@app.get("/api/tokens/{ticker}")
def token_detail(ticker: str):
    ticker = ticker.upper()
    t = next((x for x in tokens_with_stats() if x["ticker"] == ticker), None)
    if not t:
        raise HTTPException(404, "token not found")
    rows = db.q("SELECT t.*, u.nickname FROM trades t LEFT JOIN users u ON u.key=t.user "
                "WHERE ticker=? ORDER BY t.height DESC, t.rowid DESC LIMIT 100", ticker)
    chart = db.q("SELECT ts, price_after AS price FROM trades WHERE ticker=? AND filled=1 ORDER BY height, rowid", ticker)
    start = M.spot_price(M.CurveState())
    points = [{"ts": t["created_at"], "price": start}] + chart
    holders = db.q("SELECT COUNT(DISTINCT user) AS n FROM trades WHERE ticker=? AND filled=1 AND op='buy'", ticker)
    t["holders_est"] = holders[0]["n"] if holders else 0
    return {"token": t, "trades": rows, "chart": points}


@app.get("/api/tokens/{ticker}/image")
def token_image(ticker: str):
    row = db.one("SELECT image, image_type FROM tokens WHERE ticker=?", ticker.upper())
    if not row or not row["image"]:
        raise HTTPException(404, "no image")
    return Response(row["image"], media_type=row["image_type"],
                    headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/tokens/{ticker}/quote")
def quote(ticker: str, side: str, amount: str):
    ticker = ticker.upper()
    atomic = to_atomic(amount)
    params = {"quote_buy": atomic} if side == "buy" else {"quote_sell": atomic}
    r = daemon.call("get_curve_info", asset_type="sal" + ticker, **params)
    if r.get("status") != "OK":
        raise HTTPException(404, "curve not found")
    filled = r["quote_buy_filled"] if side == "buy" else r["quote_sell_filled"]
    out = r["quote_buy_out"] if side == "buy" else r["quote_sell_out"]
    st = M.state_from_row(r["curve"])
    q = M.quote_buy(st, atomic) if side == "buy" else M.quote_sell(st, atomic)
    price_after = M.spot_price(q[1]) if q else r["curve"]["spot_price"]
    impact = (price_after - r["curve"]["spot_price"]) / r["curve"]["spot_price"] if r["curve"]["spot_price"] else 0
    fee = 0   # SAL1: burnt on the curve, kept by the pool after graduation
    if q and side == "buy":
        fee = M.fee_of(atomic)
    elif q:
        fee = q[0] * M.CURVE_FEE_DIVISOR // (M.CURVE_FEE_DIVISOR - 1) - q[0]
    graduates = bool(q) and st.phase == M.PHASE_CURVE and q[1].phase == M.PHASE_POOL
    return {"side": side, "amount_in": atomic, "filled": filled, "amount_out": out, "fee": fee,
            "price_before": r["curve"]["spot_price"], "price_after": price_after, "price_impact": impact,
            "graduates": graduates}


class TradeIn(BaseModel):
    side: str
    amount: str
    slippage_bps: int = 200


@app.post("/api/tokens/{ticker}/trade")
def trade(ticker: str, body: TradeIn, x_key: str | None = Header(None)):
    u = user_for(x_key)
    ticker = ticker.upper()
    if body.side not in ("buy", "sell"):
        raise HTTPException(400, "side must be buy or sell")
    if not 0 <= body.slippage_bps <= 5000:
        raise HTTPException(400, "slippage must be between 0% and 50%")
    q = quote(ticker, body.side, body.amount)
    if not q["filled"]:
        raise HTTPException(400, "the curve cannot fill this trade right now")
    min_out = q["amount_out"] * (10000 - body.slippage_bps) // 10000
    try:
        txs = wallets.trade(u["wallet"], ticker, body.side, q["amount_in"], min_out)
    except RpcError as e:
        rpc_error(e)
    for h in txs:
        db.x("INSERT OR IGNORE INTO pending(tx_hash,user,ticker,op,amount_in,created_at) VALUES(?,?,?,?,?,?)",
             h, u["key"], ticker, body.side, q["amount_in"], now())
    db.x("UPDATE users SET balances_at=0 WHERE key=?", u["key"])   # refresh this visitor next
    chain.mine_now.set()
    return {"tx_hashes": txs, "expected_out": q["amount_out"], "min_out": min_out}


# ------------------------------------------------------------------------- feeds & stats
@app.get("/api/trades")
def recent_trades(limit: int = 30):
    return db.q("SELECT t.*, u.nickname FROM trades t LEFT JOIN users u ON u.key=t.user "
                "ORDER BY t.height DESC, t.rowid DESC LIMIT ?", min(limit, 100))


@app.get("/api/leaderboard")
def leaderboard():
    tokens = sorted(tokens_with_stats(), key=lambda t: -t["volume_24h"])[:10]
    traders = db.q("SELECT u.nickname, COUNT(*) AS trades, "
                   "SUM(CASE WHEN op='buy' THEN amount_in ELSE amount_out END) AS volume "
                   "FROM trades t JOIN users u ON u.key=t.user WHERE filled=1 "
                   "GROUP BY t.user ORDER BY volume DESC LIMIT 10")
    creators = db.q("SELECT u.nickname, COUNT(*) AS launched FROM tokens t JOIN users u ON u.key=t.creator "
                    "GROUP BY t.creator ORDER BY launched DESC LIMIT 10")
    return {"tokens": tokens, "traders": traders, "creators": creators}


@app.get("/api/status")
def status():
    return {"height": chain.height, "indexed": int(db.get_meta("indexed_height", "0")),
            "block_seconds": chain.block_seconds, "supply": M.CURVE_TOKEN_SUPPLY,
            "sale_supply": M.CURVE_SALE_SUPPLY, "pool_supply": M.CURVE_POOL_SUPPLY,
            "virtual_sal": M.CURVE_VIRTUAL_SAL, "virtual_tokens": M.CURVE_VIRTUAL_TOKENS,
            "fee_divisor": M.CURVE_FEE_DIVISOR, "faucet_amount": FAUCET_AMOUNT, "pr": "salvium/salvium#139", "graduation_pr": "salvium/salvium#140"}


# ----------------------------------------------------------------------------- frontend
DIST = Path(os.environ.get("SALCURVE_DIST", Path(__file__).resolve().parent.parent / "frontend" / "dist"))
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        if path and f.is_file() and DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
