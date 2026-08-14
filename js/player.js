/* Scenario player — the shared animation engine for every tab's "scenario
   theatre". Mount one player per scenario; hitting play advances day-by-day,
   updating a payoff chart dot, a progressive path chart, live tiles, and a
   milestone-driven narration box.

   USAGE (the canonical pattern every tab follows):

     const scenario = {
       name: 'Long call — finishes above the strike',
       days: 126,
       spotPath: [...],                    // length days+1
       volPath: [...],                     // optional; defaults to flat CL.state.vol
       legs: [{ type: 'call', K: 178, qty: 1 }],
       stockQty: 0,                        // 1 to include a stock leg
       xMin, xMax,                         // optional payoff x-domain
       milestones: [
         { day: 0, title: 'Inception', text: 'You pay A$6.90 premium…' },
         { cond: (st) => st.S > 178, once: true, pause: true,
           title: 'Through the strike', text: 'The call is now in the money…' },
         { day: 126, title: 'Expiry', text: (st) => 'Finished at ' + st.S.toFixed(0) + '…' },
       ],
       readouts: (st) => [                 // optional extra tiles; P&L tiles are automatic
         { k: 'Delta', v: CL.fmt.sign(st.greeks.delta) },
       ],
     };
     CL.player.mount(hostElement, scenario);

   st (state) passed to conds/texts/readouts:
     { t, S, iv, T, greeks (net incl. stock), pl, plStock, plOpt, prem0 }

   For fully custom visuals (e.g. bank flows), pass:
     custom: { build(host) -> ctx, frame(ctx, st) }   — replaces the default charts.
   Mount returns { destroy() } — tabs MUST call destroy on re-render (or replace
   the host's innerHTML, which stops the loop via the disconnected check).      */
