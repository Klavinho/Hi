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
