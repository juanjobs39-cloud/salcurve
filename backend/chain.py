"""Background workers: block producer, CURVE indexer and balance cache."""
import json
import logging
import threading
import time

import curve_model as M
from db import Db, now
from rpc import Rpc, RpcError
from wallets import Wallets

log = logging.getLogger("salcurve.chain")


class Chain:
    def __init__(self, daemon: Rpc, wallets: Wallets, db: Db, block_seconds: float = 3.0):
        self.d = daemon
        self.wallets = wallets
        self.db = db
        self.block_seconds = block_seconds
        self.mine_now = threading.Event()
        self.stop = threading.Event()
        self.height = 0

    # -- block producer ----------------------------------------------------------------------
    def produce_blocks(self, n: int = 1):
        self.d.call("generateblocks", amount_of_blocks=n, wallet_address=self.wallets.house_address)

    def miner_loop(self):
        while not self.stop.is_set():
            self.mine_now.wait(self.block_seconds)
            self.mine_now.clear()
            try:
                self.produce_blocks(1)
            except Exception as e:  # keep producing even if one call fails
                log.warning("block production failed: %s", e)

    # -- indexer -----------------------------------------------------------------------------
    def _tx_burnt(self, tx_hash: str) -> int:
        r = self.d.other("get_transactions", txs_hashes=[tx_hash], decode_as_json=True)
        txs = r.get("txs", [])
        if not txs:
            return 0
        return int(json.loads(txs[0]["as_json"]).get("amount_burnt", 0))

    def _state(self, ticker: str) -> M.CurveState:
        row = self.db.one("SELECT reserve, sold FROM curve_state WHERE ticker=?", ticker)
        return M.CurveState(row["reserve"], row["sold"]) if row else M.CurveState()

    def _save_state(self, ticker: str, st: M.CurveState):
        self.db.x("INSERT INTO curve_state(ticker,reserve,sold) VALUES(?,?,?) "
                  "ON CONFLICT(ticker) DO UPDATE SET reserve=excluded.reserve, sold=excluded.sold",
                  ticker, st.reserve, st.sold)

    def _index_block(self, height: int):
        blk = self.d.call("get_block", height=height)
        ts = int(blk["block_header"]["timestamp"])
        touched = set()
        for tx_hash in blk.get("tx_hashes", []):
            info = self.d.call("get_curve_tx", tx_hash=tx_hash)
            if info.get("status") != "OK":
                continue
            ticker = info["asset_type"][3:]
            pend = self.db.one("SELECT user FROM pending WHERE tx_hash=?", tx_hash)
            user = pend["user"] if pend else None
            if info["op"] == "launch":
                if not self.db.one("SELECT 1 FROM tokens WHERE ticker=?", ticker):
                    self.db.x("INSERT INTO tokens(ticker,name,created_at) VALUES(?,?,?)", ticker, ticker, ts)
                self.db.x("UPDATE tokens SET launch_tx=?, launch_height=? WHERE ticker=?", tx_hash, height, ticker)
                self._save_state(ticker, M.CurveState())
                continue
            amount_in = self._tx_burnt(tx_hash)
            st = self._state(ticker)
            q = M.quote_buy(st, amount_in) if info["op"] == "buy" else M.quote_sell(st, amount_in)
            if info["filled"] and q:
                out, st = q
                if out != info["amount_out"]:
                    log.error("model/chain mismatch on %s: model %s chain %s", tx_hash, out, info["amount_out"])
            else:
                out = 0   # refunded: state unchanged
            self._save_state(ticker, st)
            self.db.x("INSERT OR REPLACE INTO trades(tx_hash,height,ts,ticker,op,filled,amount_in,amount_out,"
                      "price_after,reserve_after,sold_after,user) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                      tx_hash, height, ts, ticker, info["op"], int(info["filled"]), amount_in,
                      info["amount_out"], M.spot_price(st), st.reserve, st.sold, user)
            touched.add(ticker)
        # the chain is the source of truth: reconcile any curve this block touched
        for ticker in touched:
            c = self.d.call("get_curve_info", asset_type="sal" + ticker)["curve"]
            if (c["reserve"], c["sold"]) != tuple(self.db.one(
                    "SELECT reserve, sold FROM curve_state WHERE ticker=?", ticker).values()):
                log.error("curve %s out of sync, adopting chain state", ticker)
                self._save_state(ticker, M.CurveState(c["reserve"], c["sold"]))

    def indexer_loop(self):
        while not self.stop.is_set():
            try:
                count = self.d.call("get_block_count")["count"]
                self.height = count - 1
                nxt = int(self.db.get_meta("indexed_height", "0")) + 1
                while nxt < count and not self.stop.is_set():
                    self._index_block(nxt)
                    self.db.set_meta("indexed_height", nxt)
                    nxt += 1
            except Exception as e:
                log.warning("indexer: %s", e)
            self.stop.wait(1.0)

    # -- balance cache -----------------------------------------------------------------------
    def refresh_user(self, key: str):
        u = self.db.one("SELECT wallet FROM users WHERE key=?", key)
        if not u:
            return
        try:
            bal = self.wallets.balances(u["wallet"])
            self.db.x("UPDATE users SET balances=?, balances_at=? WHERE key=?", json.dumps(bal), now(), key)
        except Exception as e:
            # mark the attempt anyway, so one failing wallet cannot monopolise the wallet RPC
            self.db.x("UPDATE users SET balances_at=? WHERE key=?", now(), key)
            log.warning("balance refresh for %s: %s", key[:8], e)

    def balances_loop(self):
        while not self.stop.is_set():
            # every wallet switch costs a few seconds on the single wallet RPC, so refresh one
            # active visitor at a time, each at most every ~10 s
            u = self.db.one("SELECT key FROM users WHERE last_seen > ? AND balances_at < ? "
                            "ORDER BY balances_at ASC LIMIT 1", now() - 120, now() - 10)
            if u:
                self.refresh_user(u["key"])
            self.stop.wait(1.0)

    def start(self):
        for fn in (self.miner_loop, self.indexer_loop, self.balances_loop):
            threading.Thread(target=fn, daemon=True).start()
