/* Collar Pricer — market data as-of a date, a leg blotter, and the financing
   outputs of a funded collar. Every output tile is clickable and opens a full
   TRACE: the components, formulas and per-leg arithmetic behind the number,
   so any value can be validated by hand and traced back to inputs.           */
(function () {
  const { el, card } = CL.ui;

  // ---------- state ----------
  const mkt = { symbol: 'CBA.AX', date: '2026-08-01', rate: 4.0, divy: 4.5,
    spot: null, adv90: null, sd90: null, name: '', currency: '', asof: '' };
  let legs = [];        // {dir:'sell'|'buy', n, cp:'P'|'C', strike, expiry, otype, ptype, pstart}
  let legSeq = 0;
  let activeTrace = null;

  const ccy = () => mkt.currency === 'AUD' ? 'A$' : (mkt.currency === 'USD' ? 'US$' : (mkt.currency ? mkt.currency + ' ' : '$'));
  const money = (v, dp = 2) => (v < 0 ? '−' : '') + ccy() + Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const big = (v) => {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + ccy() + (a / 1e9).toFixed(3) + 'B';
    if (a >= 1e6) return s + ccy() + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + ccy() + (a / 1e3).toFixed(0) + 'k';
    return s + ccy() + a.toFixed(0);
  };
  const nfmt = (v) => v.toLocaleString('en-AU');
  const yearsBetween = (d0, d1) => (new Date(d1) - new Date(d0)) / (365.25 * 24 * 3600e3);
  const daysBetween = (d0, d1) => Math.round((new Date(d1) - new Date(d0)) / (24 * 3600e3));
  const addYears = (dateStr, y) => {
    const d = new Date(dateStr);
    d.setFullYear(d.getFullYear() + Math.floor(y));
    d.setDate(d.getDate() + Math.round((y % 1) * 365));
    return d.toISOString().slice(0, 10);
  };

  const pparams = () => ({ vol: mkt.sd90, rate: mkt.rate / 100, divy: mkt.divy / 100, skewOn: false, skew: 0 });

  // full Black-Scholes decomposition for one leg — every intermediate kept
  // so the premium trace can print the whole derivation
  function legCalc(leg) {
    if (!mkt.spot || !leg.strike || !leg.expiry) return null;
    const T = yearsBetween(mkt.date, leg.expiry);
    if (T <= 0) return null;
    const S = mkt.spot, K = leg.strike, r = mkt.rate / 100, q = mkt.divy / 100;
    // Asian averaging shrinks vol: σ_eff = σ·√(1 − (2/3)·τ/T)
    let sig = mkt.sd90, tau = null;
    if (leg.otype === 'Asian' && leg.ptype !== 'None' && leg.pstart) {
      tau = Math.max(0, Math.min(T, yearsBetween(leg.pstart, leg.expiry)));
      sig = mkt.sd90 * Math.sqrt(Math.max(0.05, 1 - (2 / 3) * (tau / T)));
    }
    const sq = sig * Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / sq;
    const d2 = d1 - sq;
    const eq = Math.exp(-q * T), er = Math.exp(-r * T);
    const Nd1 = CL.cdf(d1), Nd2 = CL.cdf(d2), Nmd1 = CL.cdf(-d1), Nmd2 = CL.cdf(-d2);
    const prem = leg.cp === 'C'
      ? S * eq * Nd1 - K * er * Nd2
      : K * er * Nmd2 - S * eq * Nmd1;
    // greeks (values from the shared engine so pricer and course agree),
    // plus the intermediates the traces print
    const g = CL.bs(leg.cp === 'C' ? 'call' : 'put', S, K, T, sig, r, q);
    const pdf1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    const rho = (leg.cp === 'C' ? K * T * er * Nd2 : -K * T * er * Nmd2) / 100;  // per 1% rate move
    return { T, S, K, r, q, sig, tau, sq, d1, d2, eq, er, Nd1, Nd2, Nmd1, Nmd2, prem,
      pdf1, delta: g.delta, gamma: g.gamma, vega: g.vega, theta: g.theta, rho };
  }
  const legName = (leg, i) => 'Leg ' + (i + 1) + ' — bank ' + (leg.dir === 'sell' ? 'sells' : 'buys') + ' ' +
    nfmt(leg.n) + ' × ' + (leg.cp === 'P' ? 'put' : 'call') + ' K ' + money(leg.strike) +
    ' exp ' + leg.expiry + ' (' + leg.otype + (leg.otype === 'Asian' && leg.ptype !== 'None' ? ' ' + leg.ptype : '') + ')';

  // ---------- layout ----------
  const app = document.getElementById('app');

  const mktCard = card('Market data');
  const mktInputs = el('div', 'mkt-inputs');
  const field = (label, id, type, value, step) => {
    const f = el('div', 'field');
    f.innerHTML = `<label>${label}</label>`;
    const inp = el('input');
    inp.type = type; inp.id = id; inp.value = value;
    if (step) inp.step = step;
    f.append(inp);
    return { root: f, inp };
  };
  const fSym = field('Stock', 'f-sym', 'text', mkt.symbol);
  const fDate = field('Start date', 'f-date', 'date', mkt.date);
  const fRate = field('Funding rate %', 'f-rate', 'number', mkt.rate, '0.05');
  const fDivy = field('Div yield %', 'f-divy', 'number', mkt.divy, '0.05');
  const btnFetch = el('button', 'btn', 'Fetch market data');
  mktInputs.append(fSym.root, fDate.root, fRate.root, fDivy.root, btnFetch);
  mktCard.append(mktInputs);
  const mktTiles = el('div');
  const mktErr = el('div', 'fetch-err');
  mktCard.append(mktTiles, mktErr);
  app.append(mktCard);

  const structCard = card('Structure = Σ option legs');
  const legsHost = el('div');
  structCard.append(legsHost);
  const btnRow = el('div');
  btnRow.style.display = 'flex'; btnRow.style.gap = '10px'; btnRow.style.marginTop = '8px';
  const btnAdd = el('button', 'btn ghost', '+ Add leg');
  const btnExample = el('button', 'btn', 'Load example — 1-tranche 1y European collar');
  btnRow.append(btnAdd, btnExample);
  structCard.append(btnRow);
  app.append(structCard);

  const outCard = card('Outputs');
  const outTiles = el('div');
  const traceHost = el('div');
  outCard.append(outTiles, traceHost);
  app.append(outCard);

  // ---------- market fetch ----------
  function renderMkt() {
    mktTiles.innerHTML = '';
    if (mkt.spot == null) {
      mktTiles.append(el('p', 'small', 'No market loaded yet — fetch to fill spot / ADV / SD.'));
      return;
    }
    mktTiles.append(CL.ui.tiles([
      { k: mkt.symbol + ' spot · ' + mkt.asof, v: money(mkt.spot) },
      { k: '90d ADV', v: CL.fmt.shares(mkt.adv90) + ' sh' },
      { k: '90d SD (annualised)', v: (mkt.sd90 * 100).toFixed(1) + '%' },
      { k: 'Rates (fund / div)', v: mkt.rate.toFixed(2) + '% / ' + mkt.divy.toFixed(2) + '%' },
    ]));
  }

  async function fetchMkt() {
    mkt.symbol = fSym.inp.value.trim().toUpperCase();
    mkt.date = fDate.inp.value;
    mktErr.textContent = '';
    btnFetch.textContent = 'Fetching…'; btnFetch.disabled = true;
    try {
      const r = await fetch('/api/hist?symbol=' + encodeURIComponent(mkt.symbol) + '&date=' + mkt.date);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      Object.assign(mkt, { spot: j.spot, adv90: j.adv90, sd90: j.sd90, name: j.name, currency: j.currency, asof: j.asof });
      renderMkt(); recompute();
    } catch (e) {
      mktErr.textContent = 'Fetch failed: ' + e.message;
    } finally {
      btnFetch.textContent = 'Fetch market data'; btnFetch.disabled = false;
    }
  }
  btnFetch.addEventListener('click', fetchMkt);
  fRate.inp.addEventListener('input', () => { mkt.rate = parseFloat(fRate.inp.value) || 0; renderMkt(); recompute(); });
  fDivy.inp.addEventListener('input', () => { mkt.divy = parseFloat(fDivy.inp.value) || 0; renderMkt(); recompute(); });

  // ---------- legs table ----------
  const OTYPES = ['European', 'American', 'Asian'];
  const PTYPES = ['None', 'Daily', 'Weekly', 'Monthly'];

  function newLeg(over) {
    return Object.assign({
      id: ++legSeq, dir: 'sell', n: 1000000, cp: 'P', strike: null,
      expiry: addYears(mkt.date, 1), otype: 'European', ptype: 'None', pstart: '',
    }, over || {});
  }

  function renderLegs() {
    legsHost.innerHTML = '';
    const t = el('table', 'legs');
    t.innerHTML = '<tr><th>Dir</th><th>Options</th><th>C/P</th><th>Strike</th>' +
      '<th>Expiry</th><th>Type</th><th>Period</th><th>Period start</th>' +
      '<th class="r">Prem/sh</th><th class="r">Leg prem</th><th></th></tr>';
    for (const leg of legs) {
      const tr = el('tr');
      const sel = (opts, val, on, cls) => {
        const s = el('select', cls || '');
        for (const o of opts) {
          const isPair = Array.isArray(o);
          const op = el('option', null, isPair ? o[1] : o);
          op.value = isPair ? o[0] : o;
          s.append(op);
        }
        s.value = val;
        s.addEventListener('change', () => { on(s.value); recompute(); });
        const td = el('td'); td.append(s); return td;
      };
      const num = (val, on, cls, step) => {
        const i = el('input', cls || ''); i.type = 'number'; i.value = val == null ? '' : val; if (step) i.step = step;
        i.addEventListener('input', () => { on(parseFloat(i.value)); recompute(); });
        const td = el('td'); td.append(i); return td;
      };
      const date = (val, on) => {
        const i = el('input', 'w-date'); i.type = 'date'; i.value = val || '';
        i.addEventListener('change', () => { on(i.value); recompute(); });
        const td = el('td'); td.append(i); return td;
      };
      tr.append(sel([['sell', 'Sell'], ['buy', 'Buy']], leg.dir, (v) => leg.dir = v, 'w-dir'));
      tr.append(num(leg.n, (v) => leg.n = v || 0, 'w-n', '100000'));
      tr.append(sel([['P', 'Put'], ['C', 'Call']], leg.cp, (v) => leg.cp = v, 'w-cp'));
      tr.append(num(leg.strike, (v) => leg.strike = v || 0, 'w-k', '0.01'));
      tr.append(date(leg.expiry, (v) => leg.expiry = v));
      tr.append(sel(OTYPES, leg.otype, (v) => leg.otype = v, 'w-type'));
      tr.append(sel(PTYPES, leg.ptype, (v) => leg.ptype = v, 'w-per'));
      tr.append(date(leg.pstart, (v) => leg.pstart = v));
      const cPrem = el('td', 'calc'); cPrem.id = 'prem-' + leg.id;
      const cLeg = el('td', 'calc'); cLeg.id = 'legprem-' + leg.id;
      tr.append(cPrem, cLeg);
      const xtd = el('td');
      const x = el('button', 'x', '✕');
      x.addEventListener('click', () => { legs = legs.filter((l) => l.id !== leg.id); renderLegs(); recompute(); });
      xtd.append(x);
      tr.append(xtd);
      t.append(tr);
    }
    if (!legs.length) legsHost.append(el('p', 'small', 'No legs yet — add one or load the example.'));
    else legsHost.append(t);
  }

  btnAdd.addEventListener('click', () => { legs.push(newLeg()); renderLegs(); recompute(); });

  btnExample.addEventListener('click', async () => {
    if (mkt.spot == null) await fetchMkt();
    if (mkt.spot == null) return;
    const p = pparams();
    const Kp = Math.round(mkt.spot * 0.90 * 100) / 100;
    const Kc = Math.round(CL.solveZeroCostCall(mkt.spot, Kp, 1, p) * 100) / 100;
    const exp = addYears(mkt.date, 1);
    legs = [
      newLeg({ dir: 'sell', n: 1000000, cp: 'P', strike: Kp, expiry: exp }),
      newLeg({ dir: 'buy', n: 1000000, cp: 'C', strike: Kc, expiry: exp }),
    ];
    renderLegs(); recompute();
  });

  // ---------- trace rendering ----------
  // a trace = { title, note, sections: [{ heading?, rows: [[component, calculation, value]] }], result: [label, value] }
  function renderTrace(key, traces) {
    traceHost.innerHTML = '';
    outTiles.querySelectorAll('.tile').forEach((tl) => tl.classList.toggle('active', tl.dataset.key === key));
    if (!key || !traces[key]) return;
    const tr = traces[key];
    const box = el('div', 'trace');
    box.append(el('p', 'trace-title', '⌕ ' + tr.title));
    if (tr.note) box.append(el('p', 'small', tr.note));
    for (const sec of tr.sections) {
      if (sec.heading) box.append(el('p', 'trace-sec', sec.heading));
      const t = el('table', 'data trace-table');
      t.innerHTML = '<tr><th>Component</th><th>Calculation</th><th class="r">Value</th></tr>' +
        sec.rows.map((r) => `<tr><td>${r[0]}</td><td class="f">${r[1]}</td><td>${r[2]}</td></tr>`).join('');
      box.append(t);
    }
    const res = el('p', 'trace-result', tr.result[0] + ' = <b>' + tr.result[1] + '</b>');
    box.append(res);
    traceHost.append(box);
  }

  // ---------- outputs + traces ----------
  function recompute() {
    let netBank = 0;
    const legRows = [];   // for the net-premium trace
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const cP = document.getElementById('prem-' + leg.id);
      const cL = document.getElementById('legprem-' + leg.id);
      const c = legCalc(leg);
      if (cP) {
        if (!c) { cP.textContent = '—'; cL.textContent = '—'; }
        else {
          const sign = leg.dir === 'sell' ? 1 : -1;    // bank sells -> collects premium
          const cash = sign * c.prem * leg.n;
          netBank += cash;
          cP.textContent = money(c.prem);
          cL.textContent = (cash >= 0 ? '+' : '−') + big(Math.abs(cash));
          cL.className = 'calc ' + (cash >= 0 ? 'pos' : 'neg');
          legRows.push({ leg, i, c, sign, cash });
        }
      }
    }

    outTiles.innerHTML = '';
    if (!mkt.spot || !legs.length) {
      traceHost.innerHTML = '';
      outTiles.append(el('p', 'small', 'Fetch market data and add legs to price.'));
      return;
    }

    const puts = legs.map((l, i) => ({ l, i, c: legCalc(l) })).filter((x) => x.l.cp === 'P' && x.l.strike > 0 && x.c);
    const collaredShares = puts.reduce((a, x) => a + x.l.n, 0);
    const notional = collaredShares * mkt.spot;
    const lendAmt = puts.reduce((a, x) => a + x.l.strike * x.l.n, 0);
    const wTen = lendAmt > 0 ? puts.reduce((a, x) => a + x.l.strike * x.l.n * x.c.T, 0) / lendAmt : 0;
    const pvLend = puts.reduce((a, x) => a + x.l.strike * x.l.n * Math.exp(-(mkt.rate / 100) * x.c.T), 0);
    const ratio = notional > 0 ? lendAmt / notional : 0;

    // ---- build the trace for every output ----
    const r4 = (v) => v.toFixed(4);
    const traces = {
      notional: {
        title: 'Collar notional — trace',
        note: 'Collared shares are defined by the PUT legs (each protected share owns one put). Notional marks them at spot.',
        sections: [
          { rows: puts.map((x) => [legName(x.l, x.i), 'options on the put leg', nfmt(x.l.n) + ' sh']) },
          { rows: [
            ['Collared shares', puts.map((x) => nfmt(x.l.n)).join(' + '), nfmt(collaredShares) + ' sh'],
            ['Spot (close ' + mkt.asof + ')', 'fetched', money(mkt.spot)],
            ['Notional', nfmt(collaredShares) + ' × ' + money(mkt.spot), big(notional)],
            ['vs liquidity', nfmt(collaredShares) + ' ÷ ' + nfmt(mkt.adv90) + ' ADV', (collaredShares / mkt.adv90).toFixed(2) + '× ADV'],
          ] },
        ],
        result: ['Collar notional', big(notional)],
      },
      lending: {
        title: 'Lending amount — trace',
        note: 'The floor value: the bank lends against what the puts guarantee the stock can be sold for.',
        sections: [
          { rows: puts.map((x) => [legName(x.l, x.i), money(x.l.strike) + ' × ' + nfmt(x.l.n), big(x.l.strike * x.l.n)]) },
          { rows: [['Sum over put legs', puts.map((x) => big(x.l.strike * x.l.n)).join(' + '), big(lendAmt)]] },
        ],
        result: ['Lending amount', big(lendAmt)],
      },
      tenor: {
        title: 'Approx avg tenor — trace',
        note: 'Weighted by each put leg\'s lending amount (strike × options), so the tenor matches what the money is actually lent against.',
        sections: [
          { rows: puts.map((x) => [legName(x.l, x.i),
            'T = ' + daysBetween(mkt.date, x.l.expiry) + 'd ÷ 365.25 = ' + r4(x.c.T) + 'y · weight ' + big(x.l.strike * x.l.n),
            r4(x.c.T) + 'y']) },
          { rows: [
            ['Σ weight × T', puts.map((x) => big(x.l.strike * x.l.n) + '×' + r4(x.c.T)).join(' + '), big(puts.reduce((a, x) => a + x.l.strike * x.l.n * x.c.T, 0))],
            ['÷ Σ weight', big(lendAmt), r4(wTen) + 'y'],
          ] },
        ],
        result: ['Approx avg tenor', wTen.toFixed(2) + 'y'],
      },
      ratio: {
        title: 'Lending ratio — trace',
        note: 'Loan-to-value against today\'s spot. For a single 90% put this is just strike ÷ spot.',
        sections: [
          { rows: [
            ['Lending amount', 'see its trace', big(lendAmt)],
            ['Collar notional', 'see its trace', big(notional)],
            ['Ratio', big(lendAmt) + ' ÷ ' + big(notional), (ratio * 100).toFixed(2) + '%'],
          ] },
        ],
        result: ['Lending ratio', (ratio * 100).toFixed(1) + '%'],
      },
      pv: {
        title: 'PV of lending — trace',
        note: 'Each put leg\'s floor value discounted from ITS expiry at the funding rate — continuous compounding, e^(−r·T).',
        sections: [
          { rows: puts.map((x) => {
            const df = Math.exp(-(mkt.rate / 100) * x.c.T);
            return [legName(x.l, x.i),
              big(x.l.strike * x.l.n) + ' × e^(−' + (mkt.rate / 100).toFixed(4) + ' × ' + r4(x.c.T) + ') = ' + big(x.l.strike * x.l.n) + ' × ' + df.toFixed(6),
              big(x.l.strike * x.l.n * df)];
          }) },
          { rows: [
            ['Sum', '', big(pvLend)],
            ['Discount haircut', big(lendAmt) + ' − ' + big(pvLend), big(lendAmt - pvLend)],
          ] },
        ],
        result: ['PV of lending', big(pvLend)],
      },
      netprem: {
        title: 'Net premium (bank) — full Black-Scholes trace per leg',
        note: 'Every leg derived from first principles: flat 90d realised vol ' + (mkt.sd90 * 100).toFixed(2) + '%, r ' + mkt.rate.toFixed(2) + '%, q ' + mkt.divy.toFixed(2) + '%, T in years on 365.25. Bank sells ⇒ collects premium (+).',
        sections: legRows.map(({ leg, i, c, sign, cash }) => ({
          heading: legName(leg, i),
          rows: [
            ['Inputs', 'S ' + money(c.S) + ' · K ' + money(c.K) + ' · T ' + r4(c.T) + 'y · σ ' + (c.sig * 100).toFixed(2) + '%' +
              (c.tau != null ? ' (Asian: σ·√(1−⅔·' + r4(c.tau) + '/' + r4(c.T) + '))' : '') + ' · r ' + (c.r * 100).toFixed(2) + '% · q ' + (c.q * 100).toFixed(2) + '%', ''],
            ['d₁', '(ln(' + r4(c.S / c.K) + ') + (r − q + σ²/2)·T) ÷ σ√T = (' + r4(Math.log(c.S / c.K)) + ' + ' + r4((c.r - c.q + 0.5 * c.sig * c.sig) * c.T) + ') ÷ ' + r4(c.sq), r4(c.d1)],
            ['d₂', 'd₁ − σ√T = ' + r4(c.d1) + ' − ' + r4(c.sq), r4(c.d2)],
            leg.cp === 'C'
              ? ['N(d₁), N(d₂)', 'standard normal CDF', r4(c.Nd1) + ', ' + r4(c.Nd2)]
              : ['N(−d₁), N(−d₂)', 'standard normal CDF', r4(c.Nmd1) + ', ' + r4(c.Nmd2)],
            ['Discounts', 'e^(−q·T) = ' + c.eq.toFixed(6) + ' · e^(−r·T) = ' + c.er.toFixed(6), ''],
            leg.cp === 'C'
              ? ['Premium /sh', 'S·e^(−qT)·N(d₁) − K·e^(−rT)·N(d₂) = ' + r4(c.S * c.eq * c.Nd1) + ' − ' + r4(c.K * c.er * c.Nd2), money(c.prem)]
              : ['Premium /sh', 'K·e^(−rT)·N(−d₂) − S·e^(−qT)·N(−d₁) = ' + r4(c.K * c.er * c.Nmd2) + ' − ' + r4(c.S * c.eq * c.Nmd1), money(c.prem)],
            ['Leg cashflow (bank)', (sign > 0 ? '+' : '−') + money(c.prem) + ' × ' + nfmt(leg.n) + ' (bank ' + (sign > 0 ? 'sells: collects' : 'buys: pays') + ')', (cash >= 0 ? '+' : '−') + big(Math.abs(cash))],
          ],
        })).concat([{ heading: 'Net across legs',
          rows: [['Σ leg cashflows', legRows.map(({ cash }) => (cash >= 0 ? '+' : '−') + big(Math.abs(cash))).join(' '), (netBank >= 0 ? '+' : '−') + big(Math.abs(netBank))]] }]),
        result: ['Net premium to the bank', (netBank >= 0 ? '+' : '−') + big(Math.abs(netBank)) +
          (Math.abs(netBank) < 0.005 * notional ? '  (≈ zero-cost)' : '')],
      },
    };

    // ---- bank-book net greeks (sell = bank SHORT the option → −greek) ----
    const r4b = (v, dp) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dp == null ? 4 : dp);
    const shSigned = (v) => (v >= 0 ? '+' : '−') + CL.fmt.shares(Math.abs(v)) + ' sh';
    const aSigned = (v) => (v >= 0 ? '+' : '−') + big(Math.abs(v));
    const gAgg = { delta: 0, gammaPct: 0, vega: 0, theta: 0, rho: 0 };
    for (const { leg, c, sign } of legRows) {
      const gs = -sign;                       // premium sign flips for risk: sold option = short greeks
      gAgg.delta += gs * c.delta * leg.n;
      gAgg.gammaPct += gs * c.gamma * leg.n * mkt.spot * 0.01;
      gAgg.vega += gs * c.vega * leg.n;
      gAgg.theta += gs * c.theta * leg.n;
      gAgg.rho += gs * c.rho * leg.n;
    }
    const gTrace = (titleKey, note, perLeg, totalStr) => ({
      title: titleKey + ' — trace',
      note: note + ' Sign convention: the bank SELLS a leg ⇒ it is short that option ⇒ its greeks enter with a minus.',
      sections: [
        { rows: legRows.map(({ leg, i, c, sign }) => { const out = perLeg(c, leg, -sign); return [legName(leg, i), out[0], out[1]]; }) },
        { rows: [['Sum across legs', '', totalStr]] },
      ],
      result: [titleKey + ' (bank book)', totalStr],
    });
    Object.assign(traces, {
      gdelta: gTrace('Net delta', 'Shares-equivalent exposure of the option book. The desk trades the opposite to run flat.',
        (c, leg, gs) => ['δ = e^(−qT)·' + (leg.cp === 'C' ? 'N(d₁)' : '(N(d₁)−1)') + ' = ' + c.eq.toFixed(4) + '×' + (leg.cp === 'C' ? c.Nd1.toFixed(4) : '(' + c.Nd1.toFixed(4) + '−1)') + ' = ' + r4b(c.delta) + ' · ' + (gs > 0 ? 'long' : 'short') + ' × ' + nfmt(leg.n), shSigned(gs * c.delta * leg.n)],
        shSigned(gAgg.delta) + '  →  hedge: ' + (gAgg.delta >= 0 ? 'sell' : 'buy') + ' ' + CL.fmt.shares(Math.abs(gAgg.delta)) + ' sh'),
      ggamma: gTrace('Net gamma (per 1% move)', 'How many shares of delta the book picks up when ' + mkt.symbol + ' moves 1%.',
        (c, leg, gs) => ['Γ = e^(−qT)·φ(d₁)/(S·σ√T) = ' + c.eq.toFixed(4) + '×' + c.pdf1.toFixed(4) + '/(' + c.S.toFixed(2) + '×' + c.sq.toFixed(4) + ') = ' + c.gamma.toFixed(6) + '/A$ · ×n×S×1%', shSigned(gs * c.gamma * leg.n * mkt.spot * 0.01)],
        shSigned(gAgg.gammaPct) + ' per 1% move'),
      gvega: gTrace('Net vega', 'A$ P&L per 1 vol-point move in the pricing vol.',
        (c, leg, gs) => ['ν = S·e^(−qT)·φ(d₁)·√T ÷ 100 = ' + (c.S * c.eq * c.pdf1 * Math.sqrt(c.T) / 100).toFixed(4) + '/sh · ' + (gs > 0 ? '+' : '−') + ' × ' + nfmt(leg.n), aSigned(gs * c.vega * leg.n) + '/vol pt'],
        aSigned(gAgg.vega) + ' per vol pt'),
      gtheta: gTrace('Net theta', 'A$ decay per calendar day; positive = the book collects rent.',
        (c, leg, gs) => ['θ/day = [−S·e^(−qT)·φ(d₁)·σ/(2√T) ' + (leg.cp === 'C' ? '− r·K·e^(−rT)·N(d₂) + q·S·e^(−qT)·N(d₁)' : '+ r·K·e^(−rT)·N(−d₂) − q·S·e^(−qT)·N(−d₁)') + '] ÷ 365 = ' + r4b(c.theta) + '/sh', aSigned(gs * c.theta * leg.n) + '/day'],
        aSigned(gAgg.theta) + ' per day'),
      grho: gTrace('Net rho', 'A$ P&L per 1% parallel move in the funding rate (option legs only — the loan itself is traced under PV of lending).',
        (c, leg, gs) => ['ρ = ' + (leg.cp === 'C' ? 'K·T·e^(−rT)·N(d₂)' : '−K·T·e^(−rT)·N(−d₂)') + ' ÷ 100 = ' + r4b(c.rho) + '/sh per 1%', aSigned(gs * c.rho * leg.n)],
        aSigned(gAgg.rho) + ' per 1% rates'),
    });

    // ---- output tiles (clickable) ----
    const tileDefs = [
      { key: 'notional', k: 'Collar notional', v: big(notional), d: CL.fmt.shares(collaredShares) + ' sh × spot · ' + (mkt.adv90 ? (collaredShares / mkt.adv90).toFixed(1) + '× ADV' : '') },
      { key: 'lending', k: 'Lending amount', v: big(lendAmt), d: 'Σ put strike × options' },
      { key: 'tenor', k: 'Approx avg tenor', v: wTen.toFixed(2) + 'y', d: 'lending-weighted, put legs' },
      { key: 'ratio', k: 'Lending ratio', v: (ratio * 100).toFixed(1) + '%', d: 'lending ÷ notional' },
      { key: 'pv', k: 'PV of lending', v: big(pvLend), d: 'e^(−rT) per leg · haircut ' + big(lendAmt - pvLend) },
      { key: 'netprem', k: 'Net premium (bank)', v: (netBank >= 0 ? '+' : '−') + big(Math.abs(netBank)), cls: netBank >= 0 ? 'pos' : 'neg', d: netBank >= 0 ? 'bank collects' : 'bank pays' },
    ];
    const greekDefs = [
      { key: 'gdelta', k: 'Net delta', v: shSigned(gAgg.delta), d: 'hedge: ' + (gAgg.delta >= 0 ? 'sell' : 'buy') + ' ' + CL.fmt.shares(Math.abs(gAgg.delta)) + ' sh' },
      { key: 'ggamma', k: 'Net gamma / 1%', v: shSigned(gAgg.gammaPct), d: 'delta picked up per 1% move' },
      { key: 'gvega', k: 'Net vega', v: aSigned(gAgg.vega), cls: gAgg.vega >= 0 ? 'pos' : 'neg', d: 'per vol pt' },
      { key: 'gtheta', k: 'Net theta', v: aSigned(gAgg.theta), cls: gAgg.theta >= 0 ? 'pos' : 'neg', d: 'per day' },
      { key: 'grho', k: 'Net rho', v: aSigned(gAgg.rho), cls: gAgg.rho >= 0 ? 'pos' : 'neg', d: 'per 1% rates (options only)' },
    ];
    const buildRow = (defs) => {
      const row = el('div', 'tiles');
      for (const td of defs) {
        const tile = el('div', 'tile clickable');
        tile.dataset.key = td.key;
        tile.append(el('div', 'k', td.k));
        tile.append(el('div', 'v' + (td.cls ? ' ' + td.cls : ''), td.v));
        tile.addEventListener('click', () => {
          activeTrace = activeTrace === td.key ? null : td.key;
          recompute();
        });
        row.append(tile);
      }
      return row;
    };
    outTiles.append(buildRow(tileDefs));
    outTiles.append(el('p', 'trace-sec', 'Greeks — bank\'s book'));
    outTiles.append(buildRow(greekDefs));
    renderTrace(activeTrace, traces);
  }

  // ---------- boot ----------
  renderMkt();
  renderLegs();
  recompute();
})();
