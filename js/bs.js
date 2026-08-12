/* Black-Scholes engine: European pricing with continuous dividend yield,
   full greeks (delta, gamma, vega, theta, vanna, charm), parametric skew,
   zero-cost collar solver. Units:
     vega  = per 1 vol point (1%)
     theta = per calendar day
     charm = delta decay per calendar day
     vanna = dDelta / d(1 vol point)                                    */
window.CL = window.CL || {};
(function () {
  const SQRT2PI = Math.sqrt(2 * Math.PI);

  function pdf(x) { return Math.exp(-0.5 * x * x) / SQRT2PI; }

  // Zelen & Severo 26.2.17 — abs err < 7.5e-8
  function cdf(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    const neg = x < 0, ax = Math.abs(x);
    const t = 1 / (1 + 0.2316419 * ax);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
      t * (-1.821255978 + t * 1.330274429))));
    const p = 1 - pdf(ax) * poly;
    return neg ? 1 - p : p;
  }

  /* Full greeks for one European option.
     type: 'call' | 'put'. T in years. sigma decimal. q = continuous div yield. */
  function bs(type, S, K, T, sigma, r, q) {
    if (T <= 0 || sigma <= 0) {
      // expiry: intrinsic, step deltas
      const isC = type === 'call';
      const intr = isC ? Math.max(S - K, 0) : Math.max(K - S, 0);
      const delta = isC ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
      return { price: intr, delta, gamma: 0, vega: 0, theta: 0, vanna: 0, charm: 0 };
    }
    const sqT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqT);
    const d2 = d1 - sigma * sqT;
    const eq = Math.exp(-q * T), er = Math.exp(-r * T);
    const nd1 = pdf(d1);
    const isC = type === 'call';

    const price = isC
      ? S * eq * cdf(d1) - K * er * cdf(d2)
      : K * er * cdf(-d2) - S * eq * cdf(-d1);
    const delta = isC ? eq * cdf(d1) : eq * (cdf(d1) - 1);
    const gamma = eq * nd1 / (S * sigma * sqT);
    const vega = S * eq * nd1 * sqT / 100;                       // per vol pt
    const thetaYr = isC
      ? -S * eq * nd1 * sigma / (2 * sqT) - r * K * er * cdf(d2) + q * S * eq * cdf(d1)
      : -S * eq * nd1 * sigma / (2 * sqT) + r * K * er * cdf(-d2) - q * S * eq * cdf(-d1);
    const vanna = -eq * nd1 * d2 / sigma / 100;                  // per vol pt
    const charmCommon = -eq * nd1 * (2 * (r - q) * T - d2 * sigma * sqT) / (2 * T * sigma * sqT);
    const charmYr = isC
      ? q * eq * cdf(d1) + charmCommon
      : -q * eq * cdf(-d1) + charmCommon;
    return { price, delta, gamma, vega, theta: thetaYr / 365, vanna, charm: charmYr / 365 };
  }

  /* Parametric skew: sigma(K) = atm + skew * ln(F/K), floored.
     skew ~0.35 gives ≈ +3.7 vol pts at the 90% strike — typical index-name equity skew. */
  function volForStrike(K, S, T, atmVol, r, q, skewOn, skew) {
    if (!skewOn) return atmVol;
    const F = S * Math.exp((r - q) * T);
    return Math.max(0.05, atmVol + (skew == null ? 0.35 : skew) * Math.log(F / K));
  }

  /* Price a leg using the session smile. leg = {type, K, qty} (qty +1 long / -1 short). */
  function legGreeks(leg, S, T, p) {
    const sig = volForStrike(leg.K, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
    const g = bs(leg.type, S, leg.K, T, sig, p.rate, p.divy);
    const out = {};
    for (const k of Object.keys(g)) out[k] = g[k] * leg.qty;
    out.iv = sig;
    return out;
  }

  /* Aggregate greeks for a structure = array of legs + optional stock qty. */
  function structGreeks(legs, stockQty, S, T, p) {
    const tot = { price: 0, delta: stockQty || 0, gamma: 0, vega: 0, theta: 0, vanna: 0, charm: 0 };
    for (const leg of legs) {
      const g = legGreeks(leg, S, T, p);
      tot.price += g.price; tot.delta += g.delta; tot.gamma += g.gamma;
      tot.vega += g.vega; tot.theta += g.theta; tot.vanna += g.vanna; tot.charm += g.charm;
    }
    return tot;
  }

  /* Zero-cost solver: find call strike Kc such that call premium == put premium.
     Call premium is decreasing in Kc → bisection. */
  function solveZeroCostCall(S, Kp, T, p) {
    const putSig = volForStrike(Kp, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
    const target = bs('put', S, Kp, T, putSig, p.rate, p.divy).price;
    let lo = S * 0.9, hi = S * 2.5;
    const f = (K) => {
      const sig = volForStrike(K, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
      return bs('call', S, K, T, sig, p.rate, p.divy).price - target;
    };
    if (f(lo) < 0) return lo;          // put so cheap even low call overshoots
    if (f(hi) > 0) return hi;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  /* Same idea for a put-spread collar: given long put Kp, short put KpL (lower),
     solve call strike so net premium = 0. */
  function solveZeroCostCallPS(S, Kp, KpL, T, p) {
    const pv = (type, K) => {
      const sig = volForStrike(K, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
      return bs(type, S, K, T, sig, p.rate, p.divy).price;
    };
    const target = pv('put', Kp) - pv('put', KpL);   // net cost of the put spread
    let lo = S * 0.9, hi = S * 3.0;
    const f = (K) => pv('call', K) - target;
    if (f(lo) < 0) return lo;
    if (f(hi) > 0) return hi;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  CL.bs = bs;
  CL.cdf = cdf;
  CL.volForStrike = volForStrike;
  CL.legGreeks = legGreeks;
  CL.structGreeks = structGreeks;
  CL.solveZeroCostCall = solveZeroCostCall;
  CL.solveZeroCostCallPS = solveZeroCostCallPS;
})();
