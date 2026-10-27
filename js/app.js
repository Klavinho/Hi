/* Debets & Kredīts — lietotnes dzinējs: skati, nodarbību atskaņotājs, interaktīvās komponentes. */
(function () {
  'use strict';
  const V = window.V;
  const C = window.COURSE;
  const { md, mdBlock, eur, num } = V;
  document.documentElement.lang = 'lv';

  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  /* ---------- Progress (tikai šajā pārlūkā) ---------- */
  const KEY = 'debets-kredits:v1';
  function loadP() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  const P = Object.assign({ xp: 0, streak: 0, lastDay: null, done: {} }, loadP() || {});
  if (!P.done || typeof P.done !== 'object') P.done = {};
  function saveP() {
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* privātais režīms u.c. */ }
  }
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayKey(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  const streakNow = () => (P.lastDay === today() || P.lastDay === yesterday() ? P.streak || 0 : 0);
  function bumpStreak() {
    const t = today();
    if (P.lastDay === t) return;
    P.streak = P.lastDay === yesterday() ? (P.streak || 0) + 1 : 1;
    P.lastDay = t;
  }

  /* ---------- DOM palīgi ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  let uidN = 0;
  const uid = (p) => `${p}-${++uidN}`;
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const plural = (n, one, many) => (n % 10 === 1 && n % 100 !== 11 ? one : many);

  const ICON = {
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 2.2c.4 3.1-1.1 4.9-2.6 6.6C8.5 10.5 7 12.2 7 15a5 5 0 0 0 10 0c0-1.7-.6-3-1.4-4.1-.2 1.3-.9 2.2-1.9 2.6.7-3.5-.2-7.7-1.1-11.3Z"/></svg>',
    gem: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9l4-6Zm1.2 2L4.6 9h4.5l1.6-4H7.2Zm5.6 0 1.6 4h4.5l-2.6-4h-3.5ZM12 5.6 10.8 9h2.4L12 5.6ZM5.3 11l5.4 6.5L8.9 11H5.3Zm5.7 0 1 6.9 1-6.9h-2Zm4.1 0-1.8 6.5 5.4-6.5h-3.6Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6L21 7.5l-1.4-1.4-10.1 10.1Z"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm-3 18h6v2H9v-2Z"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.8 5.3 4.1 12l6.7 6.7 1.4-1.4L7.9 13H20v-2H7.9l4.3-4.3-1.4-1.4Z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.4 8.6 4.6 4.6 4.6-4.6L18 10l-6 6-6-6 1.4-1.4Z"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a.5.5 0 0 0 0 1H20v3H6.5A2.5 2.5 0 0 1 4 19.5v-15ZM8 6v2h8V6H8Zm0 4v2h6v-2H8Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3 1.4-1.4Z"/></svg>',
  };

  const LESSONS = C.order.map((id) => C.lessons[id]);
  // Katram jautājumam piesaista pēdējo skaidrojumu pirms tā. Tas der arī trenažierī.
  LESSONS.forEach((l) => {
    let last = null;
    l.steps.forEach((s) => { if (s.type === 'info') last = s; else if (last) s._ctx = last; });
  });
  const lessonNo = (id) => C.order.indexOf(id) + 1;
  const isDone = (id) => !!P.done[id];
  const nextLesson = () => LESSONS.find((l) => !isDone(l.id)) || null;
  const minutes = (l) => Math.max(3, Math.round(l.steps.length * 0.8));

  const app = document.getElementById('app');
  let view = 'home';
  let dockPrimary = null;

  function go(v) {
    view = v;
    dockPrimary = null;
    document.body.classList.remove('in-lesson');
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    app.replaceChildren();
    if (view === 'glossary') app.append(topbar(), glossaryView());
    else if (view === 'practice') app.append(topbar(), practiceView());
    else app.append(topbar(), homeView());
  }

  /* ---------- Augšējā josla ---------- */
  function topbar() {
    const tab = (id, label) =>
      h('button', { class: 'tab', type: 'button', 'aria-current': view === id ? 'page' : null, onclick: () => go(id) }, label);
    return h('header', { class: 'top' },
      h('div', { class: 'wrap top-in' },
        h('button', { class: 'brand', type: 'button', onclick: () => go('home') },
          h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('span', { class: 'd' }, 'D'), h('span', { class: 'k' }, 'K')),
          h('span', null, 'Debets & Kredīts')),
        h('nav', { class: 'tabs', 'aria-label': 'Sadaļas' }, tab('home', 'Kurss'), tab('practice', 'Trenažieris'), tab('glossary', 'Vārdnīca')),
        h('div', { class: 'stats' },
          h('span', { class: 'stat stat-flame', title: 'Dienu sērija', html: `${ICON.flame}<span class="num">${streakNow()}</span><span class="sr-only"> dienu sērija</span>` }),
          h('span', { class: 'stat stat-xp', title: 'Pieredzes punkti', html: `${ICON.gem}<span class="num">${P.xp}</span><span class="stat-u">XP</span>` }))));
  }

  /* ---------- Sākums ---------- */
  function ring(frac) {
    const r = 21, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" class="ring-bg"/><circle cx="26" cy="26" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(1)}" transform="rotate(-90 26 26)"/></svg>`;
  }

  function homeView() {
    const nx = nextLesson();
    const doneCount = LESSONS.filter((l) => isDone(l.id)).length;
    const frac = doneCount / LESSONS.length;

    const cta = h('div', { class: 'continue' },
      h('div', { class: 'ring', html: ring(frac) + `<span class="ring-t num">${doneCount}/${LESSONS.length}</span>` }),
      nx
        ? h('div', { class: 'continue-txt' },
            h('span', { class: 'continue-k' }, doneCount ? 'Turpini' : 'Sāc šeit'),
            h('strong', null, `${lessonNo(nx.id)}. ${nx.title}`),
            h('span', { class: 'continue-d' }, nx.desc))
        : h('div', { class: 'continue-txt' },
            h('span', { class: 'continue-k' }, 'Kurss pabeigts'),
            h('strong', null, 'Visas nodarbības ir izietas'),
            h('span', { class: 'continue-d' }, 'Atkārto trenažierī, lai zināšanas nostiprinātos.')),
      nx
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => playLesson(nx) }, doneCount ? 'Turpināt' : 'Sākt')
        : h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('practice') }, 'Trenēties'));

    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'eyebrow' }, `Grāmatvedības pamati · ${LESSONS.length} nodarbības · ${C.units.length} nodaļas`),
        h('h1', { html: 'Grāmatvedība, ko apgūst <mark>darot</mark>.' }),
        h('p', { class: 'lede' }, 'Īsas interaktīvas nodarbības: tu šķiro posteņus, līdzsvaro svarus un grāmato darījumus. Katrs solis ir viens neliels uzdevums, un atbildi uzreiz pārbauda un paskaidro.'),
        cta),
      heroDemo());

    const course = h('section', { class: 'course', 'aria-label': 'Kursa saturs' });
    C.units.forEach((u, ui) => {
      const ls = u.lessons.map((id) => C.lessons[id]);
      const dn = ls.filter((l) => isDone(l.id)).length;
      course.append(h('section', { class: 'unit' },
        h('header', { class: 'unit-head' },
          h('span', { class: 'unit-no' }, `${ui + 1}. nodaļa`),
          h('h2', null, u.title),
          h('span', { class: 'unit-count num' + (dn === ls.length ? ' full' : '') }, `${dn}/${ls.length}`),
          h('p', null, u.blurb)),
        h('ol', { class: 'path' }, ls.map((l) => {
          const state = isDone(l.id) ? 'done' : nx && nx.id === l.id ? 'current' : 'todo';
          const stateLabel = state === 'done' ? 'Pabeigta' : state === 'current' ? 'Nākamā' : '';
          return h('li', { class: 'node ' + state },
            h('button', { class: 'node-btn', type: 'button', onclick: () => playLesson(l), 'aria-label': `${lessonNo(l.id)}. nodarbība: ${l.title}${stateLabel ? ' (' + stateLabel.toLowerCase() + ')' : ''}` },
              h('span', { class: 'dot num', html: state === 'done' ? ICON.check : String(lessonNo(l.id)) }),
              h('span', { class: 'n-txt' },
                h('span', { class: 'n-title' }, l.title),
                h('span', { class: 'n-desc' }, l.desc)),
              h('span', { class: 'n-meta' },
                stateLabel ? h('span', { class: 'n-state' }, stateLabel) : null,
                h('span', null, `${l.steps.length} ${plural(l.steps.length, 'solis', 'soļi')} · ~${minutes(l)} min`))));
        }))));
    });

    return h('main', { class: 'wrap home' }, hero, course, footer());
  }

  function heroDemo() {
    const start = { A: 6000, S: 2000, PK: 4000 };
    const s = { ...start };
    const CAP = 11000;
    const sc = V.scale(s, { max: 14000 });
    const status = h('p', { class: 'demo-status', 'aria-live': 'polite' });
    const btn = (k, label, tone) => h('button', { class: `pill tone-${tone}`, type: 'button', onclick: () => { if (s[k] + 1000 > CAP) return; s[k] += 1000; update(); } }, h('i', { class: `sw sw-${tone}` }), label);
    const addA = btn('A', '+1 000 € aktīvi', 'a');
    const addS = btn('S', '+1 000 € saistības', 's');
    const addP = btn('PK', '+1 000 € pašu kapitāls', 'pk');
    function update() {
      sc.set(s);
      const diff = s.A - (s.S + s.PK);
      status.classList.toggle('bad', diff !== 0);
      status.innerHTML = diff === 0
        ? '<b>Līdzsvarā.</b> Tā bilancei jāizskatās vienmēr.'
        : `<b>Nav līdzsvarā</b> par ${eur(Math.abs(diff))}. Īstā darījumā vienlaikus mainās divas vietas. Pievieno otru pusi.`;
      addA.disabled = s.A + 1000 > CAP;
      addS.disabled = s.S + 1000 > CAP;
      addP.disabled = s.PK + 1000 > CAP;
    }
    const reset = h('button', { class: 'pill pill-ghost', type: 'button', onclick: () => { Object.assign(s, start); update(); } }, 'Sākt no jauna');
    update();
    return h('aside', { class: 'demo', 'aria-label': 'Interaktīvi svari' },
      h('div', { class: 'demo-head' }, h('p', { class: 'eyebrow' }, 'Pamēģini'), h('h2', null, 'Bilance ir svari')),
      h('p', { class: 'demo-lede' }, 'Kreisajā pusē ir aktīvi, labajā saistības un pašu kapitāls. Pievieno kaut ko vienā pusē un vēro, kas notiek.'),
      sc.el,
      h('div', { class: 'demo-btns' }, addA, addS, addP, reset),
      status);
  }

  function footer() {
    let armed = false, timer = 0;
    const reset = h('button', { class: 'linkish', type: 'button' }, 'Dzēst progresu');
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'Tiešām dzēst? Nospied vēlreiz';
        timer = setTimeout(() => { armed = false; reset.textContent = 'Dzēst progresu'; }, 4000);
        return;
      }
      clearTimeout(timer);
      P.xp = 0; P.streak = 0; P.lastDay = null; P.done = {};
      saveP();
      go('home');
    });
    return h('footer', { class: 'foot' },
      h('p', null, 'Piemēri mācību nolūkos ir vienkāršoti. Latvijā grāmatvedību regulē Grāmatvedības likums un Gada pārskatu un konsolidēto gada pārskatu likums.'),
      h('p', null, 'Progress glabājas tikai šajā pārlūkā. ', reset));
  }

  /* ---------- Vārdnīca ---------- */
  function glossaryView() {
    const items = C.glossary.slice().sort((a, b) => a.t.localeCompare(b.t, 'lv'));
    const input = h('input', { class: 'search', id: 'gloss-q', type: 'search', placeholder: 'Meklēt terminu, piemēram, «debets»', autocomplete: 'off' });
    const empty = h('p', { class: 'gl-empty', hidden: true }, 'Nekas netika atrasts. Pamēģini citu vārdu.');
    const rows = items.map((it) => {
      const r = h('div', { class: 'gl-item' }, h('dt', null, it.t), h('dd', null, it.d));
      r.dataset.s = (it.t + ' ' + it.d).toLowerCase();
      return r;
    });
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      let n = 0;
      rows.forEach((r) => { const show = !q || r.dataset.s.includes(q); r.hidden = !show; if (show) n++; });
      empty.hidden = n > 0;
    });
    return h('main', { class: 'wrap page' },
      h('header', { class: 'page-head' },
        h('p', { class: 'eyebrow' }, `${items.length} termini`),
        h('h1', null, 'Vārdnīca'),
        h('p', { class: 'lede' }, 'Grāmatvedības pamatjēdzieni vienkāršā valodā.')),
      h('label', { class: 'sr-only', for: 'gloss-q' }, 'Meklēt terminu'),
      input,
      h('dl', { class: 'gl-list' }, rows),
      empty);
  }

  /* ---------- Trenažieris ---------- */
  function practicePool() {
    let src = LESSONS.filter((l) => isDone(l.id) && l.practice !== false);
    const fromDone = src.length > 0;
    if (!fromDone) src = LESSONS.slice(0, 3);
    const steps = [];
    src.forEach((l) => l.steps.forEach((s) => { if (s.type !== 'info' && s.practice !== false) steps.push(s); }));
    return { src, steps, fromDone };
  }
  function startPractice() {
    const { steps } = practicePool();
    playLesson({ id: 'practice', title: 'Trenažieris' }, { practice: true, steps: shuffle(steps).slice(0, 8) });
  }
  function practiceView() {
    const { src, steps, fromDone } = practicePool();
    const n = Math.min(8, steps.length);
    return h('main', { class: 'wrap page' },
      h('header', { class: 'page-head' },
        h('p', { class: 'eyebrow' }, 'Atkārtošana'),
        h('h1', null, 'Trenažieris'),
        h('p', { class: 'lede' }, `${n} nejauši izvēlēti uzdevumi no ${fromDone ? 'pabeigtajām nodarbībām' : 'pirmās nodaļas'}. Īsa atkārtošana ik pa laikam palīdz atcerēties daudz labāk nekā viena gara mācīšanās.`)),
      h('section', { class: 'pr-card' },
        h('h2', null, fromDone ? 'Iekļautās nodarbības' : 'Vēl nav pabeigtu nodarbību'),
        fromDone ? null : h('p', { class: 'pr-note' }, 'Kamēr neviena nodarbība nav pabeigta, trenažieris ņem uzdevumus no pirmās nodaļas.'),
        h('ul', { class: 'pr-list' }, src.map((l) => h('li', null, h('span', { class: 'num' }, `${lessonNo(l.id)}.`), ' ', l.title))),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: startPractice }, 'Sākt treniņu')));
  }

  /* =====================================================================
   * Nodarbības atskaņotājs
   * ===================================================================== */
  const KICK = { info: 'Uzzini', choice: 'Jautājums', multi: 'Atzīmē visus', number: 'Aprēķini', sort: 'Sašķiro', scale: 'Līdzsvaro', effect: 'Darījums', quick: 'Ātrā kārta', entry: 'Grāmato' };
  const PRAISE = ['Pareizi!', 'Tieši tā!', 'Lieliski!', 'Precīzi!'];

  function playLesson(lesson, opts = {}) {
    view = 'player';
    document.body.classList.add('in-lesson');
    const steps = opts.steps || lesson.steps;
    const N = steps.length;
    // Simulācijā ieraksti ir atkarīgi cits no cita, tāpēc tur izlaist nevar.
    const skippable = !lesson.ledger;
    const run = {
      seq: steps.map((_, i) => i), // apmeklējuma secība; izlaistie tiek pievienoti beigās
      pos: 0,
      done: new Set(),             // izlasītie skaidrojumi un atrisinātie jautājumi
      how: {},                     // soļa nr. -> 'ok' | 'reveal'
      tries: {},                   // soļa nr. -> mēģinājumu skaits
      result: {},                  // soļa nr. -> ātrās kārtas atbildes
      entryAt: {},                 // soļa nr. -> ieraksta nr. virsgrāmatā
      snap: new Map(),             // skaidrojuma slaids -> tā saturs, kāds tas bija redzams
      xp: 0, asked: 0, first: 0,
      ledger: lesson.ledger ? V.makeLedger(lesson.ledger.map((id) => [id, C.accounts[id]])) : null,
    };

    const barFill = h('i');
    const bar = h('div', { class: 'p-bar', role: 'progressbar', 'aria-label': 'Nodarbības progress', 'aria-valuemin': '0', 'aria-valuemax': String(N) }, barFill);
    const count = h('span', { class: 'p-count num' });
    const title = h('span', { class: 'p-title' }, opts.practice ? 'Trenažieris' : `${lessonNo(lesson.id)}. ${lesson.title}`);
    const top = h('div', { class: 'p-top' },
      h('div', { class: 'p-top-in' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Aizvērt nodarbību', html: ICON.x, onclick: askExit }),
        h('div', { class: 'p-mid' }, title, bar),
        count));
    const stage = h('main', { class: 'p-stage' });
    const fb = h('div', { class: 'fb', 'aria-live': 'polite' });
    const backBtn = h('button', { class: 'btn btn-quiet dock-back', type: 'button', 'aria-label': 'Atpakaļ uz iepriekšējo slaidu', title: 'Atpakaļ', html: `${ICON.left}<span class="lbl">Atpakaļ</span>`, onclick: back });
    const btns = h('div', { class: 'dock-btns' });
    const dock = h('footer', { class: 'p-dock' }, h('div', { class: 'dock-inner' }, backBtn, fb, btns));
    const root = h('div', { class: 'player' }, top, stage, dock);
    app.replaceChildren(root);
    window.scrollTo(0, 0);

    const syncPad = () => root.style.setProperty('--dock-h', dock.offsetHeight + 'px');
    if ('ResizeObserver' in window) new ResizeObserver(syncPad).observe(dock);

    let idx = 0, step = null, ctl = null, state = '';
    const isRevisit = () => run.pos >= N;

    function show() {
      idx = run.seq[run.pos];
      step = steps[idx];
      const reviewing = step.type !== 'info' && !!run.how[idx];
      barFill.style.width = (run.done.size / N) * 100 + '%';
      bar.setAttribute('aria-valuenow', String(run.done.size));
      count.textContent = `${idx + 1}/${N}`;
      const ctx = {
        ledger: run.ledger,
        onChange: refresh,
        complete: selfComplete,
        review: reviewing ? run.result[idx] || null : null,
        // Ieraksts virsgrāmatā nonāk tikai vienreiz, arī ja pie soļa atgriežas.
        post: (lines, meta) => {
          if (run.entryAt[idx] == null) { run.ledger.post(lines, meta); run.entryAt[idx] = run.ledger.entries.length - 1; }
          return run.entryAt[idx];
        },
      };
      const card = h('article', { class: 'card card-' + step.type });
      card.append(h('div', { class: 'kick-row' },
        h('p', { class: 'kicker' }, step.kicker || KICK[step.type] || ''),
        isRevisit() ? h('span', { class: 'tag-skip' }, 'Izlaists jautājums') : null));
      if (step.type === 'info') {
        if (step.title) card.append(h('h2', { class: 'step-title' }, step.title));
        if (!run.snap.has(step)) run.snap.set(step, infoBody(step, ctx));
        card.append(...run.snap.get(step).map((n) => n.cloneNode(true)));
        ctl = null;
      } else {
        if (step._ctx) card.append(contextPanel(step._ctx, ctx));
        if (step.title) card.append(h('h2', { class: 'step-title' }, step.title));
        if (step.prompt) card.append(h('div', { class: 'prompt', html: md(step.prompt) }));
        if (step.visual) card.append(visual(step.visual, ctx));
        ctl = COMP[step.type](step, ctx);
        card.append(ctl.el);
        if (step.after) card.append(h('div', { class: 'prose prose-after', html: mdBlock(step.after) }));
      }
      stage.replaceChildren(card);
      window.scrollTo(0, 0);
      if (!ctl) setDock('info');
      else if (reviewing) { if (!ctl.selfPaced) { ctl.reveal(); ctl.lock(); } setDock('review'); }
      else { setDock(ctl.selfPaced ? 'self' : 'ask'); if (ctl.focus && FINE) ctl.focus(); }
    }

    // Salokāms bloks ar pēdējo skaidrojumu pirms jautājuma, lai to var pārlasīt atbildot.
    function contextPanel(info, ctx) {
      const nodes = run.snap.has(info) ? run.snap.get(info).map((n) => n.cloneNode(true)) : infoBody(info, ctx);
      return h('details', { class: 'ctx', open: step.context === 'open' },
        h('summary', null,
          h('span', { class: 'ctx-ic', html: ICON.book }),
          h('span', { class: 'ctx-txt' },
            h('span', { class: 'ctx-k' }, opts.practice ? 'Atgādinājums' : 'Iepriekšējais slaids'),
            h('span', { class: 'ctx-t' }, info.title || 'Skaidrojums')),
          h('span', { class: 'ctx-chev', html: ICON.chev })),
        h('div', { class: 'ctx-body' }, nodes));
    }

    const fbHead = (icon, text, gain) =>
      h('div', { class: 'fb-head' },
        h('span', { class: 'fb-ic', html: icon }),
        h('strong', null, text),
        gain ? h('span', { class: 'fb-xp num' }, `+${gain} XP`) : null);
    const fbBody = (text) => (text ? h('div', { class: 'fb-body', html: md(text) }) : null);
    const primary = (label, fn) => { const b = h('button', { class: 'btn btn-primary', type: 'button', onclick: fn }, label); dockPrimary = b; return b; };
    const ghost = (label, fn, title) => h('button', { class: 'btn btn-ghost', type: 'button', title, onclick: fn }, label);
    const skipBtn = () => ghost('Izlaist', skip, 'Pāriet tālāk un atgriezties pie šī jautājuma nodarbības beigās');

    function setDock(s, o = {}) {
      state = s;
      dock.dataset.state = s;
      fb.replaceChildren();
      btns.replaceChildren();
      dockPrimary = null;
      backBtn.disabled = run.pos === 0;
      const put = (...els) => fb.append(...els.filter(Boolean));
      const canSkip = skippable && !isRevisit();
      if (s === 'info') btns.append(primary('Turpināt', next));
      else if (s === 'ask') {
        const b = primary('Pārbaudīt', check);
        b.disabled = !ctl.ready();
        if (canSkip) btns.append(skipBtn());
        else if (isRevisit()) btns.append(ghost('Parādīt risinājumu', reveal));
        btns.append(b);
      } else if (s === 'self') {
        const b = primary('Turpināt', next);
        b.disabled = true;
        if (canSkip) btns.append(skipBtn());
        btns.append(b);
      } else if (s === 'ok') { put(fbHead(ICON.check, PRAISE[Math.floor(Math.random() * PRAISE.length)], o.gain), fbBody(step.explain)); btns.append(primary('Turpināt', next)); }
      else if (s === 'bad') { put(fbHead(ICON.x, 'Vēl ne gluži'), fbBody(o.msg || step.hint || 'Padomā vēlreiz un pamēģini.')); btns.append(ghost('Parādīt risinājumu', reveal), primary('Mēģināt vēlreiz', retry)); }
      else if (s === 'reveal') { put(fbHead(ICON.bulb, 'Risinājums'), fbBody(step.explain)); btns.append(primary('Turpināt', next)); }
      else if (s === 'review') {
        const res = run.result[idx];
        if (res) put(fbHead(ICON.bulb, `Jau atbildēts: ${res.filter(Boolean).length} no ${res.length} pareizi`));
        else if (run.how[idx] === 'ok') put(fbHead(ICON.check, 'Jau atbildēts pareizi'), fbBody(step.explain));
        else put(fbHead(ICON.bulb, 'Risinājums'), fbBody(step.explain));
        btns.append(primary('Turpināt', next));
      }
      if (s === 'ok' || s === 'bad' || s === 'reveal') requestAnimationFrame(() => dockPrimary && dockPrimary.focus({ preventScroll: true }));
      syncPad();
    }

    function refresh() {
      if (state === 'ask' && dockPrimary) dockPrimary.disabled = !ctl.ready();
    }
    function resolve(how) {
      run.how[idx] = how;
      run.done.add(idx);
      barFill.style.width = (run.done.size / N) * 100 + '%';
    }
    function check() {
      if (!ctl || !ctl.ready()) return;
      const t = (run.tries[idx] = (run.tries[idx] || 0) + 1);
      if (t === 1) run.asked++;
      const r = ctl.check();
      ctl.lock();
      if (r.ok) {
        const gain = t === 1 ? 10 : 5;
        if (t === 1) run.first++;
        run.xp += gain;
        resolve('ok');
        setDock('ok', { gain });
      } else {
        setDock('bad', { msg: r.msg });
      }
    }
    function retry() { ctl.unlock(); setDock('ask'); if (ctl.focus && FINE) ctl.focus(); }
    function reveal() {
      if (!run.tries[idx]) { run.tries[idx] = 1; run.asked++; }
      ctl.reveal();
      ctl.lock();
      resolve('reveal');
      setDock('reveal');
    }
    function selfComplete(res) {
      run.asked += res.total;
      run.first += res.correct;
      run.result[idx] = res.results;
      const gain = res.correct * 2;
      run.xp += gain;
      resolve(res.correct === res.total ? 'ok' : 'reveal');
      dock.dataset.state = res.correct === res.total ? 'ok' : 'reveal';
      btns.querySelectorAll('.btn-ghost').forEach((b) => b.remove());
      fb.replaceChildren(fbHead(res.correct === res.total ? ICON.check : ICON.bulb, `${res.correct} no ${res.total} pareizi`, gain));
      if (dockPrimary) { dockPrimary.disabled = false; dockPrimary.focus({ preventScroll: true }); }
      syncPad();
    }
    function next() {
      if (step.type === 'info') run.done.add(idx);
      advance();
    }
    function skip() {
      // Jautājums atgriežas nodarbības beigās (tikai vienu reizi rindā).
      if (!run.seq.slice(run.pos + 1).includes(idx)) run.seq.push(idx);
      advance();
    }
    function advance() {
      run.pos++;
      // Ja izlaistais jautājums jau atbildēts, atgriežoties ar «Atpakaļ», beigās to vairs nerāda.
      while (run.pos < run.seq.length && run.pos >= N && run.done.has(run.seq[run.pos])) run.pos++;
      if (run.pos < run.seq.length) show();
      else finish();
    }
    function back() {
      if (run.pos === 0) return;
      run.pos--;
      show();
    }
    function finish() {
      dockPrimary = null;
      if (!opts.practice) {
        const prev = P.done[lesson.id];
        P.done[lesson.id] = { xp: Math.max(prev ? prev.xp : 0, run.xp), at: today() };
      }
      P.xp += run.xp;
      bumpStreak();
      saveP();
      document.body.classList.remove('in-lesson');
      app.replaceChildren(doneScreen(lesson, run, !!opts.practice));
      window.scrollTo(0, 0);
    }
    function askExit() {
      if (run.done.size === 0 && !Object.keys(run.tries).length) { go('home'); return; }
      const keep = h('button', { class: 'btn btn-primary', type: 'button' }, 'Turpināt mācīties');
      const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'exit-t' },
        h('div', { class: 'sheet' },
          h('h2', { id: 'exit-t' }, 'Pārtraukt nodarbību?'),
          h('p', null, 'Šīs nodarbības progress un iegūtie XP netiks saglabāti.'),
          h('div', { class: 'sheet-btns' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go('home') }, 'Pārtraukt'), keep)));
      keep.addEventListener('click', () => ov.remove());
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
      root.append(ov);
      keep.focus();
    }

    show();
  }

  function infoBody(step, ctx) {
    const nodes = [];
    if (step.body) nodes.push(h('div', { class: 'prose', html: mdBlock(step.body) }));
    if (step.visual) nodes.push(visual(step.visual, ctx));
    if (step.after) nodes.push(h('div', { class: 'prose prose-after', html: mdBlock(step.after) }));
    return nodes;
  }

  function visual(v, ctx) {
    const out = typeof v === 'function' ? v(ctx) : v;
    if (out && out.nodeType) return h('div', { class: 'visual' }, out);
    return h('div', { class: 'visual', html: out });
  }

  function doneScreen(lesson, run, practice) {
    const acc = run.asked ? Math.round((run.first / run.asked) * 100) + '%' : '—';
    const nx = practice ? null : nextLesson();
    const d = new Date();
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
    const tile = (v, l) => h('div', { class: 'tile' }, h('b', { class: 'num' }, v), h('span', null, l));
    const s = streakNow();
    let primaryBtn;
    if (practice) primaryBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: startPractice }, 'Vēl viens treniņš');
    else if (nx) primaryBtn = h('button', { class: 'btn btn-primary', type: 'button', title: `${lessonNo(nx.id)}. ${nx.title}`, onclick: () => playLesson(nx), html: `Nākamā nodarbība ${ICON.arrow}` });
    else primaryBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('practice') }, 'Uz trenažieri');
    return h('main', { class: 'done' },
      h('div', { class: 'stamp', 'aria-hidden': 'true' }, h('span', null, 'Iegrāmatots'), h('small', { class: 'num' }, date)),
      h('div', { class: 'done-head' },
        h('h1', null, practice ? 'Treniņš pabeigts' : 'Nodarbība pabeigta'),
        h('p', null, practice ? `${run.asked} ${plural(run.asked, 'uzdevums', 'uzdevumi')} atkārtoti.` : `${lessonNo(lesson.id)}. ${lesson.title}`)),
      h('div', { class: 'tiles' }, tile(`+${run.xp}`, 'XP'), tile(acc, 'pareizi ar pirmo reizi'), tile(String(s), plural(s, 'diena', 'dienas') + ' pēc kārtas')),
      lesson.takeaways
        ? h('section', { class: 'takeaways' },
            h('h2', null, 'Galvenais'),
            h('ul', null, lesson.takeaways.map((t) => h('li', { html: `${ICON.check}<span>${md(t)}</span>` }))))
        : null,
      h('div', { class: 'done-btns' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go('home') }, 'Uz kursu'), primaryBtn));
  }

  /* =====================================================================
   * Interaktīvās komponentes
   * Katra atgriež { el, ready(), check() -> {ok, msg}, reveal(), lock(), unlock() }
   * ===================================================================== */
  function parseNum(s) {
    let t = String(s).replace(/[\s  €]/g, '').replace('−', '-');
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
  }

  const COMP = {
    choice(step, ctx) {
      let sel = -1, locked = false;
      const btns = step.options.map((o, i) =>
        h('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': 'false', onclick: () => { if (locked) return; sel = i; paint(); ctx.onChange(); } },
          h('span', { class: 'opt-key num', 'aria-hidden': 'true' }, String.fromCharCode(65 + i)),
          h('span', { class: 'opt-t', html: md(o.t) })));
      const el = h('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'Atbilžu varianti' }, btns);
      function paint() { btns.forEach((b, i) => { b.classList.toggle('sel', i === sel); b.setAttribute('aria-checked', String(i === sel)); }); }
      return {
        el,
        ready: () => sel >= 0,
        check() {
          const o = step.options[sel];
          btns[sel].classList.add(o.ok ? 'is-ok' : 'is-bad');
          return { ok: !!o.ok, msg: o.why };
        },
        reveal() { sel = step.options.findIndex((o) => o.ok); paint(); btns.forEach((b, i) => { b.classList.remove('is-bad'); b.classList.toggle('is-ok', !!step.options[i].ok); }); },
        lock() { locked = true; el.classList.add('locked'); },
        unlock() { locked = false; el.classList.remove('locked'); btns.forEach((b) => b.classList.remove('is-ok', 'is-bad')); },
      };
    },

    multi(step, ctx) {
      const sel = new Set();
      let locked = false;
      const btns = step.options.map((o, i) =>
        h('button', { class: 'opt opt-multi', type: 'button', role: 'checkbox', 'aria-checked': 'false', onclick: () => { if (locked) return; sel.has(i) ? sel.delete(i) : sel.add(i); paint(); ctx.onChange(); } },
          h('span', { class: 'opt-key', 'aria-hidden': 'true', html: ICON.check }),
          h('span', { class: 'opt-t', html: md(o.t) })));
      const el = h('div', { class: 'opts', role: 'group', 'aria-label': 'Atbilžu varianti' }, btns);
      function paint() { btns.forEach((b, i) => { b.classList.toggle('sel', sel.has(i)); b.setAttribute('aria-checked', String(sel.has(i))); }); }
      return {
        el,
        ready: () => sel.size > 0,
        check() {
          const wrong = [...sel].filter((i) => !step.options[i].ok);
          const missed = step.options.some((o, i) => o.ok && !sel.has(i));
          sel.forEach((i) => btns[i].classList.add(step.options[i].ok ? 'is-ok' : 'is-bad'));
          let msg = null;
          if (wrong.length) msg = step.options[wrong[0]].why || step.hint;
          else if (missed) msg = 'Viss, ko atzīmēji, ir pareizi, bet vismaz viena pareizā atbilde vēl trūkst.';
          return { ok: !wrong.length && !missed, msg };
        },
        reveal() { sel.clear(); step.options.forEach((o, i) => o.ok && sel.add(i)); paint(); btns.forEach((b, i) => { b.classList.remove('is-bad'); b.classList.toggle('is-ok', !!step.options[i].ok); }); },
        lock() { locked = true; el.classList.add('locked'); },
        unlock() { locked = false; el.classList.remove('locked'); btns.forEach((b) => b.classList.remove('is-ok', 'is-bad')); },
      };
    },

    number(step, ctx) {
      const id = uid('num');
      const input = h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: '0' });
      const wrap = h('div', { class: 'numfield' },
        h('label', { class: 'sr-only', for: id }, 'Tava atbilde eiro'),
        input,
        h('span', { class: 'nf-unit' }, step.unit == null ? '€' : step.unit));
      input.addEventListener('input', ctx.onChange);
      const val = () => parseNum(input.value);
      return {
        el: wrap,
        focus: () => input.focus({ preventScroll: true }),
        ready: () => val() !== null,
        check() {
          const v = val();
          const near = (a, b, tol) => Math.abs(a - b) <= tol + 1e-9;
          const ok = near(v, step.answer, step.tol || 0.004);
          wrap.classList.add(ok ? 'is-ok' : 'is-bad');
          let msg = step.hint;
          const w = !ok && step.wrong && step.wrong.find((x) => near(x.v, v, 0.004));
          if (w) msg = w.msg;
          return { ok, msg };
        },
        reveal() { input.value = num(step.answer); wrap.classList.remove('is-bad'); wrap.classList.add('is-ok'); },
        lock() { input.readOnly = true; },
        unlock() { input.readOnly = false; wrap.classList.remove('is-ok', 'is-bad'); input.select(); },
      };
    },

    sort(step, ctx) {
      const n = step.items.length;
      const place = new Array(n).fill(null);
      let sel = -1, locked = false;
      const pool = h('div', { class: 'pool', 'aria-label': 'Vēl nesašķirotie posteņi' });
      const zones = {}, totals = {};

      const chips = step.items.map((it, i) => {
        const c = h('button', { class: 'chip', type: 'button', draggable: 'true', 'aria-pressed': 'false' },
          h('span', null, it.t),
          it.v != null ? h('span', { class: 'chip-amt num' }, eur(it.v)) : null);
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          if (locked) return;
          // Ja cits postenis jau ir izvēlēts, pieskāriens ievietotam postenim nozīmē «liec šajā grupā».
          if (place[i] !== null && sel >= 0 && sel !== i) { drop(place[i]); return; }
          if (place[i] !== null) { place[i] = null; sel = i; } else sel = sel === i ? -1 : i;
          layout();
        });
        c.addEventListener('dragstart', (e) => {
          if (locked) { e.preventDefault(); return; }
          sel = i;
          e.dataTransfer.setData('text/plain', String(i));
          e.dataTransfer.effectAllowed = 'move';
          c.classList.add('dragging');
        });
        c.addEventListener('dragend', () => c.classList.remove('dragging'));
        return c;
      });

      const buckets = step.buckets.map((b) => {
        const zone = h('div', { class: 'bucket-zone' });
        zones[b.id] = zone;
        const tot = step.totals ? h('span', { class: 'bucket-total num' }) : null;
        if (tot) totals[b.id] = tot;
        const bk = h('div', { class: 'bucket tone-' + (b.tone || 'n'), role: 'button', tabindex: '0', 'aria-label': `Ievietot grupā «${b.label}»` },
          h('div', { class: 'bucket-h' }, h('span', null, b.label), tot),
          zone);
        bk.addEventListener('click', () => drop(b.id));
        bk.addEventListener('keydown', (e) => { if (e.target === bk && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); drop(b.id); } });
        bk.addEventListener('dragover', (e) => { if (locked) return; e.preventDefault(); bk.classList.add('over'); });
        bk.addEventListener('dragleave', () => bk.classList.remove('over'));
        bk.addEventListener('drop', (e) => {
          e.preventDefault();
          bk.classList.remove('over');
          const i = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (!isNaN(i)) { sel = i; drop(b.id); }
        });
        return bk;
      });
      pool.addEventListener('dragover', (e) => { if (!locked) e.preventDefault(); });
      pool.addEventListener('drop', (e) => {
        e.preventDefault();
        const i = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(i) && !locked) { place[i] = null; sel = -1; layout(); }
      });

      function drop(id) {
        if (locked || sel < 0) return;
        place[sel] = id;
        sel = -1;
        layout();
      }
      function layout() {
        chips.forEach((c, i) => {
          (place[i] === null ? pool : zones[place[i]]).append(c);
          c.classList.toggle('picked', i === sel);
          c.setAttribute('aria-pressed', String(i === sel));
        });
        buckets.forEach((b) => b.classList.toggle('armed', sel >= 0 && !locked));
        if (step.totals) {
          step.buckets.forEach((b) => {
            totals[b.id].textContent = eur(step.items.reduce((s, it, i) => s + (place[i] === b.id ? it.v : 0), 0));
          });
        }
        pool.classList.toggle('is-empty', place.every((p) => p !== null));
        ctx.onChange();
      }

      const el = h('div', { class: 'sorter' },
        h('p', { class: 'help' }, 'Pieskaries postenim un tad grupai. Datorā posteni var arī aizvilkt ar peli.'),
        pool,
        h('div', { class: 'buckets' + (step.buckets.length === 2 ? ' two' : '') }, buckets));
      layout();

      return {
        el,
        ready: () => place.every((p) => p !== null),
        check() {
          let wrong = 0;
          chips.forEach((c, i) => {
            const ok = place[i] === step.items[i].b;
            c.classList.add(ok ? 'is-ok' : 'is-bad');
            if (!ok) wrong++;
          });
          return { ok: wrong === 0, msg: wrong ? `${wrong} no ${n} posteņiem ir nepareizajā grupā. ${step.hint || ''}` : null };
        },
        reveal() {
          step.items.forEach((it, i) => (place[i] = it.b));
          sel = -1;
          layout();
          chips.forEach((c) => { c.classList.remove('is-bad'); c.classList.add('is-ok'); });
        },
        lock() { locked = true; el.classList.add('locked'); buckets.forEach((b) => b.classList.remove('armed')); },
        unlock() {
          locked = false;
          el.classList.remove('locked');
          chips.forEach((c, i) => { if (c.classList.contains('is-bad')) place[i] = null; c.classList.remove('is-ok', 'is-bad'); });
          layout();
        },
      };
    },

    scale(step, ctx) {
      const v = { A: step.A, S: step.S, PK: step.start };
      const sc = V.scale(v, { max: step.max });
      const id = uid('rng');
      const out = h('output', { class: 'num', for: id }, eur(v.PK));
      const range = h('input', { id, type: 'range', min: String(step.min), max: String(step.rangeMax), step: String(step.step), value: String(v.PK) });
      range.addEventListener('input', () => { v.PK = +range.value; out.textContent = eur(v.PK); sc.set(v); ctx.onChange(); });
      const el = h('div', { class: 'scale-q' },
        sc.el,
        h('div', { class: 'slider' },
          h('label', { for: id }, h('i', { class: 'sw sw-pk' }), 'Pašu kapitāls'),
          out),
        range);
      return {
        el,
        ready: () => true,
        check() {
          const ok = v.PK === step.answer;
          return { ok, msg: ok ? null : v.PK < step.answer ? 'Aktīvu puse joprojām ir smagāka: pašu kapitāls ir par mazu.' : 'Tagad smagāka ir labā puse: pašu kapitāls ir par lielu.' };
        },
        reveal() { v.PK = step.answer; range.value = String(v.PK); out.textContent = eur(v.PK); sc.set(v); },
        lock() { range.disabled = true; },
        unlock() { range.disabled = false; },
      };
    },

    effect(step, ctx) {
      const vals = step.rows.map(() => 0);
      let locked = false;
      const rowEls = [], afterEls = [], segs = [];
      const eqBox = h('div', { class: 'fx-eq' });
      const groups = [['A', 'Aktīvi', 'a'], ['S', 'Saistības', 's'], ['PK', 'Pašu kapitāls', 'pk']];
      const body = groups.map(([side, label, tone]) => {
        const rows = step.rows.map((r, i) => [r, i]).filter(([r]) => r.side === side);
        if (!rows.length) return null;
        return h('div', { class: 'fx-group tone-' + tone },
          h('div', { class: 'fx-gh' }, h('i', { class: 'sw sw-' + tone }), label),
          rows.map(([r, i]) => {
            const after = h('span', { class: 'fx-after' });
            afterEls[i] = after;
            const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': r.name },
              [[1, '+', 'Palielinās'], [0, '0', 'Nemainās'], [-1, '−', 'Samazinās']].map(([val, sym, lbl]) =>
                h('button', { type: 'button', role: 'radio', 'data-v': String(val), 'aria-label': lbl, title: lbl, 'aria-checked': String(val === 0), onclick: () => { if (locked) return; vals[i] = val; paint(); ctx.onChange(); } }, sym)));
            segs[i] = seg;
            const row = h('div', { class: 'fx-row' },
              h('span', { class: 'fx-name' }, r.name),
              h('span', { class: 'fx-vals num' }, h('span', { class: 'fx-before' }, eur(r.v)), h('span', { class: 'fx-arrow', 'aria-hidden': 'true' }, '→'), after),
              seg);
            rowEls[i] = row;
            return row;
          }));
      });
      function totals() {
        const t = { A: 0, S: 0, PK: 0 };
        step.rows.forEach((r, i) => (t[r.side] += r.v + vals[i] * step.amount));
        return t;
      }
      function paint() {
        step.rows.forEach((r, i) => {
          afterEls[i].textContent = eur(r.v + vals[i] * step.amount);
          afterEls[i].dataset.d = String(vals[i]);
          segs[i].querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === vals[i])));
        });
        const t = totals();
        eqBox.innerHTML = V.eq(t.A, t.S, t.PK);
      }
      const el = h('div', { class: 'effect' },
        h('p', { class: 'fx-amt' }, 'Darījuma summa: ', h('b', { class: 'num' }, eur(step.amount))),
        body,
        eqBox);
      paint();
      return {
        el,
        ready: () => vals.some((x) => x !== 0),
        check() {
          let ok = true;
          step.rows.forEach((r, i) => { if (vals[i] !== (r.ans || 0)) { ok = false; rowEls[i].classList.add('is-bad'); } });
          if (ok) step.rows.forEach((r, i) => { if (r.ans) rowEls[i].classList.add('is-ok'); });
          const t = totals();
          const bal = t.A === t.S + t.PK;
          return {
            ok,
            msg: ok ? null : bal
              ? 'Vienādojums ir līdzsvarā, bet mainīti ne tie posteņi. Padomā, kas tieši notiek ar naudu un kas ar pārējo.'
              : 'Vienādojums nav līdzsvarā. Katrs darījums maina vismaz divus posteņus tā, ka abas puses paliek vienādas.',
          };
        },
        reveal() {
          step.rows.forEach((r, i) => (vals[i] = r.ans || 0));
          paint();
          rowEls.forEach((r, i) => { r.classList.remove('is-bad'); r.classList.toggle('is-ok', !!step.rows[i].ans); });
        },
        lock() { locked = true; el.classList.add('locked'); },
        unlock() { locked = false; el.classList.remove('locked'); rowEls.forEach((r) => r.classList.remove('is-ok', 'is-bad')); },
      };
    },

    quick(step, ctx) {
      let idx = 0, correct = 0, busy = false, timer = 0;
      const results = [];
      const dots = step.items.map(() => h('span', { class: 'q-dot' }));
      const counter = h('span', { class: 'q-count num' });
      const stmt = h('p', { class: 'q-stmt' });
      const opts = h('div', { class: 'q-opts' + (step.options.length > 2 ? ' many' : '') });
      const note = h('p', { class: 'q-note', 'aria-live': 'polite' });
      const nextBtn = h('button', { class: 'btn btn-ghost q-next', type: 'button', hidden: true }, 'Tālāk');
      nextBtn.addEventListener('click', advance);
      const box = h('div', { class: 'quick' },
        h('div', { class: 'q-top' }, h('div', { class: 'q-dots', 'aria-hidden': 'true' }, dots), counter),
        stmt, opts, note, nextBtn);

      function showItem() {
        const it = step.items[idx];
        busy = false;
        dots.forEach((d, i) => d.classList.toggle('cur', i === idx));
        counter.textContent = `${idx + 1}/${step.items.length}`;
        stmt.textContent = it.t;
        note.replaceChildren();
        nextBtn.hidden = true;
        opts.replaceChildren(...step.options.map((o, oi) =>
          h('button', { class: 'qbtn' + (step.optTone ? ' tone-' + step.optTone[oi] : ''), type: 'button', onclick: () => pick(oi) }, o)));
        if (FINE) { const b = opts.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
      }
      function pick(oi) {
        if (busy) return;
        busy = true;
        const it = step.items[idx];
        const ok = oi === it.a;
        const bs = opts.querySelectorAll('button');
        bs.forEach((b) => b.setAttribute('aria-disabled', 'true'));
        bs[oi].classList.add(ok ? 'is-ok' : 'is-bad');
        if (!ok) bs[it.a].classList.add('is-ok');
        dots[idx].classList.add(ok ? 'ok' : 'bad');
        results.push(ok);
        if (ok) correct++;
        note.innerHTML = (ok ? '<b>Pareizi.</b> ' : `<b>Pareizā atbilde: ${step.options[it.a]}.</b> `) + md(it.why || '');
        nextBtn.hidden = false;
        nextBtn.textContent = idx + 1 < step.items.length ? 'Tālāk' : 'Rezultāts';
        nextBtn.focus({ preventScroll: true });
        if (ok) timer = setTimeout(advance, REDUCE ? 1600 : 1300);
      }
      function advance() {
        clearTimeout(timer);
        if (!busy) return;
        idx++;
        if (idx < step.items.length) showItem();
        else finish();
      }
      function renderDone() {
        busy = true;
        dots.forEach((d, i) => { d.classList.remove('cur'); d.classList.add(results[i] ? 'ok' : 'bad'); });
        counter.textContent = '';
        stmt.textContent = `${correct} no ${step.items.length} pareizi`;
        opts.replaceChildren();
        note.replaceChildren();
        nextBtn.remove();
        box.classList.add('q-done');
        box.append(h('ol', { class: 'q-review' }, step.items.map((it, i) =>
          h('li', { class: results[i] ? 'ok' : 'bad' },
            h('span', { class: 'q-mark', html: results[i] ? ICON.check : ICON.x }),
            h('span', null, it.t),
            h('b', null, step.options[it.a])))));
      }
      function finish() {
        renderDone();
        ctx.complete({ correct, total: step.items.length, results: results.slice() });
      }
      if (ctx.review) {
        // Atgriežoties pie jau izspēlētas kārtas, rāda tās rezultātu.
        results.push(...ctx.review);
        correct = results.filter(Boolean).length;
        renderDone();
      } else {
        showItem();
      }
      return { el: box, selfPaced: true };
    },

    entry(step, ctx) {
      const L = ctx.ledger;
      const ids = step.accounts || Object.keys(L.accts);
      const A = (id) => (L && L.accts[id]) || C.accounts[id];
      // Vienkāršs ieraksts {d, k, amount} vai salikts {lines: [{s, a, v}]}
      const lines = step.lines || [{ s: 'd', a: step.d, v: step.amount }, { s: 'k', a: step.k, v: step.amount }];
      const pick = lines.map(() => null);
      let active = 0, locked = false;
      const slots = lines.map((ln, i) => {
        const val = h('span', { class: 'slot-val' });
        const b = h('button', {
          class: `slot slot-${ln.s}`, type: 'button',
          'aria-label': `${ln.s === 'd' ? 'Debeta' : 'Kredīta'} konts, ${eur(ln.v)}`,
          onclick: () => { if (locked) return; active = i; paint(); },
        }, val);
        const row = h('div', { class: `jrow jrow-${ln.s}` },
          h('span', { class: 'jside', 'aria-hidden': 'true' }, ln.s === 'd' ? 'D' : 'K'),
          b,
          h('span', { class: 'jamt num' }, eur(ln.v)));
        return { b, val, row };
      });
      const chips = ids.map((id) => {
        const a = A(id);
        return h('button', { class: 'acct', type: 'button', 'data-id': id, onclick: () => choose(id) },
          h('span', { class: 'acct-n' }, a.name),
          h('span', { class: 'acct-t' }, h('i', { class: 'sw sw-' + V.TONE[a.type] }), V.TYPE[a.type]));
      });
      function choose(id) {
        if (locked) return;
        pick.forEach((p, i) => { if (p === id && i !== active) pick[i] = null; });
        pick[active] = id;
        // pāriet uz nākamo tukšo rindu
        for (let j = 1; j <= lines.length; j++) {
          const n = (active + j) % lines.length;
          if (!pick[n]) { active = n; break; }
        }
        paint();
        ctx.onChange();
      }
      function paint() {
        slots.forEach(({ b, val }, i) => {
          b.classList.toggle('active', !locked && active === i);
          b.classList.toggle('filled', !!pick[i]);
          b.setAttribute('aria-pressed', String(!locked && active === i));
          val.textContent = pick[i] ? A(pick[i]).name : 'izvēlies kontu';
          val.classList.toggle('empty', !pick[i]);
        });
        chips.forEach((c) => {
          const i = pick.indexOf(c.dataset.id);
          c.classList.toggle('used-d', i >= 0 && lines[i].s === 'd');
          c.classList.toggle('used-k', i >= 0 && lines[i].s === 'k');
        });
      }
      const result = h('div', { class: 'entry-result', hidden: true });
      const el = h('div', { class: 'entry' },
        h('div', { class: 'journal' + (lines.length > 2 ? ' journal-multi' : '') }, slots.map((s) => s.row)),
        h('p', { class: 'help' }, lines.length > 2
          ? 'Izvēlies rindu un tad kontu no saraksta. Debeta rindas ir augšā, kredīta rindas ar atkāpi zemāk.'
          : 'Izvēlies rindu D vai K un tad kontu no saraksta.'),
        h('div', { class: 'accts' }, chips),
        result);
      paint();

      function showResult() {
        const used = [...new Set(lines.map((l) => l.a))];
        el.classList.add('solved');
        result.hidden = false;
        if (L) {
          const n = ctx.post(lines.map((l) => ({ ...l })), { cf: step.cf, memo: step.memo });
          const LV = L.upTo(n);
          result.innerHTML = `<p class="res-h">Virsgrāmatā · ieraksts #${n + 1}</p>` +
            V.tpair(...used.map((id) => V.ledgerT(LV, id, n))) +
            V.eq(LV.total('A'), LV.total('S'), LV.total('PK') + LV.profit(), { pkLabel: 'Pašu kap. + peļņa' });
        } else {
          result.innerHTML = `<p class="res-h">Tā ieraksts izskatās kontos</p>` +
            V.tpair(...used.map((id) => {
              const a = A(id), o = { d: [], k: [], tone: V.TONE[a.type] };
              lines.forEach((l) => { if (l.a === id) o[l.s].push(l.v); });
              o.hl = o.d.length ? { side: 'd', i: 0 } : { side: 'k', i: 0 };
              return V.tacct(a.name, o);
            }));
        }
        requestAnimationFrame(() => result.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' }));
      }
      return {
        el,
        ready: () => pick.every(Boolean),
        check() {
          const right = lines.map((l, i) => pick[i] === l.a);
          const ok = right.every(Boolean);
          slots.forEach((s, i) => s.b.classList.add(right[i] ? 'is-ok' : 'is-bad'));
          let msg = step.hint || 'Padomā: kuri konti mainās un kurā virzienā?';
          if (!ok) {
            const want = new Set(lines.map((l) => l.a));
            const sameSet = pick.every((p) => want.has(p));
            const nRight = right.filter(Boolean).length;
            if (sameSet) {
              msg = lines.length === 2
                ? 'Konti ir pareizi, bet puses samainītas. Kurš konts palielinās, un kāda veida tas ir?'
                : 'Konti izvēlēti pareizi, bet ne katrs savā rindā. Pārbaudi katras rindas pusi un summu.';
            } else if (nRight) {
              msg = (lines.length === 2 ? 'Viens konts ir pareizs, otrs ne. ' : `Pareizi ir ${nRight} no ${lines.length} kontiem. `) + (step.hint || '');
            }
          }
          if (ok) showResult();
          return { ok, msg };
        },
        reveal() {
          lines.forEach((l, i) => (pick[i] = l.a));
          slots.forEach((s) => { s.b.classList.remove('is-bad'); s.b.classList.add('is-ok'); });
          paint();
          showResult();
        },
        lock() { locked = true; el.classList.add('locked'); paint(); },
        unlock() {
          locked = false;
          el.classList.remove('locked');
          const bad = slots.findIndex((s) => s.b.classList.contains('is-bad'));
          if (bad >= 0) active = bad;
          slots.forEach((s) => s.b.classList.remove('is-ok', 'is-bad'));
          paint();
        },
      };
    },
  };

  /* ---------- Tastatūra ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const ov = document.querySelector('.overlay'); if (ov) ov.remove(); return; }
    if (view !== 'player' || e.key !== 'Enter' || e.isComposing) return;
    const t = e.target;
    if (t && t.closest && t.closest('button, a, [role="button"], textarea, select')) return;
    if (dockPrimary && !dockPrimary.disabled && document.contains(dockPrimary)) {
      e.preventDefault();
      dockPrimary.click();
    }
  });

  /* ---------- Starts ---------- */
  const ROUTES = { vardnica: 'glossary', trenazieris: 'practice', kurss: 'home' };
  const routeFromHash = () => ROUTES[(location.hash || '').slice(1)];
  window.addEventListener('hashchange', () => { const r = routeFromHash(); if (r && view !== 'player') go(r); });
  view = routeFromHash() || 'home';
  render();
})();
