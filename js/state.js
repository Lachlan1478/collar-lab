/* Global session state + pub/sub. Header controls write here; the active tab
   re-renders on change.                                                      */
window.CL = window.CL || {};
(function () {
  CL.state = {
    spot: 170,          // CBA.AX working spot, A$
    vol: 0.18,          // ATM implied vol
    rate: 0.040,        // AUD risk-free (approx RBA + margin)
    divy: 0.045,        // continuous dividend yield proxy (CBA pays ~2 big franked divs/yr)
    skewOn: true,
    skew: 0.35,         // vol pts per unit log-moneyness
    perspective: 'client',  // 'client' | 'dealer'
    adv: 2.5e6,         // CBA average daily volume, shares
  };

  const subs = [];
  CL.onChange = (fn) => subs.push(fn);
  CL.emit = () => subs.forEach((fn) => fn(CL.state));
  CL.set = (patch) => { Object.assign(CL.state, patch); CL.emit(); };

  // ---------- formatting helpers ----------
  CL.fmt = {
    money: (v, dp = 2) => (v < 0 ? '−' : '') + 'A$' + Math.abs(v).toFixed(dp),
    big: (v) => {
      const a = Math.abs(v), s = v < 0 ? '−' : '';
      if (a >= 1e9) return s + 'A$' + (a / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return s + 'A$' + (a / 1e6).toFixed(1) + 'M';
      if (a >= 1e3) return s + 'A$' + (a / 1e3).toFixed(0) + 'k';
      return s + 'A$' + a.toFixed(0);
    },
    shares: (v) => {
      const a = Math.abs(v), s = v < 0 ? '−' : '';
      if (a >= 999500) return s + (a / 1e6).toFixed(1) + 'M';   // 999,600 → 1.0M, never "1000k"
      if (a >= 999.5) return s + (a / 1e3).toFixed(0) + 'k';
      return s + a.toFixed(0);
    },
    pct: (v, dp = 1) => (v * 100).toFixed(dp) + '%',
    num: (v, dp = 2) => v.toFixed(dp),
    sign: (v, dp = 2) => {
      const r = Math.abs(v).toFixed(dp);
      if (parseFloat(r) === 0) return r;               // no sign on a rounded zero
      return (v >= 0 ? '+' : '−') + r;
    },
  };
})();
