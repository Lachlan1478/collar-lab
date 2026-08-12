/* Price-path generation: seeded GBM plus scripted "story" paths that teach
   specific behaviours (grind up, sell-off, crash, pin-at-strike).            */
window.CL = window.CL || {};
(function () {
  // deterministic RNG so every render of a scenario looks the same
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* GBM daily path. days = number of business days, ann params. */
  function gbm(S0, days, muAnn, sigAnn, seed) {
    const rng = mulberry32(seed);
    const dt = 1 / 252, out = [S0];
    let S = S0;
    for (let i = 0; i < days; i++) {
      S *= Math.exp((muAnn - 0.5 * sigAnn * sigAnn) * dt + sigAnn * Math.sqrt(dt) * gauss(rng));
      out.push(S);
    }
    return out;
  }

  /* Scripted paths: a deterministic backbone + seeded noise.
     opts.target — level the "pin" path converges to (e.g. the call strike). */
  function scripted(name, S0, days, opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 7 : opts.seed;
    const rng = mulberry32(seed);
    const dt = 1 / 252;
    const noise = (sig) => sig * Math.sqrt(dt) * gauss(rng);

    const out = [S0];
    let S = S0;
    for (let i = 1; i <= days; i++) {
      const f = i / days;                       // 0→1 through the life
      let drift = 0, sig = 0.13;
      switch (name) {
        case 'base':      drift = 0.03 - 1.2 * Math.log(S / S0); sig = 0.15; break;   // gentle tether keeps it "modest"
        case 'grind':     drift = 0.28; sig = 0.10; break;
        case 'selloff':   drift = -0.30; sig = 0.22; break;
        case 'crash': {
          drift = 0.05; sig = 0.13;
          // one-day gap ~60% through, weak dead-cat bounce, ends below the floor
          if (i === Math.round(days * 0.6)) { S *= 0.83; }
          if (f > 0.6) { drift = -8.0 * Math.log(S / (S0 * 0.86)); sig = 0.22; }
          break;
        }
        case 'pin': {
          // wander up early, then mean-revert hard onto the target strike
          const target = opts.target || S0 * 1.08;
          if (f < 0.5) { drift = 0.20; sig = 0.15; }
          else {
            const pull = 6 * (f - 0.5);          // strengthening gravity
            drift = pull * Math.log(target / S) / dt * dt * 252 * 0.04;
            sig = 0.13 * (1 - 0.7 * (f - 0.5) * 2);
          }
          break;
        }
        case 'range':     drift = -12.0 * Math.log(S / S0); sig = 0.13; break;        // hard tether: chop, decay, no trend
        default:          drift = 0.03; sig = 0.15;
      }
      S *= Math.exp((drift - 0.5 * sig * sig) * dt + noise(sig));
      out.push(S);
    }
    return out;
  }

  /* Implied-vol path derived from the spot path: vol rises when spot falls
     (asymmetric leverage effect) and jumps on gap days, decaying over ~15 days.
     Deterministic given the path — "vol is a function of where spot came from". */
  function volPath(spotPath, vol0, opts) {
    opts = opts || {};
    const betaDn = opts.betaDn == null ? 0.55 : opts.betaDn;   // vol pts per log-move down
    const betaUp = opts.betaUp == null ? 0.25 : opts.betaUp;   // rallies bleed vol more slowly
    const spikes = [];
    for (let i = 1; i < spotPath.length; i++) {
      const r = Math.log(spotPath[i] / spotPath[i - 1]);
      if (r < -0.06) spikes.push({ t: i, size: Math.min(0.15, -r * 1.2) });
    }
    const out = [vol0];
    for (let i = 1; i < spotPath.length; i++) {
      const lm = Math.log(spotPath[i] / spotPath[0]);
      let v = vol0 - (lm > 0 ? betaUp : betaDn) * lm;
      for (const sp of spikes) if (i >= sp.t) v += sp.size * Math.exp(-(i - sp.t) / 15);
      out.push(Math.min(0.60, Math.max(0.08, v)));
    }
    return out;
  }

  CL.paths = { gbm, scripted, volPath, mulberry32, gauss };
  CL.pathScenarios = [
    { id: 'base',    label: 'Base case — random walk, modest drift' },
    { id: 'grind',   label: 'Grind up — low-vol rally through the call' },
    { id: 'selloff', label: 'Sell-off — steady decline through the put' },
    { id: 'crash',   label: 'Crash — one-day gap down, then rebound' },
    { id: 'pin',     label: 'Pin — spot converges to the call strike' },
    { id: 'range',   label: 'Range-bound — mean-reverting, options bleed' },
  ];
})();
