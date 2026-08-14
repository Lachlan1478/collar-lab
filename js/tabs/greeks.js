/* Tab 2 — Greeks Lab: per-leg and net greeks vs spot, with time & vol sliders.
   Perspective toggle flips signs (bank = mirror image of client's options). */
window.CL = window.CL || {};
CL.tabs = CL.tabs || {};

CL.tabs.greeks = {
  id: 'greeks',
  title: 'Greeks Lab',
  render(root) {
    const { el, slider, checkbox, callout, card, tiles } = CL.ui;
    const F = CL.fmt;
    root.innerHTML = '';

    root.append(el('h2', null, '2 · The greeks of a collar'));
    root.append(el('p', 'lede',
      'Every chart on this tab is <b>one structure: the zero-cost collar from tab 1</b> — the floor set by the put-strike slider, ' +
      'the cap solved live (shown in the controls), plus your +1 stock when the box is ticked. A collar is two options pulling in ' +
      'opposite directions, so every greek is shown per leg and net, across spot — the story is <i>where you are</i> relative to the strikes. ' +
      'Use the header toggle to flip between the holder\'s book and the bank\'s book (exact mirror image on the options). ' +
      'The Scenario theatre below deliberately switches to single options and straddles — the simplest structure that isolates each greek.'));

    // ---- controls ----
    let putPct = 0.90, tenorM = 12, tLeft = 1.0, withStock = true;
    const controls = el('div', 'controls');
    const sPut = slider({
      label: 'Put strike', min: 0.75, max: 1.0, step: 0.005, value: putPct,
      fmt: (v) => (v * 100).toFixed(1) + '%', onInput: (v) => { putPct = v; draw(); },
    });
    const sTenor = slider({
      label: 'Original tenor', min: 3, max: 24, step: 1, value: tenorM,
      fmt: (v) => v + 'm', onInput: (v) => { tenorM = v; draw(); },
    });
    const sT = slider({
      label: 'Life remaining', min: 0.02, max: 1, step: 0.01, value: 1,
      fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => { tLeft = v; draw(); },
    });
    const cStock = checkbox({
      label: 'Include the stock leg in net delta', checked: true,
      onChange: (v) => { withStock = v; draw(); },
    });
    // read-only display of the solved cap so the learner knows what call they hold
    const capRead = el('div', 'ctl');
    capRead.innerHTML = '<label><span>Cap (solved, zero-cost)</span><b id="gl-cap">—</b></label>';
    controls.append(sPut.root, sTenor.root, sT.root, capRead, cStock.root);
    root.append(controls);

    const tileHost = el('div');
    root.append(tileHost);

    const gridTop = el('div', 'grid2');
    const cDelta = card(); const cGamma = card();
    gridTop.append(cDelta, cGamma);
    root.append(gridTop);

    root.append(callout('', 'The gamma dumbbell',
      'Net gamma is the collar\'s signature: <b>long gamma around the put, short gamma around the call</b>, ' +
      'roughly zero in the middle. Where you sit on this dumbbell determines whether time decay works for you ' +
      'or against you — and determines everything the bank\'s hedge does to the stock (tab 3).'));

    const gridMid = el('div', 'grid2');
    const cVega = card(); const cTheta = card();
    gridMid.append(cVega, cTheta);
    root.append(gridMid);

    // ---- Scenario theatre (after the main controls + greek charts, before the deep dive) ----
    root.append(el('h3', null, 'Scenario theatre'));
    root.append(el('p', null,
      'Curves show what a greek <i>is</i>; time shows what it <i>does</i>. One story per greek, one simple option ' +
      'per story — priced off the live surface, so the header sliders move every number below.'));
    const picker = el('div', 'scenario-picker');
    const theatreHost = el('div');
    root.append(picker, theatreHost);

    root.append(el('h3', null, 'Second-order: vanna and charm'));
    root.append(el('p', null,
      'These two matter later, at size. <b>Vanna</b> (∂Δ/∂vol): when vol rises, out-of-the-money strikes gain delta — ' +
      'a sell-off that spikes vol changes the bank\'s hedge <i>even before spot reaches the strike</i>. ' +
      '<b>Charm</b> (∂Δ/∂time): near expiry, delta decays toward 0 or ±1, forcing the bank to unwind hedge ' +
      'day after day — the mechanical flow behind expiry-week drift and pinning.'));
    const gridBot = el('div', 'grid2');
    const cVanna = card(); const cCharm = card();
    gridBot.append(cVanna, cCharm);
    root.append(gridBot);

    // ---- Scenario theatre logic (its section is appended above, before the deep dive) ----
    const tab = this;
    const pctS = (x) => (x * 100).toFixed(0);
    const sA = (v) => (v > 0 ? '+' : '') + F.money(v);   // signed A$ for narration
    const realVol = (path, a, b) => {                 // annualised realised vol over (a, b]
      let s = 0; for (let i = a + 1; i <= b; i++) { const r = Math.log(path[i] / path[i - 1]); s += r * r; }
      return Math.sqrt((s / (b - a)) * 252);
    };
    const biggestDay = (path) => {                    // index of the largest 1-day % move
      let bi = 1; for (let i = 2; i < path.length; i++)
        if (Math.abs(Math.log(path[i] / path[i - 1])) > Math.abs(Math.log(path[bi] / path[bi - 1]))) bi = i;
      return bi;
    };
    // Daily delta-rebalance P&L, precomputed ONCE per mount; readouts index by st.t.
    const hedgeArrays = (hLegs, path, nDays, pv) => {
      const val = (t) => CL.structGreeks(hLegs, 0, path[t], Math.max(0, (nDays - t) / 252), pv);
      const hedge = [0], opt = [0]; let cum = 0; const prem = val(0).price; let h = -val(0).delta;
      for (let t = 1; t <= nDays; t++) {
        cum += h * (path[t] - path[t - 1]);
        const gt = val(t);
        hedge.push(cum); opt.push(gt.price - prem); h = -gt.delta;
      }
      return { hedge, opt };
    };
    const pnlTiles = (A) => (st) => [
      { k: 'Rebalance P&L', v: F.sign(A.hedge[st.t]), cls: A.hedge[st.t] >= 0 ? 'pos' : 'neg' },
      { k: 'Hedged total', v: F.sign(A.hedge[st.t] + A.opt[st.t]), cls: (A.hedge[st.t] + A.opt[st.t]) >= 0 ? 'pos' : 'neg' },
      { k: 'Gamma ×100', v: F.sign(st.greeks.gamma * 100, 2) },
    ];
    // For DELTA-HEDGED scenarios the payoff-at-expiry chart is the wrong lens
    // (you re-flatten direction daily, so the destination stops mattering).
    // Show the LEDGER instead: what each day's trips and decay actually add.
    const mkHedgedVisual = (path, nDays, K, A) => {
      const tot = A.hedge.map((h, i) => h + A.opt[i]);
      const allP = A.hedge.concat(A.opt, tot);
      const yLo = Math.min.apply(null, allP) - 0.5, yHi = Math.max.apply(null, allP) + 0.5;
      const sLo = Math.min.apply(null, path) * 0.98, sHi = Math.max.apply(null, path) * 1.02;
      return {
        build(host) {
          host.innerHTML = '';
          const grid = el('div', 'grid2');
          const ledger = card('The hedged ledger — what you make each DAY',
            'Cumulative, per share: rebalance trips (green) + option mark (terracotta) = hedged total (navy). Today\'s P&L is the slope, not the level.');
          const tape = card('The tape', 'Spot so far; straddle strike dashed.');
          grid.append(ledger, tape);
          host.append(grid);
          return { ledger, tape, n: 0 };
        },
        frame(ctx, st) {
          if (ctx.n++ % 3 !== 0 && st.t !== 0 && st.t !== nDays) return;
          const px = [], h = [], o = [], tt = [], sp = [];
          for (let i = 0; i <= st.t; i++) { px.push(i); h.push(A.hedge[i]); o.push(A.opt[i]); tt.push(tot[i]); sp.push(path[i]); }
          ctx.ledger.querySelectorAll('.chart-box').forEach((n) => n.remove());
          CL.charts.lineChart(ctx.ledger, {
            height: 240,
            series: [
              { name: 'rebalance trips', color: 'var(--s3)', x: px, y: h, width: 1.8 },
              { name: 'option mark', color: 'var(--s2)', x: px, y: o, width: 1.8 },
              { name: 'hedged total', color: 'var(--s1)', x: px, y: tt, width: 2.6 },
            ],
            xLabel: 'day', yLabel: 'A$/share',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1),
            xMin: 0, xMax: nDays, yMin: yLo, yMax: yHi,
            hover: false,
          });
          ctx.tape.querySelectorAll('.chart-box').forEach((n) => n.remove());
          CL.charts.lineChart(ctx.tape, {
            height: 240,
            series: [{ name: 'CBA', color: 'var(--s1)', x: px, y: sp, width: 2.2 }],
            xLabel: 'day', yLabel: 'A$',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
            xMin: 0, xMax: nDays, yMin: sLo, yMax: sHi,
            refY: [{ v: K, label: 'K ' + K, color: 'var(--s4)', dash: '3 3' }],
            legend: false, hover: false,
            marker: { x: st.t, y: path[st.t], color: 'var(--s4)' },
          });
        },
      };
    };

    const scenarioDefs = [
      { id: 'gamma-long', label: 'Long gamma · gets paid', make() {
        const p = CL.state, S0 = p.spot, K = Math.round(S0), DAYS = 63;
        const path = CL.paths.gbm(S0, DAYS, 0, 0.30, 8);
        const legs = [{ type: 'call', K, qty: 1 }, { type: 'put', K, qty: 1 }];
        const A = hedgeArrays(legs, path, DAYS, p);
        const g0 = CL.structGreeks(legs, 0, S0, DAYS / 252, p);
        const big = biggestDay(path);
        const dOptBig = A.opt[big] - A.opt[big - 1];       // naked option mark move on the gap day
        const dHedgeBig = A.hedge[big] - A.hedge[big - 1]; // hedge leg move on the gap day
        const gapUp = path[big] > path[big - 1];
        return { name: 'Long gamma — the tape pays you', days: DAYS, spotPath: path, legs, stockQty: 0,
          custom: mkHedgedVisual(path, DAYS, K, A),
          readouts: pnlTiles(A),
          milestones: [
            { day: 0, title: 'You own the chop', text:
              F.money(g0.price) + ' for the ' + K + ' straddle: delta ' + F.sign(g0.delta) + ', gamma ×100 ≈ ' +
              (g0.gamma * 100).toFixed(1) + ' — every A$1 CBA moves, you pick up ~' + g0.gamma.toFixed(2) +
              ' deltas to sell. The market implied ' + pctS(p.vol) + ' vol; watch what the tape actually does.' },
            { day: 10, title: 'Sell the rip', text: (st) =>
              'Spot ' + st.S.toFixed(0) + ': the straddle\'s delta ran to ' + F.sign(st.greeks.delta, 1) +
              ' and you sold that stock into strength. Realised vol so far ≈ ' + pctS(realVol(path, 0, st.t)) +
              ' — nearly double the ' + pctS(p.vol) + ' you paid.' },
            { day: big, pause: true, title: 'The 5% day', text:
              path[big - 1].toFixed(1) + ' → ' + path[big].toFixed(1) + ' overnight, the biggest day of the run. ' +
              'Watch which tile does what: the P&L / share tile — the naked option mark — swings ' + sA(dOptBig) +
              ' in a single session, because convexity pays on impact. The Rebalance tile ' +
              (dHedgeBig >= 0 ? 'adds only ' + sA(dHedgeBig) : 'actually gives back ' + sA(dHedgeBig)) +
              ' — yesterday\'s hedge was sized for yesterday\'s spot and couldn\'t re-size mid-gap. What the gap ' +
              'really hands you is fresh stock to ' + (gapUp ? 'sell up at ' : 'buy down at ') + path[big].toFixed(0) +
              '; the Rebalance tile banks that on the reversion, not today.' },
            { cond: (st) => A.hedge[st.t] > 1.25 * g0.price, once: true, title: 'Grinding it in', text: (st) =>
              'Rebalancing has now banked ' + F.money(A.hedge[st.t]) +
              ' — each buy-low/sell-high round trip is gamma converted to cash.' },
            { day: DAYS, title: 'The scorecard', text:
              'Spot ' + path[DAYS].toFixed(0) + ' — DOWN ' + F.money(S0 - path[DAYS], 0) + ' — and the straddle itself lost ' +
              F.money(Math.abs(A.opt[DAYS])) + '. Yet you made ' + sA(A.hedge[DAYS] + A.opt[DAYS]) + ': realised ' +
              pctS(realVol(path, 0, DAYS)) + ' vol vs ' + pctS(p.vol) + ' implied, harvested one re-hedge at a time. ' +
              'Ignore the naked P&L tile — the Hedged total tile is the scorecard. Long gamma is paid in trips, not destination.' },
          ] };
      } },
      { id: 'gamma-short', label: 'Short gamma · bleeds', make() {
        const p = CL.state, S0 = p.spot, K = Math.round(S0), DAYS = 63;
        const path = CL.paths.gbm(S0, DAYS, 0, 0.30, 8);
        const legs = [{ type: 'call', K, qty: -1 }, { type: 'put', K, qty: -1 }];
        const A = hedgeArrays(legs, path, DAYS, p);
        const g0 = CL.structGreeks(legs, 0, S0, DAYS / 252, p);
        const big = biggestDay(path);
        return { name: 'Short gamma — chasing the tape', days: DAYS, spotPath: path, legs, stockQty: 0,
          custom: mkHedgedVisual(path, DAYS, K, A),
          readouts: pnlTiles(A),
          milestones: [
            { day: 0, title: 'You sold the chop', text:
              'Same tape as the last chip, deliberately. You pocket ' + F.money(Math.abs(g0.price)) +
              ' and inherit gamma ×100 ≈ ' + F.sign(g0.gamma * 100, 1) +
              ': now every move hands delta to the OTHER side, and you must chase it to stay flat.' },
            { day: 10, title: 'Buying the top', text: (st) =>
              'Spot ' + st.S.toFixed(0) + ' forces you to buy stock up here to stay hedged. Hedged total ' +
              sA(A.hedge[st.t] + A.opt[st.t]) + ' and counting — short gamma trades against itself by construction.' },
            { day: big, pause: true, title: 'Gap risk is the business', text:
              'The ' + (Math.abs(path[big] / path[big - 1] - 1) * 100).toFixed(1) + '% overnight gap: no chance to re-hedge ' +
              'on the way. One day, ' + sA((A.hedge[big] + A.opt[big]) - (A.hedge[big - 1] + A.opt[big - 1])) +
              ' of hedged P&L, gone before the open. This asymmetry is why banks charge for gamma.' },
            { day: DAYS, title: "Theta didn't cover it", text:
              'The straddle you sold actually expired ' + F.money(A.opt[DAYS]) + ' in your favour — decay did its job. ' +
              'Re-hedging still cost ' + F.money(Math.abs(A.hedge[DAYS])) + ': total ' + sA(A.hedge[DAYS] + A.opt[DAYS]) +
              '. Short ' + pctS(p.vol) + '-vol against a ' + pctS(realVol(path, 0, DAYS)) +
              '-vol tape loses, however the spot finishes.' },
          ] };
      } },
      { id: 'theta', label: 'Theta · the melt', make() {
        const p = CL.state, S0 = p.spot, K = Math.round(S0), DAYS = 126;
        const path = CL.paths.scripted('range', S0, DAYS, { seed: 6 });
        const legs = [{ type: 'call', K, qty: 1 }];
        const g0 = CL.structGreeks(legs, 0, S0, DAYS / 252, p);
        const endIntr = Math.max(path[DAYS] - K, 0);
        // First day past halfway where daily theta triples: day-based so scrubs can't skip it.
        let tMelt = DAYS - 21, thMelt = 3 * g0.theta;
        for (let i = 64; i < DAYS; i++) {
          const gk = CL.structGreeks(legs, 0, path[i], (DAYS - i) / 252, p);
          if (gk.theta < 3 * g0.theta) { tMelt = i; thMelt = gk.theta; break; }
        }
        return { name: 'Theta — the melt', days: DAYS, spotPath: path, legs, stockQty: 0,
          readouts: (st) => [
            { k: 'Time value', v: F.money(st.greeks.price - Math.max(st.S - K, 0)) },
            { k: 'Theta / day', v: F.sign(st.greeks.theta, 3) },
            { k: 'Days left', v: String(DAYS - st.t) },
          ],
          milestones: [
            { day: 0, title: 'Renting exposure', text:
              'The 6-month ' + K + ' call costs ' + F.money(g0.price) + ', all of it time value. Theta ' +
              F.sign(g0.theta, 2) + '/day sounds like nothing — a couple of cents on an ' + F.money(g0.price, 0) +
              ' option. Watch what compounding does to nothing.' },
            { day: 21, title: 'Up on spot, poorer already', text: (st) =>
              'Spot ' + st.S.toFixed(0) + ': the call marks ' + F.money(st.greeks.price) +
              ' — but time value has already dropped from ' + F.money(g0.price) + ' to ' +
              F.money(st.greeks.price - Math.max(st.S - K, 0)) + '. Spot moved for you; the clock still collected.' },
            { day: 63, pause: true, title: 'Halfway, not half the value', text: (st) =>
              'Spot ' + st.S.toFixed(0) + ' — back where you started — and the call is ' + F.money(st.greeks.price) +
              '. Decay is not linear: the first half of the life burned ' + F.money(g0.price - st.greeks.price) +
              ', the second half burns the remaining ' + F.money(st.greeks.price) + '.' },
            { day: tMelt, title: 'The melt goes vertical', text:
              'Theta is now ' + F.sign(thMelt, 2) + '/day, three times the day-0 rate, and accelerating ' +
              'every session — this is why nobody wants to own the last month of a quiet option.' },
            { day: DAYS, title: "What's left", text:
              'Expiry at ' + path[DAYS].toFixed(1) + ': settle ' + F.money(endIntr) + ' of intrinsic against ' +
              F.money(g0.price) + ' paid. Every cent of time value melted to zero — it always does; only intrinsic ' +
              'survives. This bleed is exactly what the long-gamma chip\'s re-hedging profits had to out-earn.' },
          ] };
      } },
      { id: 'vega', label: 'Vega · marked up before touched', make() {
        const p = CL.state, S0 = p.spot, K = Math.round(S0 * 0.80), DAYS = 126;
        const path = CL.paths.scripted('crash', S0, DAYS, { seed: 2 });
        const vpath = CL.paths.volPath(path, p.vol);
        const gap = Math.round(DAYS * 0.6);
        const legs = [{ type: 'put', K, qty: 1 }];
        const mark = (t, volOv) => CL.structGreeks(legs, 0, path[t], (DAYS - t) / 252,
          Object.assign({}, p, { vol: volOv == null ? vpath[t] : volOv })).price;
        const prem0v = mark(0);
        const mPre = mark(gap - 1), mPost = mark(gap), mOldVol = mark(gap, vpath[gap - 1]);
        let pk = 0, pkV = 0;
        for (let i = 0; i <= DAYS; i++) { const m = mark(i); if (m > pkV) { pkV = m; pk = i; } }
        const pkIntr = Math.max(K - path[pk], 0);         // intrinsic at the peak mark, if the lows breached the strike
        return { name: 'Vega — repriced before touched', days: DAYS, spotPath: path, volPath: vpath, legs, stockQty: 0,
          readouts: (st) => [
            { k: 'Implied vol', v: (st.iv * 100).toFixed(1) + '%' },
            { k: 'Vega', v: F.sign(st.greeks.vega, 2) },
            { k: 'Mark', v: F.money(st.greeks.price) },
          ],
          milestones: [
            { day: 0, title: 'Buying crash insurance', text:
              'An 80% put (' + K + ') for ' + F.money(prem0v) +
              (p.skewOn
                ? ' — skew marks it well above the ' + pctS(p.vol) + '-vol ATM line.'
                : ' — priced right off the flat ' + pctS(p.vol) + '-vol line; flip skew on in the header and the desk marks this wing richer.') +
              ' Spot is ' + F.money(S0 - K, 0) + ' above the strike; for months, only the vol mark ' +
              'can move this option.' },
            { day: gap - 16, title: 'Left for dead', text: (st) =>
              'Spot has ground UP to ~' + st.S.toFixed(0) + ' and implied bled to ~' + pctS(st.iv) +
              ': the put marks pennies. Every crash put looks like wasted premium right up until it isn\'t.' },
            { day: gap, pause: true, title: 'Repriced, not reached', text:
              'Overnight: ' + path[gap - 1].toFixed(1) + ' → ' + path[gap].toFixed(1) + ' and implied ' +
              pctS(vpath[gap - 1]) + ' → ' + pctS(vpath[gap]) + '. The put jumps ' + F.money(mPre) + ' → ' + F.money(mPost) +
              ' — yet spot is still ' + F.money(path[gap] - K, 0) + ' ABOVE the strike. Re-run the gap at the old vol ' +
              'and it\'s worth just ' + F.money(mOldVol) + ': ' + F.money(mPost - mOldVol) +
              ' of the markup is vega, nothing else. Strike untouched.' },
            { day: pk, title: 'Peak fear', text: (st) =>
              'Spot ' + st.S.toFixed(1) + ', vol ' + pctS(st.iv) + ': the put marks ' + F.money(st.greeks.price) +
              ' — ' + (pkV / prem0v).toFixed(0) + '× what you paid' +
              (pkIntr > 0 ? ' (' + F.money(pkIntr) + ' of that is intrinsic; the rest is the vol mark)' : '') +
              '. This is the moment insurance is sold, not bought.' },
            { day: DAYS, title: 'The vol round-trip', text:
              'Spot claws back to ' + path[DAYS].toFixed(1) + ' — ' + F.money(Math.abs(path[DAYS] - K)) +
              (path[DAYS] >= K ? ' OUT of the money — and the put expires worthless.' : ' in the money at the bell.') +
              (pkIntr > 0
                ? ' The ' + F.money(pkIntr) + ' of intrinsic it carried at the lows left with the bounce — intrinsic is just spot, and spot round-trips. ' +
                  'What vega did was different: the ' + F.money(mPost - mOldVol) + ' gap-day markup landed while spot was still ' +
                  F.money(path[gap] - K, 0) + ' ABOVE the strike. Repriced before it was reached — that is vega.'
                : ' Intrinsic never showed up; every dollar this option was ever worth after day 0 was the vol mark. That is vega.') },
          ] };
      } },
      { id: 'charm', label: 'Charm · delta bleeds away', make() {
        const p = CL.state, S0 = p.spot, K = Math.round(S0 * 1.018), DAYS = 30;
        const path = CL.paths.scripted('range', S0, DAYS, { seed: 3 });
        const legs = [{ type: 'call', K, qty: 1 }];
        const g0 = CL.structGreeks(legs, 0, S0, DAYS / 252, p);
        const sh0 = g0.delta * 1e5;
        return { name: 'Charm — the hedge unwinds itself', days: DAYS, spotPath: path, legs, stockQty: 0,
          readouts: (st) => [
            { k: 'Delta', v: F.sign(st.greeks.delta) },
            { k: 'Charm ×100', v: F.sign(st.greeks.charm * 100, 2) + '/day' },
            { k: 'Bank hedge @ 100k calls', v: F.shares(st.greeks.delta * 1e5) + ' sh' },
          ],
          milestones: [
            { day: 0, title: 'A month out, ' + F.money(K - S0, 0) + ' off the strike', text:
              'A ' + K + ' call with ' + DAYS + ' days left, spot ' + S0.toFixed(0) + ': delta ' + F.sign(g0.delta) +
              '. The bank who sold it carries ' + F.shares(sh0) + ' shares per 100k calls. Terminal delta is ' +
              'binary — 0 or 1 — and time alone will drag it there.' },
            { day: 12, title: 'Pinned and undecided', text: (st) =>
              'Spot ' + st.S.toFixed(0) + ' — two weeks of chop and you sit ' + F.money(Math.abs(K - st.S), 0) +
              ' off the strike, closer than where you started. Delta holds ' +
              F.sign(st.greeks.delta) + ' because it genuinely could go either way. Charm is small when the coin ' +
              'is still in the air.' },
            { day: 16, pause: true, title: 'Same spot, less delta', text: (st) =>
              'Spot ' + st.S.toFixed(1) + ' — within a dollar of day 0 — but delta is ' + F.sign(st.greeks.delta) +
              ', not ' + F.sign(g0.delta) + '. Nothing happened except ' + st.t + ' days: that missing ' +
              Math.abs(g0.delta - st.greeks.delta).toFixed(2) + ' is charm, and the bank has already quietly sold ' +
              F.shares((g0.delta - st.greeks.delta) * 1e5) + ' of the ' + F.shares(sh0) + ' hedge shares.' },
            { cond: (st) => st.t > 18 && st.greeks.delta < 0.05, once: true, title: 'The unwind', text: (st) => {
              const dSpotOnly = CL.structGreeks(legs, 0, st.S, DAYS / 252, p).delta; // same spot, day-0 clock
              return 'Delta ~0 with ' + (DAYS - st.t) + ' days left. Split it honestly: the slide to ' +
                st.S.toFixed(0) + ' alone, on the day-0 clock, would still leave delta ' + F.sign(dSpotOnly) +
                ' — the other ' + Math.max(0, dSpotOnly - st.greeks.delta).toFixed(2) + ' is charm, the clock ' +
                'dragging an out-of-the-money delta to zero. Either way the whole ' + F.shares(sh0) +
                '-share hedge has been fed back to the market. Multiply by every strike on the board and you ' +
                'have expiry-week flow — tab 3 takes it from here.';
            } },
          ] };
      } },
    ];

    const chipEls = {};
    const showScenario = (id) => {
      tab._theatreSel = id;
      Object.keys(chipEls).forEach((k) => chipEls[k].classList.toggle('active', k === id));
      if (tab._theatre) tab._theatre.destroy();
      const def = scenarioDefs.find((s) => s.id === id);
      tab._theatre = CL.player.mount(theatreHost, def.make());
    };
    scenarioDefs.forEach((s) => {
      const b = el('button', null, s.label);
      b.addEventListener('click', () => showScenario(s.id));
      chipEls[s.id] = b;
      picker.append(b);
    });
    showScenario(scenarioDefs.some((s) => s.id === tab._theatreSel) ? tab._theatreSel : 'gamma-long');
    // ---- end Scenario theatre --------------------------------------------

    root.append(callout('trader', "Trader's view",
      'Shrink “life remaining” and watch gamma spike into needles at the strikes while vega collapses. ' +
      'Long-dated collars are vol trades; short-dated collars are gamma trades. The same structure changes species over its life.'));

    function draw() {
      const p = CL.state;
      const S0 = p.spot, T0 = tenorM / 12, T = Math.max(0.003, T0 * tLeft);
      const Kp = S0 * putPct;
      const Kc = CL.solveZeroCostCall(S0, Kp, T0, p);   // strikes struck at inception
      const capEl = capRead.querySelector('#gl-cap');
      if (capEl) capEl.textContent = F.money(Kc) + ' (' + (Kc / S0 * 100).toFixed(1) + '%)';
      const persp = p.perspective === 'dealer' ? -1 : 1;

      const legs = [
        { type: 'put', K: Kp, qty: 1 * persp },
        { type: 'call', K: Kc, qty: -1 * persp },
      ];
      const stockQty = (withStock && persp === 1) ? 1 : 0; // bank view = options book + hedge, not client stock

      // greeks at current spot
      const atS = CL.structGreeks(legs, stockQty, S0, T, p);
      tileHost.innerHTML = '';
      tileHost.append(tiles([
        { k: 'Net delta @ spot', v: F.sign(atS.delta), d: persp === 1 ? 'per collared share' : 'options only — hedge with −Δ stock' },
        { k: 'Net gamma', v: F.sign(atS.gamma * 100, 3), d: 'Δ change per 1% spot move ×100' },
        { k: 'Net vega', v: F.sign(atS.vega), d: 'A$ per share per vol pt' },
        { k: 'Net theta', v: F.sign(atS.theta, 3), d: 'A$ per share per day' },
      ]));
      tileHost.append(el('p', 'small',
        'Convention note: the gamma tile and the gamma chart both show Γ×100 — read either as "delta picked up over a 1% spot move". No double-counting.'));

      // sweep spot
      const xs = [], d = { put: [], call: [], net: [] }, g = { put: [], call: [], net: [] },
        v = { put: [], call: [], net: [] }, th = { put: [], call: [], net: [] },
        va = { net: [] }, ch = { net: [] };
      for (let x = S0 * 0.7; x <= S0 * 1.3; x += S0 * 0.005) {
        xs.push(x);
        const gp = CL.legGreeks(legs[0], x, T, p);
        const gc = CL.legGreeks(legs[1], x, T, p);
        d.put.push(gp.delta); d.call.push(gc.delta); d.net.push(gp.delta + gc.delta + stockQty);
        g.put.push(gp.gamma * 100); g.call.push(gc.gamma * 100); g.net.push((gp.gamma + gc.gamma) * 100);
        v.put.push(gp.vega); v.call.push(gc.vega); v.net.push(gp.vega + gc.vega);
        th.put.push(gp.theta); th.call.push(gc.theta); th.net.push(gp.theta + gc.theta);
        va.net.push(gp.vanna + gc.vanna);
        ch.net.push((gp.charm + gc.charm) * 100);
      }

      const whose = persp === 1 ? 'holder' : 'bank';
      const mk = (cardEl, title, sub, data, yLabel, extras) => {
        cardEl.innerHTML = '';
        cardEl.append(el('p', 'chart-title', title));
        cardEl.append(el('p', 'chart-sub', sub));
        CL.charts.lineChart(cardEl, Object.assign({
          height: 260,
          series: data,
          xLabel: 'spot (A$)', yLabel,
          xFmt: (q) => q.toFixed(0),
          yFmt: (q) => (Math.abs(q) < 0.005 ? '0' : (q > 0 ? '+' : '−') + Math.abs(q).toFixed(2)),
          refX: [
            { v: Kp, label: 'put', color: 'var(--s2)' },
            { v: Kc, label: 'call', color: 'var(--s3)' },
            { v: S0, label: '', color: 'var(--muted)', dash: '2 3' },
          ],
        }, extras || {}));
      };

      mk(cDelta, 'Delta — ' + whose,
        persp === 1 ? 'Net includes ' + (stockQty ? '+1 stock. Between strikes ≈ full exposure; at the edges it flattens.' : 'options only.') : 'Bank sells this many shares per collar share to start flat.',
        [
          { name: 'put leg', color: 'var(--s2)', x: xs, y: d.put, width: 1.7 },
          { name: 'call leg', color: 'var(--s3)', x: xs, y: d.call, width: 1.7 },
          { name: 'net', color: 'var(--s1)', x: xs, y: d.net, width: 2.7 },
        ], 'delta (per share)');
      {
        const eqT = Math.exp(-p.divy * T);
        cDelta.append(el('p', 'caption',
          'Why the edges never quite reach ' + (persp === 1 && stockQty ? 'zero' : '±1') + ': (1) with ' +
          Math.round(tLeft * 100) + '% of life left there is always a tail chance spot re-crosses a strike, so option deltas stop short of their limits — ' +
          'drag “Life remaining” to 2% and watch the edges slam flat; (2) even deep in the money a European option\'s delta tops out at ±e^(−q·T) = ±' + eqT.toFixed(3) +
          ', not ±1 — the option hedges the FORWARD, while the stockholder keeps collecting CBA\'s ' + (p.divy * 100).toFixed(1) + '% dividend stream the option never pays. ' +
          (persp === 1 && stockQty ? 'Deep below the floor the holder is left with ≈ +' + (1 - eqT).toFixed(3) + ' of residual delta — the dividends the put does not need to protect.' :
            'That carry haircut is why even a certain-to-exercise option is hedged with fewer shares than its notional.')));
      }

      mk(cGamma, 'Gamma — the dumbbell',
        'Long at one strike, short at the other. This chart is the key to the whole dashboard.',
        [
          { name: 'put leg', color: 'var(--s2)', x: xs, y: g.put, width: 1.7 },
          { name: 'call leg', color: 'var(--s3)', x: xs, y: g.call, width: 1.7 },
          { name: 'net', color: 'var(--s1)', x: xs, y: g.net, width: 2.7, area: true },
        ], 'gamma ×100');

      mk(cVega, 'Vega',
        'Long vol at the put, short vol at the call. Net vega flips sign as spot moves between strikes.',
        [
          { name: 'put leg', color: 'var(--s2)', x: xs, y: v.put, width: 1.7 },
          { name: 'call leg', color: 'var(--s3)', x: xs, y: v.call, width: 1.7 },
          { name: 'net', color: 'var(--s1)', x: xs, y: v.net, width: 2.7 },
        ], 'A$ / vol pt');

      mk(cTheta, 'Theta',
        'The mirror of gamma: you pay for gamma with decay. Near the put you bleed; near the call, decay pays you.',
        [
          { name: 'put leg', color: 'var(--s2)', x: xs, y: th.put, width: 1.7 },
          { name: 'call leg', color: 'var(--s3)', x: xs, y: th.call, width: 1.7 },
          { name: 'net', color: 'var(--s1)', x: xs, y: th.net, width: 2.7 },
        ], 'A$ / day');
      {
        const idxAt = (v) => {
          let bi = 0, bd = Infinity;
          for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - v); if (d < bd) { bd = d; bi = i; } }
          return bi;
        };
        const thFloor = th.net[idxAt(Kp)], thCap = th.net[idxAt(Kc)];
        const who = persp === 1 ? 'holder' : 'bank';
        cTheta.append(el('p', 'caption',
          'How to read it: theta is the DAILY RENT, in A$ per share per day, and its sign follows ownership — options you are long bleed, options you sold pay you. ' +
          (persp === 1 ? 'The holder\'s book here is long the put, short the call: ' : 'The bank\'s book here is short the put, long the call: ') +
          'net theta reads ' + F.sign(thFloor, 3) + '/day at the floor and ' + F.sign(thCap, 3) + '/day at the cap. ' +
          (thFloor * thCap < 0
            ? 'The sign flips across the range — decay bills the ' + who + ' at one strike and pays them at the other. '
            : 'Note BOTH ends currently net ' + (thFloor < 0 ? 'against' : 'for') + ' the ' + who + ': with ' + Math.round(tLeft * 100) +
              '% of life left, the 10%-OTM put leg\'s decay still dominates at either strike. Drag “Life remaining” down and watch the cap end change sign as the collar turns into a gamma trade. ') +
          'Hold this against the gamma dumbbell above: same map, opposite sign — theta is the invoice for gamma, and nobody gets convexity rent-free.'));
      }

      mk(cVanna, 'Vanna (net)',
        'Vol up → put delta grows, call delta shrinks. A vol spike alone re-hedges the whole street.',
        [{ name: 'net vanna', color: 'var(--s7)', x: xs, y: va.net, width: 2.4 }],
        'ΔΔ / vol pt', { legend: false });

      mk(cCharm, 'Charm (net) ×100',
        'Delta bleed per day. Largest just off the strikes near expiry — the engine of expiry-week flows.',
        [{ name: 'net charm', color: 'var(--s7)', x: xs, y: ch.net, width: 2.4 }],
        'ΔΔ / day ×100', { legend: false });
      cCharm.append(el('p', 'caption',
        'How to read it: charm is what delta does when NOTHING happens — spot parked, one day passes. ' +
        'Park between the strikes and both options decay toward worthless, so the collar\'s grip loosens: ' +
        (persp === 1 && stockQty
          ? 'your net delta drifts back toward +1.0 all by itself, and you quietly re-become plain long stock. The bank feels the equal-and-opposite drift and must unwind a slice of its hedge every day'
          : 'the option book\'s delta drifts toward zero all by itself, and the stock hedge held against it must be unwound a slice a day') +
        ' — mechanical flow that accelerates into expiry just off the strikes (the tall lobes here), ' +
        'which is the engine behind expiry-week pinning on tab 3. The “Charm · delta bleeds away” chip above animates exactly this.'));
    }

    draw();
    this._redraw = draw;
  },
};
