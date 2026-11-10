/* Ventspils siltums — progressive enhancements (no dependencies).
   Everything here is optional: pages stay readable and navigable without JavaScript. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var ROOT = html.getAttribute('data-root') || '';
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* "avārija" and "avarija" should find the same pages */
  function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function loadScript(src, done) {
    var s = doc.createElement('script');
    s.src = ROOT + src; s.onload = done; s.onerror = done;
    doc.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- theme + text size */
  var themeBtn = $('[data-theme-toggle]');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var dark = html.getAttribute('data-theme') === 'dark' ||
      (!html.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    store.set('vs-theme', next);
  });
  var sizeBtn = $('[data-text-size]');
  if (sizeBtn) sizeBtn.addEventListener('click', function () {
    var steps = ['', 'lg', 'xl'], names = ['standarta', 'lielāks', 'liels'];
    var i = (steps.indexOf(html.getAttribute('data-text') || '') + 1) % steps.length;
    if (steps[i]) html.setAttribute('data-text', steps[i]); else html.removeAttribute('data-text');
    store.set('vs-text', steps[i] || null);
    sizeBtn.setAttribute('title', 'Teksta izmērs: ' + names[i]);
  });

  /* ---------------------------------------------------------------- navigation */
  var header = $('.site-header'), nav = $('#nav'), menuBtn = $('.menu-btn');
  /* CSS decides (container query) when the full menu fits; here we only read the result */
  var desktop = { get matches() { return !menuBtn || getComputedStyle(menuBtn).display === 'none'; } };
  var items = $$('.nav-item');
  var hoverTimer;

  function closePanels(except) {
    items.forEach(function (it) {
      if (it === except) return;
      it.classList.remove('open');
      var top = $('.nav-top', it);
      if (top) top.setAttribute('aria-expanded', 'false');
    });
  }
  function openPanel(it) {
    closePanels(it);
    it.classList.add('open');
    $('.nav-top', it).setAttribute('aria-expanded', 'true');
  }
  items.forEach(function (it) {
    var top = $('.nav-top', it), panel = $('.nav-panel', it);
    if (!top || !panel) return;
    top.setAttribute('role', 'button');
    top.setAttribute('aria-expanded', 'false');
    top.setAttribute('aria-controls', panel.id);
    top.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (it.classList.contains('open')) closePanels(); else openPanel(it);
    });
    top.addEventListener('keydown', function (ev) {
      if (ev.key === ' ') { ev.preventDefault(); top.click(); }
      if (ev.key === 'ArrowDown' && desktop.matches) {
        ev.preventDefault(); openPanel(it);
        var first = $('a', panel); if (first) first.focus();
      }
    });
    it.addEventListener('mouseenter', function () {
      if (!desktop.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { openPanel(it); }, 90);
    });
    it.addEventListener('mouseleave', function () {
      if (!desktop.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { if (!it.contains(doc.activeElement)) closePanels(); }, 220);
    });
  });
  doc.addEventListener('click', function (ev) {
    if (desktop.matches && nav && !nav.contains(ev.target)) closePanels();
  });
  if (nav) nav.addEventListener('focusout', function (ev) {
    if (desktop.matches && ev.relatedTarget && !nav.contains(ev.relatedTarget)) closePanels();
  });

  function setMenu(open) {
    if (!menuBtn) return;
    if (open && header) html.style.setProperty('--nav-top', Math.round(header.getBoundingClientRect().bottom) + 'px');
    html.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (!open) closePanels();
    else {
      var cur = $('.nav-item.is-current');
      if (cur) openPanel(cur);
    }
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(!html.classList.contains('nav-open')); });
  var wasDesktop = desktop.matches;
  function syncMode() {
    var now = desktop.matches;
    if (now !== wasDesktop) { wasDesktop = now; setMenu(false); }
  }
  window.addEventListener('resize', syncMode);
  if (sizeBtn) sizeBtn.addEventListener('click', function () { setTimeout(syncMode, 0); });

  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      var open = $('.nav-item.open');
      if (html.classList.contains('nav-open')) { setMenu(false); menuBtn.focus(); }
      else if (open) { closePanels(); $('.nav-top', open).focus(); }
    }
  });

  /* section menu on inner pages collapses on small screens */
  var side = $('.side-nav');
  if (side) {
    var wide = window.matchMedia('(min-width: 64em)');
    var syncSide = function () { side.open = wide.matches; };
    syncSide(); wide.addEventListener('change', syncSide);
  }

  /* ---------------------------------------------------------------- search */
  var index = null, loading = null;
  function withIndex(cb) {
    if (index) return cb();
    if (loading) return loading.push(cb);
    loading = [cb];
    loadScript('assets/js/search-index.js', function () {
      index = (window.VS_SEARCH || []).map(function (r) {
        return { title: r[0], url: r[1], section: r[2], text: r[3], fTitle: fold(r[0]), fText: fold(r[3]), fSection: fold(r[2]) };
      });
      loading.forEach(function (fn) { fn(); }); loading = null;
    });
  }
  function query(q, limit) {
    var words = fold(q).split(/[^a-z0-9Ѐ-ӿ]+/).filter(function (w) { return w.length > 1; });
    if (!words.length) return { words: [], hits: [] };
    var hits = [];
    index.forEach(function (it) {
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], s = 0, at = it.fTitle.indexOf(w);
        if (at === 0) s += 14; else if (at > 0) s += it.fTitle.charAt(at - 1) === ' ' ? 10 : 6;
        if (it.fSection.indexOf(w) > -1) s += 2;
        var t = it.fText.indexOf(w);
        if (t > -1) s += 3 + (it.fText.indexOf(w, t + w.length) > -1 ? 1 : 0);
        if (!s) return;               /* every word has to match somewhere */
        score += s;
      }
      if (it.fTitle === fold(q).trim()) score += 20;
      if (it.section.indexOf('Jaunumi') !== 0) score += 4;   /* service pages before the news archive */
      else score += Math.max(0, (parseInt(it.section.slice(-4), 10) || 2012) - 2012) * 0.6;
      hits.push({ it: it, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return { words: words, hits: limit ? hits.slice(0, limit) : hits, total: hits.length };
  }
  function highlight(text, words) {
    var folded = fold(text), marks = [];
    words.forEach(function (w) {
      var at = folded.indexOf(w);
      while (at > -1 && marks.length < 40) { marks.push([at, at + w.length]); at = folded.indexOf(w, at + w.length); }
    });
    if (folded.length !== text.length || !marks.length) return esc(text);
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    marks.forEach(function (m) {
      if (m[0] < pos) return;
      out += esc(text.slice(pos, m[0])) + '<mark>' + esc(text.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    return out + esc(text.slice(pos));
  }
  function snippet(it, words) {
    var at = -1;
    for (var i = 0; i < words.length && at < 0; i++) at = it.fText.indexOf(words[i]);
    if (it.fText.length !== it.text.length) at = -1;
    var start = at > 70 ? it.text.lastIndexOf(' ', at - 60) + 1 : 0;
    var chunk = it.text.slice(start, start + 170);
    return (start > 0 ? '… ' : '') + chunk + (start + 170 < it.text.length ? ' …' : '');
  }
  function renderResults(box, q, limit, form) {
    if (!q.trim()) { box.innerHTML = ''; return 0; }
    var res = query(q, limit);
    if (!res.hits.length) {
      box.innerHTML = '<p class="result-none">Nekas netika atrasts. Pamēģiniet citu atslēgvārdu vai zvaniet Klientu daļai.</p>';
      return 0;
    }
    var out = res.hits.map(function (h) {
      var it = h.it, text = snippet(it, res.words);
      return '<a class="result" href="' + esc(ROOT + it.url) + '">' +
        (it.section ? '<span class="result-meta">' + esc(it.section) + '</span>' : '') +
        '<span class="result-title">' + highlight(it.title, res.words) + '</span>' +
        (text ? '<span class="result-text">' + highlight(text, res.words) + '</span>' : '') + '</a>';
    }).join('');
    if (limit && res.total > limit && form) {
      out += '<a class="result-all" href="' + esc(form.getAttribute('action') + '?q=' + encodeURIComponent(q)) + '">Rādīt visus ' + res.total + ' rezultātus</a>';
    }
    box.innerHTML = out;
    return res.total;
  }

  $$('form[data-search]').forEach(function (form) {
    var input = $('input[type=search]', form);
    var scope = form.closest('dialog') || form.parentNode;
    var box = $('[data-search-results]', scope), count = $('[data-search-count]', scope);
    var isPage = form.hasAttribute('data-search-page');
    var timer;
    function run() {
      var q = input.value;
      withIndex(function () {
        var n = renderResults(box, q, isPage ? 60 : 7, form);
        if (count) count.textContent = q.trim() ? (n ? 'Atrasti rezultāti: ' + n : '') : '';
      });
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    form.addEventListener('submit', function (ev) {
      if (isPage) {
        ev.preventDefault(); run();
        if (history.replaceState) history.replaceState(null, '', '?q=' + encodeURIComponent(input.value));
      }
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      var links = $$('.result', box); if (!links.length) return;
      ev.preventDefault();
      (ev.key === 'ArrowDown' ? links[0] : links[links.length - 1]).focus();
    });
    box.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      var links = $$('.result', box), i = links.indexOf(doc.activeElement);
      ev.preventDefault();
      var next = links[i + (ev.key === 'ArrowDown' ? 1 : -1)];
      (next || input).focus();
    });
    if (isPage) {
      var q = new URLSearchParams(location.search).get('q');
      if (q) { input.value = q; run(); } else input.focus();
    }
  });

  var dialog = $('#search-dialog');
  function openSearch(text) {
    if (!dialog || !dialog.showModal) return false;
    if (html.classList.contains('nav-open')) setMenu(false);
    if (!dialog.open) dialog.showModal();
    var input = $('input[type=search]', dialog);
    if (typeof text === 'string') { input.value = text; input.dispatchEvent(new Event('input')); }
    input.focus(); input.select();
    withIndex(function () {});
    return true;
  }
  if (dialog) {
    $$('[data-search-open]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) { if (openSearch()) ev.preventDefault(); });
    });
    $$('[data-search-close]', dialog).forEach(function (btn) { btn.addEventListener('click', function () { dialog.close(); }); });
    dialog.addEventListener('click', function (ev) { if (ev.target === dialog) dialog.close(); });
    doc.addEventListener('keydown', function (ev) {
      var tag = (ev.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable;
      if ((ev.key === '/' && !typing) || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')) {
        if (openSearch()) ev.preventDefault();
      }
    });
    $$('[data-search-hint]').forEach(function (hint) {
      hint.addEventListener('click', function (ev) { if (openSearch(hint.textContent.trim())) ev.preventDefault(); });
    });
    /* the big search field on the home page hands over to the dialog */
    $$('form[data-search-proxy]').forEach(function (form) {
      var input = $('input[type=search]', form);
      input.addEventListener('input', function () {
        if (input.value.length < 2) return;
        var value = input.value; input.value = '';
        openSearch(value);
      });
    });
  }

  /* ---------------------------------------------------------------- news archive */
  var newsForm = $('[data-news-filter]');
  if (newsForm) (function () {
    var list = $('[data-news-list]'), more = $('[data-news-more]'), count = $('[data-news-count]');
    var MONTHS = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
    var PAGE = 12, shown = PAGE, data = null, rows = [];
    function date(iso) {
      var p = iso.split('-');
      return p.length < 3 ? iso : (+p[0]) + '. gada ' + (+p[2]) + '. ' + MONTHS[+p[1] - 1];
    }
    function card(r) {
      var img = r[4] ? '<span class="card-img"><img src="' + esc(r[4]) + '" alt="" loading="lazy" decoding="async"></span>' : '<span class="card-img card-img-empty"></span>';
      return '<article class="news-card"><a href="' + esc(ROOT + r[1]) + '">' + img + '<span class="card-body"><time datetime="' + esc(r[2]) + '">' + esc(date(r[2])) +
        '</time><h3>' + esc(r[0]) + '</h3><span class="card-text">' + esc(r[3]) + '</span><span class="more">Lasīt vairāk<span class="i i-arrow-right" aria-hidden="true"></span></span></span></a></article>';
    }
    function plural(n) { return n + (n % 10 === 1 && n % 100 !== 11 ? ' ieraksts' : ' ieraksti'); }
    function apply(reset) {
      if (!data) return;
      if (reset) shown = PAGE;
      var q = fold(newsForm.q.value).trim(), year = newsForm.year.value;
      var words = q.split(/\s+/).filter(Boolean);
      rows = data.filter(function (r) {
        if (year && r[2].slice(0, 4) !== year) return false;
        return words.every(function (w) { return r.f.indexOf(w) > -1; });
      });
      list.innerHTML = rows.length ? rows.slice(0, shown).map(card).join('') : '<p class="empty">Šādiem nosacījumiem jaunumi nav atrasti.</p>';
      count.textContent = plural(rows.length);
      more.parentNode.hidden = shown >= rows.length;
    }
    function ready(cb) {
      if (data) return cb();
      loadScript('assets/js/news-index.js', function () {
        data = (window.VS_NEWS || []).map(function (r) { r.f = fold(r[0] + ' ' + r[3]); return r; });
        cb();
      });
    }
    var timer;
    newsForm.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { ready(function () { apply(true); }); }, 140); });
    newsForm.addEventListener('submit', function (ev) { ev.preventDefault(); });
    more.addEventListener('click', function () { ready(function () { shown += PAGE; apply(false); }); });
  })();

  /* ---------------------------------------------------------------- content helpers */
  /* mark today's row in opening-hours tables */
  var DAYS = ['svētdiena', 'pirmdiena', 'otrdiena', 'trešdiena', 'ceturtdiena', 'piektdiena', 'sestdiena'];
  var today;
  try { today = new Date().toLocaleDateString('lv-LV', { weekday: 'long', timeZone: 'Europe/Riga' }).toLowerCase(); } catch (e) { today = DAYS[new Date().getDay()]; }
  if (DAYS.indexOf(today) < 0) today = DAYS[new Date().getDay()];
  $$('.hours tr, .prose table tr').forEach(function (row) {
    var cells = row.children, hit = false;
    for (var i = 0; i < Math.min(cells.length, 2) && !hit; i++) {
      var text = cells[i].textContent.toLowerCase();
      if (text.length < 60 && text.indexOf(today) > -1 && /\d{1,2}[.:]\d{2}/.test(row.textContent)) {
        hit = true;
        if (text.trim() === today) cells[i].setAttribute('data-today', '');
      }
    }
    if (hit) row.classList.add('today');
  });

  /* tables with a header row become stacked cards on phones (labels come from the header) */
  $$('.table-wrap > table').forEach(function (table) {
    var heads = $$('thead th', table);
    if (heads.length < 4 || table.querySelector('tbody [rowspan], tbody [colspan]')) return;
    $$('tbody > tr', table).forEach(function (row) {
      for (var i = 0; i < row.children.length; i++) {
        if (heads[i]) row.children[i].setAttribute('data-label', heads[i].textContent.trim());
      }
    });
    table.classList.add('stack');
  });

  /* wide tables: keyboard-scrollable region */
  $$('.table-wrap').forEach(function (wrap) {
    if (wrap.scrollWidth > wrap.clientWidth + 4) {
      wrap.setAttribute('tabindex', '0'); wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Tabula — ritināma horizontāli');
    }
  });

  /* YouTube: load the player only after a click */
  $$('.video[data-youtube]').forEach(function (box) {
    var link = $('a', box);
    if (!link) return;
    link.addEventListener('click', function (ev) {
      ev.preventDefault();
      var frame = doc.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(box.getAttribute('data-youtube')) + '?autoplay=1&rel=0';
      frame.title = link.getAttribute('aria-label') || 'Video';
      frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      box.innerHTML = ''; box.appendChild(frame);
    });
  });

  /* photo galleries */
  var shots = $$('a[data-lightbox]');
  if (shots.length && typeof HTMLDialogElement !== 'undefined') (function () {
    var box = doc.createElement('dialog'), at = 0;
    box.className = 'lightbox';
    box.setAttribute('aria-label', 'Attēlu skatītājs');
    box.innerHTML = '<div class="lightbox-bar"><span data-count></span><button type="button" class="tool" data-close aria-label="Aizvērt"><span class="i i-x" aria-hidden="true"></span></button></div>' +
      '<div class="lightbox-stage"><button type="button" class="tool lightbox-nav prev" aria-label="Iepriekšējais attēls"><span class="i i-chevron-left" aria-hidden="true"></span></button>' +
      '<img alt=""><button type="button" class="tool lightbox-nav next" aria-label="Nākamais attēls"><span class="i i-chevron-right" aria-hidden="true"></span></button></div>';
    doc.body.appendChild(box);
    var img = $('img', box), count = $('[data-count]', box);
    function show(i) {
      at = (i + shots.length) % shots.length;
      img.src = shots[at].href;
      img.alt = ($('img', shots[at]) || {}).alt || '';
      count.textContent = (at + 1) + ' / ' + shots.length;
    }
    shots.forEach(function (a, i) { a.addEventListener('click', function (ev) { ev.preventDefault(); show(i); box.showModal(); }); });
    $('.prev', box).addEventListener('click', function () { show(at - 1); });
    $('.next', box).addEventListener('click', function () { show(at + 1); });
    $('[data-close]', box).addEventListener('click', function () { box.close(); });
    box.addEventListener('click', function (ev) { if (ev.target === box || ev.target.classList.contains('lightbox-stage')) box.close(); });
    box.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowLeft') show(at - 1);
      if (ev.key === 'ArrowRight') show(at + 1);
    });
    var x0 = null;
    box.addEventListener('touchstart', function (ev) { x0 = ev.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (ev) {
      if (x0 == null) return;
      var dx = ev.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
    });
  })();
})();