window.CL = window.CL || {};
(function () {
  const { el } = CL.ui;

  function mount(host, cfg) {
    host.innerHTML = '';
    const days = cfg.days;
    const spot = cfg.spotPath;
    const vol = cfg.volPath || spot.map(() => CL.state.vol);
    const legs = cfg.legs || [];
    const stockQty = cfg.stockQty || 0;
    const p0 = Object.assign({}, CL.state, { vol: vol[0] });

    const value = (t) => {
      const T = Math.max(0, (days - t) / 252);
      const pv = Object.assign({}, CL.state, { vol: vol[Math.round(t)] });
      return CL.structGreeks(legs, 0, spot[Math.round(t)], T <= 0 ? 0 : T, pv);
    };
    const prem0 = value(0).price;

    // ---------- state ----------
    let t = 0, playing = false, speed = 6, raf = null, last = null, frameN = 0;
    const fired = new Set();

    // ---------- controls ----------
    const bar = el('div', 'player-bar');
    const btnPlay = el('button', 'btn', '▶ Play');
    const btnRestart = el('button', 'btn ghost', '↺');
    const speedSeg = CL.ui.segmented({
      options: [{ id: '6', label: '1×' }, { id: '12', label: '2×' }, { id: '24', label: '4×' }],
      value: '6', onChange: (v) => { speed = parseInt(v, 10); },
    });
    const scrub = el('input');
    scrub.type = 'range'; scrub.min = 0; scrub.max = days; scrub.step = 1; scrub.value = 0;
    const dayLab = el('span', 'day mono', 'Day 0/' + days);
    bar.append(btnPlay, btnRestart, speedSeg.root, scrub, dayLab);
    host.append(bar);

    // ---------- narration + milestones ----------
    const narrate = el('div', 'narrate player-narrate');
    const phaseEl = el('span', 'phase', '');
    const pausedTag = el('span', 'paused-tag', '<span class="pdot"></span>paused — key moment');
    pausedTag.style.display = 'none';
    const textEl = el('p', null, '');
    const contBtn = el('button', 'btn continue-btn', 'Continue ▶');
    contBtn.style.display = 'none';
    narrate.append(phaseEl, pausedTag, textEl, contBtn);
    host.append(narrate);
    function setPausedMoment(v, withBtn) {
      narrate.classList.toggle('paused-moment', v);
      pausedTag.style.display = v ? 'inline-flex' : 'none';
      contBtn.style.display = (v && withBtn !== false) ? 'inline-block' : 'none';
    }
    contBtn.addEventListener('click', () => setPlaying(true));
    const msRow = el('div', 'milestone-row');
    const msDots = (cfg.milestones || []).map((m) => {
      const d = el('span', 'ms-dot', '<span class="tick">●</span>' + (m.title || ''));
      msRow.append(d);
      return d;
    });
    if (msDots.length) host.append(msRow);

    // ---------- charts ----------
    let ctx = null;
    const chartHost = el('div');
    host.append(chartHost);
    const tileHost = el('div');
    host.append(tileHost);

    function stateAt(tt) {
      const ti = Math.round(tt);
      const g = value(ti);
      const gNet = Object.assign({}, g, { delta: g.delta + stockQty });
      const plOpt = g.price - prem0;
      const plStock = stockQty * (spot[ti] - spot[0]);
      return { t: ti, S: spot[ti], iv: vol[ti], T: Math.max(0, (days - ti) / 252), greeks: gNet, pl: plOpt + plStock, plStock, plOpt, prem0 };
    }

    function buildDefault() {
      chartHost.innerHTML = '';
      const grid = el('div', 'grid2');
      const payCard = CL.ui.card('Where you are on the payoff', 'Dot = spot today on the expiry P&L line.');
      const pathCard = CL.ui.card('The tape', 'Spot so far; strikes dashed.');
      grid.append(payCard, pathCard);
      chartHost.append(grid);

      // static payoff chart
      const S0 = spot[0];
      const xMin = cfg.xMin || Math.min(...spot, ...legs.map((l) => l.K)) * 0.92;
      const xMax = cfg.xMax || Math.max(...spot, ...legs.map((l) => l.K)) * 1.08;
      const xs = [], net = [];
      for (let x = xMin; x <= xMax; x += (xMax - xMin) / 160) {
        xs.push(x);
        let v = stockQty * (x - S0);
        for (const leg of legs) {
          const prem = CL.legGreeks({ type: leg.type, K: leg.K, qty: 1 }, S0, days / 252, p0).price;
          const intr = leg.type === 'put' ? Math.max(leg.K - x, 0) : Math.max(x - leg.K, 0);
          v += leg.qty * (intr - prem);
        }
        net.push(v);
      }
      const payBox = CL.charts.lineChart(payCard, {
        height: 240,
        series: [{ name: 'P&L at expiry', color: 'var(--s1)', x: xs, y: net, width: 2.6, area: true }],
        xLabel: 'spot at expiry (A$)', yLabel: 'A$/share',
        xFmt: (v) => v.toFixed(0), yFmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0),
        refX: legs.map((l) => ({ v: l.K, label: (l.qty > 0 ? '+' : '−') + l.type + ' ' + l.K.toFixed(0), color: l.type === 'put' ? 'var(--s2)' : 'var(--s3)' })),
        legend: false, hover: false,
        marker: { x: spot[0], y: net[0], color: 'var(--s4)' },
      });
      const marker = payBox.querySelectorAll('circle');
      const dot = marker[marker.length - 1];
      const payX = (v) => 64 + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * (720 - 64 - 14);
      const yLo = Math.min(...net), yHi = Math.max(...net);
      const pad = (yHi - yLo) * 0.07 || 1;
      const payY = (v) => 10 + (1 - (v - (yLo - pad)) / ((yHi + pad) - (yLo - pad))) * (240 - 10 - 34);
      const netAt = (S) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - S); if (d < bd) { bd = d; best = i; } }
        return net[best];
      };
      return {
        pathCard,
        frame(st) {
          dot.setAttribute('cx', payX(Math.max(xs[0], Math.min(xs[xs.length - 1], st.S))));
          dot.setAttribute('cy', payY(netAt(st.S)));
          if (frameN % 3 === 0 || !playing) {
            pathCard.querySelectorAll('.chart-box').forEach((n) => n.remove());
            const px = [], py = [];
            for (let i = 0; i <= st.t; i++) { px.push(i); py.push(spot[i]); }
            CL.charts.lineChart(pathCard, {
              height: 240,
              series: [{ name: 'CBA', color: 'var(--s1)', x: px, y: py, width: 2.2 }],
              xLabel: 'day', yLabel: 'A$',
              xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
              xMin: 0, xMax: days,
              yMin: Math.min(...spot) * 0.98, yMax: Math.max(...spot) * 1.02,
              refY: legs.map((l) => ({ v: l.K, label: l.type + ' ' + l.K.toFixed(0), color: l.type === 'put' ? 'var(--s2)' : 'var(--s3)', dash: '3 3' })),
              legend: false, hover: false,
              marker: { x: st.t, y: st.S, color: 'var(--s4)' },
            });
          }
        },
      };
    }

    function renderTiles(st) {
      tileHost.innerHTML = '';
      const base = [
        { k: 'Spot', v: CL.fmt.money(st.S), d: CL.fmt.pct(st.S / spot[0] - 1) + ' vs day 0' },
        { k: 'P&L / share', v: CL.fmt.sign(st.pl), cls: st.pl >= 0 ? 'pos' : 'neg', d: stockQty ? 'stock ' + CL.fmt.sign(st.plStock) + ' · options ' + CL.fmt.sign(st.plOpt) : 'options only' },
      ];
      const extra = cfg.readouts ? cfg.readouts(st) : [];
      tileHost.append(CL.ui.tiles(base.concat(extra)));
    }

    function checkMilestones(st) {
      const ms = cfg.milestones || [];
      let snapped = null;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (fired.has(i)) continue;
        const hit = (m.day != null && st.t >= m.day) || (m.cond && m.cond(st));
        if (!hit) continue;
        fired.add(i);
        msDots[i] && msDots[i].classList.add('hit');
        // day-based milestones narrate their NOMINAL day, so a throttled frame
        // that jumps past the day still shows the numbers the text describes
        const stM = (m.day != null && st.t > m.day) ? stateAt(m.day) : st;
        phaseEl.textContent = m.title || '';
        textEl.innerHTML = typeof m.text === 'function' ? m.text(stM) : (m.text || '');
        if (m.pause) {
          if (playing) {
            // snap the whole frame back to the milestone's nominal day, so the
            // tiles/charts the narration points at show the day it teaches
            if (m.day != null && st.t > m.day) { t = m.day; snapped = m.day; }
            setPlaying(false);
            setPausedMoment(true, true);
            break;   // don't let a later milestone overwrite the pause lesson this frame
          } else if (st.t >= days) {
            setPausedMoment(true, false);   // expiry: highlight the moment, no Continue
          }
        }
      }
      return snapped;
    }

    function frame(st) {
      // milestones first: a pause here sets playing=false, which forces the
      // tile/chart render below — narration and tiles stay in sync at pauses.
      // A day-based pause may snap t back to its nominal day; re-derive state.
      const snapped = checkMilestones(st);
      if (snapped != null) st = stateAt(snapped);
      if (ctx && cfg.custom) cfg.custom.frame(ctx, st);
      else if (ctx) ctx.frame(st);
      if (frameN % 3 === 0 || !playing) renderTiles(st);
      dayLab.textContent = 'Day ' + st.t + '/' + days;
      scrub.value = st.t;
      frameN++;
    }

    let backstop = null;
    function setPlaying(v) {
      playing = v;
      btnPlay.innerHTML = v ? '⏸ Pause' : '▶ Play';
      if (v) {
        setPausedMoment(false);
        last = null;
        raf = requestAnimationFrame(tick);
        // occluded/background windows suspend rAF entirely — a timer keeps the
        // clock honest (itself throttled to ~1Hz back there, which is fine)
        backstop = setInterval(() => {
          if (!playing) return;
          const now = performance.now();
          if (last != null && now - last < 400) return;   // rAF is healthy
          tick(now);
        }, 500);
      } else {
        if (raf) cancelAnimationFrame(raf);
        if (backstop) { clearInterval(backstop); backstop = null; }
      }
    }
    function tick(ts) {
      if (!playing) return;
      if (!host.isConnected) { setPlaying(false); return; }   // tab re-rendered
      if (last == null) last = ts;
      // wall-clock accrual (clamped to 1s) so throttled rAF — background or
      // automated windows — still advances the clock correctly
      const dt = Math.min(1.0, (ts - last) / 1000);
      last = ts;
      t = Math.min(days, t + speed * dt);
      if (t >= days) {
        setPlaying(false);        // stop FIRST so the final frame force-renders
        frame(stateAt(days));     // tiles, tape and narration all land on expiry
        return;
      }
      frame(stateAt(t));
      raf = requestAnimationFrame(tick);
    }

    btnPlay.addEventListener('click', () => {
      if (!playing && t >= days) { t = 0; fired.clear(); msDots.forEach((d) => d.classList.remove('hit')); }
      setPlaying(!playing);
    });
    btnRestart.addEventListener('click', () => {
      setPlaying(false); setPausedMoment(false); t = 0; fired.clear();
      msDots.forEach((d) => d.classList.remove('hit'));
      phaseEl.textContent = ''; textEl.innerHTML = '';
      frame(stateAt(0));
    });
    scrub.addEventListener('input', () => {
      setPlaying(false); setPausedMoment(false);
      t = parseInt(scrub.value, 10);
      // resync narration to the scrubbed day: day-based milestones up to t
      // re-fire (latest wins), everything later resets so dots tell the truth
      fired.clear();
      msDots.forEach((d) => d.classList.remove('hit'));
      phaseEl.textContent = ''; textEl.innerHTML = '';
      (cfg.milestones || []).forEach((m, i) => {
        if (m.day == null || m.day > t) return;
        fired.add(i);
        msDots[i] && msDots[i].classList.add('hit');
        const stM = stateAt(m.day);
        phaseEl.textContent = m.title || '';
        textEl.innerHTML = typeof m.text === 'function' ? m.text(stM) : (m.text || '');
      });
      frame(stateAt(t));
    });

    // build + first frame
    if (cfg.custom) ctx = cfg.custom.build(chartHost);
    else ctx = buildDefault();
    frame(stateAt(0));

    return { destroy() { setPlaying(false); host.innerHTML = ''; } };
  }

  CL.player = { mount };
})();
