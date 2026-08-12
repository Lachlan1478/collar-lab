/* Tab 7 — Campaign Simulator: the full 30x ADV multi-tranche collar program.
   Scenario walkthrough (aggregate greeks + hedge flows) and Monte Carlo
   comparison vs one-shot collar and naked stock.                             */
window.CL = window.CL || {};
CL.tabs = CL.tabs || {};

CL.tabs.campaign = {
  id: 'campaign',
  title: 'Campaign Sim',
  render(root) {
    const { el, slider, select, tiles, callout, card } = CL.ui;
    const F = CL.fmt;
    root.innerHTML = '';

    root.append(el('h2', null, '6 · The campaign: 30× ADV, done properly'));
    root.append(el('p', 'lede',
      'Everything in one place. Build the program — size, tranches, spacing, wings — and run it. ' +
      'The walkthrough shows the book you\'d actually be carrying: aggregate greeks that build tranche by tranche, ' +
      'hedge flows measured against CBA\'s real volume, expiry cliffs at the far end. ' +
      'The Monte Carlo answers the only question that matters: was averaging in worth it?'));

    let advMult = 30, nTranches = 6, spacingW = 2, tenorM = 12, putPct = 0.90,
      wings = 'plain', scen = 'base', partRate = 0.15;

    const controls = el('div', 'controls');
    controls.append(slider({
      label: 'Size', min: 5, max: 50, step: 1, value: advMult,
      fmt: (v) => v + '× ADV', onInput: (v) => { advMult = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Tranches', min: 1, max: 12, step: 1, value: nTranches,
      fmt: (v) => '' + v, onInput: (v) => { nTranches = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Spacing', min: 1, max: 4, step: 1, value: spacingW,
      fmt: (v) => v + 'w', onInput: (v) => { spacingW = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Put strike', min: 0.82, max: 0.96, step: 0.01, value: putPct,
      fmt: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { putPct = v; draw(); },
    }).root);
    controls.append(select({
      label: 'Wings', options: [
        { id: 'plain', label: 'Plain collar' },
        { id: 'ps', label: 'Put-spread collar (78% trapdoor)' },
        { id: 'cs', label: 'Call-spread collar (122% recapture)' },
      ], value: wings, onChange: (v) => { wings = v; draw(); },
    }).root);
    controls.append(select({
      label: 'Walkthrough scenario', options: CL.pathScenarios, value: scen,
      onChange: (v) => { scen = v; draw(); },
    }).root);
    let deductImpact = false, seedOff = 0;
    controls.append(CL.ui.checkbox({
      label: 'Deduct estimated impact costs in the Monte Carlo', checked: false,
      onChange: (v) => { deductImpact = v; draw(); },
    }).root);
    const reseedBtn = el('button', 'btn ghost', 'Re-run — new seed');
    reseedBtn.addEventListener('click', () => { seedOff += 1; draw(); });
    controls.append(reseedBtn);
    root.append(controls);

    const tileHost = el('div');
    root.append(tileHost);

    const ladderCard = card('Tranche ladder on the scenario path',
      'Each tranche struck at prevailing spot. Terracotta = tranche floors, green = caps, dashed = blended program levels.');
    root.append(ladderCard);

    const g2 = el('div', 'grid2');
    const greekCard = card('Aggregate program greeks through time',
      'Client net delta (M shares) builds as tranches land, then steps down as they expire.');
    const flowCard = card('Street hedge flow, daily',
      'Shares banks must trade each day (inception hedges + gamma re-hedging + expiry unwinds) vs CBA ADV.');
    g2.append(greekCard, flowCard);
    root.append(g2);

    // ---- Scenario theatre ------------------------------------------------
    root.append(el('h3', null, 'Scenario theatre'));
    root.append(el('p', null,
      'The whole course on one clock: 75M shares, six tranches, three tapes — watch the ladder land, ' +
      'the street absorb it, and every tranche resolve.'));
    const picker = el('div', 'scenario-picker');
    const theatreHost = el('div');
    root.append(picker, theatreHost);

    const tab = this;
    // shared params, recomputed at every mount so numbers follow the live surface.
    // Theatre constants (30× ADV, 6 tranches, 2w spacing, 90% floor, plain
    // collar, 12m tenor, 15% participation) are deliberately NOT read from the
    // sliders above — this is THE canonical program, on three different tapes.
    const shared = () => {
      const p = CL.state, S0 = p.spot, ADV = p.adv, T0 = 1, TEN = 252;
      const N = 6, SPACE = 10, DAYS = (N - 1) * SPACE + TEN;    // 302
      const perTr = 5 * ADV, prog = N * perTr;                  // 12.5M / 75M sh
      const PART = 0.15;                                        // hedge-ledger participation
      return { p, S0, ADV, T0, TEN, N, SPACE, DAYS, perTr, prog, PART };
    };
    // precompute the whole program once per mount, indexed by day — the
    // scrubber goes backward, so nothing may accumulate inside frame().
    const mkProgram = (c, path) => {
      const trs = [];
      for (let i = 0; i < c.N; i++) {
        const t0 = i * c.SPACE, S = path[t0], exp = t0 + c.TEN, ST = path[exp];
        const Kp = S * 0.90, Kc = CL.solveZeroCostCall(S, Kp, c.T0, c.p);
        const hedge = CL.structGreeks([{ type: 'put', K: Kp, qty: -1 }, { type: 'call', K: Kc, qty: 1 }], 0, S, c.T0, c.p).delta * c.perTr;
        const pay = Math.max(Kp - ST, 0) - Math.max(ST - Kc, 0);          // collar payoff/share
        const tag = ST <= Kp ? 'floor' : (ST >= Kc ? 'cap' : 'band');
        trs.push({ t0, exp, S, Kp, Kc, ST, hedge, pay, tag, settle: (ST - c.S0 + pay) * c.perTr });
      }
      const COLL = [], SOLD = [], blendF = [], blendC = [], SETTLED = [], NEXP = [];
      for (let t = 0; t <= c.DAYS; t++) {
        let coll = 0, sold = 0, f = 0, cc = 0, live = 0, settled = 0, nx = 0;
        for (const tr of trs) {
          if (t >= tr.t0 && t < tr.exp) { coll += c.perTr; f += tr.Kp; cc += tr.Kc; live++; }
          sold += Math.min(Math.max(0, t - tr.t0) * c.PART * c.ADV, tr.hedge);
          if (t >= tr.exp) { settled += tr.settle; nx++; }
        }
        COLL.push(coll); SOLD.push(sold);
        blendF.push(live ? f / live : null); blendC.push(live ? cc / live : null);
        SETTLED.push(settled); NEXP.push(nx);
      }
      return { trs, COLL, SOLD, blendF, blendC, SETTLED, NEXP,
        hedgeTot: trs.reduce((a, tr) => a + tr.hedge, 0),
        progPL: trs.reduce((a, tr) => a + tr.settle, 0) };
    };
    // the two theatre cards, shared by all three scenarios
    const mkTheatre = (c, path, prg) => {
      const yLo = Math.min(Math.min.apply(null, path), Math.min.apply(null, prg.trs.map((tr) => tr.Kp))) * 0.98;
      const yHi = Math.max(Math.max.apply(null, path), Math.max.apply(null, prg.trs.map((tr) => tr.Kc))) * 1.02;
      const refs = (t) => {
        const out = [];
        prg.trs.forEach((tr, i) => {
          if (tr.t0 > t) return;                                // not landed yet
          if (t >= tr.exp) {                                    // resolved — winning leg amber
            if (tr.tag === 'floor') {
              out.push({ v: tr.Kp, label: 'T' + (i + 1) + ' ✓ floor +' + tr.pay.toFixed(1), color: 'var(--s4)', dash: '3 3' });
              out.push({ v: tr.Kc, label: tr.Kc.toFixed(0), color: 'var(--s3)', dash: '3 3' });
            } else if (tr.tag === 'cap') {
              out.push({ v: tr.Kp, label: 'T' + (i + 1) + ' ' + tr.Kp.toFixed(0), color: 'var(--s2)', dash: '3 3' });
              out.push({ v: tr.Kc, label: '✓ capped −' + (-tr.pay).toFixed(1), color: 'var(--s4)', dash: '3 3' });
            } else {
              out.push({ v: tr.Kp, label: 'T' + (i + 1) + ' ✓ in band', color: 'var(--s4)', dash: '3 3' });
              out.push({ v: tr.Kc, label: tr.Kc.toFixed(0), color: 'var(--s3)', dash: '3 3' });
            }
          } else {
            out.push({ v: tr.Kp, label: 'T' + (i + 1) + ' ' + tr.Kp.toFixed(0), color: 'var(--s2)', dash: '3 3' });
            out.push({ v: tr.Kc, label: tr.Kc.toFixed(0), color: 'var(--s3)', dash: '3 3' });
          }
        });
        if (prg.blendF[t] != null) {
          out.push({ v: prg.blendF[t], label: 'blend ' + prg.blendF[t].toFixed(1), color: 'var(--s2)', dash: '2 2' });
          out.push({ v: prg.blendC[t], label: 'blend ' + prg.blendC[t].toFixed(1), color: 'var(--s3)', dash: '2 2' });
        }
        return out;
      };
      return {
        build(host) {
          host.innerHTML = '';
          const grid = el('div', 'grid2');
          const tapeCard = card('The campaign tape',
            'Floors/caps land as each tranche strikes; dashed blend lines re-level; labels resolve at expiry.');
          const ledgerCard = card('The program ledger',
            'Shares collared live (navy) vs street hedge sold (terracotta), out of the 75M program.');
          grid.append(tapeCard, ledgerCard);
          host.append(grid);
          return { tapeCard, ledgerCard, n: 0 };
        },
        frame(ctx, st) {
          if (ctx.n++ % 3 !== 0 && st.t !== 0 && st.t !== c.DAYS) return;
          ctx.tapeCard.querySelectorAll('.chart-box').forEach((n) => n.remove());
          const px = [], py = [];
          for (let i = 0; i <= st.t; i++) { px.push(i); py.push(path[i]); }
          CL.charts.lineChart(ctx.tapeCard, {
            height: 260,
            series: [{ name: 'CBA', color: 'var(--s1)', x: px, y: py, width: 2.2 }],
            xLabel: 'day', yLabel: 'A$',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
            xMin: 0, xMax: c.DAYS, yMin: yLo, yMax: yHi,
            refY: refs(st.t), legend: false, hover: false,
            marker: { x: st.t, y: st.S, color: 'var(--s4)' },
          });
          ctx.ledgerCard.querySelectorAll('.chart-box').forEach((n) => n.remove());
          const cy = [], sy = [];
          for (let i = 0; i <= st.t; i++) { cy.push(prg.COLL[i]); sy.push(prg.SOLD[i]); }
          CL.charts.lineChart(ctx.ledgerCard, {
            height: 260,
            series: [
              { name: 'collared', color: 'var(--s1)', x: px, y: cy, width: 2.4, area: true },
              { name: 'hedge sold', color: 'var(--s2)', x: px, y: sy, width: 2.2 },
            ],
            xLabel: 'day', yLabel: 'shares',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
            xMin: 0, xMax: c.DAYS, yMin: 0, yMax: c.prog * 1.04,
            refY: [{ v: c.prog, label: 'full program', color: 'var(--muted)', dash: '2 3' }],
            legend: false, hover: false,
            marker: { x: st.t, y: prg.COLL[st.t], color: 'var(--s4)' },
          });
        },
      };
    };
    const mkReadouts = (c, prg) => (st) => {
      const t = st.t, live = prg.blendF[t] != null;
      return [
        { k: 'Collared (live)', v: F.shares(prg.COLL[t]) + ' sh', d: (prg.COLL[t] / c.prog * 100).toFixed(0) + '% of the ' + F.shares(c.prog) + ' program' },
        { k: 'Street hedge sold', v: F.shares(prg.SOLD[t]) + ' sh', d: (prg.SOLD[t] / c.ADV).toFixed(1) + ' ADV-days of ' + (prg.hedgeTot / c.ADV).toFixed(1) },
        { k: 'Blended floor', v: live ? F.money(prg.blendF[t]) : '—', d: live ? (prg.blendF[t] / c.S0 * 100).toFixed(1) + '% of day-0 spot' : 'all tranches expired' },
        { k: 'Blended cap', v: live ? F.money(prg.blendC[t]) : '—', d: live ? (prg.blendC[t] / c.S0 * 100).toFixed(1) + '% of day-0 spot' : 'all tranches expired' },
        { k: 'Settled P&L', v: F.big(prg.SETTLED[t]), cls: prg.SETTLED[t] >= 0 ? 'pos' : 'neg', d: prg.NEXP[t] + ' of 6 tranches expired' },
      ];
    };
    const base = (c, path, prg, extra) => Object.assign({
      days: c.DAYS, spotPath: path, legs: [], stockQty: 1,   // P&L tile = one unhedged share (benchmark)
      custom: mkTheatre(c, path, prg), readouts: mkReadouts(c, prg),
    }, extra);

    const scenarioDefs = [
      { id: 'grind', label: 'Grind-up · the ratchet', make(c) {
        const path = CL.paths.scripted('grind', c.S0, c.DAYS, { seed: 5 });
        const prg = mkProgram(c, path), T = prg.trs, t1 = T[0], t6 = T[5];
        const perSh = prg.progPL / c.prog, naked = path[c.DAYS] - c.S0;
        const sessions = Math.ceil(t1.hedge / (c.PART * c.ADV));
        return base(c, path, prg, { milestones: [
          { day: 0, title: 'T1 lands', text:
            `Tranche 1: ${F.shares(c.perTr)} shares (five days of CBA volume) collared at ${t1.Kp.toFixed(2)}/${t1.Kc.toFixed(2)}, ` +
            `struck off today's ${c.S0.toFixed(0)}. The street starts selling its ${F.shares(t1.hedge)}-share hedge at 15% participation — ` +
            `about ${sessions} sessions of work, and T2 lands in ten days: the stacking problem from tab 4, live.` },
          { cond: (st) => st.S >= t1.Kc, once: true, pause: true, title: 'Cap breached, ladder half-built', text: (st) => {
            const on = Math.min(c.N, Math.floor(st.t / c.SPACE) + 1);
            return `Spot ${st.S.toFixed(1)} is through T1's ${t1.Kc.toFixed(2)} cap with only ${on} tranches on. On a one-shot this is ` +
              `pure pain; here T${on + 1}–T6 haven't struck yet — they will set their floors and caps up at these prices. ` +
              `Averaging up is the ladder climbing with the tape.`; } },
          { day: 50, title: 'Fully collared: the ratchet', text:
            `All ${F.shares(c.prog)} shares on. T6's floor is ${t6.Kp.toFixed(2)} — above the ${c.S0.toFixed(0)} the campaign started at — ` +
            `and the blended floor is ${prg.blendF[50].toFixed(2)} vs T1's ${t1.Kp.toFixed(2)}. Hedge sold so far: ` +
            `~${F.shares(prg.SOLD[50])} of ${F.shares(prg.hedgeTot)} shares.` },
          { day: 252, title: 'First expiry: called away', text:
            `T1 settles at ${t1.ST.toFixed(1)} against its ${t1.Kc.toFixed(2)} cap: ${(-t1.pay).toFixed(2)}/share of upside handed back ` +
            `on ${F.shares(c.perTr)} shares. Watch the resolutions march right: every later tranche's higher cap gives up less — ` +
            `T6 only ${(-t6.pay).toFixed(2)}.` },
          { day: c.DAYS, title: 'The invoice, program-sized', text:
            `Final ledger: ${F.sign(perSh)}/share (${F.big(prg.progPL)}) vs ${F.sign(naked)} (${F.big(naked * c.prog)}) unhedged — ` +
            `about ${F.big(naked * c.prog - prg.progPL)} of upside bought a floor the tape never touched. That is tab 1's ` +
            `capped-collar invoice at 30× ADV scale; the Monte Carlo below prices it across every tape at once.` },
        ] });
      } },
      { id: 'crash', label: 'Crash · mid-campaign', make(c) {
        // 'crash' gaps at 60% of its OWN length — splice a 50-day crash (gap on
        // day 30, mid-ladder) into a range tail so late tranches strike at the lows
        const A = CL.paths.scripted('crash', c.S0, 50, { seed: 6 });
        const path = A.concat(CL.paths.scripted('range', A[50], 252, { seed: 9 }).slice(1));
        const vols = CL.paths.volPath(path, c.p.vol);
        const prg = mkProgram(c, path), T = prg.trs, t1 = T[0];
        const perSh = prg.progPL / c.prog, naked = path[c.DAYS] - c.S0;
        const earlyClaims = (T[0].pay + T[1].pay + T[2].pay) * c.perTr;
        const lateF = T.slice(3).map((tr) => tr.Kp), lateC = T.slice(3).map((tr) => tr.Kc);
        return base(c, path, prg, { volPath: vols, milestones: [
          { day: 0, title: 'Struck at the top', text:
            `T1: ${F.shares(c.perTr)} shares at ${t1.Kp.toFixed(2)}/${t1.Kc.toFixed(2)}. The tape will pay ${T[1].S.toFixed(0)}–${T[2].S.toFixed(0)} ` +
            `for the next two tranches — floors ${T[1].Kp.toFixed(2)} and ${T[2].Kp.toFixed(2)}, the highest protection this campaign ` +
            `will ever own. You don't know that yet; that's the point of averaging.` },
          { day: 30, pause: true, title: `Gap day: −${Math.abs((path[30] / path[29] - 1) * 100).toFixed(1)}% with half the program on`, text:
            `${path[29].toFixed(1)} to ${path[30].toFixed(1)} overnight, vol to ${(vols[30] * 100).toFixed(0)}%. T1–T3's floors ` +
            `(${t1.Kp.toFixed(0)}–${T[2].Kp.toFixed(0)}) are suddenly in or near the money — and tab 3's flow works for you: the street ` +
            `is long gamma at three floor strikes and buys this dip. T4 strikes into the wreckage today.` },
          { day: 50, title: 'Re-loading at the lows', text:
            `T4–T6 struck at ${T[3].S.toFixed(0)}/${T[4].S.toFixed(0)}/${T[5].S.toFixed(0)}: floors down at ${Math.min.apply(null, lateF).toFixed(0)}–${Math.max.apply(null, lateF).toFixed(0)}, ` +
            `caps only ${Math.min.apply(null, lateC).toFixed(0)}–${Math.max.apply(null, lateC).toFixed(0)} — cheap protection with recovery room. The blended floor slides ` +
            `${prg.blendF[29].toFixed(2)}→${prg.blendF[50].toFixed(2)} as they land. Averaging means you never bought the whole floor at the top — or at the bottom.` },
          { day: 252, pause: true, title: 'The early floors pay', text:
            `T1 settles at ${t1.ST.toFixed(1)}: the ${t1.Kp.toFixed(2)} floor pays +${t1.pay.toFixed(2)}/share on ${F.shares(c.perTr)} shares. ` +
            `T2 and T3 — struck at the highs — follow at +${T[1].pay.toFixed(2)} and +${T[2].pay.toFixed(2)}: roughly ${F.big(earlyClaims)} ` +
            `of claims from protection bought before the fire.` },
          { day: c.DAYS, title: 'Campaign ledger', text:
            `Program ${F.sign(perSh)}/share (${F.big(prg.progPL)}) vs ${F.sign(naked)} (${F.big(naked * c.prog)}) naked: the high-struck ` +
            `floors clawed back ~${F.big(prg.progPL - naked * c.prog)} while the low-struck tranches rode the recovery inside their bands. ` +
            `One structure, six strike dates, both halves of the averaging argument in one tape.` },
        ] });
      } },
      { id: 'basecase', label: 'Base case · the tape you know', make(c) {
        const path = CL.paths.scripted('base', c.S0, c.DAYS, { seed: 11 });   // = the walkthrough charts' default path
        const prg = mkProgram(c, path), T = prg.trs, t1 = T[0];
        const perSh = prg.progPL / c.prog, oneSh = t1.settle / c.perTr, naked = path[c.DAYS] - c.S0;
        const dipS = T.slice(1).map((tr) => tr.S);
        return base(c, path, prg, { milestones: [
          { day: 0, title: 'The tape you already know', text:
            `Seed-11: the exact path every walkthrough chart above is drawn on. Those charts are the map; the next ${c.DAYS} days ` +
            `are the territory. T1: ${F.shares(c.perTr)} shares at ${t1.Kp.toFixed(2)}/${t1.Kc.toFixed(2)}.` },
          { day: 50, title: 'Ladder set in a dip', text:
            `T2–T6 struck ${Math.min.apply(null, dipS).toFixed(0)}–${Math.max.apply(null, dipS).toFixed(0)} while the tape sagged: blended band ` +
            `${prg.blendF[50].toFixed(2)}/${prg.blendC[50].toFixed(2)} vs the ${t1.Kp.toFixed(2)}/${t1.Kc.toFixed(2)} a one-shot locked on day 0. ` +
            `Strikes go where the tape goes — remember this band for the final frame.` },
          { day: 64, title: 'Brush with the floor', text:
            `Low of ${path[64].toFixed(1)} — within a couple of dollars of T1's floor, never through it. Six tranches in-band means ` +
            `the street's book is the quiet regime: gamma dribble, a few percent of ADV a day, exactly the mid-section of the flow chart above.` },
          { day: 252, pause: true, title: 'The expiry staircase', text:
            `From here one tranche rolls off every two weeks: ${F.shares(t1.hedge)} shares of hedge unwound per expiry, six times — ` +
            `against a one-shot's single ${F.shares(prg.hedgeTot)}-share cliff. Those are the terracotta spikes at the right edge ` +
            `of the flow chart, now on the clock. Real programs roll instead.` },
          { day: c.DAYS, title: 'Was averaging worth it?', text:
            `The tape rallied late and everything finished capped: program ${F.sign(perSh)}/share vs ${F.sign(oneSh)} one-shot vs ` +
            `${F.sign(naked)} naked. The dip-struck caps cost ~${(oneSh - perSh).toFixed(2)}/share against the one-shot — the Monte Carlo's ` +
            `'median trails' result, for the Monte Carlo's exact reason — and in exchange impact fell √6 ≈ 2.4× and no single strike ` +
            `ever held ${F.shares(c.prog)} shares of gamma. That trade-off is the whole course.` },
        ] });
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
    showScenario(scenarioDefs.some((d) => d.id === tab._theatreSel) ? tab._theatreSel : 'grind');
    // ---- end Scenario theatre --------------------------------------------

    const mcCard = card('Monte Carlo — was averaging in worth it?',
      '400 GBM paths. Program P&L at expiry vs the same size done one-shot on day 0, vs staying naked.');
    root.append(mcCard);
    const mcTable = el('div', 'card');
    root.append(mcTable);

    root.append(callout('trader', 'The course in one paragraph',
      'A collar swaps upside for a floor; Black-Scholes prices it but skew shapes it. Its greeks live at the strikes — ' +
      'long gamma at the floor, short at the cap — and the bank\'s mirror-image hedging is a real flow in the stock. ' +
      'At 30× ADV that flow would be the market, so you cut the trade into tranches: impact falls like 1/√N, strikes ladder ' +
      'into a blend, and no single price level ever holds the whole program\'s gamma. Spread wings tune the last trade-offs. ' +
      'What you give up is certainty of level; what you buy is the ability to do the trade at all.'));

    function draw() {
      const p = CL.state;
      const S0 = p.spot;
      const T0 = tenorM / 12;
      const tenorD = Math.round(252 * T0);
      const spacing = spacingW * 5;
      const progShares = advMult * p.adv;
      const shTr = progShares / nTranches;
      const starts = [];
      for (let i = 0; i < nTranches; i++) starts.push(i * spacing);
      const horizon = starts[nTranches - 1] + tenorD;

      const mkLegs = (S) => {
        const Kp = S * putPct;
        if (wings === 'plain') {
          const Kc = CL.solveZeroCostCall(S, Kp, T0, p);
          return [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: Kc, qty: -1 }];
        }
        if (wings === 'ps') {
          const KpL = S * 0.78;
          const Kc = CL.solveZeroCostCallPS(S, Kp, KpL, T0, p);
          return [{ type: 'put', K: Kp, qty: 1 }, { type: 'put', K: KpL, qty: -1 }, { type: 'call', K: Kc, qty: -1 }];
        }
        // call-spread collar: short near call funds the put AND a long far call
        const KcH = S * 1.22;
        const pv = (type, K) => {
          const sig = CL.volForStrike(K, S, T0, p.vol, p.rate, p.divy, p.skewOn, p.skew);
          return CL.bs(type, S, K, T0, sig, p.rate, p.divy).price;
        };
        const target = pv('put', Kp) + pv('call', KcH);
        let lo = S * 0.85, hi = KcH, Kc = null;
        if (pv('call', lo) - target > 0) {
          for (let i = 0; i < 80; i++) {
            const mid = 0.5 * (lo + hi);
            if (pv('call', mid) - target > 0) lo = mid; else hi = mid;
          }
          Kc = 0.5 * (lo + hi);
        }
        if (Kc == null) {   // far call unfundable — fall back to plain
          const KcP = CL.solveZeroCostCall(S, Kp, T0, p);
          return [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: KcP, qty: -1 }];
        }
        return [{ type: 'put', K: Kp, qty: 1 }, { type: 'call', K: Kc, qty: -1 }, { type: 'call', K: KcH, qty: 1 }];
      };
      const payoff = (legs, ST) => {
        let v = 0;
        for (const leg of legs) v += leg.qty * (leg.type === 'put' ? Math.max(leg.K - ST, 0) : Math.max(ST - leg.K, 0));
        return v;
      };

      // ---------- walkthrough on scenario path ----------
      const path = CL.paths.scripted(scen, S0, horizon, { seed: 11, target: S0 * 1.08 });
      const tranches = starts.map((t) => ({ t0: t, S: path[t], legs: mkLegs(path[t]), exp: t + tenorD }));

      const capOf = (tr) => tr.legs.find((l) => l.type === 'call').K;
      const floorOf = (tr) => tr.legs[0].K;
      const blendFloor = tranches.reduce((a, tr) => a + floorOf(tr), 0) / nTranches;
      const blendCap = tranches.reduce((a, tr) => a + capOf(tr), 0) / nTranches;

      // daily aggregate client delta + bank hedge
      const days = [], cliDelta = [], hedgeTot = [];
      const step = Math.max(1, Math.round(horizon / 300));
      for (let t = 0; t <= horizon; t += step) {
        let d = 0;
        for (const tr of tranches) {
          if (t < tr.t0 || t >= tr.exp) continue;
          const T = Math.max(0.002, (tr.exp - t) / 252);
          d += CL.structGreeks(tr.legs, 0, path[t], T, p).delta * shTr;
        }
        days.push(t);
        cliDelta.push(d);           // client option delta (negative)
        hedgeTot.push(d);           // bank hedge = client option delta (bank shorts −d... equal magnitude)
      }
      // daily flows from hedge changes (bank trades −Δhedge in stock)
      const flows = [], flowLabels = [];
      for (let i = 1; i < days.length; i++) {
        flows.push(-(hedgeTot[i] - hedgeTot[i - 1]));
        flowLabels.push('d' + days[i]);
      }
      let worstFlow = 0, worstFlowDay = 0;
      flows.forEach((fv, i) => { if (Math.abs(fv) > worstFlow) { worstFlow = Math.abs(fv); worstFlowDay = days[i + 1]; } });
      const worstIsExpiry = worstFlowDay >= starts[0] + tenorD - 1;   // first tranche expiry onward

      const oneShotLegs = mkLegs(S0);
      const oneBankDelta = -CL.structGreeks(oneShotLegs, 0, S0, T0, p).delta * progShares;
      const dailyVol = p.vol / Math.sqrt(252);
      const impact1 = dailyVol * Math.sqrt(Math.abs(oneBankDelta) / p.adv) * Math.abs(oneBankDelta) * S0;
      const impactN = impact1 / Math.sqrt(nTranches);

      tileHost.innerHTML = '';
      tileHost.append(tiles([
        { k: 'Program', v: F.shares(progShares) + ' sh', d: F.big(progShares * S0) + ' · ' + nTranches + ' tranches / ' + spacingW + 'w' },
        { k: 'Blended floor', v: F.money(blendFloor), d: (blendFloor / S0 * 100).toFixed(1) + '% of day-0 spot' },
        { k: 'Blended cap', v: F.money(blendCap), d: (blendCap / S0 * 100).toFixed(1) + '% of day-0 spot' },
        { k: 'Worst daily hedge flow', v: F.shares(worstFlow) + ' sh', cls: worstFlow > p.adv * 0.25 ? 'neg' : '', d: (worstFlow / p.adv * 100).toFixed(0) + '% of ADV · day ' + worstFlowDay + (worstIsExpiry ? ' — the expiry cliff' : '') },
        { k: 'Est. impact saved', v: F.big(impact1 - impactN), cls: 'pos', d: 'vs one-shot (√N law): ' + F.big(impactN) + ' vs ' + F.big(impact1) },
      ]));

      // ladder chart
      ladderCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const lx = path.map((_, i) => i).filter((i) => i % step === 0);
      CL.charts.lineChart(ladderCard, {
        height: 280,
        series: [
          { name: 'CBA path', color: 'var(--s1)', x: lx, y: lx.map((i) => path[i]), width: 2 },
          { name: 'floors', color: 'var(--s2)', x: tranches.map((tr) => tr.t0), y: tranches.map(floorOf), width: 0.001 },
          { name: 'caps', color: 'var(--s3)', x: tranches.map((tr) => tr.t0), y: tranches.map(capOf), width: 0.001 },
        ],
        xLabel: 'day', yLabel: 'A$',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
        refX: tranches.map((tr, i) => ({ v: tr.t0, label: 'T' + (i + 1), color: 'var(--muted)', dash: '2 4' })),
        refY: [
          { v: blendFloor, label: 'blended floor', color: 'var(--s2)', dash: '2 2' },
          { v: blendCap, label: 'blended cap', color: 'var(--s3)', dash: '2 2' },
        ],
        hover: false, legend: false,
      });
      ladderCard.append(el('p', 'caption',
        'Tranche strikes: ' + tranches.map((tr, i) => 'T' + (i + 1) + ' ' + floorOf(tr).toFixed(0) + '/' + capOf(tr).toFixed(0)).join(' · ')));

      // aggregate delta chart
      greekCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(greekCard, {
        height: 260,
        series: [{ name: 'client option delta (shares)', color: 'var(--s1)', x: days, y: cliDelta, width: 2.2, area: true }],
        xLabel: 'day', yLabel: 'shares',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
        refX: [{ v: starts[nTranches - 1] + tenorD, label: '', color: 'var(--muted)' }],
        legend: false,
      });
      greekCard.append(el('p', 'caption',
        'Steps down as tranches land (each adds negative option delta = the bank\'s short hedge), steps back up as they expire. ' +
        'The staircase at the right edge is the expiry cliff — programs usually ROLL tranches instead of letting them all mature.'));

      // flows chart
      flowCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const maxBars = 110;
      const stride = Math.max(1, Math.ceil(flows.length / maxBars));
      const fl = [], fdl = [];
      for (let i = 0; i < flows.length; i += stride) {
        let s = 0;
        for (let j = i; j < Math.min(i + stride, flows.length); j++) s += flows[j];
        fl.push(s); fdl.push(flowLabels[i]);
      }
      CL.charts.barChart(flowCard, {
        labels: fdl, values: fl, height: 260,
        color: (v) => (v >= 0 ? 'var(--div-pos)' : 'var(--div-neg)'),
        seriesName: 'street flow (shares)', yFmt: (v) => F.shares(v), xLabel: 'day',
        refY: [{ v: p.adv * partRate, label: (partRate * 100).toFixed(0) + '% ADV', color: 'var(--s4)' }, { v: -p.adv * partRate, color: 'var(--s4)' }],
      });
      flowCard.append(el('p', 'caption',
        'Spikes at tranche dates are inception hedges — in practice worked over days at ~' + (partRate * 100).toFixed(0) + '% participation (amber line), not crossed at once.'));

      // ---------- Monte Carlo ----------
      mcCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const NP = 400, mu = 0.07;
      const progPL = [], onePL = [], nakedPL = [];
      for (let mc = 0; mc < NP; mc++) {
        const mpath = CL.paths.gbm(S0, horizon, mu, p.vol, 1000 + mc + seedOff * 100000);
        // program: tranches struck along the path
        let pl = 0;
        for (const t0 of starts) {
          const St = mpath[t0], ST = mpath[t0 + tenorD];
          const legs = mkLegs(St);
          pl += (ST - S0 + payoff(legs, ST)) * shTr;
        }
        progPL.push(pl - (deductImpact ? impactN : 0));
        // one-shot: all struck day 0, expiring at tenorD
        const ST1 = mpath[tenorD];
        onePL.push((ST1 - S0 + payoff(oneShotLegs, ST1)) * progShares - (deductImpact ? impact1 : 0));
        nakedPL.push((mpath[horizon] - S0) * progShares);
      }
      const q = (arr, f) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))]; };
      CL.charts.histogram(mcCard, {
        values: progPL.map((v) => v / 1e9), bins: 36, height: 250,
        color: 'var(--s1)', xLabel: 'program P&L (A$B)',
        xFmt: (v) => v.toFixed(1),
        vlines: [
          { v: q(progPL, 0.5) / 1e9, label: 'median', color: 'var(--s1)' },
          { v: q(progPL, 0.05) / 1e9, label: 'P5', color: 'var(--critical)' },
        ],
      });

      const row = (name, arr, hl) =>
        `<tr${hl ? ' class="hl"' : ''}><td>${name}</td><td>${F.big(q(arr, 0.01))}</td><td>${F.big(q(arr, 0.05))}</td><td>${F.big(q(arr, 0.5))}</td><td>${F.big(q(arr, 0.95))}</td><td>${F.big(q(arr, 0.95) - q(arr, 0.05))}</td></tr>`;
      mcTable.innerHTML =
        '<p class="chart-title">Outcome distribution, ' + NP + ' paths (' + advMult + '× ADV, A$' + (progShares * S0 / 1e9).toFixed(1) + 'B)' +
        (deductImpact ? ' — net of estimated impact' : '') + (seedOff ? ' · seed #' + (seedOff + 1) : '') + '</p>' +
        '<table class="data"><tr><th>Strategy</th><th>P1 (tail)</th><th>P5 (bad)</th><th>Median</th><th>P95 (good)</th><th>P95−P5 spread</th></tr>' +
        row('Naked stock', nakedPL) +
        row('One-shot collar (day 0)', onePL) +
        row('Tranche program (' + nTranches + '× averaged)', progPL, true) +
        '</table>' +
        '<p class="caption">' +
        (deductImpact
          ? 'Impact deducted per the √N model: ' + F.big(impact1) + ' from one-shot, ' + F.big(impactN) + ' from the program (naked pays none — you already own the stock). '
          : 'Impact costs NOT deducted (tick the box in the controls) — they would take ~' + F.big(impact1) + ' from one-shot and ~' + F.big(impactN) + ' from the program. ') +
        'Why the program\'s median trails one-shot: a collar\'s payoff is concave (capped), and averaging entries across a drifting tape means some tranches spend their cap budget on levels the one-shot already locked in — the price of the fatter P95 and the thinner execution footprint. ' +
        'The P1 column is where wings show up: with a put-spread trapdoor, the program\'s deep tail opens well below the plain collar\'s floor.</p>';
    }

    draw();
    this._redraw = draw;
  },
};
