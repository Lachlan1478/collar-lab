/* Tab 5 — Spreads as wings: put-spread collar and call-spread collar,
   compared against the plain collar on payoff, cost and greeks.              */
window.CL = window.CL || {};
CL.tabs = CL.tabs || {};

CL.tabs.spreads = {
  id: 'spreads',
  title: 'Spread Wings',
  render(root) {
    const { el, slider, tiles, callout, card } = CL.ui;
    const F = CL.fmt;
    root.innerHTML = '';

    root.append(el('h2', null, '5 · Rebuilding the wings with spreads'));
    root.append(el('p', 'lede',
      'The plain collar makes two blunt promises: full protection below the floor, zero participation above the cap. ' +
      'Spreads let you renegotiate both. <b>Put-spread collar</b>: sell a further-OTM put against the one you own — ' +
      'cheaper protection, so the cap moves up, but the floor now has a trapdoor. ' +
      '<b>Call-spread collar</b>: buy back a far-OTM call — you re-own the moonshot, but the near cap crashes in to pay for it.'));

    let putPct = 0.90, lowPutPct = 0.78, farCallPct = 1.22, tenorM = 12;
    const controls = el('div', 'controls');
    controls.append(slider({
      label: 'Put strike (protection)', min: 0.82, max: 0.98, step: 0.005, value: putPct,
      fmt: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { putPct = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Low put sold (trapdoor)', min: 0.60, max: 0.88, step: 0.005, value: lowPutPct,
      fmt: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { lowPutPct = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Far call bought (recapture)', min: 1.10, max: 1.45, step: 0.005, value: farCallPct,
      fmt: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { farCallPct = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Tenor', min: 6, max: 18, step: 1, value: tenorM,
      fmt: (v) => v + 'm', onInput: (v) => { tenorM = v; draw(); },
    }).root);
    root.append(controls);

    const tileHost = el('div');
    root.append(tileHost);

    const payCard = card('Payoff at expiry — the three structures',
      'All solved to zero net premium. What each buys, and what each gives up.');
    root.append(payCard);

    const tableHost = el('div', 'card');
    root.append(tableHost);

    // ---- Scenario theatre ------------------------------------------------
    root.append(el('h3', null, 'Scenario theatre'));
    root.append(el('p', null,
      'Same tape, three structures, three dots — between the wings the payoffs are identical, so watch where the dots separate.'));
    const picker = el('div', 'scenario-picker');
    const theatreHost = el('div');
    root.append(picker, theatreHost);

    const tab = this;
    // Theatre strikes are FIXED (floor 90%, trapdoor 78%, recapture 122%, 12m),
    // not read from the sliders above — the stories depend on the trapdoor
    // breaking and the recapture engaging on these scripted tapes.
    const shared = () => {
      const p = CL.state, S0 = p.spot, DAYS = 252, T0 = 1;
      const Kp = S0 * 0.90, KpL = S0 * 0.78, KcH = S0 * 1.22;
      const Kc1 = CL.solveZeroCostCall(S0, Kp, T0, p);
      const Kc2 = CL.solveZeroCostCallPS(S0, Kp, KpL, T0, p);
      const pv0 = (type, K) => {
        const sig = CL.volForStrike(K, S0, T0, p.vol, p.rate, p.divy, p.skewOn, p.skew);
        return CL.bs(type, S0, K, T0, sig, p.rate, p.divy).price;
      };
      // near call of the call-spread collar: C(Kc3) = P(Kp) + C(KcH)
      const target3 = pv0('put', Kp) + pv0('call', KcH);
      let Kc3 = Kc1;                          // fallback if the wing can't be funded
      let lo3 = S0 * 0.85, hi3 = KcH;
      if (pv0('call', lo3) - target3 > 0) {
        for (let i = 0; i < 80; i++) {
          const mid = 0.5 * (lo3 + hi3);
          if (pv0('call', mid) - target3 > 0) lo3 = mid; else hi3 = mid;
        }
        Kc3 = 0.5 * (lo3 + hi3);
      }
      const legsOf = {
        plain: [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: Kc1, qty: -1 }],
        ps: [{ type: 'put', K: Kp, qty: 1 }, { type: 'put', K: KpL, qty: -1 }, { type: 'call', K: Kc2, qty: -1 }],
        cs: [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: Kc3, qty: -1 }, { type: 'call', K: KcH, qty: 1 }],
      };
      const prem0 = {}, legPrem = {};
      for (const k in legsOf) {
        prem0[k] = CL.structGreeks(legsOf[k], 0, S0, T0, p).price;
        legPrem[k] = legsOf[k].map((l) => pv0(l.type, l.K));
      }
      const payAt = (name, x) => {           // expiry payoff incl. stock, per share
        let v = x - S0;
        legsOf[name].forEach((leg, i) => {
          const intr = leg.type === 'put' ? Math.max(leg.K - x, 0) : Math.max(x - leg.K, 0);
          v += leg.qty * (intr - legPrem[name][i]);
        });
        return v;
      };
      return { p, S0, DAYS, T0, Kp, KpL, KcH, Kc1, Kc2, Kc3, legsOf, prem0, payAt,
        premTrap: legPrem.ps[1], premWing: legPrem.cs[2] };
    };
    const sA = (v) => (v > 0 ? '+' : '') + F.money(v);
    const mkPL = (c) => (name, st) =>
      CL.structGreeks(c.legsOf[name], 0, st.S, st.T, Object.assign({}, CL.state, { vol: st.iv })).price
      - c.prem0[name] + (st.S - c.S0);
    const mkGk = (c) => (name, st, g) =>
      CL.structGreeks(c.legsOf[name], 0, st.S, st.T, Object.assign({}, CL.state, { vol: st.iv }))[g];
    const structTiles = (pl, st) => ['plain', 'ps', 'cs'].map((k, i) => {
      const v = pl(k, st);
      return { k: ['Plain collar', 'Put-spread collar', 'Call-spread collar'][i], v: F.sign(v), cls: v >= 0 ? 'pos' : 'neg' };
    });
    // custom visual: static 3-payoff chart with three riding dots + progressive tape
    const mkCustom = (c, days, path, tapeRefY, tapeYMin, tapeYMax) => {
      const xMin = c.S0 * 0.60, xMax = c.S0 * 1.55, H = 240;
      const KEYS = ['plain', 'ps', 'cs'], COLS = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
      return {
        build(host) {
          host.innerHTML = '';
          const grid = el('div', 'grid2');
          const payC = card('Three payoffs, one tape', 'Each dot = spot today on that structure\'s expiry P&L line.');
          const tapeC = card('The tape', 'Spot so far; strikes dashed.');
          grid.append(payC, tapeC);
          host.append(grid);
          const xs = [], ys = { plain: [], ps: [], cs: [] };
          for (let x = xMin; x <= xMax; x += (xMax - xMin) / 180) {
            xs.push(x);
            KEYS.forEach((k) => ys[k].push(c.payAt(k, x)));
          }
          let yLo = Infinity, yHi = -Infinity;
          KEYS.forEach((k) => { yLo = Math.min(yLo, ...ys[k]); yHi = Math.max(yHi, ...ys[k]); });
          const padY = (yHi - yLo) * 0.07;
          yLo -= padY; yHi += padY;
          CL.charts.lineChart(payC, {
            height: H,
            series: KEYS.map((k, i) => ({ name: k, color: COLS[i], x: xs, y: ys[k], width: i === 0 ? 2.8 : 2 })),
            xMin, xMax, yMin: yLo, yMax: yHi,
            xLabel: 'CBA at expiry (A$)', yLabel: 'A$/share',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0),
            refX: [
              { v: c.KpL, label: 'trapdoor', color: 'var(--s2)', dash: '2 3' },
              { v: c.Kp, label: 'floor', color: 'var(--muted)', dash: '2 3' },
              { v: c.KcH, label: 'recapture', color: 'var(--s3)', dash: '2 3' },
            ],
            legend: false, hover: false,
          });
          const svg = payC.querySelector('svg');
          const dots = {};
          KEYS.forEach((k, i) => {
            const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            d.setAttribute('r', 5);
            d.setAttribute('fill', COLS[i]);
            d.setAttribute('stroke', 'var(--surface)');
            d.setAttribute('stroke-width', 2);
            svg.append(d);
            dots[k] = d;
          });
          const X = (v) => 64 + ((v - xMin) / (xMax - xMin)) * (720 - 64 - 14);
          const Y = (v) => 10 + (1 - (v - yLo) / (yHi - yLo)) * (H - 10 - 34);
          return { tapeC, dots, X, Y, n: 0 };
        },
        frame(ctx, st) {
          const Sc = Math.max(xMin, Math.min(xMax, st.S));
          KEYS.forEach((k) => {
            ctx.dots[k].setAttribute('cx', ctx.X(Sc));
            ctx.dots[k].setAttribute('cy', ctx.Y(c.payAt(k, Sc)));
          });
          if (ctx.n++ % 3 !== 0 && st.t !== 0 && st.t !== days) return;   // dots every frame, tape every 3rd
          ctx.tapeC.querySelectorAll('.chart-box').forEach((n) => n.remove());
          const px = [], py = [];
          for (let i = 0; i <= st.t; i++) { px.push(i); py.push(path[i]); }
          CL.charts.lineChart(ctx.tapeC, {
            height: H,
            series: [{ name: 'CBA', color: 'var(--s1)', x: px, y: py, width: 2.2 }],
            xLabel: 'day', yLabel: 'A$',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
            xMin: 0, xMax: days, yMin: tapeYMin, yMax: tapeYMax,
            refY: tapeRefY, legend: false, hover: false,
            marker: { x: st.t, y: st.S, color: 'var(--s4)' },
          });
        },
      };
    };

    const scenarioDefs = [
      { id: 'crash', label: 'Crash · the trapdoor', make(c) {
        const path = CL.paths.scripted('selloff', c.S0, c.DAYS, { seed: 8 });
        const ivs = CL.paths.volPath(path, c.p.vol);
        const pl = mkPL(c), gk = mkGk(c);
        const yLo = Math.min(Math.min.apply(null, path), c.KpL) * 0.97;
        const yHi = Math.max(Math.max.apply(null, path), c.Kp) * 1.02;
        return { days: c.DAYS, spotPath: path, volPath: ivs, legs: [], stockQty: 1,
          custom: mkCustom(c, c.DAYS, path, [
            { v: c.Kp, label: 'floor ' + c.Kp.toFixed(0), color: 'var(--s2)' },
            { v: c.KpL, label: 'trapdoor ' + c.KpL.toFixed(0), color: 'var(--s2)', dash: '3 3' },
          ], yLo, yHi),
          readouts: (st) => structTiles(pl, st).concat([{
            k: 'PS net vega', v: F.sign(gk('ps', st, 'vega'), 2) + ' /vol pt',
            d: 'plain ' + F.sign(gk('plain', st, 'vega'), 2),
          }]),
          milestones: [
            { day: 0, title: 'Three structures, one storm', text: (st) =>
              `Same 12-month zero-cost economics: plain caps at ${(c.Kc1 / c.S0 * 100).toFixed(1)}%, the put-spread collar buys its ` +
              `${(c.Kc2 / c.S0 * 100).toFixed(1)}% cap by selling the ${c.KpL.toFixed(2)} trapdoor put for ${F.money(c.premTrap)}. ` +
              `Note the vega tile: the put-spread collar is short vol from birth (${F.sign(gk('ps', st, 'vega'), 2)}/pt vs ${F.sign(gk('plain', st, 'vega'), 2)} plain).` },
            { cond: (st) => st.S < c.Kp, title: 'Floor engages — for two of you', text: (st) =>
              `Below ${c.Kp.toFixed(0)} the plain and call-spread collars flatten toward ${sA(c.payAt('plain', c.Kp))}/share at expiry; the put-spread collar ` +
              `is already worse (${sA(pl('ps', st))} vs ${sA(pl('plain', st))} MTM) because the trapdoor put you sold is marking against you.` },
            { cond: (st) => st.S < c.KpL, pause: true, title: 'Through the trapdoor', text: (st) =>
              `${c.KpL.toFixed(2)} breaks and the terracotta dot falls off the shelf: below here the put you sold cancels the put you own ` +
              `and you are long stock 1-for-1 again. And the vega tile: plain is long ${F.sign(gk('plain', st, 'vega'), 2)}/pt into ${(st.iv * 100).toFixed(0)}-vol; ` +
              `you are short. Sold the tail at what skew said was its richest — now buying it back in the fire.` },
            { day: 190, title: 'No bottom for the terracotta', text: (st) =>
              `Spot ${st.S.toFixed(1)}: plain pinned near ${sA(pl('plain', st))}, the put-spread collar ${sA(pl('ps', st))} ` +
              `and still tracking spot down, dollar for dollar.` },
            { day: c.DAYS, title: 'The invoice for the higher cap', text: (st) =>
              `${st.S.toFixed(2)} at the bell: plain and call-spread collars settle at the floor, ${sA(pl('plain', st))}. ` +
              `The put-spread collar: ${sA(pl('ps', st))} — ${F.money(pl('plain', st) - pl('ps', st))}/share worse, exactly (trapdoor − expiry) = ` +
              `${c.KpL.toFixed(2)} − ${st.S.toFixed(2)}. The extra ${((c.Kc2 - c.Kc1) / c.S0 * 100).toFixed(1)} pts of cap cost you the crash.` },
          ] };
      } },
      { id: 'rally', label: 'Rally · the recapture', make(c) {
        const path = CL.paths.scripted('grind', c.S0, c.DAYS, { seed: 1 });
        const ivs = CL.paths.volPath(path, c.p.vol);
        const pl = mkPL(c);
        const yLo = Math.min.apply(null, path) * 0.98;
        const yHi = Math.max(Math.max.apply(null, path), c.KcH) * 1.02;
        return { days: c.DAYS, spotPath: path, volPath: ivs, legs: [], stockQty: 1,
          custom: mkCustom(c, c.DAYS, path, [
            { v: c.Kc1, label: 'caps ~' + c.Kc1.toFixed(0), color: 'var(--s3)' },
            { v: c.Kc2, label: 'PS cap ' + c.Kc2.toFixed(0), color: 'var(--s3)', dash: '3 3' },
            { v: c.KcH, label: 'recapture ' + c.KcH.toFixed(0), color: 'var(--s3)', dash: '3 3' },
          ], yLo, yHi),
          readouts: (st) => structTiles(pl, st).concat([{
            k: 'Upside recaptured', v: F.sign(pl('cs', st) - pl('plain', st)), d: 'CS vs plain',
          }]),
          milestones: [
            { day: 0, title: 'The moonshot costs ' + Math.round(c.premWing * 100) + ' cents', text:
              `The call-spread collar buys back the ${c.KcH.toFixed(2)} call for ${F.money(c.premWing)} — under this linear skew model ` +
              `far wings are almost free, so its cap (${(c.Kc3 / c.S0 * 100).toFixed(1)}%) gives up only ${F.money(c.Kc1 - c.Kc3)} of strike vs plain ` +
              `(${(c.Kc1 / c.S0 * 100).toFixed(1)}%). Cheap lottery ticket; watch what it does.` },
            { cond: (st) => st.S > c.Kc1, title: 'Two dots hit the shelf', text:
              `Through ${c.Kc1.toFixed(2)}: the navy and green dots flatten onto their caps. The terracotta dot keeps climbing — ` +
              `the put-spread collar's cap is ${c.Kc2.toFixed(2)}, the upside it bought by selling the trapdoor.` },
            { cond: (st) => st.S > c.Kc2, title: 'All three capped… for now', text: (st) =>
              `${st.S.toFixed(1)}: even the put-spread collar is flat now. Plain ${sA(pl('plain', st))}, PS ${sA(pl('ps', st))} MTM. ` +
              `The green dot sits ${F.money(c.payAt('plain', st.S) - c.payAt('cs', st.S))} under navy — the running cost of a moonshot nobody believes in yet.` },
            { cond: (st) => st.S > c.KcH, pause: true, title: 'Recapture — the green dot re-accelerates', text: (st) =>
              `Through ${c.KcH.toFixed(2)} the far call goes live and the call-spread collar is long CBA again, 1-for-1, while plain and PS ` +
              `stay nailed to ${sA(c.payAt('plain', c.KcH))} and ${sA(c.payAt('ps', c.KcH))}. ` +
              `A ${Math.round(c.premWing * 100)}-cent option just reopened the whole right tail.` },
            { day: c.DAYS, title: 'Same hedge, three endings', text: (st) =>
              `${st.S.toFixed(2)} at the bell (${F.sign((st.S / c.S0 - 1) * 100, 1)}%): plain ${sA(pl('plain', st))}, put-spread ${sA(pl('ps', st))}, ` +
              `call-spread ${sA(pl('cs', st))} — vs ${sA(st.S - c.S0)} unhedged. The recapture kept ${F.money(pl('cs', st) - pl('plain', st))}/share ` +
              `of upside the plain collar handed away.` },
          ] };
      } },
      { id: 'grind', label: 'Grind · three ways to die quietly', make(c) {
        const path = CL.paths.scripted('range', c.S0, c.DAYS, { seed: 5 });
        const pl = mkPL(c), gk = mkGk(c);
        const yLo = Math.min(Math.min.apply(null, path), c.Kp) * 0.98;
        const yHi = Math.max(Math.max.apply(null, path), c.Kc1) * 1.02;
        return { days: c.DAYS, spotPath: path, legs: [], stockQty: 1,
          custom: mkCustom(c, c.DAYS, path, [
            { v: c.Kp, label: 'floor ' + c.Kp.toFixed(0), color: 'var(--s2)', dash: '3 3' },
            { v: c.Kc1, label: 'plain cap ' + c.Kc1.toFixed(0), color: 'var(--s3)', dash: '3 3' },
          ], yLo, yHi),
          readouts: (st) => structTiles(pl, st).concat([{
            k: 'PS theta', v: F.sign(gk('ps', st, 'theta') * 100, 2) + ' ×100/day',
            d: 'plain ' + F.sign(gk('plain', st, 'theta') * 100, 2),
          }]),
          milestones: [
            { day: 0, title: 'The modal market', text:
              `No crash, no moonshot — most years look like this. All three dots start stacked on top of each other, and between ` +
              `${c.KpL.toFixed(2)} and ${c.Kc1.toFixed(0)} the payoffs are literally identical. The only fight is theta.` },
            { cond: (st) => st.S > c.Kc1 * 0.988, title: 'Brush with the cap', text: (st) =>
              `${st.S.toFixed(1)} — within ${F.money(Math.max(c.Kc1 - st.S, 0))} of the plain cap, never through. The dots haven't separated: ` +
              `this whole excursion happened inside the corridor where all three structures are just long stock.` },
            { day: 126, pause: true, title: 'Halfway: the rent ledger', text: (st) =>
              `Spot ${st.S.toFixed(1)}, nothing has happened — and the theta ledger shows why structure choice is a rent decision: ` +
              `the put-spread collar pays almost nothing to wait (~${F.sign(gk('ps', st, 'theta') * 100, 2)}×100/day — two options sold against one owned), ` +
              `while plain pays ${F.sign(gk('plain', st, 'theta') * 100, 2)} and the call-spread ${F.sign(gk('cs', st, 'theta') * 100, 2)}. ` +
              `MTM: PS ${sA(pl('ps', st))} vs plain ${sA(pl('plain', st))}. In a quiet market the trapdoor-seller waits nearly rent-free.` },
            { day: c.DAYS, title: 'Convergence', text: (st) =>
              `${st.S.toFixed(2)}: every option expires worthless and all three structures print the identical ${sA(pl('plain', st))} — ` +
              `the stock move, nothing else. Structure choice is a bet on the tails; this year, there weren't any. ` +
              `Below: what each choice does to your greeks while you wait.` },
          ] };
      } },
    ];

    const chipEls = {};
    const showScenario = (id) => {
      tab._theatreSel = id;
      Object.keys(chipEls).forEach((k) => chipEls[k].classList.toggle('active', k === id));
      if (tab._theatre) tab._theatre.destroy();
      const def = scenarioDefs.find((d) => d.id === id);
      tab._theatre = CL.player.mount(theatreHost, def.make(shared()));
    };
    scenarioDefs.forEach((d) => {
      const b = el('button', null, d.label);
      b.addEventListener('click', () => showScenario(d.id));
      chipEls[d.id] = b;
      picker.append(b);
    });
    showScenario(scenarioDefs.some((d) => d.id === tab._theatreSel) ? tab._theatreSel : 'crash');
    // ---- end Scenario theatre --------------------------------------------

    const g2 = el('div', 'grid2');
    const dCard = card('Net delta across spot', 'Holder view, incl. stock, at half-life.');
    const gCard = card('Net gamma across spot', 'The dumbbell grows extra lobes — every spread leg adds a gamma pole.');
    g2.append(dCard, gCard);
    root.append(g2);

    const g2b = el('div', 'grid2');
    const vCard = card('Net vega across spot',
      'What each structure does to your vol exposure — the question the bank\'s desk asks first.');
    const tCard = card('Net theta across spot',
      'The rent. Sold wings turn decay in your favour exactly where they removed your protection or upside.');
    g2b.append(vCard, tCard);
    root.append(g2b);

    root.append(callout('warn', 'The trapdoor is not theoretical',
      'The put-spread collar\'s weakness is exactly the scenario protection is bought for: the crash. ' +
      'Below the low strike you are long stock again, 1-for-1, having sold the tail at what skew says was its richest price. ' +
      'JPM\'s Hedged Equity funds run this structure at ~$20B scale — accepting tail risk to keep the cap high is a ' +
      'deliberate, disclosed trade-off. Know which scenario you actually fear before choosing wings.'));
    root.append(callout('trader', "Trader's view — why desks love spread wings at size",
      'Spreads also change the <i>bank\'s</i> book: the sold tail put hands the street a long-vol, long-gamma lobe deep ' +
      'below the market that partially offsets their short-gamma floor problem. At 30x ADV that matters — the aggregate ' +
      'gamma profile (tab 4) gets flatter and the hedge flows in a crash get smaller. Structuring is risk management for both sides.'));

    function draw() {
      const p = CL.state;
      const S = p.spot, T = tenorM / 12;
      // the trapdoor must sit below the protection strike — clamp and say so
      const effLowPct = Math.min(lowPutPct, putPct - 0.04);
      const clamped = effLowPct < lowPutPct;
      const Kp = S * putPct, KpL = S * effLowPct, KcH = S * farCallPct;
      const pv = (type, K) => {
        const sig = CL.volForStrike(K, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
        return CL.bs(type, S, K, T, sig, p.rate, p.divy).price;
      };

      // structure 1: plain collar
      const Kc1 = CL.solveZeroCostCall(S, Kp, T, p);
      // structure 2: put-spread collar
      const Kc2 = CL.solveZeroCostCallPS(S, Kp, KpL, T, p);
      // structure 3: call-spread collar — solve near call so C(Kc) = P(Kp) + C(KcH)
      const target3 = pv('put', Kp) + pv('call', KcH);
      let lo = S * 0.85, hi = KcH;
      let Kc3 = null;
      if (pv('call', lo) - target3 > 0) {
        for (let i = 0; i < 80; i++) {
          const mid = 0.5 * (lo + hi);
          if (pv('call', mid) - target3 > 0) lo = mid; else hi = mid;
        }
        Kc3 = 0.5 * (lo + hi);
      }

      const structs = [
        {
          name: 'plain collar', color: 'var(--s1)',
          legs: [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: Kc1, qty: -1 }],
          desc: 'floor ' + (putPct * 100).toFixed(0) + '% · cap ' + (Kc1 / S * 100).toFixed(1) + '%',
        },
        {
          name: 'put-spread collar', color: 'var(--s2)',
          legs: [{ type: 'put', K: Kp, qty: 1 }, { type: 'put', K: KpL, qty: -1 }, { type: 'call', K: Kc2, qty: -1 }],
          desc: 'protection ' + (effLowPct * 100).toFixed(0) + '–' + (putPct * 100).toFixed(0) + '% · cap ' + (Kc2 / S * 100).toFixed(1) + '%',
        },
      ];
      if (Kc3) {
        structs.push({
          name: 'call-spread collar', color: 'var(--s3)',
          legs: [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: Kc3, qty: -1 }, { type: 'call', K: KcH, qty: 1 }],
          desc: 'capped only ' + (Kc3 / S * 100).toFixed(1) + '–' + (farCallPct * 100).toFixed(0) + '%, upside re-opens above',
        });
      }

      tileHost.innerHTML = '';
      if (clamped) {
        tileHost.append(CL.ui.el('p', 'small',
          'Trapdoor clamped to ' + (effLowPct * 100).toFixed(0) + '% — the put you sell must sit below the put you own, or the "spread" inverts into naked short downside.'));
      }
      tileHost.append(tiles([
        { k: 'Plain collar cap', v: (Kc1 / S * 100).toFixed(1) + '%', d: F.money(Kc1) },
        { k: 'Put-spread collar cap', v: (Kc2 / S * 100).toFixed(1) + '%', cls: 'pos', d: '+' + ((Kc2 - Kc1) / S * 100).toFixed(1) + ' pts of extra upside vs plain' },
        { k: 'Call-spread collar cap', v: Kc3 ? (Kc3 / S * 100).toFixed(1) + '%' : 'n/a', cls: 'neg', d: Kc3 ? ((Kc3 - Kc1) / S * 100).toFixed(1) + ' pts vs plain — the price of the moonshot' : 'far call too expensive to fund' },
      ]));

      // payoff chart
      payCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const xs = [], ys = structs.map(() => []);
      const stockY = [];
      for (let x = S * 0.55; x <= S * 1.5; x += S * 0.005) {
        xs.push(x);
        stockY.push(x - S);
        structs.forEach((st, si) => {
          let v = x - S;
          for (const leg of st.legs) {
            const prem = pv(leg.type, leg.K);
            const intr = leg.type === 'put' ? Math.max(leg.K - x, 0) : Math.max(x - leg.K, 0);
            v += leg.qty * (intr - prem);
          }
          ys[si].push(v);
        });
      }
      CL.charts.lineChart(payCard, {
        height: 320,
        series: [
          { name: 'stock alone', color: 'var(--muted)', x: xs, y: stockY, dash: '5 4', width: 1.5 },
          ...structs.map((st, si) => ({ name: st.name, color: st.color, x: xs, y: ys[si], width: si === 0 ? 2.8 : 2 })),
        ],
        xLabel: 'CBA at expiry (A$)', yLabel: 'P&L per share (A$)',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0),
        refX: [
          { v: KpL, label: 'trapdoor', color: 'var(--s2)', dash: '2 3' },
          { v: Kp, label: 'floor', color: 'var(--muted)', dash: '2 3' },
          { v: KcH, label: 'recapture', color: 'var(--s3)', dash: '2 3' },
        ],
      });

      // legs table
      tableHost.innerHTML = '<p class="chart-title">Legs and premiums (per share)</p>';
      let html = '<table class="data"><tr><th>Structure</th><th>Leg</th><th>Strike</th><th>% spot</th><th>IV</th><th>Premium</th></tr>';
      for (const st of structs) {
        st.legs.forEach((leg, li) => {
          const sig = CL.volForStrike(leg.K, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
          const prem = pv(leg.type, leg.K) * leg.qty * -1; // cash: pay for long (−), receive for short (+)
          html += '<tr>' +
            `<td>${li === 0 ? st.name + ' <span class="small">(' + st.desc + ')</span>' : ''}</td>` +
            `<td>${leg.qty > 0 ? 'long' : 'short'} ${leg.type}</td>` +
            `<td>${F.money(leg.K)}</td><td>${(leg.K / S * 100).toFixed(1)}%</td>` +
            `<td>${(sig * 100).toFixed(1)}</td>` +
            `<td>${prem >= 0 ? '+' : '−'}${F.money(Math.abs(prem))}</td></tr>`;
        });
      }
      html += '</table><p class="caption">Premium column is holder cashflow: short legs collect (+), long legs cost (−). Each structure nets to ≈ zero. ' +
        'Note: IVs are floored at 5.0 — the linear skew model extrapolates poorly beyond ~±30% moneyness, so far wings (e.g. a 140%+ call) price near zero here; a real desk marks them off a smile with a floor.</p>';
      tableHost.innerHTML += html;

      // greeks comparison
      const Tmid = T * 0.5;
      const gx = [], dSets = structs.map(() => []), gSets = structs.map(() => []),
        vSets = structs.map(() => []), tSets = structs.map(() => []);
      for (let x = S * 0.6; x <= S * 1.5; x += S * 0.006) {
        gx.push(x);
        structs.forEach((st, si) => {
          const g = CL.structGreeks(st.legs, 1, x, Tmid, p);
          dSets[si].push(g.delta);
          gSets[si].push(g.gamma * 100);
          vSets[si].push(g.vega);
          tSets[si].push(g.theta * 100);
        });
      }
      dCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(dCard, {
        height: 250,
        series: structs.map((st, si) => ({ name: st.name, color: st.color, x: gx, y: dSets[si], width: si === 0 ? 2.6 : 1.9 })),
        xLabel: 'spot (A$)', yLabel: 'net delta',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(2),
      });
      gCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(gCard, {
        height: 250,
        series: structs.map((st, si) => ({ name: st.name, color: st.color, x: gx, y: gSets[si], width: si === 0 ? 2.6 : 1.9 })),
        xLabel: 'spot (A$)', yLabel: 'net gamma ×100',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2),
      });

      vCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(vCard, {
        height: 250,
        series: structs.map((st, si) => ({ name: st.name, color: st.color, x: gx, y: vSets[si], width: si === 0 ? 2.6 : 1.9 })),
        xLabel: 'spot (A$)', yLabel: 'A$ / vol pt',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2),
      });
      vCard.append(el('p', 'caption',
        'The put-spread collar\'s tell: below the trapdoor it flips net SHORT vol (the sold tail put\'s vega dominates) — in the crash, ' +
        'just when vol explodes, you are paying it away. The plain collar stays long vol all the way down. ' +
        'The call-spread collar re-goes long vol above the recapture strike.'));

      tCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(tCard, {
        height: 250,
        series: structs.map((st, si) => ({ name: st.name, color: st.color, x: gx, y: tSets[si], width: si === 0 ? 2.6 : 1.9 })),
        xLabel: 'spot (A$)', yLabel: 'A$ / day ×100',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1),
      });
    }

    draw();
    this._redraw = draw;
  },
};
