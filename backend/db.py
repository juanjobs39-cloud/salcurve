"""SQLite storage: visitors, token metadata, trades and the indexer cursor."""
import sqlite3
import threading
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  key          TEXT PRIMARY KEY,      -- random id kept in the visitor's browser
  wallet       TEXT NOT NULL,         -- wallet file name on the wallet RPC
  address      TEXT NOT NULL,         -- Carrot address of that wallet
  nickname     TEXT NOT NULL,
  faucet_at    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  balances     TEXT NOT NULL DEFAULT '{}',   -- cached JSON {asset: [total, unlocked]}
  balances_at  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tokens (
  ticker        TEXT PRIMARY KEY,      -- 4 chars, asset type is "sal" + ticker
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  image         BLOB,
  image_type    TEXT,
  creator       TEXT,                  -- users.key, NULL if launched outside the platform
  launch_tx     TEXT,
  launch_height INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pending (
  tx_hash   TEXT PRIMARY KEY,          -- trades/launches submitted through the platform
  user      TEXT NOT NULL,
  ticker    TEXT NOT NULL,
  op        TEXT NOT NULL,
  amount_in INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
  tx_hash     TEXT PRIMARY KEY,
  height      INTEGER NOT NULL,
  ts          INTEGER NOT NULL,
  ticker      TEXT NOT NULL,
  op          TEXT NOT NULL,           -- buy | sell
  filled      INTEGER NOT NULL,
  amount_in   INTEGER NOT NULL,        -- SAL1 burnt (buy) or tokens burnt (sell)
  amount_out  INTEGER NOT NULL,        -- tokens (buy) or SAL1 (sell); 0 when refunded
  price_after INTEGER NOT NULL,        -- spot price, SAL1 atomic units per whole token
  reserve_after INTEGER NOT NULL,
  sold_after  INTEGER NOT NULL,
  user        TEXT
);
CREATE INDEX IF NOT EXISTS trades_ticker ON trades(ticker, height);
CREATE TABLE IF NOT EXISTS curve_state (
  ticker  TEXT PRIMARY KEY,
  reserve INTEGER NOT NULL,
  sold    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""


class Db:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self.lock = threading.Lock()

    def q(self, sql, *args):
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def one(self, sql, *args):
        rows = self.q(sql, *args)
        return rows[0] if rows else None

    def x(self, sql, *args):
        with self.lock:
            self.conn.execute(sql, args)

    def get_meta(self, k, default=None):
        row = self.one("SELECT v FROM meta WHERE k=?", k)
        return row["v"] if row else default

    def set_meta(self, k, v):
        self.x("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, str(v))


def now() -> int:
    return int(time.time())
