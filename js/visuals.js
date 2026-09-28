/* Debets & Kredīts — vizuālie palīgi: skaitļu formāts, T-konti, bilance, svari un virsgrāmata. */
(function () {
  'use strict';

  const NB = ' ';
  const TYPE = { A: 'Aktīvs', S: 'Saistības', PK: 'Pašu kapitāls', I: 'Ieņēmumi', E: 'Izdevumi' };
  const TONE = { A: 'a', S: 's', PK: 'pk', I: 'pk', E: 'pk' };

  // 8000 -> "8 000", -2000 -> "−2 000"
  function num(n) {
    if (typeof n !== 'number') return String(n);
    const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (n < 0 ? '−' : '') + s;
  }
  const eur = (n) => (n === '?' ? '?' : num(n) + NB + '€');
  const sum = (arr) => arr.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  // **treknraksts**, *slīpraksts*, ==marķieris==
  function md(s) {
    return String(s == null ? '' : s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/==(.+?)==/g, '<mark>$1</mark>')
      .replace(/(^|[^*\w])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
  }
  const mdBlock = (s) => String(s).split(/\n\n+/).map((p) => `<p>${md(p)}</p>`).join('');

  /* ---------- Vienādojums ---------- */
  function eq(a, s, pk, o = {}) {
    const t = (lbl, v, tone) =>
      `<div class="term tone-${tone}"><span class="term-l">${lbl}</span><span class="term-v num">${v === '?' ? '<b class="q">?</b>' : eur(v)}</span></div>`;
    const known = [a, s, pk].every((v) => typeof v === 'number');
    const bal = !known || a === s + pk;
    return `<div class="eqn" role="group" aria-label="Grāmatvedības vienādojums">${t('Aktīvi', a, 'a')}<span class="sign${bal ? '' : ' sign-bad'}" aria-label="${bal ? 'ir vienāds ar' : 'nav vienāds ar'}">${bal ? '=' : '≠'}</span>${t('Saistības', s, 's')}<span class="sign">+</span>${t(o.pkLabel || 'Pašu kapitāls', pk, 'pk')}</div>`;
  }

  /* ---------- T-konts ---------- */
  function tacct(name, o = {}) {
    const col = (side) => {
      const rows = [];
      if (o.open && o.open.side === side) {
        rows.push(`<div class="ta-row ta-open"><span class="ta-tag">SA</span><span class="num">${num(o.open.v)}</span></div>`);
      }
      (o[side] || []).forEach((v, i) => {
        const hl = o.hl && o.hl.side === side && o.hl.i === i;
        const tag = (o.memo && o.memo[side] && o.memo[side][i]) || '';
        rows.push(`<div class="ta-row${hl ? ' ta-hl' : ''}"><span class="ta-tag">${tag}</span><span class="num">${num(v)}</span></div>`);
      });
      if (o.close && o.close.side === side) {
        rows.push(`<div class="ta-row ta-close"><span class="ta-tag">BA</span><span class="num">${o.close.v === '?' ? '<b class="q">?</b>' : num(o.close.v)}</span></div>`);
      }
      return `<div class="ta-col ta-${side}"><div class="ta-h">${side === 'd' ? 'Debets' : 'Kredīts'}</div>${rows.join('')}</div>`;
    };
    return `<figure class="tacct${o.tone ? ' tone-' + o.tone : ''}"><figcaption class="ta-name">${name}</figcaption><div class="ta-body">${col('d')}${col('k')}</div></figure>`;
  }
  const tpair = (...html) => `<div class="tpair">${html.join('')}</div>`;

  /* ---------- Bilance ---------- */
  // rows: {h:'Sadaļa'} vai {l:'Nosaukums', v:1000}
  function bilance(b) {
    const side = (title, rows) => {
      const unknown = rows.some((r) => r.v === '?');
      const total = sum(rows.map((r) => r.v));
      const body = rows
        .map((r) => {
          if (r.h) return `<div class="bil-h">${r.h}</div>`;
          const val = r.v == null ? '' : r.v === '?' ? '<b class="q">?</b>' : num(r.v);
          return `<div class="bil-row"><span class="bil-l">${r.l}</span><span class="bil-dots" aria-hidden="true"></span><span class="num">${val}</span></div>`;
        })
        .join('');
      const tot =
        b.totals === false
          ? ''
          : `<div class="bil-total"><span>Kopā</span><span class="num">${unknown ? '?' : num(total)}</span></div>`;
      return { html: `<div class="bil-side"><div class="bil-title">${title}</div>${body}${tot}</div>`, total, unknown };
    };
    const A = side('Aktīvs', b.a);
    const Pa = side('Pasīvs', b.p);
    let check = '';
    if (b.check && !A.unknown && !Pa.unknown) {
      const ok = A.total === Pa.total;
      check = `<p class="bil-check ${ok ? 'ok' : 'bad'}">${ok ? '✓ Aktīvs = Pasīvs' : '✗ Aktīvs ≠ Pasīvs'} <span class="num">${eur(A.total)}${ok ? '' : ' / ' + eur(Pa.total)}</span></p>`;
    }
    return `<div class="bil">${b.date ? `<div class="bil-date">Bilance uz ${b.date}</div>` : ''}<div class="bil-cols">${A.html}${Pa.html}</div>${check}${b.note ? `<p class="bil-note">${md(b.note)}</p>` : ''}</div>`;
  }

  /* ---------- Peļņas vai zaudējumu aprēķins ---------- */
  function pnl(o) {
    const inc = sum(o.I.map((r) => r[1]));
    const exp = sum(o.E.map((r) => r[1]));
    const res = inc - exp;
    const row = (l, v, minus) =>
      `<div class="bil-row"><span class="bil-l">${l}</span><span class="bil-dots" aria-hidden="true"></span><span class="num">${minus ? '−' + NB : ''}${num(v)}</span></div>`;
    const label = o.hide ? 'Peļņa vai zaudējumi' : res >= 0 ? 'Peļņa' : 'Zaudējumi';
    return `<div class="bil pnl"><div class="bil-date">${o.title || 'Peļņas vai zaudējumu aprēķins'}</div><div class="bil-side">
      <div class="bil-h">Ieņēmumi</div>${o.I.map((r) => row(r[0], r[1])).join('')}
      <div class="bil-h">Izdevumi</div>${o.E.map((r) => row(r[0], r[1], true)).join('')}
      <div class="bil-total"><span>${label}</span><span class="num">${o.hide ? '<b class="q">?</b>' : num(res)}</span></div></div></div>`;
  }

  /* ---------- Mazie bloki ---------- */
  const cards = (items) =>
    `<div class="cards">${items
      .map(
        (c) =>
          `<div class="mini tone-${c.tone || 'n'}">${c.k ? `<span class="mini-k">${c.k}</span>` : ''}<strong class="mini-t">${md(c.t)}</strong>${c.d ? `<span class="mini-d">${md(c.d)}</span>` : ''}</div>`
      )
      .join('')}</div>`;

  const flow = (items) =>
    `<ol class="flow">${items
      .map((it, i) => `<li><span class="flow-n num">${i + 1}</span><strong>${md(it.t)}</strong>${it.d ? `<span>${md(it.d)}</span>` : ''}</li>`)
      .join('')}</ol>`;

  const dk = (s) => `<span class="dk dk-${s === 'D' ? 'd' : 'k'}">${s}</span>`;
  const rules = (rows) =>
    `<div class="table-scroll"><table class="rules"><thead><tr><th scope="col">Konta veids</th><th scope="col">Palielinās</th><th scope="col">Samazinās</th></tr></thead><tbody>${rows
      .map((r) => `<tr><th scope="row"><i class="sw sw-${r[3] || 'n'}"></i>${r[0]}</th><td>${dk(r[1])}</td><td>${dk(r[2])}</td></tr>`)
      .join('')}</tbody></table></div>`;

  const chips = (list, tone) =>
    `<div class="chips-static">${list.map((t) => `<span class="chip chip-static tone-${tone || 'n'}"><i class="sw sw-${tone || 'n'}"></i>${t}</span>`).join('')}</div>`;

  const timeline = (items) =>
    `<ol class="timeline">${items
      .map((it) => `<li><span class="tl-m">${it.m}</span><strong>${it.t}</strong><span class="tl-d">${md(it.d)}</span></li>`)
      .join('')}</ol>`;

  const years = (n, each, total) =>
    `<div class="years"><div class="years-bar">${Array.from({ length: n }, (_, i) => `<div class="yr"><span>${i + 1}. gads</span><b class="num">${eur(each)}</b></div>`).join('')}</div><p class="years-cap">Iegādes vērtība <b class="num">${eur(total)}</b> sadalīta ${n} gados — katru gadu izdevumos nonāk <b class="num">${eur(each)}</b>.</p></div>`;

  const defs = (items) =>
    `<dl class="defs">${items.map((d) => `<div><dt>${d[0]}</dt><dd>${md(d[1])}</dd></div>`).join('')}</dl>`;

  const formula = (s) => `<p class="formula">${md(s)}</p>`;

  /* ---------- Svari ---------- */
  function scale(init, o = {}) {
    const max = o.max || 20000;
    const CX = 180, CY = 146, R = 128, HMAX = 80;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.createElement('div');
    el.className = 'scale';
    const pan = (side) =>
      `<g class="sc-pan sc-${side}"><line class="sc-stem" x1="0" y1="0" x2="0" y2="-13"/><rect class="sc-plat" x="-52" y="-18" width="104" height="6" rx="3"/><g class="sc-stack"></g></g>`;
    el.innerHTML = `
      <svg viewBox="0 0 360 236" aria-hidden="true" focusable="false">
        <path class="sc-post" d="M180 150 L163 222 H197 Z"/>
        <rect class="sc-base" x="116" y="220" width="128" height="9" rx="4.5"/>
        <g class="sc-beam"><rect class="sc-bar" x="${CX - R - 8}" y="${CY - 4}" width="${2 * R + 16}" height="8" rx="4"/></g>
        ${pan('l')}${pan('r')}
        <circle class="sc-pivot" cx="${CX}" cy="${CY}" r="7"/>
      </svg>
      <div class="sc-legend">
        <div class="sc-side"><span class="lg"><i class="sw sw-a"></i>Aktīvi</span><b class="num" data-k="A"></b></div>
        <div class="sc-sign num" aria-hidden="true">=</div>
        <div class="sc-side sc-side-r"><span class="lg"><i class="sw sw-s"></i>Saistības</span><b class="num" data-k="S"></b><span class="lg"><i class="sw sw-pk"></i>Pašu kapitāls</span><b class="num" data-k="PK"></b></div>
      </div>
      <p class="sr-only" aria-live="polite"></p>`;
    const beam = el.querySelector('.sc-beam');
    const pl = el.querySelector('.sc-l');
    const pr = el.querySelector('.sc-r');
    const sign = el.querySelector('.sc-sign');
    const live = el.querySelector('.sr-only');

    function stack(g, blocks) {
      const total = sum(blocks.map((b) => b.v));
      const k = total > max ? max / total : 1;
      let y = -18;
      let html = '';
      blocks.forEach((b) => {
        if (b.v <= 0) return;
        const hh = Math.max(3, (b.v / max) * HMAX * k);
        y -= hh;
        html += `<rect class="blk ${b.cls}" x="-40" y="${y.toFixed(1)}" width="80" height="${hh.toFixed(1)}" rx="3"/>`;
        if (hh >= 16) html += `<text class="blk-t" x="0" y="${(y + hh / 2 + 4).toFixed(1)}" text-anchor="middle">${b.t}</text>`;
      });
      g.querySelector('.sc-stack').innerHTML = html;
    }

    function draw(deg) {
      const r = (deg * Math.PI) / 180;
      const dx = R * Math.cos(r), dy = R * Math.sin(r);
      beam.setAttribute('transform', `rotate(${deg.toFixed(2)} ${CX} ${CY})`);
      pl.setAttribute('transform', `translate(${(CX - dx).toFixed(1)} ${(CY - dy).toFixed(1)})`);
      pr.setAttribute('transform', `translate(${(CX + dx).toFixed(1)} ${(CY + dy).toFixed(1)})`);
    }

    let cur = 0, vel = 0, target = 0, raf = 0, first = true;
    function tick() {
      vel = (vel + (target - cur) * 0.09) * 0.8;
      cur += vel;
      if (Math.abs(target - cur) < 0.02 && Math.abs(vel) < 0.02) { cur = target; vel = 0; }
      draw(cur);
      raf = cur === target ? 0 : requestAnimationFrame(tick);
    }

    function set(v) {
      stack(pl, [{ v: v.A, cls: 'blk-a', t: 'A' }]);
      stack(pr, [{ v: v.S, cls: 'blk-s', t: 'S' }, { v: v.PK, cls: 'blk-pk', t: 'PK' }]);
      el.querySelector('[data-k="A"]').textContent = eur(v.A);
      el.querySelector('[data-k="S"]').textContent = eur(v.S);
      el.querySelector('[data-k="PK"]').textContent = eur(v.PK);
      const right = v.S + v.PK;
      sign.textContent = v.A === right ? '=' : v.A > right ? '>' : '<';
      sign.classList.toggle('sign-bad', v.A !== right);
      live.textContent = v.A === right ? 'Svari ir līdzsvarā.' : v.A > right ? 'Smagāka ir aktīvu puse.' : 'Smagāka ir saistību un pašu kapitāla puse.';
      target = Math.max(-11, Math.min(11, ((right - v.A) / max) * 40));
      if (first || reduce) { cur = target; vel = 0; draw(cur); first = false; return; }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    set(init);
    return { el, set };
  }

  /* ---------- Virsgrāmata (simulācijai) ---------- */
  function makeLedger(pairs) {
    const accts = {};
    pairs.forEach(([id, a]) => (accts[id] = a));
    const L = { accts, entries: [] };
    L.post = (d, k, amt) => L.entries.push({ d, k, amt });
    L.bal = (id) => {
      let dd = 0, kk = 0;
      L.entries.forEach((e) => { if (e.d === id) dd += e.amt; if (e.k === id) kk += e.amt; });
      const t = accts[id].type;
      return t === 'A' || t === 'E' ? dd - kk : kk - dd;
    };
    L.ids = (type) => Object.keys(accts).filter((id) => accts[id].type === type);
    L.total = (type) => sum(L.ids(type).map(L.bal));
    L.profit = () => L.total('I') - L.total('E');
    L.hasPL = () => L.entries.some((e) => /^(I|E)$/.test(accts[e.d].type) || /^(I|E)$/.test(accts[e.k].type));
    return L;
  }

  function ledgerT(L, id, hlEntry) {
    const a = L.accts[id];
    const d = [], k = [], md_ = [], mk = [];
    let hl = null;
    L.entries.forEach((e, i) => {
      if (e.d === id) { d.push(e.amt); md_.push('#' + (i + 1)); if (i === hlEntry) hl = { side: 'd', i: d.length - 1 }; }
      if (e.k === id) { k.push(e.amt); mk.push('#' + (i + 1)); if (i === hlEntry) hl = { side: 'k', i: k.length - 1 }; }
    });
    const nat = a.type === 'A' || a.type === 'E' ? 'd' : 'k';
    return tacct(a.name, { d, k, memo: { d: md_, k: mk }, hl, close: { side: nat, v: L.bal(id) }, tone: TONE[a.type] });
  }

  function ledgerBilance(L, o = {}) {
    if (!L.entries.length) return '<div class="bil bil-empty">Bilance vēl ir tukša: nav neviena ieraksta.</div>';
    const rows = (type, grp) =>
      L.ids(type)
        .filter((id) => !grp || L.accts[id].grp === grp)
        .map((id) => ({ l: L.accts[id].name, v: L.bal(id) }))
        .filter((r) => r.v !== 0);
    const a = [];
    const il = rows('A', 'IL'), al = rows('A', 'AL');
    if (il.length) a.push({ h: 'Ilgtermiņa ieguldījumi' }, ...il);
    if (al.length) a.push({ h: 'Apgrozāmie līdzekļi' }, ...al);
    const p = [];
    const pk = rows('PK');
    if (L.hasPL()) pk.push({ l: 'Pārskata perioda peļņa', v: L.profit() });
    if (pk.length) p.push({ h: 'Pašu kapitāls' }, ...pk);
    const s = rows('S');
    if (s.length) p.push({ h: 'Kreditori' }, ...s);
    return bilance({ date: o.date, a, p, check: true });
  }

  function ledgerPnl(L, o = {}) {
    const I = L.ids('I').map((id) => [L.accts[id].name, L.bal(id)]);
    const E = L.ids('E').map((id) => [L.accts[id].name, L.bal(id)]);
    return pnl({ I, E, hide: o.hide, title: o.title });
  }

  window.V = {
    TYPE, TONE, num, eur, md, mdBlock, eq, tacct, tpair, bilance, pnl, cards, flow, rules, chips,
    timeline, years, defs, formula, scale, makeLedger, ledgerT, ledgerBilance, ledgerPnl,
  };
})();
