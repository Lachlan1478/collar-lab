#!/usr/bin/env python3
"""Collar Lab dev server: static files + /api/hist market-data endpoint.

    python3 server.py [port]          (default 8317)

/api/hist?symbol=CBA.AX&date=2026-08-01
  -> { symbol, name, currency, asof, spot, adv90, sd90 }
  spot  = close on the last trading day <= date
  adv90 = mean volume over the 90 trading days ending that day
  sd90  = annualised std-dev of daily log returns over those 90 days
Data via Yahoo Finance v8 chart API (same source as the Investment dashboard).
"""
import json
import math
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8317
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def fetch_hist(symbol, date_str):
    asof = datetime.strptime(date_str, "%Y-%m-%d")
    p1 = int((asof - timedelta(days=200)).timestamp())
    p2 = int((asof + timedelta(days=4)).timestamp())
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol)}?period1={p1}&period2={p2}"
           "&interval=1d&events=div")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    res = data["chart"]["result"][0]
    meta = res["meta"]
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    closes, vols, days = [], [], []
    for i, t in enumerate(ts):
        c, v = q["close"][i], q["volume"][i]
        if c is None or v is None:
            continue
        d = datetime.fromtimestamp(t)
        if d.date() > asof.date():
            continue
        closes.append(c)
        vols.append(v)
        days.append(d.date())
    if len(closes) < 91:
        raise ValueError(f"only {len(closes)} trading days available before {date_str}")
    spot = closes[-1]
    window_c = closes[-91:]           # 91 closes -> 90 returns
    window_v = vols[-90:]
    rets = [math.log(window_c[i + 1] / window_c[i]) for i in range(90)]
    mean = sum(rets) / 90
    var = sum((r - mean) ** 2 for r in rets) / 89
    return {
        "symbol": symbol,
        "name": meta.get("longName") or meta.get("shortName") or symbol,
        "currency": meta.get("currency", ""),
        "asof": days[-1].isoformat(),
        "spot": round(spot, 4),
        "adv90": round(sum(window_v) / 90),
        "sd90": round(math.sqrt(var * 252), 6),
    }


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/hist"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            try:
                out = fetch_hist(qs["symbol"][0].strip(), qs["date"][0])
                body, code = json.dumps(out), 200
            except Exception as e:  # surface the reason to the UI
                body, code = json.dumps({"error": str(e)}), 500
            data = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Collar Lab server on http://localhost:{PORT} (static + /api/hist)")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
