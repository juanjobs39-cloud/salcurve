"""Demo wallets on a single salvium-wallet-rpc process.

salvium-wallet-rpc holds one open wallet at a time, so every visitor gets their own wallet FILE
(not an account inside a shared wallet: protocol payouts of a trade made from a non-zero
account are credited to account 0). All wallet access goes through one lock.
"""
import threading

from rpc import Rpc, RpcError

HOUSE = "house"
SAL1 = "SAL1"
TX_TRANSFER = 3


class Wallets:
    def __init__(self, wallet: Rpc, daemon: Rpc):
        self.w = wallet
        self.d = daemon
        self.lock = threading.RLock()
        self.current = None
        self.house_address = None

    # -- low level ----------------------------------------------------------------------
    def _open(self, name: str, create: bool = False):
        if self.current == name:
            return
        try:
            self.w.call("open_wallet", filename=name, password="")
        except RpcError:
            if not create:
                raise
            self.w.call("create_wallet", filename=name, password="", language="English")
        self.current = name

    def _address(self) -> str:
        r = self.w.call("get_address", account_index=0)
        # on a fresh chain the RPC may report the CryptoNote address first; we need Carrot
        return r["addresses"][0].get("address_carrot") or r["address"]

    def _balances(self) -> dict:
        try:
            r = self.w.call("get_balance", account_index=0, all_assets=True)
        except RpcError as e:
            if "not found in wallet" in str(e):   # a brand new wallet holds no asset yet
                return {}
            raise
        out = {}
        for b in r.get("balances", []):
            out[b["asset_type"]] = [b["balance"], b["unlocked_balance"], b.get("blocks_to_unlock", 0)]
        return out

    # -- house (receives the block rewards, pays the faucet) -------------------------------
    def setup_house(self) -> str:
        with self.lock:
            self._open(HOUSE, create=True)
            self.house_address = self._address()
            return self.house_address

    def faucet(self, address: str, amount: int) -> str:
        with self.lock:
            self._open(HOUSE)
            self.w.call("refresh")
            r = self.w.call("transfer", account_index=0,
                            destinations=[{"amount": amount, "address": address, "asset_type": SAL1}],
                            source_asset=SAL1, dest_asset=SAL1, tx_type=TX_TRANSFER)
            return r.get("tx_hash", "")

    def house_balances(self) -> dict:
        with self.lock:
            self._open(HOUSE)
            self.w.call("refresh")
            return self._balances()

    # -- visitors ---------------------------------------------------------------------------
    def create_visitor(self, name: str) -> str:
        with self.lock:
            self._open(name, create=True)
            return self._address()

    def balances(self, name: str) -> dict:
        with self.lock:
            self._open(name)
            self.w.call("refresh")
            return self._balances()

    def launch(self, name: str, ticker: str, token_name: str, url: str) -> str:
        with self.lock:
            self._open(name)
            self.w.call("refresh")
            r = self.w.call("curve_launch", ticker=ticker, name=token_name, url=url, account_index=0)
            return r["tx_hash_list"][0]

    def trade(self, name: str, ticker: str, side: str, amount: int, min_out: int) -> list:
        """Returns the tx hashes; a sell also sends the ROLLUP that pays its fee."""
        with self.lock:
            self._open(name)
            self.w.call("refresh")
            method = "curve_buy" if side == "buy" else "curve_sell"
            r = self.w.call(method, ticker=ticker, amount=amount, min_out=min_out, account_index=0)
            return r["tx_hash_list"]
