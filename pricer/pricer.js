/* Collar Pricer — market data as-of a date, a leg blotter, and the financing
   outputs of a funded collar (notional, lending vs the floor, tenor, PV).     */
(function () {
  const { el, tiles, card, callout } = CL.ui;

  // ---------- state ----------
  const mkt = { symbol: 'CBA.AX', date: '2026-08-01', rate: 4.0, divy: 4.5,
    spot: null, adv90: null, sd90: null, name: '', currency: '', asof: '' };
  let legs = [];        // {dir:'sell'|'buy', n, cp:'P'|'C', strike, expiry, otype, ptype, pstart}
  let legSeq = 0;

  const ccy = () => mkt.currency === 'AUD' ? 'A$' : (mkt.currency === 'USD' ? 'US$' : (mkt.currency ? mkt.currency + ' ' : '$'));
  const money = (v, dp = 2) => (v < 0 ? '−' : '') + ccy() + Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const big = (v) => {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + ccy() + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + ccy() + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + ccy() + (a / 1e3).toFixed(0) + 'k';
    return s + ccy() + a.toFixed(0);
  };
  const yearsBetween = (d0, d1) => (new Date(d1) - new Date(d0)) / (365.25 * 24 * 3600e3);
  const addYears = (dateStr, y) => {
    const d = new Date(dateStr);
    d.setFullYear(d.getFullYear() + Math.floor(y));
    d.setDate(d.getDate() + Math.round((y % 1) * 365));
    return d.toISOString().slice(0, 10);
  };

  // pricing params off the fetched market (flat vol, no smile)
  const pparams = () => ({ vol: mkt.sd90, rate: mkt.rate / 100, divy: mkt.divy / 100, skewOn: false, skew: 0 });

  // effective vol for an Asian leg: averaging over the final tau of life T
  // shrinks variance by (T − τ + τ/3)/T  →  σ_eff = σ·√(1 − (2/3)·τ/T)
  function legVol(leg, T) {
    if (leg.otype !== 'Asian' || leg.ptype === 'None' || !leg.pstart) return mkt.sd90;
    let tau = yearsBetween(leg.pstart, leg.expiry);
    tau = Math.max(0, Math.min(T, tau));
    return mkt.sd90 * Math.sqrt(Math.max(0.05, 1 - (2 / 3) * (tau / T)));
  }

  function priceLeg(leg) {
    if (!mkt.spot || !leg.strike || !leg.expiry) return null;
    const T = yearsBetween(mkt.date, leg.expiry);
    if (T <= 0) return null;
    const sig = legVol(leg, T);
    const p = pparams();
    const prem = CL.bs(leg.cp === 'P' ? 'put' : 'call', mkt.spot, leg.strike, T, sig, p.rate, p.divy).price;
    return { T, sig, prem };
  }

  // ---------- layout ----------
  const app = document.getElementById('app');

  const mktCard = card('Market data', 'Spot, 90-day ADV and 90-day realised SD, as of the start date.');
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

  const structCard = card('Structure = Σ option legs',
    'Bank direction is the desk\'s side: Sell = the bank writes the option to the client (collects premium), Buy = the bank takes it in. Premium column is per share; leg premium is the bank\'s cashflow.');
  const legsWrap = el('div', 'legs-wrap');
  const legsHost = el('div');
  legsWrap.append(legsHost);
  structCard.append(legsWrap);
  const btnRow = el('div');
  btnRow.style.display = 'flex'; btnRow.style.gap = '10px'; btnRow.style.marginTop = '8px';
  const btnAdd = el('button', 'btn ghost', '+ Add leg');
  const btnExample = el('button', 'btn', 'Load example — 1-tranche 1y European collar');
  btnRow.append(btnAdd, btnExample);
  structCard.append(btnRow);
  app.append(structCard);

  const outCard = card('Outputs', 'Collar notional and the financing read: lending is sized on the put legs (the floor the bank can lend against).');
  const outTiles = el('div');
  outCard.append(outTiles);
  const outNote = el('div');
  outCard.append(outNote);
  app.append(outCard);

  // ---------- market fetch ----------
  function renderMkt() {
    mktTiles.innerHTML = '';
    if (mkt.spot == null) {
      mktTiles.append(el('p', 'small', 'No market loaded yet — fetch to fill spot / ADV / SD.'));
      return;
    }
    mktTiles.append(tiles([
      { k: mkt.symbol + ' spot', v: money(mkt.spot), d: mkt.name + ' · close ' + mkt.asof },
      { k: '90d ADV', v: CL.fmt.shares(mkt.adv90) + ' sh', d: '≈ ' + big(mkt.adv90 * mkt.spot) + '/day' },
      { k: '90d SD (annualised)', v: (mkt.sd90 * 100).toFixed(1) + '%', d: 'pricing vol — flat, no smile' },
      { k: 'Rates used', v: mkt.rate.toFixed(2) + '% / ' + mkt.divy.toFixed(2) + '%', d: 'funding / dividend yield' },
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
    t.innerHTML = '<tr><th>Bank direction</th><th>No of options</th><th>C/P</th><th>Strike</th>' +
      '<th>Expiration</th><th>Option type</th><th>Asian / tranche period</th><th>Period start</th>' +
      '<th style="text-align:right">Premium /sh</th><th style="text-align:right">Leg premium (bank)</th><th></th></tr>';
    for (const leg of legs) {
      const tr = el('tr');
      const sel = (opts, val, on) => {
        const s = el('select');
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
      const num = (val, on, step) => {
        const i = el('input'); i.type = 'number'; i.value = val == null ? '' : val; if (step) i.step = step;
        i.addEventListener('input', () => { on(parseFloat(i.value)); recompute(); });
        const td = el('td'); td.append(i); return td;
      };
      const date = (val, on) => {
        const i = el('input'); i.type = 'date'; i.value = val || '';
        i.addEventListener('change', () => { on(i.value); recompute(); });
        const td = el('td'); td.append(i); return td;
      };
      tr.append(sel([['sell', 'Bank sells'], ['buy', 'Bank buys']], leg.dir, (v) => leg.dir = v));
      tr.append(num(leg.n, (v) => leg.n = v || 0, '100000'));
      tr.append(sel([['P', 'Put'], ['C', 'Call']], leg.cp, (v) => leg.cp = v));
      tr.append(num(leg.strike, (v) => leg.strike = v || 0, '0.01'));
      tr.append(date(leg.expiry, (v) => leg.expiry = v));
      tr.append(sel(OTYPES, leg.otype, (v) => leg.otype = v));
      tr.append(sel(PTYPES, leg.ptype, (v) => leg.ptype = v));
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
      newLeg({ dir: 'sell', n: 1000000, cp: 'P', strike: Kp, expiry: exp }),   // bank writes the floor
      newLeg({ dir: 'buy', n: 1000000, cp: 'C', strike: Kc, expiry: exp }),    // bank takes the cap in
    ];
    renderLegs(); recompute();
  });

  // ---------- outputs ----------
  function recompute() {
    // per-leg premiums
    let netBank = 0;
    for (const leg of legs) {
      const cP = document.getElementById('prem-' + leg.id);
      const cL = document.getElementById('legprem-' + leg.id);
      const r = priceLeg(leg);
      if (!cP) continue;
      if (!r) { cP.textContent = '—'; cL.textContent = '—'; continue; }
      const sign = leg.dir === 'sell' ? 1 : -1;      // bank receives premium on options it writes...
      // NB: bank SELLS an option -> client pays premium -> bank RECEIVES (+)
      const cash = sign * r.prem * leg.n;
      netBank += cash;
      cP.textContent = money(r.prem) + (leg.otype === 'Asian' && leg.ptype !== 'None' ? ' @' + (r.sig * 100).toFixed(1) + 'v' : '');
      cL.textContent = (cash >= 0 ? '+' : '−') + big(Math.abs(cash));
      cL.className = 'calc ' + (cash >= 0 ? 'pos' : 'neg');
    }

    outTiles.innerHTML = '';
    outNote.innerHTML = '';
    if (!mkt.spot || !legs.length) {
      outTiles.append(el('p', 'small', 'Fetch market data and add legs to price.'));
      return;
    }
    const puts = legs.filter((l) => l.cp === 'P' && l.strike > 0 && priceLeg(l));
    const collaredShares = puts.reduce((a, l) => a + l.n, 0);
    const notional = collaredShares * mkt.spot;
    const lendAmt = puts.reduce((a, l) => a + l.strike * l.n, 0);
    const wTen = lendAmt > 0 ? puts.reduce((a, l) => a + l.strike * l.n * priceLeg(l).T, 0) / lendAmt : 0;
    const pvLend = puts.reduce((a, l) => a + l.strike * l.n * Math.exp(-(mkt.rate / 100) * priceLeg(l).T), 0);
    const ratio = notional > 0 ? lendAmt / notional : 0;

    outTiles.append(tiles([
      { k: 'Collar notional', v: big(notional), d: CL.fmt.shares(collaredShares) + ' sh × spot · ' + (mkt.adv90 ? (collaredShares / mkt.adv90).toFixed(1) + '× ADV' : '') },
      { k: 'Lending amount', v: big(lendAmt), d: 'Σ put strike × options — the floor value' },
      { k: 'Approx avg tenor', v: wTen.toFixed(2) + 'y', d: 'lending-weighted across put legs' },
      { k: 'Lending ratio', v: (ratio * 100).toFixed(1) + '%', d: 'lending ÷ notional (LVR vs spot)' },
      { k: 'PV of lending', v: big(pvLend), d: 'per-leg discount at ' + mkt.rate.toFixed(2) + '% · haircut ' + big(lendAmt - pvLend) },
      { k: 'Net premium (bank)', v: (netBank >= 0 ? '+' : '−') + big(Math.abs(netBank)), cls: netBank >= 0 ? 'pos' : 'neg', d: netBank >= 0 ? 'bank collects — client pays' : 'bank pays — client collects' },
    ]));
    if (Math.abs(netBank) < 0.005 * notional && netBank !== 0) {
      outNote.append(el('p', 'small', 'Net premium is within half a percent of notional — effectively a zero-cost structure.'));
    }
    if (legs.some((l) => l.otype === 'American')) {
      outNote.append(el('p', 'small', 'American legs are priced European here (no early-exercise premium) — see the course\'s early-exercise radar for when that matters.'));
    }
  }

  // ---------- boot ----------
  renderMkt();
  renderLegs();
  recompute();
})();
