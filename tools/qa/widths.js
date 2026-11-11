#!/usr/bin/env node
/* Load representative pages at many viewport widths and report horizontal overflow
   or a wrapped / oversized header.

     python3 -m http.server 8000 --directory docs &
     node tools/qa/widths.js [http://localhost:8000]

   Needs Playwright with Chromium. Exits with status 1 when an issue is found. */
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const PAGES = [
  '/index.html', '/tarifs.html', '/par-mums/kontakti.html', '/iepirkumi.html', '/par-mums/jaunumi.html',
  '/par-mums/pazinojumi.html', '/par-mums/jaunumi/top-jauni-siltumtikli.html', '/video-foto.html', '/meklet.html',
  '/pamatprincipi-un-standarti/etikas-kodekss.html', '/projekti/siltumtrasu-rekonstrukcijas-projekti.html',
  '/pakalpojumi/informacija-par-eku-siltumenergijas-paterinu.html',
];
const WIDTHS = [320, 360, 390, 600, 768, 1024, 1152, 1200, 1280, 1440, 1920];

(async () => {
  const browser = await chromium.launch();
  let issues = 0;
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const header = document.querySelector('.header-in');
        const tops = [...document.querySelectorAll('.nav-top')].filter((a) => a.offsetParent)
          .map((a) => Math.round(a.getBoundingClientRect().top));
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          headerHeight: Math.round(header.getBoundingClientRect().height),
          navWrapped: new Set(tops).size > 1,
        };
      });
      if (r.overflow > 0 || r.headerHeight > 80 || r.navWrapped) {
        issues += 1;
        console.log('ISSUE', width, path, JSON.stringify(r));
      }
    }
    await context.close();
  }
  await browser.close();
  console.log(`checked ${WIDTHS.length * PAGES.length} page/width combinations, ${issues} issues`);
  process.exit(issues ? 1 : 0);
})();
