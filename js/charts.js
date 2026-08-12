/* SVG chart library: line chart (crosshair + tooltip), bar chart, histogram.
   Reads theme via CSS custom properties; all colors passed as var() strings.  */
window.CL = window.CL || {};
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  };

  function niceTicks(min, max, n) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 10 : norm >= 2.2 ? 5 : norm >= 1.2 ? 2 : 1) * mag;
    const lo = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = lo; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return ticks;
  }

  const defFmt = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return +v.toFixed(2) + '';
    if (a === 0) return '0';
    return +v.toFixed(3) + '';
  };

  /* lineChart(container, opts)
     opts = {
       height, series: [{name, color, x[], y[], dash, width, area}],
       xLabel, yLabel, xFmt, yFmt, xMin, xMax, yMin, yMax,
       refX: [{v, label, color, dash}], refY: [...], marker: {x, y, color},
       legend (default auto: >=2 series), hover (default true), zeroLine (default true)
     }                                                                        */
  function lineChart(container, opts) {
    const W = 720, H = opts.height || 300;
    const m = { l: 64, r: 14, t: 10, b: 34 };
    const box = CL.ui.el('div', 'chart-box');
    container.append(box);

    const series = opts.series.filter((s) => s.x.length);
    let xMin = opts.xMin, xMax = opts.xMax, yMin = opts.yMin, yMax = opts.yMax;
    if (xMin == null) xMin = Math.min(...series.map((s) => Math.min(...s.x)));
    if (xMax == null) xMax = Math.max(...series.map((s) => Math.max(...s.x)));
    if (yMin == null) yMin = Math.min(...series.map((s) => Math.min(...s.y)));
    if (yMax == null) yMax = Math.max(...series.map((s) => Math.max(...s.y)));
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const pad = (yMax - yMin) * 0.07;
    if (opts.yMin == null) yMin -= pad;
    if (opts.yMax == null) yMax += pad;

    const X = (v) => m.l + ((v - xMin) / (xMax - xMin)) * (W - m.l - m.r);
    const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}` });
    box.append(svg);

    // grid + y ticks
    const yTicks = niceTicks(yMin, yMax, 5);
    const yFmt = opts.yFmt || defFmt;
    for (const t of yTicks) {
      svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
      const lb = sv('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = yFmt(t);
      svg.append(lb);
    }
    // zero line emphasis
    if (opts.zeroLine !== false && yMin < 0 && yMax > 0) {
      svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: 'var(--baseline)', 'stroke-width': 1.4 }));
    }
    // x ticks
    const xTicks = niceTicks(xMin, xMax, 6);
    const xFmt = opts.xFmt || defFmt;
    for (const t of xTicks) {
      const lb = sv('text', { x: X(t), y: H - m.b + 18, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = xFmt(t);
      svg.append(lb);
    }
    // axis baseline
    svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'var(--baseline)', 'stroke-width': 1 }));
    // axis labels
    if (opts.xLabel) {
      const lb = sv('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = opts.xLabel;
      svg.append(lb);
    }
    if (opts.yLabel) {
      const lb = sv('text', { x: 12, y: m.t + 2, transform: `rotate(-90 12 ${m.t + 2})`, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = opts.yLabel;
      svg.append(lb);
    }

    // reference lines — stagger labels vertically when lines sit close together
    let lastLabX = -Infinity, labLevel = 0;
    const refXs = (opts.refX || []).filter((r) => r.v >= xMin && r.v <= xMax).sort((a, b) => a.v - b.v);
    for (const r of refXs) {
      svg.append(sv('line', { x1: X(r.v), x2: X(r.v), y1: m.t, y2: H - m.b, stroke: r.color || 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': r.dash || '4 4', opacity: 0.85 }));
      if (r.label) {
        const atRightEdge = X(r.v) > W - m.r - 8 - r.label.length * 6.3;
        labLevel = (X(r.v) - lastLabX < 64) ? labLevel + 1 : 0;
        const lb = sv('text', {
          x: atRightEdge ? X(r.v) - 4 : X(r.v) + 4,
          y: m.t + 11 + labLevel * 13,
          'text-anchor': atRightEdge ? 'end' : 'start',
          fill: r.color || 'var(--muted)', 'font-size': 10.5, 'font-weight': 600,
        });
        lb.textContent = r.label;
        svg.append(lb);
        lastLabX = X(r.v) + 4 + r.label.length * 6;
      }
    }
    for (const r of opts.refY || []) {
      if (r.v < yMin || r.v > yMax) continue;
      svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(r.v), y2: Y(r.v), stroke: r.color || 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': r.dash || '4 4', opacity: 0.85 }));
      if (r.label) {
        const ly = Math.max(Y(r.v) - 4, m.t + 10);
        const lb = sv('text', { x: W - m.r - 4, y: ly, 'text-anchor': 'end', fill: r.color || 'var(--muted)', 'font-size': 10.5, 'font-weight': 600 });
        lb.textContent = r.label;
        svg.append(lb);
      }
    }

    // series
    for (const s of series) {
      const pts = s.x.map((x, i) => `${X(x).toFixed(1)},${Y(Math.max(yMin, Math.min(yMax, s.y[i]))).toFixed(1)}`);
      if (s.area) {
        const d = `M ${X(s.x[0]).toFixed(1)},${Y(Math.max(yMin, Math.min(yMax, 0))).toFixed(1)} L ${pts.join(' L ')} L ${X(s.x[s.x.length - 1]).toFixed(1)},${Y(Math.max(yMin, Math.min(yMax, 0))).toFixed(1)} Z`;
        svg.append(sv('path', { d, fill: s.color, opacity: 0.12 }));
      }
      svg.append(sv('path', {
        d: 'M ' + pts.join(' L '),
        fill: 'none', stroke: s.color, 'stroke-width': s.width || 2,
        'stroke-dasharray': s.dash || 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
    }

    // marker dot
    if (opts.marker) {
      svg.append(sv('circle', { cx: X(opts.marker.x), cy: Y(opts.marker.y), r: 5, fill: opts.marker.color || 'var(--s1)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    }

    // legend (always for >= 2 series)
    if (opts.legend !== false && series.length >= 2) {
      const lg = CL.ui.el('div', 'legend');
      for (const s of series) {
        const li = CL.ui.el('span', 'li');
        const sw = CL.ui.el('span', 'swatch' + (s.dash ? ' dashed' : ''));
        if (s.dash) sw.style.color = s.color; else sw.style.background = s.color;
        li.append(sw, document.createTextNode(s.name));
        lg.append(li);
      }
      box.append(lg);
    }

    // hover crosshair + tooltip
    if (opts.hover !== false) {
      const tip = CL.ui.el('div', 'viz-tooltip');
      box.append(tip);
      const cross = sv('line', { y1: m.t, y2: H - m.b, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '2 3', visibility: 'hidden' });
      svg.append(cross);
      const dots = series.map((s) => {
        const d = sv('circle', { r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 1.5, visibility: 'hidden' });
        svg.append(d);
        return d;
      });
      svg.addEventListener('mousemove', (ev) => {
        const rect = svg.getBoundingClientRect();
        const px = ((ev.clientX - rect.left) / rect.width) * W;
        if (px < m.l || px > W - m.r) { hide(); return; }
        const xv = xMin + ((px - m.l) / (W - m.l - m.r)) * (xMax - xMin);
        cross.setAttribute('x1', X(xv)); cross.setAttribute('x2', X(xv));
        cross.setAttribute('visibility', 'visible');
        let rows = `<div class="tt-x">${(opts.xFmt || defFmt)(xv)}${opts.xLabel ? ' ' + opts.xLabel : ''}</div>`;
        series.forEach((s, si) => {
          // nearest index
          let bi = 0, bd = Infinity;
          for (let i = 0; i < s.x.length; i++) { const d = Math.abs(s.x[i] - xv); if (d < bd) { bd = d; bi = i; } }
          const yv = s.y[bi];
          dots[si].setAttribute('cx', X(s.x[bi]));
          dots[si].setAttribute('cy', Y(Math.max(yMin, Math.min(yMax, yv))));
          dots[si].setAttribute('visibility', 'visible');
          rows += `<div class="row"><span class="name"><span class="dot" style="background:${s.color}"></span>${s.name}</span><span class="val">${(opts.yFmt || defFmt)(yv)}</span></div>`;
        });
        tip.innerHTML = rows;
        tip.style.display = 'block';
        const bw = box.clientWidth;
        const leftPx = (X(xv) / W) * bw;
        tip.style.left = (leftPx > bw - 180 ? leftPx - 165 : leftPx + 14) + 'px';
        tip.style.top = '12px';
      });
      const hide = () => {
        cross.setAttribute('visibility', 'hidden');
        dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
        tip.style.display = 'none';
      };
      svg.addEventListener('mouseleave', hide);
    }
    return box;
  }

  /* barChart(container, {labels[], values[], height, color | colorFn(v,i), yFmt, xLabel, yLabel, refY}) */
  function barChart(container, opts) {
    const W = 720, H = opts.height || 260;
    const m = { l: 64, r: 14, t: 10, b: 34 };
    const box = CL.ui.el('div', 'chart-box');
    container.append(box);
    const vals = opts.values;
    let yMin = Math.min(0, ...vals), yMax = Math.max(0, ...vals);
    if (yMin === yMax) yMax = 1;
    const pad = (yMax - yMin) * 0.08;
    if (yMax > 0) yMax += pad;
    if (yMin < 0) yMin -= pad;
    const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
    const n = vals.length;
    const bwAll = (W - m.l - m.r) / n;
    const bw = Math.max(2, Math.min(40, bwAll - 2));   // 2px surface gap between bars

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}` });
    box.append(svg);
    const yTicks = niceTicks(yMin, yMax, 5);
    const yFmt = opts.yFmt || defFmt;
    for (const t of yTicks) {
      svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
      const lb = sv('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = yFmt(t);
      svg.append(lb);
    }
    svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: 'var(--baseline)', 'stroke-width': 1.4 }));
    for (const r of opts.refY || []) {
      svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(r.v), y2: Y(r.v), stroke: r.color || 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
      if (r.label) {
        const lb = sv('text', { x: W - m.r - 4, y: Y(r.v) - 4, 'text-anchor': 'end', fill: r.color || 'var(--muted)', 'font-size': 10.5, 'font-weight': 600 });
        lb.textContent = r.label;
        svg.append(lb);
      }
    }

    const tip = CL.ui.el('div', 'viz-tooltip');
    box.append(tip);
    vals.forEach((v, i) => {
      const cx = m.l + bwAll * i + bwAll / 2;
      const y0 = Y(Math.max(0, v)), y1 = Y(Math.min(0, v));
      const h = Math.max(1.5, y1 - y0);
      const color = typeof opts.color === 'function' ? opts.color(v, i) : (opts.color || 'var(--s1)');
      const rect = sv('rect', {
        x: cx - bw / 2, y: y0, width: bw, height: h, fill: color, rx: Math.min(4, bw / 2),
      });
      svg.append(rect);
      // hover target wider than the mark
      const hit = sv('rect', { x: m.l + bwAll * i, y: m.t, width: bwAll, height: H - m.t - m.b, fill: 'transparent' });
      hit.addEventListener('mousemove', () => {
        tip.innerHTML = `<div class="tt-x">${opts.labels[i]}</div><div class="row"><span class="name">${opts.seriesName || 'value'}</span><span class="val">${yFmt(v)}</span></div>`;
        tip.style.display = 'block';
        const bwPx = box.clientWidth;
        const leftPx = (cx / W) * bwPx;
        tip.style.left = (leftPx > bwPx - 180 ? leftPx - 165 : leftPx + 12) + 'px';
        tip.style.top = '10px';
        rect.setAttribute('opacity', '0.8');
      });
      hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; rect.setAttribute('opacity', '1'); });
      svg.append(hit);
    });

    // x labels: thin to ~8
    const step = Math.ceil(n / 8);
    opts.labels.forEach((lbt, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const lb = sv('text', { x: m.l + bwAll * i + bwAll / 2, y: H - m.b + 18, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = lbt;
      svg.append(lb);
    });
    if (opts.xLabel) {
      const lb = sv('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 });
      lb.textContent = opts.xLabel;
      svg.append(lb);
    }
    return box;
  }

  /* histogram(container, {values[], bins, height, color, xFmt, vlines: [{v,label,color}]}) */
  function histogram(container, opts) {
    const vals = opts.values.slice().sort((a, b) => a - b);
    const lo = vals[0], hi = vals[vals.length - 1];
    const nb = opts.bins || 40;
    const w = (hi - lo) / nb || 1;
    const counts = new Array(nb).fill(0);
    for (const v of vals) {
      let b = Math.floor((v - lo) / w);
      if (b >= nb) b = nb - 1;
      if (b < 0) b = 0;
      counts[b]++;
    }
    const labels = counts.map((_, i) => (opts.xFmt || defFmt)(lo + (i + 0.5) * w));
    const box = barChart(container, {
      labels, values: counts, height: opts.height || 240,
      color: opts.color || 'var(--s1)', seriesName: 'paths',
      yFmt: (v) => v.toFixed(0), xLabel: opts.xLabel,
    });
    // vertical reference lines drawn on top
    if (opts.vlines && opts.vlines.length) {
      const svg = box.querySelector('svg');
      const W = 720, H = opts.height || 240, m = { l: 64, r: 14, t: 10, b: 34 };
      for (const vl of opts.vlines) {
        const frac = (vl.v - lo) / (hi - lo);
        if (frac < 0 || frac > 1) continue;
        const x = m.l + frac * (W - m.l - m.r);
        svg.append(sv('line', { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: vl.color || 'var(--ink)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }));
        const atRight = x > W - m.r - 8 - vl.label.length * 6.3;
        const lb = sv('text', { x: atRight ? x - 4 : x + 4, y: m.t + 11, 'text-anchor': atRight ? 'end' : 'start', fill: vl.color || 'var(--ink)', 'font-size': 10.5, 'font-weight': 600 });
        lb.textContent = vl.label;
        svg.append(lb);
      }
    }
    return box;
  }

  CL.charts = { lineChart, barChart, histogram, niceTicks };
})();
