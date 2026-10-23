#!/usr/bin/env python3
"""Fill a fresh SalCurve demo with a few visitors, tokens (with generated logos) and trades.

    python3 seed_demo.py [base_url]
"""
import json
import math
import random
import struct
import sys
import time
import urllib.request
import uuid
import zlib

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
COIN = 10**8
random.seed(7)

TOKENS = [
    ("WAVE", "Salvium Wave", "Riding the private DeFi wave. First community curve on Salvium.", (62, 224, 200), (20, 90, 160)),
    ("FROG", "Carrot Frog", "A frog that only eats Carrot outputs.", (120, 220, 90), (250, 170, 40)),
    ("MOON", "Moon Mission", "Slow and steady: buy the curve, hold, repeat.", (250, 210, 90), (120, 70, 200)),
    ("ZERO", "Zero Knowledge", "You can't see what we hold. Neither can we.", (240, 90, 140), (40, 40, 60)),
]


def png(c1, c2, size=256):
    """A radial-gradient logo as PNG bytes (no third-party libraries)."""
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            d = math.hypot(x - size * 0.35, y - size * 0.3) / (size * 1.0)
            t = max(0.0, min(1.0, d))
            row += bytes(int(a + (b - a) * t) for a, b in zip(c1, c2))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def call(method, path, body=None, key=None, files=None, form=None):
    headers = {"X-Key": key} if key else {}
    data = None
    if form is not None:
        b = uuid.uuid4().hex
        parts = []
        for k, v in form.items():
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (fn, content, ctype) in (files or {}).items():
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\n'
                         f'Content-Type: {ctype}\r\n\r\n'.encode() + content + b"\r\n")
        data = b"".join(parts) + f"--{b}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={b}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def wait_unlocked(key, amount):
    while call("GET", "/api/me", key=key)["sal1"]["unlocked"] < amount:
        time.sleep(3)


visitors = [call("POST", "/api/session", {}) for _ in range(6)]
print("visitors:", ", ".join(v["nickname"] for v in visitors))
with open("seed_visitors.json", "w") as f:   # keys, e.g. for portfolio screenshots
    json.dump(visitors, f)
for v in visitors:
    wait_unlocked(v["key"], 3000 * COIN)

for (ticker, name, desc, c1, c2), v in zip(TOKENS, visitors):
    try:
        call("POST", "/api/tokens", key=v["key"], form={"ticker": ticker, "name": name, "description": desc},
             files={"image": (f"{ticker}.png", png(c1, c2), "image/png")})
        print("launched", ticker)
    except urllib.error.HTTPError as e:
        print("launch", ticker, e.code, e.read()[:100])

# wait until every curve is live
while not all(t["live"] for t in call("GET", "/api/tokens?sort=new")):
    time.sleep(3)

weights = {"WAVE": 6, "FROG": 4, "MOON": 3, "ZERO": 1}
for i in range(26):
    ticker = random.choices(list(weights), list(weights.values()))[0]
    v = random.choice(visitors)
    amount = random.choice([20, 35, 50, 80, 120, 200])
    try:
        call("POST", f"/api/tokens/{ticker}/trade", {"side": "buy", "amount": str(amount)}, key=v["key"])
        print(f"{v['nickname']} bought {ticker} for {amount} SAL1")
    except urllib.error.HTTPError as e:
        print("buy failed", e.code, e.read()[:120])
    time.sleep(2)
print("seed done")
