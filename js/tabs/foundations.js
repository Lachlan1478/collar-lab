/* Tab 1 — Foundations: collar anatomy, payoff composition, zero-cost solver, skew. */
window.CL = window.CL || {};
CL.tabs = CL.tabs || {};

CL.tabs.foundations = {
  id: 'foundations',
  title: 'Foundations',
  render(root) {
    const { el, slider, checkbox, tiles, callout, card } = CL.ui;
    const F = CL.fmt;
    root.innerHTML = '';

    root.append(el('h2', null, '1 · Anatomy of a collar'));
    root.append(el('p', 'lede',
      'You hold CBA.AX and want to keep holding it — but you need downside protection. ' +
      'A collar buys a put (the floor) and pays for it by selling a call (the cap). ' +
      'Struck so the call premium exactly funds the put, it is a <b>zero-cost collar</b>: ' +
      'protection paid for with upside, not cash.'));

    root.append(callout('', 'The three legs',
      '<b>Long stock</b> — the position you are protecting. ' +
      '<b>Long put at K<sub>p</sub></b> — the right to sell at the floor; costs premium. ' +
      '<b>Short call at K<sub>c</sub></b> — obliges you to deliver above the cap; earns premium. ' +
      'Between the strikes you still own normal CBA exposure — collars only bite at the edges.'));

    // ---- controls ----
    const controls = el('div', 'controls');
    let putPct = 0.90, tenorM = 12, zeroCost = true, callPct = 1.10;
    const sPut = slider({
      label: 'Put strike (floor)', min: 0.75, max: 1.0, step: 0.005, value: putPct,
      fmt: (v) => (v * 100).toFixed(1) + '% of spot',
      onInput: (v) => { putPct = v; draw(); },
    });
    const sCall = slider({
      label: 'Call strike (cap)', min: 0.95, max: 1.35, step: 0.005, value: callPct,
      fmt: (v) => (v * 100).toFixed(1) + '% of spot',
      onInput: (v) => { callPct = v; draw(); },
    });
    const sTenor = slider({
      label: 'Tenor', min: 1, max: 24, step: 1, value: tenorM,
      fmt: (v) => v + 'm', onInput: (v) => { tenorM = v; draw(); },
    });
    const cZero = checkbox({
      label: 'Solve call strike for zero cost', checked: true,
      onChange: (v) => { zeroCost = v; sCall.root.style.opacity = v ? 0.4 : 1; draw(); },
    });
    sCall.root.style.opacity = 0.4;
    controls.append(sPut.root, sCall.root, sTenor.root, cZero.root);
    root.append(controls);

    const tileHost = el('div');
    root.append(tileHost);
    const warnHost = el('div');
    root.append(warnHost);

    const g2 = el('div', 'grid2');
    const payoffCard = card('Payoff at expiry, per share — the HOLDER\'s side',
      'Each leg\'s P&L vs where CBA finishes, from the buyer\'s seat (long stock + long put − short call). The bank\'s option book is the exact mirror image — tab 3.');
    const mtmCard = card('Value today vs value at expiry — the HOLDER\'s side',
      'The same position at two moments in time. Before expiry the mark is a smooth curve; the vertical gap vs the expiry line is net TIME VALUE — and its sign flips across the range.');
    g2.append(payoffCard, mtmCard);
    root.append(g2);

    // ---- Scenario theatre ------------------------------------------------
    root.append(el('h3', null, 'Scenario theatre'));
    root.append(el('p', null,
      'Before the collar earns its name, watch each leg live through six months on its own — then assemble them.'));
    const picker = el('div', 'scenario-picker');
    const theatreHost = el('div');
    root.append(picker, theatreHost);

    const tab = this;
    const sA = (v) => (v > 0 ? '+' : '') + F.money(v);   // signed A$ for narration
    const intrinsic = (legs, S) => legs.reduce((a, l) =>
      a + l.qty * (l.type === 'put' ? Math.max(l.K - S, 0) : Math.max(S - l.K, 0)), 0);
    const mkReadouts = (legs, withStock) => (st) => {
      const out = [
        { k: 'Delta', v: F.sign(st.greeks.delta) },
        { k: 'Time value', v: F.money(st.greeks.price - intrinsic(legs, st.S)) },
      ];
      if (withStock) out.push({ k: 'Unhedged stock', v: F.sign(st.plStock), cls: st.plStock >= 0 ? 'pos' : 'neg' });
      return out;
    };
    // shared params, recomputed at every mount so numbers follow live CL.state
    const shared = () => {
      const S0 = CL.state.spot, DAYS = 126, T0 = DAYS / 252, p = CL.state;
      const KC = Math.round(S0 * 1.05), KP = Math.round(S0 * 0.90), KPZ = S0 * 0.90;
      const KCZ = CL.solveZeroCostCall(S0, KPZ, T0, p);
      return {
        S0, DAYS, T0, p, KC, KP, KPZ, KCZ,
        callPrem: CL.legGreeks({ type: 'call', K: KC, qty: 1 }, S0, T0, p).price,
        putPrem: CL.legGreeks({ type: 'put', K: KP, qty: 1 }, S0, T0, p).price,
        putPremZ: CL.legGreeks({ type: 'put', K: KPZ, qty: 1 }, S0, T0, p).price,
        callPremZ: CL.legGreeks({ type: 'call', K: KCZ, qty: 1 }, S0, T0, p).price,
      };
    };
    const collarLegs = (c) => [{ type: 'put', K: c.KPZ, qty: 1 }, { type: 'call', K: c.KCZ, qty: -1 }];
    const collarDay0 = (c, tail) =>
      `Put at ${c.KPZ.toFixed(0)} costs ${F.money(c.putPremZ)}; the ${c.KCZ.toFixed(2)} call brings in ${F.money(c.callPremZ)}. ` +
      `Net premium: zero. Floor −10%, cap ${F.sign((c.KCZ / c.S0 - 1) * 100, 1)}%. ` + tail;

    const scenarioDefs = [
      { id: 'call-wins', label: 'Long call · wins', make(c) {
        const legs = [{ type: 'call', K: c.KC, qty: 1 }];
        const d0 = CL.legGreeks(legs[0], c.S0, c.T0, c.p).delta;
        return { days: c.DAYS, spotPath: CL.paths.scripted('grind', c.S0, c.DAYS, { seed: 5 }), legs, stockQty: 0,
          readouts: mkReadouts(legs, false),
          milestones: [
            { day: 0, title: 'You pay the premium', text:
              `You buy the 6-month ${c.KC} call (105%) for ${F.money(c.callPrem)}. That ${F.money(c.callPrem)} is your maximum loss; ` +
              `delta ${F.sign(d0)} says it behaves like a third of a share.` },
            { cond: (st) => st.S > c.KC, pause: true, title: 'Through the strike', text: (st) =>
              `Day ~${st.t}, spot ${st.S.toFixed(1)}: intrinsic is only ${F.money(st.S - c.KC)} yet the call marks ${F.money(st.greeks.price)} — ` +
              `the other ${F.money(st.greeks.price - (st.S - c.KC))} is time value, the market's bet there is more to come.` },
            { day: 100, title: 'Converging to intrinsic', text: (st) =>
              `Spot ${st.S.toFixed(1)}, call ${F.money(st.greeks.price)} vs ${F.money(Math.max(st.S - c.KC, 0))} intrinsic — ` +
              `deep in the money with a month left, an option is almost just stock.` },
            { day: c.DAYS, title: 'Expiry settlement', text: (st) =>
              `Finished at ~${st.S.toFixed(1)}: settle ${F.money(Math.max(st.S - c.KC, 0))} intrinsic against ${F.money(c.callPrem)} paid → ` +
              `${sA(Math.max(st.S - c.KC, 0) - c.callPrem)}/share, ~${((Math.max(st.S - c.KC, 0) - c.callPrem) / c.callPrem).toFixed(1)}× your premium.` },
          ] };
      } },
      { id: 'call-dies', label: 'Long call · dies', make(c) {
        const legs = [{ type: 'call', K: c.KC, qty: 1 }];
        return { days: c.DAYS, spotPath: CL.paths.scripted('range', c.S0, c.DAYS, { seed: 5 }), legs, stockQty: 0,
          readouts: mkReadouts(legs, false),
          milestones: [
            { day: 0, title: `Same ${F.money(c.callPrem)}, other outcome`, text:
              `Identical call, identical premium. Most OTM options expire worthless — this is the modal path, not the sad one.` },
            { cond: (st) => st.S > c.KC - 2, title: 'So close', text: (st) =>
              `Day ~${st.t}, spot ${st.S.toFixed(1)}: the call marks ${F.money(st.greeks.price)}, up ${F.pct(st.greeks.price / c.callPrem - 1, 0)} — ` +
              `entirely time value, entirely unrealised. You could sell here. Nobody does.` },
            { day: 90, title: "Theta's work", text: (st) =>
              `Spot ${st.S.toFixed(1)} — roughly where you started — but the call is ${F.money(st.greeks.price)}, not ${F.money(c.callPrem)}. ` +
              `Spot round-tripped; time didn't.` },
            { day: c.DAYS, pause: true, title: 'Expired worthless', text: (st) =>
              `${st.S.toFixed(1)} < ${c.KC}: the call settles at zero and the full ${F.money(c.callPrem)} is burned. ` +
              `Remember this number — it's the income side of the short-call and covered-call chips.` },
          ] };
      } },
      { id: 'put-ins', label: 'Long put · insurance', make(c) {
        const legs = [{ type: 'put', K: c.KP, qty: 1 }];
        const d0 = CL.legGreeks(legs[0], c.S0, c.T0, c.p).delta;
        const path = CL.paths.scripted('selloff', c.S0, c.DAYS, { seed: 3 });
        return { days: c.DAYS, spotPath: path, volPath: CL.paths.volPath(path, CL.state.vol), legs, stockQty: 0,
          readouts: mkReadouts(legs, false),
          milestones: [
            { day: 0, title: 'Buying the floor', text:
              `The 90% put (${c.KP}) costs ${F.money(c.putPrem)} — ${(c.putPrem / c.S0 * 100).toFixed(1)}% of spot for six months of insurance. ` +
              `Delta ${F.sign(d0)}: a small short-share position that grows exactly when you need it.` },
            { cond: (st) => st.S < c.KP, pause: true, title: 'Floor breached', text: (st) =>
              `Day ~${st.t}: the put marks ${F.money(st.greeks.price)} against ${F.money(c.putPrem)} paid, and implied vol is up to ` +
              `~${(st.iv * 100).toFixed(0)}% — spot down, vol up. Puts win twice.` },
            { day: 100, title: 'Delta → −1', text: (st) =>
              `Spot ${st.S.toFixed(1)}, put ${F.money(st.greeks.price)}, almost all of it intrinsic — deep ITM, the put now IS a short share.` },
            { day: c.DAYS, title: 'The claim pays', text: (st) =>
              `${st.S.toFixed(1)} at expiry → ${F.money(Math.max(c.KP - st.S, 0))} intrinsic, ${sA(Math.max(c.KP - st.S, 0) - c.putPrem)} net: ` +
              `roughly ${((Math.max(c.KP - st.S, 0) - c.putPrem) / c.putPrem).toFixed(0)}× the premium, delivered in the state of the world where your portfolio bleeds.` },
          ] };
      } },
      { id: 'short-call', label: 'Short call · pain', make(c) {
        const legs = [{ type: 'call', K: c.KC, qty: -1 }];
        return { days: c.DAYS, spotPath: CL.paths.scripted('grind', c.S0, c.DAYS, { seed: 5 }), legs, stockQty: 0,
          readouts: mkReadouts(legs, false),
          milestones: [
            { day: 0, title: `You collect ${F.money(c.callPrem)}`, text:
              `The seller's trade: pocket ${F.money(c.callPrem)} now, keep it all if CBA stays under ${c.KC} for six months. ` +
              `Same tape as the winning long-call chip — deliberately.` },
            { cond: (st) => st.S > c.KC, title: 'Same tape, other side', text: (st) =>
              `Day ~${st.t} — the exact crossing that thrilled you on the long-call chip. The call marks ${F.money(-st.greeks.price)} against you, ` +
              `${sA(st.plOpt)} net of the premium collected. Every dollar the buyer makes comes out of you.` },
            { cond: (st) => st.S > c.S0 * 1.118, pause: true, title: 'Uncapped loss is real', text: (st) =>
              `Spot through ${(c.S0 * 1.118).toFixed(0)} with weeks left: you're down ~${(-st.plOpt / c.callPrem).toFixed(1)}× what you collected ` +
              `and there is no strike below which this stops.` },
            { day: c.DAYS, title: 'Assignment', text: (st) =>
              `${st.S.toFixed(1)} at expiry: pay out ${F.money(Math.max(st.S - c.KC, 0))}, keep ${F.money(c.callPrem)} → ` +
              `${sA(c.callPrem - Math.max(st.S - c.KC, 0))}/share. Naked short calls: capped win, uncapped loss. The next two chips cover it with stock.` },
          ] };
      } },
      { id: 'prot-put', label: 'Protective put · gap day', make(c) {
        const legs = [{ type: 'put', K: c.KP, qty: 1 }];
        const path = CL.paths.scripted('crash', c.S0, c.DAYS, { seed: 2 });
        const gapDay = Math.round(c.DAYS * 0.6);
        const worst = c.KP - c.S0 - c.putPrem;
        return { days: c.DAYS, spotPath: path, volPath: CL.paths.volPath(path, CL.state.vol), legs, stockQty: 1,
          readouts: mkReadouts(legs, false),
          milestones: [
            { day: 0, title: 'Stock plus floor', text:
              `You own the share at ${c.S0.toFixed(0)} and pay ${F.money(c.putPrem)} for the ${c.KP} floor: worst case locked at about ` +
              `${sA(worst)}/share (−${(Math.abs(worst) / c.S0 * 100).toFixed(0)}%) no matter what prints.` },
            { day: 56, title: 'The insurance looks wasted', text: (st) =>
              `Spot ${st.S.toFixed(1)}, stock ${sA(st.plStock)}, put marked ${F.money(st.greeks.price)}. ` +
              `This is when holders sell their hedge. Watch what happens if you don't.` },
            { day: gapDay, pause: true, title: 'Gap day', text: (st) =>
              `Overnight −${(Math.abs(path[gapDay] / path[gapDay - 1] - 1) * 100).toFixed(1)}%: ${path[gapDay - 1].toFixed(1)} → ${path[gapDay].toFixed(1)}. ` +
              `The put jumps to ${F.money(st.greeks.price)} as vol spikes to ${(st.iv * 100).toFixed(0)}%. You cannot buy insurance after the fire.` },
            { day: c.DAYS, title: 'The floor holds', text: (st) =>
              `${st.S.toFixed(1)} at expiry: stock ${sA(st.plStock)}, put ${sA(st.plOpt)} net of premium → ${sA(st.pl)}, ` +
              `exactly the worst case you bought on day 0.` },
          ] };
      } },
      { id: 'cov-call', label: 'Covered call · called away', make(c) {
        const legs = [{ type: 'call', K: c.KC, qty: -1 }];
        return { days: c.DAYS, spotPath: CL.paths.scripted('grind', c.S0, c.DAYS, { seed: 7 }), legs, stockQty: 1,
          readouts: mkReadouts(legs, false),
          milestones: [
            { day: 0, title: 'Renting out your upside', text:
              `You own the share and sell the ${c.KC} call for ${F.money(c.callPrem)} — income if nothing happens, a cap if something does.` },
            { cond: (st) => st.S > c.KC, title: 'Capped', text:
              `From here every extra dollar of stock gain is handed straight back on the short call — watch net delta collapse toward zero in the tiles.` },
            { cond: (st) => st.S > c.S0 * 1.147, pause: true, title: 'The regret zone', text: (st) =>
              `Stock alone would be ${sA(st.plStock)} and climbing; you are pinned near ${sA(st.pl)} ` +
              `(${F.money(c.KC - c.S0)} to the cap + ${F.money(c.callPrem)} premium). Opportunity cost is the real price of covered calls.` },
            { day: c.DAYS, title: 'Called away', text: (st) =>
              `${st.S.toFixed(1)}: assigned at ${c.KC} → ${sA(c.KC - c.S0)} stock + ${F.money(c.callPrem)} premium = ` +
              `${sA(c.KC - c.S0 + c.callPrem)} vs ${sA(st.plStock)} unhedged. Now: what if that surrendered upside bought something?` },
          ] };
      } },
      { id: 'col-cap', label: 'Collar · capped', make(c) {
        const legs = collarLegs(c);
        return { days: c.DAYS, spotPath: CL.paths.scripted('grind', c.S0, c.DAYS, { seed: 7 }), legs, stockQty: 1,
          readouts: mkReadouts(legs, true),
          milestones: [
            { day: 0, title: 'Zero cost, assembled', text:
              collarDay0(c, 'The cap comes from the same zero-cost solver the sliders above quote from.') },
            { cond: (st) => st.S > c.KCZ, pause: true, title: "This is where 'free' gets paid", text: (st) =>
              `Day ~${st.t}, spot ${st.S.toFixed(1)}: the cap engages. Zero-cost collars are paid for in upside, not cash — the invoice starts now.` },
            { day: 90, title: 'Pinned', text: (st) =>
              `Spot ${st.S.toFixed(1)}, your P&L flat at ≈ ${sA(st.pl)}/share while the Unhedged tile keeps climbing.` },
            { day: c.DAYS, title: 'The invoice', text: (st) =>
              `${st.S.toFixed(1)}: collar ${sA(st.pl)} vs ${sA(st.plStock)} unhedged. That ${F.money(st.plStock - st.pl)} gap ` +
              `is what the 'free' protection actually cost this time.` },
          ] };
      } },
      { id: 'col-floor', label: 'Collar · floor', make(c) {
        const legs = collarLegs(c);
        const path = CL.paths.scripted('selloff', c.S0, c.DAYS, { seed: 8 });
        return { days: c.DAYS, spotPath: path, volPath: CL.paths.volPath(path, CL.state.vol), legs, stockQty: 1,
          readouts: mkReadouts(legs, true),
          milestones: [
            { day: 0, title: 'Same structure, other tail', text:
              collarDay0(c, 'This time the market tests the terracotta line, not the green one.') },
            { cond: (st) => st.S < c.KPZ, pause: true, title: 'Floor engages', text: (st) =>
              `Day ~${st.t}: below ${c.KPZ.toFixed(0)} the put's delta ≈ −1 cancels the stock. Watch the Delta tile go to ~0 ` +
              `and P&L flatline near ${sA(c.KPZ - c.S0)}.` },
            { day: 110, title: 'Riding it out', text: (st) =>
              `Spot ${st.S.toFixed(0)}s, vol ${(st.iv * 100).toFixed(0)}%, unhedged holder ${sA(st.plStock)} and sweating; ` +
              `you are ${sA(st.pl)} and asleep.` },
            { day: c.DAYS, title: 'Insurance that cost nothing', text: (st) =>
              `${st.S.toFixed(1)}: put paid ${F.money(Math.max(c.KPZ - st.S, 0))} intrinsic, call died worthless, net premium was zero → ` +
              `loss capped at ${sA(st.pl)} (−10%) vs ${sA(st.plStock)} unhedged.` },
          ] };
      } },
      { id: 'col-quiet', label: 'Collar · quiet', make(c) {
        const legs = collarLegs(c);
        return { days: c.DAYS, spotPath: CL.paths.scripted('range', c.S0, c.DAYS, { seed: 5 }), legs, stockQty: 1,
          readouts: mkReadouts(legs, true),
          milestones: [
            { day: 0, title: 'The modal collar', text:
              collarDay0(c, 'Most collars spend their whole life between the strikes.') },
            { cond: (st) => st.S > c.KCZ - 3, title: 'Brush with the cap', text: (st) =>
              `Day ~${st.t}, ${st.S.toFixed(1)}: within ${F.money(c.KCZ - st.S)} of the cap, never through it. ` +
              `Between the strikes you are simply long CBA.` },
            { day: 90, title: 'Both wings bleeding', text:
              `Put and call are each nearly worthless now — but you sold one and bought one, so the decay nets to ~zero. ` +
              `The Time value tile tells the story.` },
            { day: c.DAYS, title: 'Nothing happened — that was the point', text: (st) =>
              `${st.S.toFixed(1)}: both options expire worthless, stock ${sA(st.plStock)}, collar cost zero. You paid nothing, ` +
              `and this time protection was never needed. Next section: why the smile means it's still not free.` },
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
    showScenario(scenarioDefs.some((d) => d.id === tab._theatreSel) ? tab._theatreSel : 'call-wins');
    // ---- end Scenario theatre --------------------------------------------

    const skewHost = el('div');
    root.append(skewHost);

    root.append(el('h3', null, 'Why the zero-cost collar is not "free"'));
    root.append(el('p', null,
      'With skew on, the 90% put trades several vol points <i>over</i> ATM and the call you sell trades ' +
      '<i>under</i> ATM — the exact gap is printed beneath the smile chart. You are buying expensive volatility and selling cheap volatility. The market charges ' +
      'for this in the only currency left: <b>the cap comes in closer than symmetry would suggest</b>. ' +
      'Toggle skew in the header and watch the solved call strike move — that gap is the price of crash insurance.'));
    root.append(callout('trader', "Trader's view",
      'Desks quote collars as a strike, not a price: “90% floor, what\'s my cap?” ' +
      'A tighter cap = more expensive protection. Watching the solved cap move as vol and skew change ' +
      'is the fastest way to build intuition for what protection really costs.'));

    function draw() {
      const p = CL.state;
      const S = p.spot, T = tenorM / 12;
      const Kp = S * putPct;
      const Kc = zeroCost ? CL.solveZeroCostCall(S, Kp, T, p) : S * callPct;
      if (zeroCost) { callPct = Kc / S; sCall.set(callPct); }

      warnHost.innerHTML = '';
      if (p.perspective === 'dealer') {
        warnHost.append(el('p', 'small',
          'Bank view applies from tab 2 onward — Foundations is always framed from the holder\'s side.'));
      }
      if (Kc <= Kp * 1.01) {
        warnHost.append(CL.ui.callout('warn', 'Not a collar any more',
          'The solved cap (' + F.money(Kc) + ') has collapsed onto or below the floor (' + F.money(Kp) + '): ' +
          'a put this close to at-the-money is so expensive that no sensible call funds it, and the structure ' +
          'degenerates toward a synthetic forward sale. Lower the floor, shorten the tenor, or accept paying premium.'));
      } else if (Kc < S) {
        warnHost.append(CL.ui.callout('', 'Cap below spot?',
          'The zero-cost cap solved <b>below today\'s price</b>. Nothing is broken — options are struck against the ' +
          '<b>forward</b>, and with dividends (' + (p.divy * 100).toFixed(1) + '%) above the rate (' + (p.rate * 100).toFixed(1) + '%), ' +
          'CBA\'s forward sits below spot. You are capping the forward, not today\'s price.'));
      }

      const putIv = CL.volForStrike(Kp, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
      const callIv = CL.volForStrike(Kc, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
      const putPrem = CL.bs('put', S, Kp, T, putIv, p.rate, p.divy).price;
      const callPrem = CL.bs('call', S, Kc, T, callIv, p.rate, p.divy).price;
      const net = callPrem - putPrem;   // + = credit to client
      const netDelta = 1 + CL.bs('put', S, Kp, T, putIv, p.rate, p.divy).delta
        - CL.bs('call', S, Kc, T, callIv, p.rate, p.divy).delta;

      tileHost.innerHTML = '';
      tileHost.append(tiles([
        { k: 'Floor (put strike)', v: F.money(Kp), d: (putPct * 100).toFixed(1) + '% of spot · IV ' + (putIv * 100).toFixed(1) },
        { k: 'Cap (call strike)', v: F.money(Kc), d: (Kc / S * 100).toFixed(1) + '% of spot · IV ' + (callIv * 100).toFixed(1) },
        { k: 'Put premium paid', v: F.money(putPrem), d: (putPrem / S * 100).toFixed(2) + '% of spot' },
        { k: 'Call premium received', v: F.money(callPrem), d: (callPrem / S * 100).toFixed(2) + '% of spot' },
        { k: 'Net premium', v: Math.abs(net) < 0.005 ? 'A$0.00' : (net > 0 ? '+' : '−') + F.money(Math.abs(net)), cls: Math.abs(net) < 0.02 ? '' : (net > 0 ? 'pos' : 'neg'), d: Math.abs(net) < 0.005 ? 'zero-cost ✓' : (net > 0 ? 'credit to holder' : 'cost to holder') },
        { k: 'Net delta at inception', v: F.sign(netDelta), d: 'the other ' + (1 - netDelta).toFixed(2) + '/share is the bank\'s hedge — tabs 3–4' },
      ]));

      // ---- payoff at expiry ----
      payoffCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const xs = [], stockPL = [], putPL = [], callPL = [], netPL = [];
      for (let x = S * 0.65; x <= S * 1.35; x += S * 0.005) {
        xs.push(x);
        stockPL.push(x - S);
        putPL.push(Math.max(Kp - x, 0) - putPrem);
        callPL.push(callPrem - Math.max(x - Kc, 0));
        netPL.push((x - S) + Math.max(Kp - x, 0) - putPrem + callPrem - Math.max(x - Kc, 0));
      }
      CL.charts.lineChart(payoffCard, {
        height: 300,
        series: [
          { name: 'stock alone', color: 'var(--muted)', x: xs, y: stockPL, dash: '5 4', width: 1.6 },
          { name: 'long put', color: 'var(--s2)', x: xs, y: putPL, width: 1.8 },
          { name: 'short call', color: 'var(--s3)', x: xs, y: callPL, width: 1.8 },
          { name: 'collar (net)', color: 'var(--s1)', x: xs, y: netPL, width: 2.8 },
        ],
        xLabel: 'CBA at expiry (A$)', yLabel: 'P&L per share (A$)',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0),
        refX: [
          { v: Kp, label: 'floor', color: 'var(--s2)' },
          { v: Kc, label: 'cap', color: 'var(--s3)' },
          { v: S, label: 'spot', color: 'var(--muted)', dash: '2 3' },
        ],
      });
      payoffCard.append(el('p', 'caption',
        'Term-sheet summary: worst case ' + F.sign((Kp - S + net) / S * 100, 1) + '% (at or below the floor) · ' +
        'best case ' + F.sign((Kc - S + net) / S * 100, 1) + '% (at or above the cap) · between the strikes you are simply long CBA.'));

      // ---- MTM today vs expiry ----
      mtmCard.querySelectorAll('.chart-box, .caption').forEach((n) => n.remove());
      const mtmNow = xs.map((x) => {
        const pv = CL.legGreeks({ type: 'put', K: Kp, qty: 1 }, x, T, p).price;
        const cv = CL.legGreeks({ type: 'call', K: Kc, qty: -1 }, x, T, p).price;
        return (x - S) + pv - putPrem + cv + callPrem;
      });
      CL.charts.lineChart(mtmCard, {
        height: 300,
        series: [
          { name: 'at expiry', color: 'var(--s1)', x: xs, y: netPL, width: 2.6 },
          { name: 'today (' + tenorM + 'm left)', color: 'var(--s7)', x: xs, y: mtmNow, width: 2 },
        ],
        xLabel: 'CBA spot (A$)', yLabel: 'P&L per share (A$)',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0),
        refX: [
          { v: Kp, label: 'floor', color: 'var(--s2)' },
          { v: Kc, label: 'cap', color: 'var(--s3)' },
        ],
      });
      // the gap between the curves, quantified at the two strikes
      const idxAt = (v) => {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - v); if (d < bd) { bd = d; bi = i; } }
        return bi;
      };
      const gapCap = mtmNow[idxAt(Kc)] - netPL[idxAt(Kc)];     // negative: holder short time value
      const gapFloor = mtmNow[idxAt(Kp)] - netPL[idxAt(Kp)];   // positive: holder long time value
      mtmCard.append(el('p', 'caption',
        'Why "today" is worth LESS than "expiry" on the right side: at the cap you are SHORT the call\'s remaining time value — ' +
        F.money(Math.abs(gapCap)) + '/share of premium the market still charges for the year of optionality you sold. ' +
        'Unwind today and you pay it back; sit still and it decays INTO your pocket, melting the today line up into the expiry line. ' +
        'At the floor it flips: the ' + F.money(Math.abs(gapFloor)) + ' gap is the put time value you OWN, and decay bleeds it away from you. ' +
        'Same position, two clocks — the gap is never free money, it is theta with a sign. All curves here are the holder\'s; the bank holds the mirror image of the option legs and hedges the delta (tab 3).'));

      // ---- skew panel ----
      skewHost.innerHTML = '';
      const skCard = card('The smile you are trading against',
        'Implied vol by strike. The collar buys the left side (rich) and sells the right side (cheap).');
      const kxs = [], ivs = [];
      for (let k = S * 0.7; k <= S * 1.3; k += S * 0.01) {
        kxs.push(k / S * 100);
        ivs.push(CL.volForStrike(k, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew) * 100);
      }
      CL.charts.lineChart(skCard, {
        height: 230,
        series: [{ name: 'implied vol', color: 'var(--s1)', x: kxs, y: ivs, width: 2.4 }],
        xLabel: 'strike (% of spot)', yLabel: 'implied vol (%)',
        xFmt: (v) => v.toFixed(0) + '%', yFmt: (v) => v.toFixed(1),
        refX: [
          { v: putPct * 100, label: 'put ' + (putIv * 100).toFixed(1) + 'v', color: 'var(--s2)' },
          { v: Kc / S * 100, label: 'call ' + (callIv * 100).toFixed(1) + 'v', color: 'var(--s3)' },
        ],
        legend: false,
      });
      skCard.append(el('p', 'caption', p.skewOn
        ? 'Skew on: the put you buy is marked ' + ((putIv - callIv) * 100).toFixed(1) + ' vol pts over the call you sell.'
        : 'Skew off: flat vol — both legs priced at ' + (p.vol * 100).toFixed(0) + ' vol. Note the cap moves further away: this is the “free lunch” flat-vol Black-Scholes wrongly suggests.'));
      skewHost.append(skCard);

      // ---- protection menu: solved caps across floors, as a desk would quote ----
      const menuCard = card('The protection menu',
        'Zero-cost caps a desk would quote across floors, at this tenor and vol surface. Tighter floor, tighter cap.');
      let mrows = '<table class="data"><tr><th>Floor</th><th>Put IV</th><th>Solved cap</th><th>Cap IV</th><th>Upside kept</th></tr>';
      for (const fp of [0.80, 0.85, 0.90, 0.95]) {
        const mKp = S * fp;
        const mKc = CL.solveZeroCostCall(S, mKp, T, p);
        const mPutIv = CL.volForStrike(mKp, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
        const mCallIv = CL.volForStrike(mKc, S, T, p.vol, p.rate, p.divy, p.skewOn, p.skew);
        const hl = Math.abs(fp - putPct) < 0.013 ? ' class="hl"' : '';
        mrows += `<tr${hl}><td>${(fp * 100).toFixed(0)}% · ${F.money(mKp)}</td><td>${(mPutIv * 100).toFixed(1)}</td>` +
          `<td>${(mKc / S * 100).toFixed(1)}% · ${F.money(mKc)}</td><td>${(mCallIv * 100).toFixed(1)}</td>` +
          `<td>${((mKc / S - 1) * 100).toFixed(1)} pts</td></tr>`;
      }
      mrows += '</table>';
      menuCard.innerHTML += mrows;
      skewHost.append(menuCard);
    }

    draw();
    this._redraw = draw;
  },
};
