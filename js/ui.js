/* Small DOM helpers + control builders (slider, select, segmented, checkbox). */
window.CL = window.CL || {};
(function () {
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* slider: {label, min, max, step, value, fmt, onInput} → {root, set(v), value} */
  function slider(opts) {
    const root = el('div', 'ctl');
    const lab = el('label');
    const name = el('span', null, opts.label);
    const val = el('b');
    lab.append(name, val);
    const input = el('input');
    input.type = 'range';
    input.min = opts.min; input.max = opts.max; input.step = opts.step;
    input.value = opts.value;
    const fmt = opts.fmt || ((v) => v);
    const show = () => { val.textContent = fmt(parseFloat(input.value)); };
    show();
    input.addEventListener('input', () => { show(); opts.onInput && opts.onInput(parseFloat(input.value)); });
    root.append(lab, input);
    return {
      root,
      get value() { return parseFloat(input.value); },
      set(v) { input.value = v; show(); },
    };
  }

  /* select: {label, options: [{id,label}], value, onChange} */
  function select(opts) {
    const root = el('div', 'ctl');
    const lab = el('label', null, `<span>${opts.label}</span>`);
    const sel = el('select');
    for (const o of opts.options) {
      const op = el('option', null, o.label);
      op.value = o.id;
      sel.append(op);
    }
    sel.value = opts.value;
    sel.addEventListener('change', () => opts.onChange && opts.onChange(sel.value));
    root.append(lab, sel);
    return { root, get value() { return sel.value; }, set(v) { sel.value = v; } };
  }

  /* segmented: {options: [{id,label}], value, onChange} */
  function segmented(opts) {
    const root = el('div', 'seg');
    let current = opts.value;
    const btns = opts.options.map((o) => {
      const b = el('button', o.id === current ? 'active' : '', o.label);
      b.addEventListener('click', () => {
        current = o.id;
        btns.forEach((x, i) => x.classList.toggle('active', opts.options[i].id === current));
        opts.onChange && opts.onChange(current);
      });
      root.append(b);
      return b;
    });
    return { root, get value() { return current; } };
  }

  /* checkbox: {label, checked, onChange} */
  function checkbox(opts) {
    const root = el('label', 'chk');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!opts.checked;
    input.addEventListener('change', () => opts.onChange && opts.onChange(input.checked));
    root.append(input, document.createTextNode(opts.label));
    return { root, get value() { return input.checked; } };
  }

  /* stat tile row */
  function tiles(items) {
    const root = el('div', 'tiles');
    for (const t of items) {
      const tile = el('div', 'tile');
      tile.append(el('div', 'k', t.k));
      const v = el('div', 'v' + (t.cls ? ' ' + t.cls : ''), t.v);
      tile.append(v);
      if (t.d) tile.append(el('div', 'd', t.d));
      root.append(tile);
    }
    return root;
  }

  function callout(kind, tag, html) {
    const c = el('div', 'callout ' + (kind || ''));
    c.append(el('span', 'tag', tag));
    c.append(el('p', null, html));
    return c;
  }

  function card(title, sub) {
    const c = el('div', 'card');
    if (title) c.append(el('p', 'chart-title', title));
    if (sub) c.append(el('p', 'chart-sub', sub));
    return c;
  }

  CL.ui = { el, slider, select, segmented, checkbox, tiles, callout, card };
})();
