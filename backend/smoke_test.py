#!/usr/bin/env python3
"""End-to-end API check with two visitors: A launches, B buys, B sells after the unlock window.

    python3 smoke_test.py [base_url]
"""
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
COIN = 10**8


def call(method, path, body=None, key=None, form=None):
    headers = {}
    data = None
    if key:
        headers["X-Key"] = key
    if form is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in form.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n')
        data = ("".join(parts) + f"--{boundary}--\r\n").encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read().decode()}")


def wait_for(pred, what, timeout=600):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = pred()
        if v:
            return v
        time.sleep(3)
    raise AssertionError(f"timeout waiting for {what}")


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("  ok ", msg)


ticker = "T" + uuid.uuid4().hex[:3].upper()
a = call("POST", "/api/session", {})
b = call("POST", "/api/session", {})
print("visitors", a["nickname"], b["nickname"])

print("1. faucet arrives and unlocks")
for u in (a, b):
    wait_for(lambda: call("GET", "/api/me", key=u["key"])["sal1"]["unlocked"] >= 2000 * COIN, "faucet unlock")
check(True, "both visitors have unlocked SAL1")

print("2. A launches", ticker)
r = call("POST", "/api/tokens", form={"ticker": ticker, "name": "Smoke Test", "description": "smoke"}, key=a["key"])
wait_for(lambda: call("GET", f"/api/tokens/{ticker}")["token"]["live"], "curve live")
check(True, "token is live on chain")

print("3. B buys 100 SAL1")
q = call("GET", f"/api/tokens/{ticker}/quote?side=buy&amount=100")
check(q["filled"] and q["amount_out"] > 0, f"quote gives {q['amount_out'] / COIN:.2f} tokens")
r = call("POST", f"/api/tokens/{ticker}/trade", {"side": "buy", "amount": "100"}, key=b["key"])
d = wait_for(lambda: (lambda x: x if x["trades"] else None)(call("GET", f"/api/tokens/{ticker}")), "buy indexed")
check(d["trades"][0]["op"] == "buy" and d["trades"][0]["amount_out"] == q["amount_out"], "indexed buy matches quote")
check(d["token"]["sold"] == q["amount_out"], "curve sold == tokens bought")

print("4. B's tokens unlock (60 blocks)")
me = wait_for(lambda: (lambda m: m if any(h["ticker"] == ticker and h["unlocked"] > 0 for h in m["holdings"]) else None)(
    call("GET", "/api/me", key=b["key"])), "token unlock", timeout=900)
held = next(h for h in me["holdings"] if h["ticker"] == ticker)
check(held["unlocked"] == q["amount_out"], "B holds exactly the bought tokens")

print("5. B sells half")
half = held["unlocked"] // 2
qs = call("GET", f"/api/tokens/{ticker}/quote?side=sell&amount={half / COIN}")
r = call("POST", f"/api/tokens/{ticker}/trade", {"side": "sell", "amount": str(half / COIN)}, key=b["key"])
check(len(r["tx_hashes"]) == 2, "sell sent with its ROLLUP fee tx")
d = wait_for(lambda: (lambda x: x if x["trades"][0]["op"] == "sell" else None)(call("GET", f"/api/tokens/{ticker}")), "sell indexed")
check(d["trades"][0]["filled"] == 1, f"sell filled, {d['trades'][0]['amount_out'] / COIN:.4f} SAL1 out")

print("6. feeds")
lb = call("GET", "/api/leaderboard")
check(any(t["ticker"] == ticker for t in lb["tokens"]), "token on leaderboard")
check(len(call("GET", f"/api/tokens/{ticker}")["chart"]) >= 3, "chart has points")

print("7. swap search")
tok = call("GET", f"/api/tokens/{ticker}")["token"]
for q in (ticker.lower(), "Smoke", tok["asset_type"], tok["launch_tx"]):
    r = call("GET", "/api/swap/tokens?q=" + urllib.parse.quote(q))
    hit = [t["ticker"] for t in r["tokens"] + r["on_curve"]]
    check(hit and hit[0] == ticker, f"swap search {q[:16]!r} finds {ticker}")
check(ticker not in [t["ticker"] for t in call("GET", "/api/swap/tokens?q=")["tokens"]],
      "a token still on its curve is not offered as a pool")
print("\nSALCURVE SMOKE TEST: PASSED")
