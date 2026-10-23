"""Minimal JSON-RPC clients for salviumd and salvium-wallet-rpc."""
import json
import urllib.request


class RpcError(RuntimeError):
    def __init__(self, method, error):
        self.method = method
        self.error = error
        msg = error.get("message", error) if isinstance(error, dict) else error
        super().__init__(f"{method}: {msg}")


class Rpc:
    def __init__(self, host: str, timeout: float = 120):
        self.base = f"http://{host}"
        self.timeout = timeout

    def call(self, method: str, **params):
        body = json.dumps({"jsonrpc": "2.0", "id": "0", "method": method, "params": params}).encode()
        req = urllib.request.Request(f"{self.base}/json_rpc", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            res = json.loads(r.read())
        if "error" in res:
            raise RpcError(method, res["error"])
        return res["result"]

    def other(self, path: str, **params):
        """Non-JSON-RPC daemon endpoints (e.g. /get_transactions, /pop_blocks)."""
        body = json.dumps(params).encode()
        req = urllib.request.Request(f"{self.base}/{path}", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())
