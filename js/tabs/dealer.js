/* Tab 4 — The Bank's Book: the other side of the collar, delta-hedging
   simulation, hedge flows, and hedging P&L vs realised vol.                  */
window.CL = window.CL || {};
CL.tabs = CL.tabs || {};

CL.tabs.dealer = {
  id: 'dealer',
  title: "Bank's Book",
  render(root) {
    const { el, slider, select, tiles, callout, card } = CL.ui;
    const F = CL.fmt;
    root.innerHTML = '';

    root.append(el('h2', null, '3 · The bank\'s book'));
    root.append(el('p', 'lede',
      'Every collar has another side. The bank is <b>short your put and long your call</b> — a book with ' +
      'positive delta that they immediately flatten by shorting stock. From then on they run the position ' +
      'delta-neutral, re-hedging as spot moves. Those hedging flows are real orders in real CBA volume — ' +
      'and at size, they move the stock. This tab simulates them on a 1M-share collar clip.'));

    root.append(callout('', 'Sign conventions',
      'Client: +stock, +put, −call. Bank: −put, +call, − hedge stock. The bank\'s option greeks are the exact ' +
      'mirror of the client\'s: <b>short gamma at the put strike, long gamma at the call strike</b>. ' +
      'Long gamma banks trade <i>against</i> the market (buy dips, sell rallies) → the stock pins. ' +
      'Short gamma banks trade <i>with</i> the market (sell dips, buy rallies) → moves amplify.'));

    let scen = 'base', putPct = 0.90, tenorM = 12, hedgeEvery = 1;
    const CLIP = 1e6;   // shares in this collar clip

    const controls = el('div', 'controls');
    controls.append(select({
      label: 'Scenario', options: CL.pathScenarios, value: scen,
      onChange: (v) => { scen = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Put strike', min: 0.8, max: 0.98, step: 0.005, value: putPct,
      fmt: (v) => (v * 100).toFixed(1) + '%', onInput: (v) => { putPct = v; draw(); },
    }).root);
    controls.append(slider({
      label: 'Tenor', min: 6, max: 18, step: 1, value: tenorM,
      fmt: (v) => v + 'm', onInput: (v) => { tenorM = v; draw(); },
    }).root);
    controls.append(select({
      label: 'Re-hedge', options: [
        { id: '1', label: 'Daily' }, { id: '5', label: 'Weekly' }, { id: '21', label: 'Monthly' },
      ], value: '1', onChange: (v) => { hedgeEvery = parseInt(v, 10); draw(); },
    }).root);
    let streetM = 40;
    controls.append(slider({
      label: 'Street inventory (pinning sim)', min: 5, max: 75, step: 5, value: streetM,
      fmt: (v) => v + 'M sh collared', onInput: (v) => { streetM = v; draw(); },
    }).root);
    root.append(controls);

    const tileHost = el('div');
    root.append(tileHost);

    const gammaCard = card('Bank net gamma across spot',
      'Where the bank\'s hedging stabilises the stock (long gamma, above zero) vs destabilises it (short gamma, below).');
    root.append(gammaCard);

    const pinCard = card('Does hedging move the stock? Same shocks, with and without bank flow',
      'The same daily shocks re-run through a market where the street\'s hedging is part of the tape: long-gamma zones damp the moves (pinning), short-gamma zones amplify them.');
    root.append(pinCard);

    const g2 = el('div', 'grid2');
    const hedgeCard = card('Bank\'s short-stock hedge through the trade',
      'Shares short to stay delta-neutral against a 1M-share collar. The day-0 jump is the inception hedge.');
    const flowCard = card('Daily hedging flow',
      'Shares bought (green) / sold (terracotta) each re-hedge. Compare to CBA\'s ~2.5M ADV.');
    g2.append(hedgeCard, flowCard);
    root.append(g2);

    const volCard = card('The vol the desk marks against',
      'ATM implied vol along this path — derived from spot (sell-offs spike it, rallies bleed it). The short put hurts twice in a crash: spot AND vol.');
    const plCard = card('Bank P&L decomposition',
      'Options book + hedge P&L. A delta-neutral bank\'s net P&L ≈ gamma/theta rent: they profit where they are long gamma and realised vol beats implied — and vice versa.');
    const g2b = el('div', 'grid2');
    g2b.append(plCard, volCard);
    root.append(g2b);

    const noteHost = el('div');
    root.append(noteHost);

    const restrikeCard = card('The restrike menu — quoting the client mid-trade',
      'A collar is not set-and-forget: the client will call. These are the desk\'s quotes at any day of THIS path, marked off that day\'s spot and vol — and the CBA the desk must cross the moment the client trades. Restrikes are flow events.');
    root.append(restrikeCard);

    // ---- Scenario theatre ------------------------------------------------
    root.append(el('h3', null, 'Scenario theatre'));
    root.append(el('p', null,
      'The charts above are the map; this is the tape. Watch the bank work the book day by day — ' +
      'the inception sale, the maintenance re-hedges, and the two gamma regimes doing opposite things to CBA.'));
    const picker = el('div', 'scenario-picker');
    const theatreHost = el('div');
    root.append(picker, theatreHost);

    const tab = this;
    const pctS = (x) => (x * 100).toFixed(1);
    // shared params, recomputed at every mount so numbers follow the live surface
    const shared = () => {
      const p = CL.state, S0 = p.spot, DAYS = 126, T0 = DAYS / 252;
      const Kp = S0 * 0.90, Kc = CL.solveZeroCostCall(S0, Kp, T0, p);
      const legs = [{ type: 'put', K: Kp, qty: -1 }, { type: 'call', K: Kc, qty: 1 }];  // bank signs
      return { p, S0, DAYS, T0, Kp, Kc, legs, ADV: p.adv };
    };
    // hedge/flow/P&L arrays precomputed ONCE per mount; everything indexes by
    // st.t so backward scrubs are safe. rampShares = per-day participation cap.
    const mkBook = (c, path, vpath, rampShares) => {
      const val = (t) => CL.structGreeks(c.legs, 0, path[t],
        Math.max(0.002, (c.DAYS - t) / 252), Object.assign({}, c.p, { vol: vpath[t] }));
      const H = [], FLOW = [], CUM = [], opt0 = val(0).price;
      let h = 0, hpl = 0;
      for (let t = 0; t <= c.DAYS; t++) {
        if (t > 0) hpl += h * (path[t] - path[t - 1]);   // h is already in shares
        const target = -val(t).delta * CLIP;
        const step = Math.max(-rampShares, Math.min(rampShares, target - h));
        FLOW.push(step); h += step; H.push(h);
        CUM.push((val(t).price - opt0) * CLIP + hpl);
      }
      return { H, FLOW, CUM };
    };
    const flatVol = (c, path) => path.map(() => c.p.vol);
    const mkReadouts = (c, B) => (st) => [
      { k: 'Bank delta / sh', v: F.sign(st.greeks.delta) },
      { k: 'Hedge', v: F.shares(B.H[st.t]) + ' sh' },
      { k: "Today's flow", v: F.shares(B.FLOW[st.t]) + ' sh',
        d: (Math.abs(B.FLOW[st.t]) / c.ADV * 100).toFixed(1) + '% of ADV',
        cls: B.FLOW[st.t] >= 0 ? 'pos' : 'neg' },
      { k: 'Bank P&L (clip)', v: F.big(B.CUM[st.t]), cls: B.CUM[st.t] >= 0 ? 'pos' : 'neg',
        d: 'options + hedge, gross of frictions' },
    ];
    // one custom visual for all four scenarios: progressive tape + hedge building
    const mkCustom = (c, path, B, ghost) => {
      const allY = ghost ? path.concat(ghost) : path;
      const yLo = Math.min(Math.min.apply(null, allY), c.Kp) * 0.98;
      const yHi = Math.max(Math.max.apply(null, allY), c.Kc) * 1.02;
      const hMin = Math.min.apply(null, B.H);
      const hLo = hMin * 1.05 - 1;
      const hHi = Math.max(0, Math.max.apply(null, B.H)) + Math.abs(hMin) * 0.05;
      return {
        build(host) {
          host.innerHTML = '';
          const grid = el('div', 'grid2');
          const tapeCard = card('The tape', 'Spot so far; strikes dashed.' +
            (ghost ? ' Dashed grey line = same shocks without bank flow.' : ''));
          const bookCard = card("The bank's hedge, building",
            "Shares short so far; today's flow is the newest step.");
          grid.append(tapeCard, bookCard);
          host.append(grid);
          return { tapeCard, bookCard, n: 0 };
        },
        frame(ctx, st) {
          if (ctx.n++ % 3 !== 0 && st.t !== 0 && st.t !== c.DAYS) return;
          ctx.tapeCard.querySelectorAll('.chart-box').forEach((n) => n.remove());
          ctx.bookCard.querySelectorAll('.chart-box').forEach((n) => n.remove());
          const px = [], py = [], hy = [];
          for (let i = 0; i <= st.t; i++) { px.push(i); py.push(path[i]); hy.push(B.H[i]); }
          const series = [];
          if (ghost) series.push({ name: 'no bank flow', color: 'var(--muted)',
            x: ghost.map((_, i) => i), y: ghost, width: 1.4, dash: '4 3' });
          series.push({ name: 'CBA', color: 'var(--s1)', x: px, y: py, width: 2.2 });
          CL.charts.lineChart(ctx.tapeCard, {
            height: 240, series,
            xLabel: 'day', yLabel: 'A$',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
            xMin: 0, xMax: c.DAYS, yMin: yLo, yMax: yHi,
            refY: [
              { v: c.Kp, label: 'put ' + c.Kp.toFixed(0), color: 'var(--s2)', dash: '3 3' },
              { v: c.Kc, label: 'call ' + c.Kc.toFixed(0), color: 'var(--s3)', dash: '3 3' },
            ],
            legend: false, hover: false,
            marker: { x: st.t, y: st.S, color: 'var(--s4)' },
          });
          CL.charts.lineChart(ctx.bookCard, {
            height: 240,
            series: [{ name: 'hedge (sh)', color: 'var(--s1)', x: px, y: hy, width: 2.2 }],
            xLabel: 'day', yLabel: 'shares',
            xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
            xMin: 0, xMax: c.DAYS, yMin: hLo, yMax: hHi,
            refY: [{ v: 0, label: 'flat', color: 'var(--muted)', dash: '3 3' }],
            legend: false, hover: false,
            marker: { x: st.t, y: B.H[st.t], color: 'var(--s4)' },
          });
        },
      };
    };

    const scenarioDefs = [
      { id: 'inception', label: 'Inception · working the sale', make(c) {
        const path = CL.paths.scripted('base', c.S0, c.DAYS, { seed: 11 });
        const vpath = flatVol(c, path);
        const ramp = 0.10 * c.ADV;
        const B = mkBook(c, path, vpath, ramp);
        const g0 = CL.structGreeks(c.legs, 0, c.S0, c.T0, c.p);
        const target0 = -g0.delta * CLIP;
        // first day the daily step is no longer participation-capped = order done
        let doneDay = 2;
        for (let t = 1; t <= c.DAYS; t++) if (Math.abs(B.FLOW[t]) < ramp * 0.99) { doneDay = t; break; }
        let maint = 0;                                    // typical |flow| around mid-life
        for (let t = 60; t <= 66; t++) maint += Math.abs(B.FLOW[t]) / 7;
        const hMin = Math.min.apply(null, B.H);
        return { days: c.DAYS, spotPath: path, legs: c.legs, stockQty: 0,
          readouts: mkReadouts(c, B),
          custom: mkCustom(c, path, B, null),
          milestones: [
            { day: 0, title: 'The client just traded; you inherited the risk', text:
              '1M-share collar crossed: you are short the ' + c.Kp.toFixed(0) + ' put, long the ' + c.Kc.toFixed(2) +
              ' call — net delta ' + F.sign(g0.delta) + '. To be flat you must sell ' + F.shares(target0 * -1) +
              ' CBA — ' + (Math.abs(target0) / c.ADV * 100).toFixed(0) + '% of a full day\'s ADV. Nobody prints that ' +
              'in one go; you work it at 10% participation. (And note: the automatic P&L / share tile is the naked ' +
              'options mark — the Bank P&L (clip) tile is your scorecard.)' },
            { day: 1, title: 'Working the order', text:
              'Sold ' + F.shares(Math.abs(B.H[1])) + ' so far, ' + F.shares(Math.abs(target0 - B.H[1])) +
              ' still to go. Every one of these prints is real volume on the ASX tape — tab 4 asks what happens ' +
              'when the clip is 30× bigger.' },
            { day: doneDay, pause: true, title: 'Flat, at last', text:
              'Day ' + doneDay + ': hedge complete at ' + F.shares(Math.abs(B.H[doneDay])) + ' sh short. From here ' +
              'the job changes species: you no longer have an order, you have a POSITION — watch Today\'s flow ' +
              'shrink to maintenance size.' },
            { day: 63, title: 'The rhythm of maintenance', text:
              'Between the strikes gamma is small: re-hedges run ~' + F.shares(maint) + ' a day, noise inside a ' +
              F.shares(c.ADV) + '-share ADV. The tape barely feels you — for now.' },
            { day: c.DAYS, title: 'Charm hands the shares back', text: (st) =>
              'Both options die OTM at ' + st.S.toFixed(1) + ', delta → 0, and the hedge has quietly unwound from ' +
              F.shares(Math.abs(hMin)) + ' short to ' + F.shares(Math.abs(B.H[c.DAYS])) + '. The book closes; P&L ' +
              F.big(B.CUM[c.DAYS]) + ' is the skew and theta you collected for six months of this work.' },
          ] };
      } },
      { id: 'pin', label: 'Pinning · long-gamma glue', make(c) {
        const raw = CL.paths.scripted('pin', c.S0, c.DAYS, { seed: 11, target: c.Kc });
        const ivFlat = flatVol(c, raw);
        // with-flow tape: same damp model as the pinning sim above (draw())
        const streetSh = 40e6;
        const S2 = [c.S0];
        for (let t = 1; t <= c.DAYS; t++) {
          const rawRet = Math.log(raw[t] / raw[t - 1]);
          const T2 = Math.max(0.02, (c.DAYS - t) / 252);
          const pv2 = Object.assign({}, c.p, { vol: ivFlat[t - 1] });
          const gSh = CL.structGreeks(c.legs, 0, S2[t - 1], T2, pv2).gamma * S2[t - 1] * 0.01 * streetSh;
          const damp = Math.min(1.8, Math.max(0.55, 1 / (1 + 0.5 * gSh / c.p.adv)));
          S2.push(S2[t - 1] * Math.exp(rawRet * damp));
        }
        const B = mkBook(c, S2, ivFlat, Infinity);
        let glueDay = 100;
        for (let t = 64; t <= c.DAYS; t++) if (Math.abs(S2[t] - c.Kc) < 1.5) { glueDay = t; break; }
        const shPerPct = (t) => CL.structGreeks(c.legs, 0, S2[t],
          Math.max(0.002, (c.DAYS - t) / 252), c.p).gamma * S2[t] * 0.01 * CLIP;
        return { days: c.DAYS, spotPath: S2, legs: c.legs, stockQty: 0,
          readouts: mkReadouts(c, B),
          custom: mkCustom(c, S2, B, raw),
          milestones: [
            { day: 0, title: 'The map says: long gamma up there', text:
              'The street is collared ' + F.shares(streetSh) + ' shares. Above, at the ' + c.Kc.toFixed(2) +
              ' cap, banks are LONG gamma — the green zone on the gamma chart. Watch what that does when ' +
              'spot goes visiting.' },
            { cond: (st) => st.S > c.Kc - 2, once: true, title: 'Entering the glue zone', text: (st) =>
              'Spot ' + st.S.toFixed(1) + ': every uptick grows your delta, so you SELL it; every downtick, you ' +
              'buy it back. Check Today\'s flow — its sign now flips against yesterday\'s move.' },
            { day: glueDay, pause: true, title: 'Glued', text:
              'Day ' + glueDay + ': with-flow tape ' + S2[glueDay].toFixed(1) + ' vs exogenous ' + raw[glueDay].toFixed(1) +
              ' — ' + F.money(Math.abs(raw[glueDay] - S2[glueDay])) + ' apart, and the solid line will not leave ' +
              c.Kc.toFixed(0) + '. Your mean-reverting flow IS the pin; the dashed line is the market that would ' +
              'have happened without you.' },
            { day: 110, title: 'Expiry week sharpens it', text:
              'Gamma needles up as T → 0: the same 1% move now moves the hedge ' + F.shares(shPerPct(110)) +
              ' instead of ' + F.shares(shPerPct(63)) + ' at mid-life. Strikes with size pin hardest in the ' +
              'last fortnight.' },
            { day: c.DAYS, title: 'Expiry on the strike', text:
              'CBA settles ' + S2[c.DAYS].toFixed(1) + ', within ' + F.money(Math.abs(S2[c.DAYS] - c.Kc)) +
              ' of the cap — exactly where ' + F.shares(streetSh) + ' collared shares said it would. Options ' +
              'theory calls it pinning; the tape calls it Tuesday.' },
          ] };
      } },
      { id: 'chase', label: 'Sell-off · short-gamma chase', make(c) {
        const raw = CL.paths.scripted('selloff', c.S0, c.DAYS, { seed: 3 });
        const vpath = CL.paths.volPath(raw, c.p.vol);
        const B = mkBook(c, raw, vpath, Infinity);
        let worstDay = 1;
        for (let t = 1; t <= c.DAYS; t++) if (B.FLOW[t] < B.FLOW[worstDay]) worstDay = t;
        let rs = 0;
        for (let t = 1; t <= c.DAYS; t++) rs += Math.pow(Math.log(raw[t] / raw[t - 1]), 2);
        const realVol = Math.sqrt(rs / c.DAYS * 252);
        const putIv0 = CL.volForStrike(c.Kp, c.S0, c.T0, c.p.vol, c.p.rate, c.p.divy, c.p.skewOn, c.p.skew);
        const hMin = Math.min.apply(null, B.H);
        return { days: c.DAYS, spotPath: raw, volPath: vpath, legs: c.legs, stockQty: 0,
          readouts: mkReadouts(c, B),
          custom: mkCustom(c, raw, B, null),
          milestones: [
            { day: 0, title: 'The mirror image', text:
              'Same book, other tail. Below the ' + c.Kp.toFixed(0) + ' put you are SHORT gamma — the terracotta ' +
              'zone on the chart above. Down there your hedging stops leaning against the market and starts ' +
              'pushing it.' },
            { cond: (st) => st.S < c.Kp * 1.03, once: true, title: 'Approaching the floor', text: (st) =>
              'Spot ' + st.S.toFixed(1) + ', vol ' + pctS(st.iv) + '%: the short put is fattening and every ' +
              'downtick now ADDS delta you must sell. Today\'s flow has turned one-way.' },
            { cond: (st) => st.S < c.Kp, once: true, pause: true, title: 'Selling into the hole', text: (st) =>
              'Through the put at ' + c.Kp.toFixed(0) + '. Today you sold ' + F.shares(Math.abs(B.FLOW[st.t])) +
              ' into a falling tape — ' + (Math.abs(B.FLOW[st.t]) / c.ADV * 100).toFixed(0) + '% of ADV — not ' +
              'because you want to, but because delta-neutral demands it. You are no longer hedging the move; ' +
              'you are part of it.' },
            { day: worstDay, title: 'The worst print', text:
              'Day ' + worstDay + ': ' + F.shares(Math.abs(B.FLOW[worstDay])) + ' sold, ' +
              (Math.abs(B.FLOW[worstDay]) / c.ADV * 100).toFixed(0) + '% of ADV, at ' + raw[worstDay].toFixed(1) +
              ' — the chase\'s biggest day. Multiply by the street\'s 40M shares and this flow is what turns a ' +
              'sell-off into a rout.' },
            { day: c.DAYS, title: 'The scorecard', text:
              'Spot ' + raw[c.DAYS].toFixed(1) + ', hedge peaked at ' + F.shares(Math.abs(hMin)) + ' short. ' +
              'Bank P&L ' + F.big(B.CUM[c.DAYS]) + ': the short put paid out and realised ' + pctS(realVol) +
              '% vol beat the ' + pctS(putIv0) + '% implied you sold — short gamma pays theta in quiet times ' +
              'and takes it back all at once.' },
          ] };
      } },
      { id: 'volspike', label: 'Crash · vega marks first', make(c) {
        const raw = CL.paths.scripted('crash', c.S0, c.DAYS, { seed: 2 });
        const vpath = CL.paths.volPath(raw, c.p.vol);
        const B = mkBook(c, raw, vpath, Infinity);
        const gapDay = Math.round(c.DAYS * 0.6);
        // decompose the gap-day put re-mark: same spot, yesterday's vol vs today's
        const pmark = (t, vol) => CL.legGreeks({ type: 'put', K: c.Kp, qty: 1 }, raw[t],
          Math.max(0.002, (c.DAYS - t) / 252), Object.assign({}, c.p, { vol })).price;
        const vegaPart = pmark(gapDay, vpath[gapDay]) - pmark(gapDay, vpath[gapDay - 1]);
        const putIv0 = CL.volForStrike(c.Kp, c.S0, c.T0, c.p.vol, c.p.rate, c.p.divy, c.p.skewOn, c.p.skew);
        const callIv0 = CL.volForStrike(c.Kc, c.S0, c.T0, c.p.vol, c.p.rate, c.p.divy, c.p.skewOn, c.p.skew);
        return { days: c.DAYS, spotPath: raw, volPath: vpath, legs: c.legs, stockQty: 0,
          readouts: mkReadouts(c, B),
          custom: mkCustom(c, raw, B, null),
          milestones: [
            { day: 0, title: 'Selling the crash put', text:
              'You are short the ' + c.Kp.toFixed(0) + ' put at ' + pctS(putIv0) + ' vol' +
              (c.p.skewOn ? ', skew-rich vs the ' + pctS(callIv0) + '-vol call you own' : '') +
              '. For months the strike is far away — but the MARK doesn\'t need spot to get there.' },
            { day: 60, title: 'Quiet book, small flows', text: (st) =>
              'Spot ' + st.S.toFixed(1) + ', IV ' + pctS(st.iv) + '%: flows are maintenance-sized, P&L ' +
              F.big(B.CUM[60]) + ' and grinding in. Short-vol books always look best the week before.' },
            { day: gapDay, pause: true, title: 'The gap: vol arrives before spot', text: (function () {
              const swing = B.CUM[gapDay] - B.CUM[gapDay - 1];
              return raw[gapDay - 1].toFixed(1) + ' → ' + raw[gapDay].toFixed(1) + ' overnight, and implied ' +
                pctS(vpath[gapDay - 1]) + '% → ' + pctS(vpath[gapDay]) + '%. The ' + c.Kp.toFixed(0) +
                ' put you are short re-marks ' + F.money(pmark(gapDay - 1, vpath[gapDay - 1])) + ' → ' +
                F.money(pmark(gapDay, vpath[gapDay])) + ' with spot still ' + F.money(raw[gapDay] - c.Kp, 0) +
                ' ABOVE the strike — re-run it at yesterday\'s vol and ' + F.big(vegaPart * CLIP) +
                ' of the markup is pure vega, not spot. The whole book swings ' + (swing >= 0 ? '+' : '') +
                F.big(swing) +
                (swing >= 0
                  ? ' — the gap broke from up in your long-gamma call zone, so yesterday\'s big short hedge paid; the put\'s vega bill is buried inside that number.'
                  : ' — and the hedge, sized for yesterday\'s delta, traded none of the gap.');
            })() },
            { cond: (st) => st.t > gapDay && st.iv < vpath[gapDay] - 0.05, once: true,
              title: 'The spike decays', text: (st) =>
              'Fifteen-odd sessions on, the panic premium has bled to ' + pctS(st.iv) + '%: vol mean-reverts ' +
              'even when spot doesn\'t. The put\'s gap-day vega markup quietly bleeds back out of the mark.' },
            { day: c.DAYS, title: 'Settlement', text:
              'CBA ends ' + raw[c.DAYS].toFixed(1) + ', through the floor: the put you\'re short pays out ' +
              F.money(Math.max(c.Kp - raw[c.DAYS], 0)) + ' intrinsic. Final P&L ' + F.big(B.CUM[c.DAYS]) +
              (B.CUM[c.DAYS] >= 0
                ? ' — rescued by re-hedging a crash that broke from ABOVE the cap, in the long-gamma zone. Gap risk landed in the friendly zone this time; a gap that opens AT the put strike has no such mercy.'
                : ' — one gap did what six months of theta couldn\'t undo.') +
              ' This is why the desk charges for gamma, and why tab 4\'s 30× program terrifies them.' },
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
    showScenario(scenarioDefs.some((d) => d.id === tab._theatreSel) ? tab._theatreSel : 'inception');
    // ---- end Scenario theatre --------------------------------------------

    root.append(callout('trader', 'Why stocks pin at heavily-dealt strikes',
      'Suppose spot drifts up to the call strike, where the street\'s banks are LONG gamma. Every uptick, their ' +
      'delta grows → they sell; every downtick, they buy. Their hedging is a mean-reverting force glued to the strike — ' +
      'that is pinning. Run the “Pin” scenario and watch the flow bars flip sign around the cap. ' +
      'Below the put strike the banks are SHORT gamma and the same logic runs in reverse: hedging chases the ' +
      'move and adds fuel to sell-offs. At 30x ADV (next tab) this stops being a curiosity and becomes the trade.'));

    function draw() {
      const p = CL.state;
      const S0 = p.spot;
      const days = Math.round(252 * tenorM / 12);
      const T0 = tenorM / 12;
      const Kp = S0 * putPct;
      const Kc = CL.solveZeroCostCall(S0, Kp, T0, p);
      const path = CL.paths.scripted(scen, S0, days, { seed: 11, target: Kc });
      const legs = [{ type: 'put', K: Kp, qty: -1 }, { type: 'call', K: Kc, qty: 1 }];  // bank book

      // simulate hedging — options marked at each day's own vol, frictions accrued
      const ivP = CL.paths.volPath(path, p.vol);
      const BORROW = 0.004;          // 40bp p.a. stock-borrow on the short hedge
      const HALF_SPREAD = 2.5e-4;    // 2.5bp half-spread crossed on every hedge share
      const hx = [], hedge = [], flows = [], flowDays = [];
      let optV0 = CL.structGreeks(legs, 0, S0, T0, p).price;
      let h = 0, hedgePL = 0, prevS = S0, borrowCost = 0, crossCost = 0;
      const cumOpt = [], cumHedge = [], cumTot = [];
      let realisedSum = 0;
      for (let t = 0; t <= days; t++) {
        const S = path[t];
        const T = Math.max(0.002, (days - t) / 252);
        const pv = Object.assign({}, p, { vol: ivP[t] });
        const g = CL.structGreeks(legs, 0, S, t >= days ? 0 : T, pv);
        hedgePL += h * (S - prevS) * CLIP;
        borrowCost += BORROW / 252 * Math.abs(h) * S * CLIP;
        if (t > 0) realisedSum += Math.pow(Math.log(S / prevS), 2);
        prevS = S;
        if (t % hedgeEvery === 0 || t === days) {
          const target = -g.delta;              // shares per collar share (negative = short)
          flows.push((target - h) * CLIP);
          flowDays.push(t);
          crossCost += Math.abs(target - h) * CLIP * S * HALF_SPREAD;
          h = target;
        }
        hx.push(t);
        hedge.push(h * CLIP);
        const optPL = (g.price - optV0) * CLIP;
        cumOpt.push(optPL); cumHedge.push(hedgePL); cumTot.push(optPL + hedgePL);
      }
      const realisedVol = Math.sqrt(realisedSum / days * 252);
      const frictions = borrowCost + crossCost;
      const grossPL = cumTot[cumTot.length - 1];

      // pinning sim: replay the same shocks with bank flow damping/amplifying them
      const streetSh = streetM * 1e6;
      const S2 = [S0];
      for (let t = 1; t <= days; t++) {
        const rawRet = Math.log(path[t] / path[t - 1]);
        const T2 = Math.max(0.02, (days - t) / 252);
        const pv2 = Object.assign({}, p, { vol: ivP[t - 1] });
        const gSh = CL.structGreeks(legs, 0, S2[t - 1], T2, pv2).gamma * S2[t - 1] * 0.01 * streetSh;
        const damp = Math.min(1.8, Math.max(0.55, 1 / (1 + 0.5 * gSh / p.adv)));
        S2.push(S2[t - 1] * Math.exp(rawRet * damp));
      }

      const g0 = CL.structGreeks(legs, 0, S0, T0, p);
      const putIv0 = CL.volForStrike(Kp, S0, T0, p.vol, p.rate, p.divy, p.skewOn, p.skew);
      const callIv0 = CL.volForStrike(Kc, S0, T0, p.vol, p.rate, p.divy, p.skewOn, p.skew);
      tileHost.innerHTML = '';
      tileHost.append(tiles([
        { k: 'Inception hedge', v: F.shares(-g0.delta * CLIP) + ' sh', d: 'short, = ' + ((g0.delta * CLIP) / p.adv * 100).toFixed(0) + '% of one day\'s ADV' },
        { k: 'Bank delta / collar sh', v: F.sign(g0.delta), d: 'flattened by shorting stock' },
        { k: 'Skew collected (day 0)', v: ((putIv0 - callIv0) * 100).toFixed(1) + ' vols', d: 'sold put @ ' + (putIv0 * 100).toFixed(1) + ', bought call @ ' + (callIv0 * 100).toFixed(1) + ' — the bank\'s structural margin' },
        { k: 'Realised vol (this path)', v: (realisedVol * 100).toFixed(1) + '%', d: 'vs ' + (p.vol * 100).toFixed(1) + '% implied — ' + (realisedVol > p.vol ? 'long-gamma side of the book wins' : 'short-vol side of the book wins') },
        { k: 'Hedging frictions', v: '−' + F.big(frictions), cls: 'neg', d: 'borrow ' + F.big(borrowCost) + ' (40bp p.a.) + crossing ' + F.big(crossCost) + ' (2.5bp/share)' },
        { k: 'Bank final P&L (net)', v: F.big(grossPL - frictions), cls: grossPL - frictions >= 0 ? 'pos' : 'neg', d: 'gross ' + F.big(grossPL) + ' − frictions, 1M-share clip' },
      ]));

      // gamma profile
      gammaCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const gx = [], gy = [];
      for (let x = S0 * 0.72; x <= S0 * 1.28; x += S0 * 0.004) {
        gx.push(x);
        gy.push(CL.structGreeks(legs, 0, x, Math.max(0.02, T0 * 0.5), p).gamma * 100);
      }
      CL.charts.lineChart(gammaCard, {
        height: 240,
        series: [{ name: 'bank gamma ×100', color: 'var(--s1)', x: gx, y: gy, width: 2.5, area: true }],
        xLabel: 'spot (A$)', yLabel: 'gamma ×100',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2),
        refX: [
          { v: Kp, label: 'put: SHORT γ', color: 'var(--s2)' },
          { v: Kc, label: 'call: LONG γ', color: 'var(--s3)' },
        ],
        legend: false,
      });

      // pinning: raw shocks vs shocks filtered through street hedging
      pinCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const px = path.map((_, i) => i);
      CL.charts.lineChart(pinCard, {
        height: 280,
        series: [
          { name: 'no bank flow (exogenous)', color: 'var(--muted)', x: px, y: path, width: 1.5, dash: '4 3' },
          { name: 'with street hedging (' + streetM + 'M sh collared)', color: 'var(--s1)', x: px, y: S2, width: 2.4 },
        ],
        xLabel: 'day', yLabel: 'A$',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
        refY: [
          { v: Kp, label: 'put (moves amplified)', color: 'var(--s2)' },
          { v: Kc, label: 'call (moves damped → pin)', color: 'var(--s3)' },
        ],
      });
      pinCard.append(el('p', 'caption',
        'Model: each day\'s return is scaled by 1/(1 + k·γ-flow/ADV) — bank long gamma absorbs the move, short gamma chases it. ' +
        'Run the “Pin” scenario and watch the solid line glue itself to the cap harder than the raw path; run “Sell-off” and watch it fall faster through the put. ' +
        'Drag Street inventory up toward the 75M-share program and the effect stops being subtle — this is tab 4\'s motivation drawn on the tape itself.'));

      // hedge line
      hedgeCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(hedgeCard, {
        height: 250,
        series: [{ name: 'hedge (shares)', color: 'var(--s1)', x: hx, y: hedge, width: 2.2 }],
        xLabel: 'day', yLabel: 'shares',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => F.shares(v),
        legend: false,
      });

      // flow bars — cap count for readability; day-0 inception hedge excluded
      // (it dwarfs everything — it lives in the tile above)
      flowCard.querySelector('.chart-title').textContent =
        (hedgeEvery === 1 ? 'Daily' : hedgeEvery === 5 ? 'Weekly' : 'Monthly') + ' hedging flow';
      flowCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const reFlows = flows.slice(1), reDays = flowDays.slice(1);
      const maxBars = 120;
      const stride = Math.max(1, Math.ceil(reFlows.length / maxBars));
      const fl = [], fd = [];
      for (let i = 0; i < reFlows.length; i += stride) {
        let s = 0;
        for (let j = i; j < Math.min(i + stride, reFlows.length); j++) s += reFlows[j];
        fl.push(s); fd.push('d' + reDays[i]);
      }
      CL.charts.barChart(flowCard, {
        labels: fd, values: fl, height: 250,
        color: (v) => (v >= 0 ? 'var(--div-pos)' : 'var(--div-neg)'),
        seriesName: 'shares traded', yFmt: (v) => F.shares(v), xLabel: 'day',
      });
      flowCard.append(el('p', 'caption',
        'Day-0 inception hedge (' + F.shares(flows[0]) + ' sh) excluded so the re-hedging flow is readable — it is the tile above.'));

      // P&L
      plCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(plCard, {
        height: 270,
        series: [
          { name: 'options book', color: 'var(--s2)', x: hx, y: cumOpt, width: 1.8 },
          { name: 'stock hedge', color: 'var(--s3)', x: hx, y: cumHedge, width: 1.8 },
          { name: 'net bank P&L', color: 'var(--s1)', x: hx, y: cumTot, width: 2.7 },
        ],
        xLabel: 'day', yLabel: 'A$',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => F.big(v),
      });

      // implied vol along the path (salvaged from the old Life of a Trade tab)
      volCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      CL.charts.lineChart(volCard, {
        height: 270,
        series: [{ name: 'ATM vol', color: 'var(--s7)', x: hx, y: hx.map((t) => ivP[t] * 100), width: 2.2, area: true }],
        xLabel: 'day', yLabel: 'vol (%)',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
        refY: [{ v: p.vol * 100, label: 'struck ' + (p.vol * 100).toFixed(0), color: 'var(--muted)', dash: '2 3' }],
        legend: false,
      });

      noteHost.innerHTML = '';
      const skewEdge = p.skewOn
        ? 'Note the bank also collected the skew: they sold the rich 90% put vol and bought the cheap upside call vol. On a flat-realised path that skew premium is their margin.'
        : 'Skew is off, so the bank priced both legs at flat vol — try turning skew on in the header to see the margin they normally build in.';
      noteHost.append(CL.ui.callout('', 'Reading the P&L chart',
        'The options book is marked at each day\'s implied vol (sell-offs spike it — the bank\'s short put loses on vol as well as spot), ' +
        'and the hedge mirrors it — that is what delta-neutral means. The residual is the ' +
        'gamma/theta exchange: re-hedge less often (monthly) and the residual gets noisier, because unhedged gamma is a bet on every move. ' + skewEdge));

      // ---- restrike menu, bank side (salvaged & reframed from the old tab 3) ----
      restrikeCard.querySelectorAll('.ctl, table, .caption').forEach((n) => n.remove());
      let qDay = Math.round(days * 0.5);
      const quotesHost = el('div');
      const qSlider = slider({
        label: 'Quote day', min: 5, max: days - 5, step: 1, value: qDay,
        fmt: (v) => 'day ' + v + '/' + days, onInput: (v) => { qDay = v; renderQuotes(); },
      });
      qSlider.root.style.maxWidth = '260px';
      restrikeCard.append(qSlider.root, quotesHost);
      const renderQuotes = () => {
        const S = path[qDay], T = Math.max(0.002, (days - qDay) / 252);
        const pv = Object.assign({}, p, { vol: ivP[qDay] });
        const lg = (type, K) => CL.legGreeks({ type, K, qty: 1 }, S, T, pv);
        const cNow = lg('call', Kc), pNow = lg('put', Kp);
        const capUp = Kc * 1.05, cUp = lg('call', capUp);
        const newKp = S * putPct, newKc = CL.solveZeroCostCall(S, newKp, tenorM / 12, pv);
        const nP = lg('put', newKp), nC = lg('call', newKc);
        // bank book delta per collar share: −Δput + Δcall; hedge = −bookΔ
        const bookOld = -pNow.delta + cNow.delta;
        const flowShares = (bookNew) => -(bookNew - bookOld) * CLIP;   // + = desk BUYS
        const fFlow = (sh) => (sh >= 0 ? 'buy ' : 'sell ') + F.shares(Math.abs(sh)) + ' sh';
        let html = '<table class="data"><tr><th>Client asks</th><th>Cash / share</th><th>Desk crosses (1M clip)</th><th>What changes</th></tr>';
        html += `<tr><td>Uncap — sell me back my call</td><td>client pays ${F.money(cNow.price)}</td><td>${fFlow(flowShares(-pNow.delta))}</td><td>upside reopens; desk keeps only the short put</td></tr>`;
        html += `<tr><td>Roll the cap up 5% (to ${F.money(capUp)})</td><td>client pays ${F.money(Math.max(0, cNow.price - cUp.price))}</td><td>${fFlow(flowShares(-pNow.delta + cUp.delta))}</td><td>cap moves ${F.money(capUp - Kc)} higher</td></tr>`;
        html += `<tr><td>Full restrike — new 12m ${(putPct * 100).toFixed(0)}% zero-cost at today's spot</td><td>client ${pNow.price - cNow.price >= 0 ? 'receives' : 'pays'} ${F.money(Math.abs(pNow.price - cNow.price))} unwind</td><td>${fFlow(flowShares(-nP.delta + nC.delta))}</td><td>new floor ${F.money(newKp)} · new cap ${F.money(newKc)} (${(newKc / S * 100).toFixed(1)}%)</td></tr>`;
        html += '</table>';
        quotesHost.innerHTML = html;
        quotesHost.insertAdjacentHTML('beforeend',
          '<p class="caption">Quoted off day-' + qDay + ' spot (' + F.money(S) + ') and vol (' + (ivP[qDay] * 100).toFixed(1) +
          '). The flow column is the point: every restrike re-levels the book\'s delta, and the desk crosses that difference in CBA within minutes of the client trading. ' +
          'Scale it 75× for the full program and a client restrike IS a market event — tab 4\'s territory.</p>');
      };
      renderQuotes();
    }

    draw();
    this._redraw = draw;
  },
};
