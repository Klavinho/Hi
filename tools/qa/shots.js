#!/usr/bin/env node
/* Take screenshots of the built site in one browser session.

     python3 -m http.server 8000 --directory docs &
     node tools/qa/shots.js jobs.json

   jobs.json is a list of jobs:
     { "url": "http://localhost:8000/index.html", "out": "home.png",
       "w": 1440, "h": 900, "scale": 2, "full": true, "theme": "dark", "scroll": 600,
       "actions": [["hover", ".nav-item:nth-child(1) .nav-top"], ["click", ".menu-btn"],
                   ["press", "/"], ["type", "tarifs"], ["wait", 500]] }
   Only "url" and "out" are required. "full" scrolls through the page first so that
   lazy-loaded images are present in the full-page capture. */
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch();
  for (const job of jobs) {
    const context = await browser.newContext({
      viewport: { width: job.w || 1440, height: job.h || 900 }, deviceScaleFactor: job.scale || 1,
      colorScheme: job.theme === 'dark' ? 'dark' : 'light', locale: 'lv-LV', timezoneId: 'Europe/Riga',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(job.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(700);
    if (job.full) {
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(900);
    }
    if (job.scroll) await page.evaluate((y) => window.scrollTo(0, y), job.scroll);
    for (const [kind, arg] of job.actions || []) {
      if (kind === 'click') await page.click(arg);
      else if (kind === 'hover') await page.hover(arg);
      else if (kind === 'press') await page.keyboard.press(arg);
      else if (kind === 'type') await page.keyboard.type(arg);
      else if (kind === 'wait') await page.waitForTimeout(arg);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: job.out, fullPage: !!job.full });
    console.log(job.out, errors.length ? 'SCRIPT ERRORS: ' + errors.join(' | ') : 'ok');
    await context.close();
  }
  await browser.close();
})();
