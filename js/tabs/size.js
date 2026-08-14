/* Tab 4 — Size & Impact: what changes at 30x ADV. Execution arithmetic,
   square-root impact, and gamma concentration vs tranche laddering.          */
window.CL = window.CL || {};
CL.tabs = CL.tabs || {};

CL.tabs.size = {
  id: 'size',
  title: 'Size & Impact',
  render(root) {
    const { el, slider, select, tiles, callout, card } = CL.ui;
    const F = CL.fmt;
    root.innerHTML = '';

    root.append(el('h2', null, '4 · What breaks at 30x ADV'));
    root.append(el('p', 'lede',
      'Everything so far scales linearly — until the hedge has to trade through the order book. ' +
      'CBA turns over ~2.5M shares (~A$425M) a day. A 30x ADV collar is ~75M shares, roughly A$13B of stock. ' +
      'The bank\'s <i>inception delta hedge alone</i> is tens of millions of shares of selling. ' +
      'This tab is the arithmetic of why such trades are cut into tranches and averaged in.'));

    let advMult = 30, partRate = 0.15, nTranches = 6, spacingW = 2, putPct = 0.90, tenorM = 12;

    const controls = el('div', 'controls');
    controls.append(slider({
      label: 'Program size', min: 5, max: 50, step: 1, value: advMult,
      fmt: (v) => v + '× ADV', onInput: (v) => { advMult = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Participation rate', min: 0.05, max: 0.30, step: 0.01, value: partRate,
      fmt: (v) => (v * 100).toFixed(0) + '% of volume', onInput: (v) => { partRate = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Tranches', min: 1, max: 12, step: 1, value: nTranches,
      fmt: (v) => v + (v === 1 ? ' (one-shot)' : ''), onInput: (v) => { nTranches = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Tranche spacing', min: 1, max: 4, step: 1, value: spacingW,
      fmt: (v) => v + 'w', onInput: (v) => { spacingW = v; draw(); },
    }).root);
    root.append(controls);

    root.append(callout('', 'How to read this tab — five steps, in order',
      '<b>Step 1 · the clock:</b> how many days of selling is the hedge? ' +
      '<b>Step 2 · the bill:</b> what does forcing it through the order book cost? ' +
      '<b>Step 3 · the map:</b> where does the program\'s gamma pile up? ' +
      '<b>Step 4 · the chase:</b> what naked delta is the trader carrying while the hedge is still being worked? ' +
      '<b>Step 5 · the theatre:</b> watch the whole thing play out on the tape. ' +
      'Steps 1–3 recompute from all four sliders above; Step 4\'s chase is deliberately the ONE-SHOT order (size and participation only) — the tranche cure for it is chip 2 of the theatre.'));

    const tileHost = el('div');
    root.append(tileHost);
    const chainHost = el('div');
    root.append(chainHost);

    root.append(callout('warn', 'The execution problem',
      'A bank can realistically work ~10–20% of volume before their own selling <i>is</i> the tape. ' +
      'Above that, impact turns from cost into signal: the market smells a large seller, front-runs the flow, ' +
      'and the client\'s strikes get set against a spot the trade itself pushed down. ' +
      'Slower is cheaper — but slower means longer unhedged, and the client wears the market risk in the meantime.'));

    root.append(el('h3', null, 'Step 1 — the clock'));
    root.append(el('p', null,
      'The tile chain compresses to one question: <b>can each tranche\'s selling finish before the next tranche lands?</b> ' +
      'Terracotta bars mean no — flows stack, and the desk ends up trading faster than its participation target without choosing to.'));
    const execCard = card('Executing the inception hedge',
      'Days of selling required per tranche at the chosen participation rate.');
    root.append(execCard);

    root.append(el('h3', null, 'Step 2 — the bill'));
    root.append(el('p', null,
      'Forcing Q shares through a book that refills at ADV pace costs roughly σ<sub>daily</sub>·√(Q/ADV) per share — ' +
      'the square-root law. Size is given, vol is given: the only lever the desk controls is <b>how many separate, ' +
      'well-spaced orders</b> the program is cut into.'));
    const impactCard = card('Impact cost: one-shot vs tranches',
      'Square-root market-impact model. Well-separated tranches let liquidity refill: total cost falls like 1/√N.');
    root.append(impactCard);

    root.append(el('h3', null, 'Step 3 — the map of risk'));
    root.append(el('p', null,
      'Impact is paid once; gamma is carried for a year. This chart is the most important picture at size: ' +
      'how many shares the street must trade for a 1% CBA move, at every price level. One strike-set builds a cliff ' +
      'the whole market can see; a ladder of tranches builds a hill it can absorb.'));
    const gammaCard = card('Aggregate bank gamma: one strike vs a ladder',
      'Shares the street must trade per 1% CBA move, across spot. One tranche = a cliff at a single strike pair. Averaging in spreads it.');
    root.append(gammaCard);

    // ---- Step 4: the trader's delta while the hedge is worked ----
    root.append(el('h3', null, 'Step 4 — the chase: the trader\'s delta while the hedge is worked'));
    root.append(el('p', null,
      'Steps 1–3 assume the market politely stands still while the desk sells. It does not. From the second the strikes ' +
      'print, the book\'s delta is <b>live</b> — and it moves with spot every day — but the trader can only trade the ' +
      'participation cap. Below: the hedge the book <b>needs</b> (terracotta, recomputed daily off the path) vs the hedge the ' +
      'trader actually <b>has</b> (navy, built at the cap). The vertical gap is naked delta — pure market risk the desk never wanted, ' +
      'and the reason "slower is cheaper" has a limit. This is the ONE-SHOT chase, the worst case tranching exists to fix: cut it into N tranches and each chase is 1/N the size.'));
    let hedgeScen = 'crash';
    const chaseCtl = el('div', 'controls');
    chaseCtl.append(select({
      label: 'Path while hedging', options: CL.pathScenarios, value: hedgeScen,
      onChange: (v) => { hedgeScen = v; draw(); },
    }).root);
    root.append(chaseCtl);
    const chaseTiles = el('div');
    root.append(chaseTiles);
    const g2c = el('div', 'grid2');
    const chaseCard = card('Needed vs held', 'The chase: the target moves with spot; the trader closes the gap at the participation cap.');
    const slipCard = card('What the gap cost', 'Cumulative P&L from carrying naked delta while working the hedge. Sign is luck; size is the lesson.');
    g2c.append(chaseCard, slipCard);
    root.append(g2c);
    const chaseNote = el('div');
    root.append(chaseNote);

    // ---- Scenario theatre ------------------------------------------------
    root.append(el('h3', null, 'Scenario theatre'));
    root.append(el('p', null,
      'Step 5 — watch it happen. The charts above are the arithmetic; this is the clock. Watch the same 30× program ' +
      'executed three ways — one heroic order, six clean tranches, and six tranches that stack.'));
    const picker = el('div', 'scenario-picker');
    const theatreHost = el('div');
    root.append(picker, theatreHost);

    const tab = this;
    // shared params, recomputed at every mount so numbers follow the live surface.
    // Theatre constants (0.90 floor, T0=1y, 15% participation, 6 tranches, 10d
    // spacing, 30×/12× sizes) are deliberately NOT read from the sliders above.
    const shared = () => {
      const p = CL.state, S0 = p.spot, ADV = p.adv, T0 = 1;
      const Kp = S0 * 0.90, Kc = CL.solveZeroCostCall(S0, Kp, T0, p);
      const legs = [{ type: 'put', K: Kp, qty: -1 }, { type: 'call', K: Kc, qty: 1 }];   // bank signs
      const dDelta = CL.structGreeks(legs, 0, S0, T0, p).delta;
      const cap = 0.15 * ADV;                                   // shares/day at 15%
      return { p, S0, ADV, T0, Kp, Kc, legs, dDelta, cap };
    };
    const bpAt = (c, q) => 10000 * (c.p.vol / Math.sqrt(252)) * Math.sqrt(q / c.ADV);
    const drawTape = (cardEl, path, days, st, refs, yLo, yHi) => {
      cardEl.querySelectorAll('.chart-box').forEach((n) => n.remove());
      const px = [], py = [];
      for (let i = 0; i <= st.t; i++) { px.push(i); py.push(path[i]); }
      CL.charts.lineChart(cardEl, {
        height: 240,
        series: [{ name: 'CBA', color: 'var(--s1)', x: px, y: py, width: 2.2 }],
        xLabel: 'day', yLabel: 'A$',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
        xMin: 0, xMax: days, yMin: yLo, yMax: yHi,
        refY: refs, legend: false, hover: false,
        marker: { x: st.t, y: st.S, color: 'var(--s4)' },
      });
    };
    // strike refs for whatever tranches have landed by day t (floors carry the
    // T-number, caps just the level, to limit clutter)
    const trancheRefs = (trs, t) => {
      const refs = [];
      trs.forEach((tr, i) => {
        if (tr.landDay > t) return;
        refs.push({ v: tr.Kp, label: 'T' + (i + 1) + ' ' + tr.Kp.toFixed(0), color: 'var(--s2)', dash: '3 3' });
        refs.push({ v: tr.Kc, label: tr.Kc.toFixed(0), color: 'var(--s3)', dash: '3 3' });
      });
      return refs;
    };
    // one grid2 custom-visual skeleton shared by all three scenarios
    const mkTheatre = (days, tapeTitle, tapeSub, tapeFn, rightTitle, rightSub, rightFn) => ({
      build(host) {
        host.innerHTML = '';
        const grid = el('div', 'grid2');
        const tapeCard = card(tapeTitle, tapeSub);
        const rightCard = card(rightTitle, rightSub);
        grid.append(tapeCard, rightCard);
        host.append(grid);
        return { tapeCard, rightCard, n: 0 };
      },
      frame(ctx, st) {
        if (ctx.n++ % 3 !== 0 && st.t !== 0 && st.t !== days) return;
        tapeFn(ctx.tapeCard, st);
        rightFn(ctx.rightCard, st);
      },
    });

    const scenarioDefs = [
      { id: 'oneshot', label: 'One-shot · one heroic order', make(c) {
        const prog = 30 * c.ADV, hedge = c.dDelta * prog;
        const DAYS1 = Math.ceil(hedge / c.cap);
        const path = CL.paths.scripted('grind', c.S0, DAYS1, { seed: 5 });
        const DONE = [], REM = [], RISK = [];
        let risk = 0;
        for (let t = 0; t <= DAYS1; t++) {
          const d = Math.min(t * c.cap, hedge);
          DONE.push(d); REM.push(hedge - d);
          risk += (hedge - d) / hedge; RISK.push(risk);
        }
        const yLo = Math.min(Math.min.apply(null, path), c.Kp) * 0.98;
        const yHi = Math.max(Math.max.apply(null, path), c.Kc) * 1.02;
        const half = Math.round(DAYS1 / 2), late = Math.round(DAYS1 * 0.76);
        const refs = [
          { v: c.Kp, label: 'put ' + c.Kp.toFixed(0), color: 'var(--s2)', dash: '3 3' },
          { v: c.Kc, label: 'call ' + c.Kc.toFixed(0), color: 'var(--s3)', dash: '3 3' },
          { v: c.S0, label: 'strike-set ' + c.S0.toFixed(0), color: 'var(--muted)', dash: '2 3' },
        ];
        return { days: DAYS1, spotPath: path, legs: c.legs, stockQty: 0,
          custom: mkTheatre(DAYS1,
            'The tape', 'Spot vs the strikes — all set on day 0.',
            (cardEl, st) => drawTape(cardEl, path, DAYS1, st, refs, yLo, yHi),
            'The order, working', 'Hedge done (navy) vs remaining (terracotta).',
            (cardEl, st) => {
              cardEl.querySelectorAll('.chart-box').forEach((n) => n.remove());
              const px = [], dy = [], ry = [];
              for (let i = 0; i <= st.t; i++) { px.push(i); dy.push(DONE[i]); ry.push(REM[i]); }
              CL.charts.lineChart(cardEl, {
                height: 240,
                series: [
                  { name: 'done', color: 'var(--s1)', x: px, y: dy, width: 2.2 },
                  { name: 'remaining', color: 'var(--s2)', x: px, y: ry, width: 2.2 },
                ],
                xLabel: 'day', yLabel: 'shares',
                xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
                xMin: 0, xMax: DAYS1, yMin: 0, yMax: hedge * 1.05,
                legend: false, hover: false,
                marker: { x: st.t, y: DONE[st.t], color: 'var(--s4)' },
              });
            }),
          readouts: (st) => [
            { k: 'Shares done', v: F.shares(DONE[st.t]) + ' sh', d: (DONE[st.t] / hedge * 100).toFixed(0) + '% of hedge' },
            { k: 'Remaining', v: F.shares(REM[st.t]), d: Math.ceil(REM[st.t] / c.cap) + ' days to go' },
            { k: 'Participation', v: '15%', d: F.shares(c.cap) + ' sh/day' },
            { k: 'Risk-days accrued', v: RISK[st.t].toFixed(0), d: 'fully-unhedged-day equivalents' },
          ],
          milestones: [
            { day: 0, title: 'The whole hedge, one order', text:
              'The client crosses ' + F.shares(prog) + ' shares (30× ADV) collared at floor ' + c.Kp.toFixed(0) +
              ' / cap ' + c.Kc.toFixed(2) + ' — all struck against today\'s ' + c.S0.toFixed(0) + '. Bank Δ +' +
              c.dDelta.toFixed(2) + ' means ' + F.shares(hedge) + ' shares to sell; at 15% of a ' + F.shares(c.ADV) +
              ' ADV that is ' + F.shares(c.cap) + ' a day for ' + DAYS1 + ' days. Half a year to get flat.' },
            { cond: (st) => st.S >= c.Kc, once: true, pause: true,
              title: 'The market left; your strikes didn\'t', text: (st) =>
              'Day ~' + st.t + ': spot ' + st.S.toFixed(1) + ' is already through the ' + c.Kc.toFixed(2) +
              ' cap and you have sold only ' + F.shares(DONE[st.t]) + ' of ' + F.shares(hedge) + ' — ' +
              (DONE[st.t] / hedge * 100).toFixed(0) + '% done. The other ' + F.shares(REM[st.t]) +
              ' shares of hedge will be sold at prices ever further above the level the whole structure was priced on.' },
            { day: half, title: 'Half-time', text:
              F.shares(DONE[half]) + ' done, ' + F.shares(REM[half]) + ' to go, spot ' + path[half].toFixed(1) +
              ' — ' + ((path[half] / c.S0 - 1) * 100).toFixed(1) + '% above the strike-set level. You have accrued ~' +
              RISK[half].toFixed(0) + ' risk-days, and every fill up here is slippage against day-0 economics.' },
            { day: late, title: 'The tape knows', text:
              late + ' consecutive sessions of one-way selling. Your fingerprint is public; front-running is now ' +
              'a cost the √-law above doesn\'t even model.' },
            { day: DAYS1, title: 'Done — in name', text:
              'Day ' + DAYS1 + ', spot ' + path[DAYS1].toFixed(1) + ': flat at last. The floor at ' + c.Kp.toFixed(0) +
              ' now sits ' + ((1 - c.Kp / path[DAYS1]) * 100).toFixed(0) + '% under the market and the cap was ' +
              'breached months ago — you executed a collar for a share price that no longer exists. Risk-days: ' +
              RISK[DAYS1].toFixed(0) + ' — equivalent to two-plus months entirely unhedged. Chips 2 and 3: the alternative.' },
          ] };
      } },
      { id: 'tranches', label: 'Tranche program · six clean landings', make(c) {
        const DAYS = 65, perTr = 2 * c.ADV, hedgeTr = c.dDelta * perTr;   // 12× ADV over 6 tranches
        const hedgeTot = 6 * hedgeTr, work = hedgeTr / c.cap;             // ~8.7 days < 10-day spacing
        const path = CL.paths.scripted('grind', c.S0, DAYS, { seed: 5 }); // same tape as chip 1 (prefix)
        const trs = [];
        for (let i = 0; i < 6; i++) {
          const Si = path[10 * i], Kpi = Si * 0.90;
          trs.push({ landDay: 10 * i, Kp: Kpi, Kc: CL.solveZeroCostCall(Si, Kpi, c.T0, c.p) });
        }
        const DONE = [], PARTS = [];
        for (let t = 0; t <= DAYS; t++) {
          let d = 0, working = false;
          trs.forEach((tr) => {
            if (t < tr.landDay) return;
            d += Math.min((t - tr.landDay) * c.cap, hedgeTr);
            if ((t - tr.landDay) * c.cap < hedgeTr) working = true;
          });
          DONE.push(d); PARTS.push(working ? 15 : 0);
        }
        // per-tranche street-gamma curves on a fixed grid, summed by landed count
        const gx = [];
        for (let x = c.S0 * 0.75; x <= c.S0 * 1.35; x += c.S0 * 0.005) gx.push(x);
        const curves = trs.map((tr) => {
          const lgs = [{ type: 'put', K: tr.Kp, qty: -1 }, { type: 'call', K: tr.Kc, qty: 1 }];
          return gx.map((x) => CL.structGreeks(lgs, 0, x, 0.5, c.p).gamma * x * 0.01 * perTr);
        });
        const SUMK = [], PEAKK = [];                          // index = tranches landed − 1
        for (let k = 1; k <= 6; k++) {
          const s = gx.map((_, j) => curves.slice(0, k).reduce((a, cv) => a + cv[j], 0));
          SUMK.push(s); PEAKK.push(Math.max.apply(null, s.map(Math.abs)));
        }
        const kAt = (t) => Math.min(6, Math.floor(t / 10) + 1);
        const perShPeak = PEAKK[0] / perTr;                    // single-strike-pair peak per share
        const yLo = Math.min(Math.min.apply(null, path), trs[0].Kp) * 0.98;
        const yHi = Math.max(Math.max.apply(null, path), trs[5].Kc) * 1.02;
        return { days: DAYS, spotPath: path, legs: c.legs, stockQty: 0,
          custom: mkTheatre(DAYS,
            'The tape — strikes struck as you go', 'Each tranche\'s floor/cap set on its landing day.',
            (cardEl, st) => drawTape(cardEl, path, DAYS, st, trancheRefs(trs, st.t), yLo, yHi),
            'Street gamma, building lobe by lobe', 'Shares to hedge per 1% move, summed over landed tranches.',
            (cardEl, st) => {
              cardEl.querySelectorAll('.chart-box').forEach((n) => n.remove());
              CL.charts.lineChart(cardEl, {
                height: 240,
                series: [{ name: 'landed gamma', color: 'var(--s1)', x: gx, y: SUMK[kAt(st.t) - 1], width: 2.4 }],
                xLabel: 'spot (A$)', yLabel: 'sh per 1% move',
                xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
                xMin: gx[0], xMax: gx[gx.length - 1], yMin: -c.ADV * 1.1, yMax: c.ADV * 1.1,
                refY: [
                  { v: c.ADV, label: '1 day ADV', color: 'var(--critical)' },
                  { v: -c.ADV, label: '−1 day ADV', color: 'var(--critical)' },
                ],
                legend: false, hover: false,
              });
            }),
          readouts: (st) => [
            { k: 'Shares done', v: F.shares(DONE[st.t]) + ' / ' + F.shares(hedgeTot) },
            { k: 'Tranches landed', v: kAt(st.t) + '/6' },
            { k: 'Participation', v: PARTS[st.t] + '%' },
            { k: 'Gamma peak', v: F.shares(PEAKK[kAt(st.t) - 1]) + ' sh/1%',
              d: (PEAKK[kAt(st.t) - 1] / c.ADV * 100).toFixed(0) + '% of ADV' },
          ],
          milestones: [
            { day: 0, title: 'Tranche 1 of 6', text:
              'This is the size the schedule can carry: ' + F.shares(6 * perTr) + ' shares (12× ADV), ' +
              F.shares(perTr) + ' per tranche. Each tranche\'s hedge is ' + F.shares(hedgeTr) + ' shares — ' +
              work.toFixed(1) + ' days at 15% participation, inside a 2-week spacing with a day to spare. Floor ' +
              trs[0].Kp.toFixed(0) + ', cap ' + trs[0].Kc.toFixed(2) + ' — on one-sixth of the program only.' },
            { day: 9, title: 'Flat before the next lands', text:
              'Tranche 1\'s hedge finished inside its window and the tape never saw more than ' + F.shares(c.cap) +
              ' shares a day. One quiet day, then tranche 2 strikes at whatever Monday prints.' },
            { day: 20, pause: true, title: 'The ladder appears', text:
              'Tranche 3 sets floor ' + trs[2].Kp.toFixed(1) + ' / cap ' + trs[2].Kc.toFixed(1) + ' — ' +
              (trs[2].Kp - trs[0].Kp).toFixed(0) + ' points above tranche 1\'s. Look right: three separate gamma ' +
              'lobes at three different spots, none of them near the 1-day-ADV line. No single price in CBA is ' +
              'becoming a trigger.' },
            { cond: (st) => st.t >= 40, once: true, title: 'Diversification you can see', text:
              'Five floors from ' + Math.min.apply(null, trs.slice(0, 5).map((tr) => tr.Kp)).toFixed(1) + ' to ' +
              Math.max.apply(null, trs.slice(0, 5).map((tr) => tr.Kp)).toFixed(1) + '. A crash through any one ' +
              'strike now meets one-sixth of the gamma a one-shot program would have parked there — and tranche 2, ' +
              'struck on the dip at ' + trs[1].Kp.toFixed(1) + ', is the \'worse level\' the trader callout warned ' +
              'you\'d sometimes accept.' },
            { day: 59, title: 'Landed and worked', text:
              'All six down, hedge complete: aggregate gamma peaks at ' + F.shares(PEAKK[5]) + ' sh per 1% move — ' +
              (PEAKK[5] / c.ADV * 100).toFixed(0) + '% of ADV — versus ' + F.shares(perShPeak * 6 * perTr) +
              ' if all ' + F.shares(6 * perTr) + ' shared one strike pair, and ' + F.shares(perShPeak * 30 * c.ADV) +
              ' (' + (perShPeak * 30 * c.ADV / c.ADV * 100).toFixed(0) + '% of a full day\'s volume) for the ' +
              F.shares(30 * c.ADV) + ' one-shot. The client\'s average floor is ' +
              (trs.reduce((a, tr) => a + tr.Kp, 0) / 6).toFixed(1) + ', laddered up a rising tape.' },
            { day: DAYS, title: 'The machine, at the right size', text:
              'Every landing clean, no overlap, no fingerprint. But the client wanted 30×, not 12× — force this same ' +
              'schedule to carry 2.5× the size and it breaks. That is chip 3.' },
          ] };
      } },
      { id: 'overlap', label: 'Overlap failure · flows stack', make(c) {
        const DAYS = 75, perTr = 5 * c.ADV, hedgeTr = c.dDelta * perTr;   // full 30× over the same 6 tranches
        const hedgeTot = 6 * hedgeTr, work = hedgeTr / c.cap;             // ~21.8 days vs a 10-day budget
        const path = CL.paths.scripted('selloff', c.S0, DAYS, { seed: 3 });
        const vpath = CL.paths.volPath(path, c.p.vol);
        const trs = [];
        for (let i = 0; i < 6; i++) {
          const Si = path[10 * i], Kpi = Si * 0.90;
          trs.push({ landDay: 10 * i, Kp: Kpi, Kc: CL.solveZeroCostCall(Si, Kpi, c.T0, c.p) });
        }
        const DONE = [], KN = [], PARTS = [], FLOW = [];
        for (let t = 0; t <= DAYS; t++) {
          let d = 0, k = 0;
          trs.forEach((tr) => {
            if (t < tr.landDay) return;
            d += Math.min((t - tr.landDay) * c.cap, hedgeTr);
            if (t < tr.landDay + work) k++;
          });
          DONE.push(d); KN.push(k); PARTS.push(15 * k); FLOW.push(k * c.cap);
        }
        let doneDay = DAYS;
        for (let t = 0; t <= DAYS; t++) if (DONE[t] >= hedgeTot - 1) { doneDay = t; break; }
        const yLo = Math.min(Math.min.apply(null, path), trs[5].Kp) * 0.98;
        const yHi = Math.max(Math.max.apply(null, path), trs[0].Kc) * 1.02;
        return { days: DAYS, spotPath: path, volPath: vpath, legs: c.legs, stockQty: 0,
          custom: mkTheatre(DAYS,
            'The tape — floors marching lower', 'Each tranche struck on a price your own flow helped push down.',
            (cardEl, st) => drawTape(cardEl, path, DAYS, st, trancheRefs(trs, st.t), yLo, yHi),
            'Participation: target vs actual', 'Stacked hedges push you far beyond the 15% plan.',
            (cardEl, st) => {
              cardEl.querySelectorAll('.chart-box').forEach((n) => n.remove());
              const px = [], py = [];
              for (let i = 0; i <= st.t; i++) { px.push(i); py.push(PARTS[i]); }
              CL.charts.lineChart(cardEl, {
                height: 240,
                series: [{ name: 'participation', color: 'var(--s1)', x: px, y: py, width: 2.2 }],
                xLabel: 'day', yLabel: '% of volume',
                xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0) + '%',
                xMin: 0, xMax: DAYS, yMin: 0, yMax: 50,
                refY: [
                  { v: 15, label: 'target 15%', color: 'var(--muted)', dash: '3 3' },
                  { v: 20, label: 'you are the tape', color: 'var(--s4)' },
                ],
                legend: false, hover: false,
                marker: { x: st.t, y: PARTS[st.t], color: 'var(--s4)' },
              });
            }),
          readouts: (st) => [
            { k: 'Shares done', v: F.shares(DONE[st.t]) + ' / ' + F.shares(hedgeTot) },
            { k: 'Tranches in flight', v: '' + KN[st.t] },
            { k: 'Participation', v: PARTS[st.t] + '%', cls: PARTS[st.t] > 20 ? 'neg' : '',
              d: F.shares(FLOW[st.t]) + ' sh/day' },
            { k: 'Impact / share', v: '~' + bpAt(c, Math.max(FLOW[st.t], 0)).toFixed(0) + 'bp',
              d: '√-law at today\'s clip' },
          ],
          milestones: [
            { day: 0, title: 'Same schedule, 2.5× the size', text:
              'The full ' + F.shares(30 * c.ADV) + '-share program jammed into six tranches, two weeks apart: each ' +
              'tranche\'s hedge is ' + F.shares(hedgeTr) + ' shares — ' + Math.ceil(work) + ' working days at 15% ' +
              'participation, against a 10-day spacing budget. The terracotta bars above already told you; now ' +
              'watch it happen.' },
            { day: 10, title: 'Tranche 2 lands on tranche 1\'s back', text:
              'T1 is only ' + (DONE[10] / hedgeTr * 100).toFixed(0) + '% worked — ' + F.shares(DONE[10]) + ' of ' +
              F.shares(hedgeTr) + ' sold — when T2\'s ' + F.shares(hedgeTr) + ' arrives. Two hedges now share one ' +
              'order book: participation 30%.' },
            { day: 20, pause: true, title: 'Three deep — you are the tape', text:
              'T3 lands and three hedges run at once: ' + F.shares(3 * c.cap) + ' shares a day, 45% of everything ' +
              'CBA trades. The callout above put the ceiling at 10–20%: √-law impact per share jumps ' +
              bpAt(c, c.cap).toFixed(0) + 'bp → ' + bpAt(c, 3 * c.cap).toFixed(0) + 'bp, and past 20% impact ' +
              'stops being a cost and becomes a signal the whole market can read.' },
            { cond: (st) => st.S < c.Kp, once: true, title: 'Selling into your own hole', text: (st) =>
              'Spot through tranche 1\'s ' + c.Kp.toFixed(0) + ' floor with vol at ~' + (st.iv * 100).toFixed(0) +
              '% — and your own stacked selling is part of why. The next floors are being struck on prices you ' +
              'pushed down: T4 sets at ' + trs[3].Kp.toFixed(1) + ', T5 at ' + trs[4].Kp.toFixed(1) + '.' },
            { day: 50, title: 'The last landing', text:
              'T6\'s floor prints at ' + trs[5].Kp.toFixed(1) + ' — ' + (trs[0].Kp - trs[5].Kp).toFixed(0) +
              ' points (' + ((1 - trs[5].Kp / trs[0].Kp) * 100).toFixed(0) + '%) below T1\'s. Averaging-in was ' +
              'meant to diversify strike risk; overlap turned it into chasing the tape down at 30–45% participation.' },
            { day: doneDay, title: 'Done, at a price', text:
              'Flat on day ~' + doneDay + ' with spot ' + path[DAYS].toFixed(1) + ' and vol ' +
              (vpath[DAYS] * 100).toFixed(0) + '% by the end. The fixes are the two sliders above: widen spacing ' +
              'past the ' + Math.ceil(work) + '-day work time (≈5 weeks), shrink the tranches, or accept that 30× ' +
              'is a 26-week campaign, not a 12-week one. Scheduling that campaign is tab 6.' },
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
    showScenario(scenarioDefs.some((d) => d.id === tab._theatreSel) ? tab._theatreSel : 'oneshot');
    // ---- end Scenario theatre --------------------------------------------

    root.append(callout('trader', "Trader's view — why averaging in wins twice",
      '<b>Once on impact:</b> each tranche\'s hedge is small enough to hide inside normal volume. ' +
      '<b>Once on gamma:</b> strikes struck on different days sit at different levels, so no single price becomes ' +
      'a 75M-share trigger — hover the gamma chart at the put strike: if the one-shot line rivals daily ADV, the hedge ' +
      'flow <i>is</i> the market (the JPM collar effect); the ladder rarely gets near it at any single level. ' +
      'The cost is time: the unhedged tail of the program carries market risk for weeks, ' +
      'and averaging means some tranches will be struck at worse levels. That is not a bug — it is the diversification you are buying. ' +
      'The strike ladder itself, drawn tranche by tranche on a live path, is the first chart of tab 6.'));

    function draw() {
      const p = CL.state;
      const S0 = p.spot;
      const T0 = tenorM / 12;
      const progShares = advMult * p.adv;
      const progNotional = progShares * S0;
      const Kp0 = S0 * putPct;
      const Kc0 = CL.solveZeroCostCall(S0, Kp0, T0, p);

      // bank inception delta per collar share
      const bankLegs0 = [{ type: 'put', K: Kp0, qty: -1 }, { type: 'call', K: Kc0, qty: 1 }];
      const dDelta = CL.structGreeks(bankLegs0, 0, S0, T0, p).delta;   // ~ +0.55
      const hedgeShares = dDelta * progShares;                            // shares to short
      const advDays100 = hedgeShares / p.adv;
      const advDaysPart = hedgeShares / (p.adv * partRate);
      const perTrancheDays = advDaysPart / nTranches;

      tileHost.innerHTML = '';
      tileHost.append(tiles([
        { k: 'Program', v: F.shares(progShares) + ' sh', d: F.big(progNotional) + ' · ' + advMult + '× ADV' },
        { k: 'Inception hedge (street sells)', v: F.shares(hedgeShares) + ' sh', d: 'bank Δ ' + dDelta.toFixed(2) + ' per collar share' },
        { k: 'Hedge = days of ADV', v: advDays100.toFixed(1) + ' days', d: 'at 100% of volume (impossible)' },
        { k: 'At ' + (partRate * 100).toFixed(0) + '% participation', v: Math.ceil(advDaysPart) + ' days', d: 'one-shot — ' + (advDaysPart / 21).toFixed(1) + ' months of selling' },
        { k: 'Per tranche (' + nTranches + ')', v: Math.ceil(perTrancheDays) + ' days', d: 'fits inside ' + spacingW + 'w spacing: ' + (perTrancheDays <= spacingW * 5 ? 'yes ✓' : 'NO — overlapping flow') + ' · program spans ~' + Math.ceil((spacingW * 5 * (nTranches - 1) + perTrancheDays) / 5) + 'w' },
      ]));

      // the tile chain, spelled out in words
      chainHost.innerHTML = '';
      chainHost.append(el('p', 'small',
        'In words: ' + F.shares(progShares) + ' collar shares × ' + dDelta.toFixed(2) + ' bank delta per share = <b>' +
        F.shares(hedgeShares) + ' shares to sell</b>. Divide by ' + F.shares(p.adv) + ' ADV → ' + advDays100.toFixed(1) +
        ' days of ALL the volume. Divide by ' + (partRate * 100).toFixed(0) + '% participation → <b>' + Math.ceil(advDaysPart) +
        ' trading days of quiet selling</b>. Divide by ' + nTranches + ' tranche' + (nTranches > 1 ? 's' : '') + ' → ' +
        Math.ceil(perTrancheDays) + ' days each, against a ' + spacingW * 5 + '-day spacing window.'));

      // ---- execution bar chart: days per tranche vs spacing budget ----
      execCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const labels = [], vals = [];
      for (let i = 1; i <= nTranches; i++) { labels.push('T' + i); vals.push(perTrancheDays); }
      CL.charts.barChart(execCard, {
        labels, values: vals, height: 200,
        color: (v) => (v <= spacingW * 5 ? 'var(--s1)' : 'var(--critical)'),
        seriesName: 'selling days', yFmt: (v) => v.toFixed(1) + 'd',
        refY: [{ v: spacingW * 5, label: 'spacing budget (' + spacingW * 5 + 'd)', color: 'var(--s4)' }],
      });
      execCard.append(el('p', 'caption', perTrancheDays > spacingW * 5
        ? 'Terracotta bars: the tranche\'s hedge cannot be worked before the next tranche lands — flows stack and participation quietly rises above target.'
        : 'Every tranche\'s hedge fits inside its spacing window at this participation — the flow hides in normal volume.'));

      // ---- impact cost vs N ----
      impactCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const dailyVol = p.vol / Math.sqrt(252);
      const impactBps = (q) => 10000 * dailyVol * Math.sqrt(q / p.adv);   // per-share cost, Y=1
      const ns = [], costs = [];
      for (let n = 1; n <= 12; n++) {
        ns.push(n);
        const qT = hedgeShares / n;
        costs.push(impactBps(qT) / 10000 * qT * S0 * n / 1e6);            // total A$M
      }
      // if per-tranche flow overlaps the spacing window, the separation assumption
      // fails: the effective number of independent tranches is what actually fits
      const effN = perTrancheDays <= spacingW * 5
        ? nTranches
        : Math.max(1, nTranches * (spacingW * 5) / perTrancheDays);
      const refXs2 = [{ v: nTranches, label: 'chosen', color: 'var(--s4)' }];
      if (effN < nTranches - 0.3) refXs2.push({ v: effN, label: 'effective N≈' + effN.toFixed(1), color: 'var(--critical)' });
      CL.charts.lineChart(impactCard, {
        height: 240,
        series: [{ name: 'total impact', color: 'var(--s1)', x: ns, y: costs, width: 2.5 }],
        xLabel: 'number of tranches', yLabel: 'impact cost (A$M)',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0) + 'M',
        refX: refXs2,
        legend: false, yMin: 0,
      });
      impactCard.append(el('p', 'caption',
        'Model: cost/share = σ_daily·√(Q/ADV) (square-root law, Y=1). One-shot: ' + F.big(costs[0] * 1e6) +
        '. At ' + nTranches + ' tranches: ' + F.big(costs[nTranches - 1] * 1e6) + '.' +
        (effN < nTranches - 0.3
          ? ' But your flows overlap (see bars above): only ~' + effN.toFixed(1) + ' tranches are effectively separated, so the realistic saving is the terracotta marker, not the chosen one. Widen the spacing or raise participation.'
          : ' Tranches are far enough apart for the book to refill between them, so the full √N saving is realistic.')));

      // ---- aggregate gamma: one-shot vs ladder ----
      gammaCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      // ladder strikes off a grind path
      const spacing = spacingW * 5;
      const ladderPath = CL.paths.scripted('grind', S0, spacing * (nTranches - 1) + 1, { seed: 5 });
      const tranches = [];
      for (let i = 0; i < nTranches; i++) {
        const Si = ladderPath[i * spacing];
        const Kpi = Si * putPct;
        tranches.push({ S: Si, Kp: Kpi, Kc: CL.solveZeroCostCall(Si, Kpi, T0, p) });
      }
      const shPerTranche = progShares / nTranches;
      const gx = [], gOne = [], gLad = [];
      const Tmid = T0 * 0.5;
      for (let x = S0 * 0.7; x <= S0 * 1.45; x += S0 * 0.005) {
        gx.push(x);
        const gone = CL.structGreeks(bankLegs0, 0, x, Tmid, p).gamma;
        gOne.push(gone * x * 0.01 * progShares);
        let glad = 0;
        for (const tr of tranches) {
          const legs = [{ type: 'put', K: tr.Kp, qty: -1 }, { type: 'call', K: tr.Kc, qty: 1 }];
          glad += CL.structGreeks(legs, 0, x, Tmid, p).gamma * x * 0.01 * shPerTranche;
        }
        gLad.push(glad);
      }
      CL.charts.lineChart(gammaCard, {
        height: 240,
        series: [
          { name: 'one-shot (single strikes)', color: 'var(--s2)', x: gx, y: gOne, width: 2.2 },
          { name: 'laddered (' + nTranches + ' tranches)', color: 'var(--s1)', x: gx, y: gLad, width: 2.4 },
        ],
        xLabel: 'spot (A$)', yLabel: 'shares to hedge per 1% move',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
        refY: [{ v: p.adv, label: '1 day ADV', color: 'var(--critical)' }, { v: -p.adv, label: '−1 day ADV', color: 'var(--critical)' }],
      });
      const peakOne = Math.max(...gOne.map(Math.abs));
      const peakLad = Math.max(...gLad.map(Math.abs));
      gammaCard.append(el('p', 'caption',
        'Worst single-level hedge demand: one-shot ' + F.shares(peakOne) + ' sh per 1% move → laddered ' + F.shares(peakLad) +
        ' sh (−' + ((1 - peakLad / peakOne) * 100).toFixed(0) + '%). Strikes here are laddered up a rising tape over ' +
        (spacing * (nTranches - 1)) + ' days; wider spacing or a trendier tape disperses them further.'));

      // ---- Step 4: the chase — needed vs held delta on a live path ----
      const capSh = p.adv * partRate;
      const chaseDays = Math.min(252, Math.ceil(Math.abs(hedgeShares) / capSh) + 40);
      const cPath = CL.paths.scripted(hedgeScen, S0, chaseDays, { seed: 11, target: Kc0 });
      const cIv = CL.paths.volPath(cPath, p.vol);
      const cx = [], tgt = [], act = [], slipArr = [], residArr = [];
      let H = 0, slip = 0, prevBook = dDelta * progShares, prevH = 0;
      let peakResid = 0, flatDay = null, maxWiden = 0, maxWidenDay = 0;
      for (let t = 0; t <= chaseDays; t++) {
        const T = Math.max(0.02, T0 - t / 252);
        const pv = Object.assign({}, p, { vol: cIv[t] });
        const bookSh = CL.structGreeks(bankLegs0, 0, cPath[t], T, pv).delta * progShares;  // + = long-equivalent
        if (t > 0) slip += (prevBook + prevH) * (cPath[t] - cPath[t - 1]);   // naked delta × the day's move
        const target = -bookSh;
        H += Math.max(-capSh, Math.min(capSh, target - H));
        const resid = bookSh + H;
        if (Math.abs(resid) > peakResid) peakResid = Math.abs(resid);
        if (t > 0 && Math.abs(resid) - Math.abs(residArr[t - 1]) > maxWiden) {
          maxWiden = Math.abs(resid) - Math.abs(residArr[t - 1]); maxWidenDay = t;
        }
        if (flatDay == null && Math.abs(resid) < 0.02 * Math.abs(hedgeShares)) flatDay = t;
        prevBook = bookSh; prevH = H;
        cx.push(t); tgt.push(target); act.push(H); slipArr.push(slip); residArr.push(resid);
      }
      // honesty check on "flat": count later days where the residual re-breaches
      let rebreach = 0;
      if (flatDay != null) {
        for (let t = flatDay + 1; t <= chaseDays; t++) {
          if (Math.abs(residArr[t]) >= 0.02 * Math.abs(hedgeShares)) rebreach++;
        }
      }

      chaseTiles.innerHTML = '';
      chaseTiles.append(tiles([
        { k: 'Peak naked delta', v: F.shares(peakResid) + ' sh', d: '≈ ' + F.big(peakResid * S0 * 0.01) + ' P&L per 1% move (day 0, by construction) · biggest later widening ' + F.shares(maxWiden) + ' sh on day ' + maxWidenDay },
        { k: 'Days to first flat', v: flatDay == null ? '>' + chaseDays : '' + flatDay, d: 'residual < 2% of the order' + (rebreach > 0 ? ' — re-breached on ' + rebreach + ' later days (the target never stops moving)' : ' — and it stays flat') },
        { k: 'Slippage on this path', v: F.big(slipArr[chaseDays]), cls: slipArr[chaseDays] >= 0 ? 'pos' : 'neg', d: 'sign is luck — the size is the risk' },
        { k: 'Daily capacity', v: F.shares(capSh) + ' sh', d: (partRate * 100).toFixed(0) + '% of ' + F.shares(p.adv) + ' ADV' },
      ]));

      chaseCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(chaseCard, {
        height: 260,
        series: [
          { name: 'hedge NEEDED (moves with spot)', color: 'var(--s2)', x: cx, y: tgt, width: 2 },
          { name: 'hedge HELD (built at the cap)', color: 'var(--s1)', x: cx, y: act, width: 2.5 },
        ],
        xLabel: 'day', yLabel: 'shares (short)',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
      });
      chaseCard.append(el('p', 'caption',
        'Read the vertical gap: that many shares of CBA exposure are simply UNHEDGED that day. The navy line is a straight ramp ' +
        '— the cap is the cap — while the terracotta target breathes with every move in spot and vol. Notice the target keeps ' +
        'moving even after the lines meet: that steady wiggle is ordinary re-hedging, the gamma flows of Step 3.'));

      slipCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(slipCard, {
        height: 260,
        series: [{ name: 'cumulative naked-delta P&L', color: slipArr[chaseDays] >= 0 ? 'var(--s3)' : 'var(--s2)', x: cx, y: slipArr, width: 2.4, area: true }],
        xLabel: 'day', yLabel: 'A$',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => F.big(v),
        legend: false,
      });
      slipCard.append(el('p', 'caption',
        'Each day: naked delta × the day\'s move, accumulated. On an up-tape the bank\'s unsold long-equivalent delta happens to ' +
        'WIN — do not confuse that with skill. On a down-tape the same gap bleeds, and in a crash it haemorrhages precisely when ' +
        'the target is running AWAY (the put goes in the money, the book\'s delta grows, and the desk must sell even more into the hole). ' +
        'This chart, more than impact, is why desks pre-hedge, why they pay for speed, and why tranche strikes are set tranche by tranche.'));

      chaseNote.innerHTML = '';
      chaseNote.append(callout('trader', 'What the trader actually does about it',
        'Nobody runs the full chase naked. Desks <b>pre-hedge</b> a slice before the strikes print (and disclose it), ' +
        '<b>set strikes tranche by tranche</b> so each chase is 1/N the size (chip 2 in the theatre below), ' +
        '<b>borrow speed</b> — pay the impact bill for a faster ramp when the gap is scariest — and <b>use futures or swaps</b> ' +
        'for the first days\' delta while the stock order works. Every one of those is a trade-off between Step 2\'s bill and Step 4\'s risk: ' +
        'that tension IS the execution business.'));
    }

    draw();
    this._redraw = draw;
  },
};
