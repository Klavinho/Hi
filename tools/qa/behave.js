#!/usr/bin/env node
/* Behaviour checks: keyboard navigation, search, news filter, saved preferences,
   the mobile menu, stacked tables and rendering with JavaScript disabled.

     python3 -m http.server 8000 --directory docs &
     node tools/qa/behave.js [http://localhost:8000]

   Needs Playwright with Chromium. Exits with status 1 when a check fails. */
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

(async () => {
  const browser = await chromium.launch();

  // ---- desktop, JavaScript on
  let context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'lv-LV', timezoneId: 'Europe/Riga' });
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE + '/index.html');
  await page.keyboard.press('Tab');
  check('skip link is the first focus stop', await page.evaluate(() => document.activeElement.className === 'skip'));
  await page.keyboard.press('Enter');
  check('skip link jumps to the content', await page.evaluate(() => location.hash === '#saturs'));

  await page.focus('.nav-item:nth-child(1) .nav-top');
  await page.keyboard.press('Enter');
  check('Enter opens a menu panel', await page.evaluate(() => document.querySelector('.nav-item').classList.contains('open')
    && document.querySelector('.nav-top').getAttribute('aria-expanded') === 'true'));
  await page.keyboard.press('Tab');
  check('Tab moves into the open panel', await page.evaluate(() => !!document.activeElement.closest('.nav-panel')));
  await page.keyboard.press('Escape');
  check('Escape closes the panel and restores focus', await page.evaluate(() => !document.querySelector('.nav-item.open')
    && document.activeElement.classList.contains('nav-top')));

  await page.keyboard.press('Control+k');
  check('Ctrl+K opens the search dialog', await page.evaluate(() => document.getElementById('search-dialog').open));
  await page.keyboard.type('tarifs');
  await page.waitForSelector('#search-dialog .result', { timeout: 8000 });
  const first = await page.evaluate(() => document.querySelector('#search-dialog .result-title').textContent.trim());
  check('"tarifs" ranks the tariff page first', first === 'Tarifs', first);
  await page.keyboard.press('Escape');
  check('one Escape closes the search dialog', await page.evaluate(() => !document.getElementById('search-dialog').open));

  await page.keyboard.press('/');
  await page.keyboard.type('izzina');
  await page.waitForSelector('#search-dialog .result', { timeout: 8000 });
  await page.waitForTimeout(400);
  const titles = await page.evaluate(() => [...document.querySelectorAll('#search-dialog .result-title')].map((e) => e.textContent).slice(0, 3).join(' | '));
  check('search without diacritics ("izzina") finds "izziņa"', /zziņ/i.test(titles), titles);
  await page.keyboard.press('ArrowDown');
  check('ArrowDown focuses the first result', await page.evaluate(() => document.activeElement.classList.contains('result')));
  await Promise.all([page.waitForURL((u) => !/index\.html/.test(u.toString()), { timeout: 8000 }), page.keyboard.press('Enter')]);
  check('Enter on a result opens it', /izzin/.test(page.url()), page.url().replace(BASE, ''));

  await page.goto(BASE + '/par-mums/jaunumi.html');
  await page.selectOption('[data-news-filter] select', '2020');
  await page.waitForTimeout(900);
  const years = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-news-list] time')].map((t) => t.getAttribute('datetime').slice(0, 4)))].join(','));
  check('news archive filters by year', years === '2020', years);
  await page.fill('[data-news-filter] input', 'tarifs');
  await page.waitForTimeout(600);
  const count = await page.evaluate(() => document.querySelectorAll('[data-news-list] .news-card').length);
  check('news archive filters by text', count > 0, count + ' cards');

  await page.goto(BASE + '/tarifs.html');
  await page.click('[data-theme-toggle]');
  await page.click('[data-text-size]');
  await page.goto(BASE + '/par-mums/kontakti.html');
  const pref = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'),
    text: document.documentElement.getAttribute('data-text'), fontSize: getComputedStyle(document.documentElement).fontSize }));
  check('theme and text size persist across pages', pref.theme === 'dark' && pref.text === 'lg' && pref.fontSize === '18px', JSON.stringify(pref));
  const weekday = new Date().toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/Riga' });
  if (!['Sat', 'Sun'].includes(weekday)) {
    check('today is highlighted in opening-hours tables', await page.evaluate(() => document.querySelectorAll('tr.today').length >= 1));
  }
  check('no script errors on desktop', errors.length === 0, errors.join(' | '));
  await context.close();

  // ---- phone, JavaScript on
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await context.newPage();
  await page.goto(BASE + '/iedzivotajiem/ligumi.html');
  check('section menu starts collapsed on phones', await page.evaluate(() => !document.querySelector('.side-nav').open));
  await page.click('.menu-btn');
  await page.waitForTimeout(500); // let the opening animation finish before measuring
  const menu = await page.evaluate(() => { const n = document.getElementById('nav').getBoundingClientRect();
    return { open: document.documentElement.classList.contains('nav-open'), bottom: Math.round(n.bottom), viewport: innerHeight,
      current: !!document.querySelector('.nav-item.is-current.open') }; });
  check('mobile menu fills the screen and opens the current section', menu.open && menu.bottom >= menu.viewport - 2 && menu.current, JSON.stringify(menu));
  await page.keyboard.press('Escape');
  check('Escape closes the mobile menu', await page.evaluate(() => !document.documentElement.classList.contains('nav-open')));
  await page.goto(BASE + '/iepirkumi.html');
  check('procurement table stacks into cards on phones', await page.evaluate(() => { const t = document.querySelector('table.stack');
    return !!t && getComputedStyle(t.querySelector('tbody td')).display === 'grid'; }));
  await context.close();

  // ---- service pages added after the research review: notices, forms, accessibility statement
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await page.goto(BASE + '/index.html');
  const band = await page.evaluate(() => { const a = document.querySelector('.notice-band .more'); return a && a.getAttribute('href'); });
  check('home page links to interruptions and works', band === 'remonti.html', band);
  const footer = await page.evaluate(() => [...document.querySelectorAll('.site-footer a')].map((a) => a.getAttribute('href')));
  check('footer links to the easy-read page', footer.includes('viegli-lasit.html'), footer.length + ' links');
  check('structured data names the emergency line', await page.evaluate(() => {
    const d = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    return d.contactPoint.some((c) => c.contactType === 'emergency' && /63602240/.test(c.telephone)); }));
  await page.goto(BASE + '/remonti.html');
  check('interruptions page lists notices by year', await page.evaluate(() => document.querySelectorAll('.notice-year').length > 3
    && document.querySelectorAll('.notice-guide .alert-phone').length === 1));
  for (const form of ['iedzivotajiem/e-rekins.html', 'iedzivotajiem/zinot-par-bojajumu.html']) {
    await page.goto(BASE + '/' + form);
    const f = await page.evaluate(() => {
      const el = document.querySelector('form.form');
      const fields = [...el.querySelectorAll('input:not([type=hidden]):not([name=bot-field]), textarea')];
      return { netlify: el.hasAttribute('data-netlify') && !!el.querySelector('input[name=form-name]'),
        labelled: fields.every((x) => x.labels && x.labels.length === 1),
        consent: el.querySelector('#piekrisana').required };
    });
    check(`${form}: every field has a label, consent is required, Netlify can read it`, f.netlify && f.labelled && f.consent, JSON.stringify(f));
    await page.click('form.form button[type=submit]');
    check(`${form}: an empty form is not sent`, page.url().endsWith(form));
  }
  // WCAG 2.4.11: the sticky header must not cover the focused element
  await page.goto(BASE + '/remonti.html');
  let covered = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    covered += await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body || el.closest('.site-header, .topbar, .preview-note, .skip')) return 0;
      const r = el.getBoundingClientRect(), h = document.querySelector('.site-header').getBoundingClientRect();
      // only a header stuck to the top of the viewport can hide anything; count a stop when it is entirely behind it
      return h.top <= 0 && r.top < h.bottom && r.bottom <= h.bottom ? 1 : 0;
    });
  }
  check('keyboard focus is never hidden under the sticky header', covered === 0, covered + ' of 40 stops covered');
  await context.close();

  // ---- JavaScript disabled
  for (const width of [1440, 390]) {
    context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    page = await context.newPage();
    await page.goto(BASE + '/index.html');
    const state = await page.evaluate(() => ({ links: [...document.querySelectorAll('.nav-top')].filter((a) => a.offsetParent).length,
      overflow: document.documentElement.scrollWidth > innerWidth }));
    check(`without JavaScript the menu links are visible at ${width}px`, state.links === 6 && !state.overflow, JSON.stringify(state));
    if (width === 1440) {
      await page.hover('.nav-item:nth-child(2) .nav-top');
      check('without JavaScript hover opens a panel', await page.evaluate(() => getComputedStyle(document.querySelector('.nav-item:nth-child(2) .nav-panel')).display === 'block'));
    }
    await context.close();
  }

  await browser.close();
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '  -> ' + r.detail : ''));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
  console.error('CRASH', err.message);
  process.exit(1);
});
