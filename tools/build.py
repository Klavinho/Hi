#!/usr/bin/env python3
"""Build the static site:  content/ + src/ + site.json  ->  docs/

    python3 tools/build.py            # writes ./docs
    python3 tools/build.py --out dir  # custom output directory

Only the Python standard library is needed.
"""
import argparse
import datetime
import hashlib
import html
import json
import posixpath
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONTHS = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts',
          'septembris', 'oktobris', 'novembris', 'decembris']
FILE_EXT = re.compile(r'\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|edoc|asice|odt|ods|rtf|txt|csv|jpe?g|png)(?:$|[?#])', re.I)
e = html.escape


# ------------------------------------------------------------------ content

class Page:
    def __init__(self, path, meta, body):
        self.path = path
        self.meta = meta
        self.body = body
        self.title = meta.get('title') or ''
        self.type = meta.get('type', 'page')
        self.date = meta.get('date', '')
        self.image = meta.get('image', '')

    @property
    def text(self):
        if not hasattr(self, '_text'):
            raw = re.sub(r'<(script|style)\b.*?</\1>', ' ', self.body, flags=re.S)
            raw = re.sub(r'<[^>]+>', ' ', raw)
            self._text = re.sub(r'\s+', ' ', html.unescape(raw)).strip()
        return self._text

    def excerpt(self, limit=150):
        body = re.sub(r'<h[2-4][^>]*>.*?</h[2-4]>', ' ', self.body, flags=re.S)
        body = re.sub(r'<table.*?</table>', ' ', body, flags=re.S)
        text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', body))).strip()
        if len(text) <= limit:
            return text
        cut = text[:limit].rsplit(' ', 1)[0].rstrip('.,;:–-( ')
        return cut + '…'


def load_content(directory):
    pages = {}
    for file in sorted(directory.rglob('*.html')):
        raw = file.read_text(encoding='utf-8')
        m = re.match(r'---\n(.*?)\n---\n(.*)', raw, flags=re.S)
        if not m:
            continue
        path = '/' + file.relative_to(directory).with_suffix('').as_posix()
        pages[path] = Page(path, json.loads(m.group(1)), m.group(2).strip())
    return pages


def fmt_date(iso):
    try:
        d = datetime.date.fromisoformat(iso)
    except ValueError:
        return iso
    return f'{d.year}. gada {d.day}. {MONTHS[d.month - 1]}'


def fmt_phone(digits):
    digits = re.sub(r'\D', '', digits)
    return f'{digits[:3]} {digits[3:5]} {digits[5:]}' if len(digits) == 8 else digits


# ------------------------------------------------------------------ site

class Site:
    def __init__(self, out):
        self.cfg = json.loads((ROOT / 'site.json').read_text(encoding='utf-8'))
        self.pages = load_content(ROOT / 'content')
        self.out = out
        self.asset = self.cfg['assetBase'].rstrip('/')
        self.origin = self.cfg['origin'].rstrip('/')
        self.facts = self.cfg['facts']
        self.unlisted = set(self.cfg.get('unlisted', []))
        self.year = datetime.date.today().year

        self.news = sorted((p for p in self.pages.values() if p.type == 'article'),
                           key=lambda p: (p.date, p.path), reverse=True)
        self.galleries = sorted((p for p in self.pages.values() if p.type == 'gallery'),
                                key=lambda p: p.meta.get('order', 999))
        self.videos = sorted((p for p in self.pages.values() if p.type == 'video'),
                             key=lambda p: p.meta.get('order', 999))
        self.virtual = {'/': 'Sākumlapa', self.facts['newsPage']: 'Jaunumi',
                        self.facts['mediaPage']: 'Foto un video', '/meklet': 'Meklēšana'}
        self.built = set(self.pages) | set(self.virtual)

        self._nav()
        self.tariff = self._tariff()
        self.hours = self._hours()
        self.version = ''

    # -- navigation -------------------------------------------------------
    def title(self, path, label=None):
        if label:
            return label
        if path in self.pages:
            return self.pages[path].title
        return self.virtual.get(path, path)

    def _node(self, item):
        node = {'path': item.get('path'), 'icon': item.get('icon'), 'intro': item.get('intro', ''),
                'mega': item.get('mega', False), 'childrenLabel': item.get('childrenLabel'),
                'title': self.title(item.get('path'), item.get('label')),
                'children': [self._node(c) for c in item.get('children', [])],
                'groups': [self._node(g) for g in item.get('groups', [])]}
        return node

    def _nav(self):
        self.nav = [self._node(item) for item in self.cfg['nav']]
        self.parent, self.section, self.top = {}, {}, {}
        for i, top in enumerate(self.nav):
            sections = top['groups'] if top['mega'] else [top]
            for sec in sections:
                self.section[sec['path']] = sec
                self.top[sec['path']] = i
                for child in sec['children']:
                    if child['path'] in self.section or child['path'] in self.parent:
                        continue
                    if sec.get('childrenLabel'):
                        continue  # loosely related links, not real children
                    self.parent[child['path']] = sec['path']
                    self.section[child['path']] = sec
                    self.top[child['path']] = i
        archive = self.cfg.get('procurementArchive', [])
        if archive:
            head = archive[0]
            sec = {'path': head, 'title': self.title(head), 'icon': 'briefcase', 'intro': '', 'children': [],
                   'archive': True}
            for path in archive:
                year = re.search(r'(20\d\d)', path)
                sec['children'].append({'path': path, 'title': year.group(1) if year else 'Aktuālie iepirkumi',
                                        'icon': None})
                self.section[path] = sec
                if path != head:
                    self.parent[path] = head
                self.top[path] = self.top.get(head)
        news = self.facts['newsPage']
        media = self.facts['mediaPage']
        for p in self.news:
            self.parent[p.path] = news
        for p in self.galleries + self.videos:
            self.parent[p.path] = media

    def crumbs(self, path):
        trail, seen = [], set()
        cur = self.parent.get(path)
        if cur is None and path not in self.section:
            guess = posixpath.dirname(path)
            cur = guess if guess in self.built and guess != '/' else None
        while cur and cur not in seen:
            seen.add(cur)
            trail.append(cur)
            cur = self.parent.get(cur)
        return list(reversed(trail))

    # -- facts parsed from content ---------------------------------------
    def _rows(self, path):
        page = self.pages.get(path)
        if not page:
            return []
        table = re.search(r'<table.*?</table>', page.body, flags=re.S)
        rows = []
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', table.group(0) if table else '', flags=re.S):
            cells = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', c))).strip()
                     for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, flags=re.S)]
            if cells:
                rows.append(cells)
        return rows

    def _tariff(self):
        rows = []
        for cells in self._rows(self.facts['tariffPage']):
            if len(cells) < 2:
                continue
            m = re.search(r'(\d+(?:[.,]\d+)?)\s*EUR', cells[1])
            start = re.search(r'(\d{2}\.\d{2}\.\d{4})', cells[0])
            if m and start:
                rows.append({'period': cells[0].rstrip('. ') + '.', 'start': start.group(1) + '.',
                             'text': m.group(1), 'value': float(m.group(1).replace(',', '.'))})
        return rows

    def _hours(self):
        rows = []
        for cells in self._rows(self.facts['hoursPage']):
            if len(cells) >= 2 and re.search(r'\d', ' '.join(cells[1:])):
                times = [re.sub(r'\s*-\s*', '–', c) for c in cells[1:] if c]
                rows.append({'day': cells[0].capitalize(), 'times': times})
        return rows

    # -- urls --------------------------------------------------------------
    @staticmethod
    def file(path):
        return 'index.html' if path == '/' else path.lstrip('/') + '.html'

    def rel(self, src, dst, frag=''):
        base = posixpath.dirname(self.file(src)) or '.'
        return posixpath.relpath(self.file(dst), base) + frag

    def root(self, src):
        depth = self.file(src).count('/')
        return '../' * depth

    def media(self, url):
        if url.startswith('/'):
            return self.asset + url
        return url

    def rewrite(self, body, src):
        def fix(m):
            attr, val = m.group(1), html.unescape(m.group(2))
            if val.startswith(('/sites/', '/themes/', '/core/', '/modules/')):
                return f'{attr}="{e(self.asset + val)}"'
            path, _, frag = val.partition('#')
            path = urllib.parse.unquote(path).rstrip('/') or '/'
            if path in self.built:
                return f'{attr}="{e(self.rel(src, path, "#" + frag if frag else ""))}"'
            return f'{attr}="{e(self.origin + val)}"'
        return re.sub(r'\b(href|src)="(/[^"]*)"', fix, body)


def icon(name, extra=''):
    return f'<span class="i i-{name}{" " + extra if extra else ""}" aria-hidden="true"></span>' if name else ''


# ------------------------------------------------------------------ templates

class Builder:
    def __init__(self, site):
        self.s = site
        self.cfg = site.cfg
        self.c = site.cfg['contacts']
        self.search = []

    # -- shared chrome -----------------------------------------------------
    def nav_html(self, cur):
        s = self.s
        cur_top = s.top.get(cur)
        if cur_top is None:
            for anc in s.crumbs(cur):
                if anc in s.top:
                    cur_top = s.top[anc]
        items = []
        for i, top in enumerate(s.nav):
            pid = f'np{i}'
            href = s.rel(cur, top['path'] or top['groups'][0]['path'])
            current = ' is-current' if cur_top == i else ''
            if top['mega']:
                cols = []
                for g in top['groups']:
                    links = ''.join(self._nav_link(cur, c) for c in g['children'])
                    sub = f'<p class="nav-sub">{e(g["childrenLabel"])}</p>' if g.get('childrenLabel') else ''
                    cols.append(
                        f'<div class="mega-col"><a class="mega-title" href="{e(s.rel(cur, g["path"]))}"'
                        f'{self._cur(cur, g["path"])}>{icon(g["icon"])}<span>{e(g["title"])}</span></a>'
                        f'{sub}<ul>{links}</ul></div>')
                panel = f'<div class="nav-panel-in mega">{"".join(cols)}</div>'
            else:
                links = ''.join(self._nav_link(cur, c, True) for c in top['children'])
                panel = (
                    '<div class="nav-panel-in">'
                    f'<div class="nav-intro"><p class="nav-intro-title">{icon(top["icon"])}{e(top["title"])}</p>'
                    f'<p>{e(top["intro"])}</p>'
                    f'<a class="more" href="{e(href)}"{self._cur(cur, top["path"])}>Sadaļas pārskats{icon("arrow-right")}</a></div>'
                    f'<ul class="nav-links">{links}</ul></div>')
            items.append(
                f'<li class="nav-item{current}"><a class="nav-top" href="{e(href)}" data-panel="{pid}">'
                f'<span>{e(top["title"])}</span>{icon("chevron-down")}</a>'
                f'<div class="nav-panel" id="{pid}">{panel}</div></li>')
        extra = ''.join(f'<li><a href="{e(s.rel(cur, u["path"]))}">{e(u["label"])}</a></li>'
                        for u in self.cfg['utility'])
        return (f'<nav class="nav" id="nav" aria-label="Galvenā izvēlne"><ul class="nav-list">{"".join(items)}</ul>'
                f'<ul class="nav-extra">{extra}</ul></nav>')

    def _cur(self, cur, path):
        return ' aria-current="page"' if cur == path else ''

    def _nav_link(self, cur, child, with_icon=False):
        s = self.s
        ic = icon(child['icon']) if with_icon and child.get('icon') else ''
        return (f'<li><a href="{e(s.rel(cur, child["path"]))}"{self._cur(cur, child["path"])}>'
                f'{ic}<span>{e(child["title"])}</span></a></li>')

    def header(self, cur):
        s, c = self.s, self.c
        root = s.root(cur)
        util = ''.join(f'<li><a href="{e(s.rel(cur, u["path"]))}"{self._cur(cur, u["path"])}>{e(u["label"])}</a></li>'
                       for u in self.cfg['utility'])
        notice = ''
        if self.cfg.get('previewNotice'):
            notice = ('<div class="preview-note"><div class="container">Dizaina priekšskatījums — oficiālā vietne: '
                      f'<a href="{e(s.origin)}">{e(re.sub(r"^https?://", "", s.origin))}</a></div></div>')
        return f'''<a class="skip" href="#saturs">Pāriet uz saturu</a>
{notice}<div class="topbar"><div class="container topbar-in">
<p class="topbar-alert">{icon("triangle-alert")}<a href="{e(s.rel(cur, s.facts["emergencyPage"]))}">Siltumtrašu avārijas</a><a class="topbar-phone" href="tel:+371{c["emergencyPhone"]}">{fmt_phone(c["emergencyPhone"])}</a></p>
<ul class="topbar-links">{util}</ul>
<div class="topbar-tools">
<button type="button" class="tool" data-text-size aria-label="Mainīt teksta izmēru" title="Teksta izmērs">{icon("a-large-small")}</button>
<button type="button" class="tool" data-theme-toggle aria-label="Pārslēgt gaišo vai tumšo režīmu" title="Gaišais / tumšais režīms">{icon("moon", "when-light")}{icon("sun", "when-dark")}</button>
</div></div></div>
<header class="site-header"><div class="container header-in">
<a class="brand" href="{e(s.rel(cur, "/"))}" aria-label="{e(self.cfg["name"])} — uz sākumlapu"><span class="brand-mark"><img src="{root}assets/img/logo-mark.png" width="56" height="56" alt=""></span><span class="brand-text"><span class="brand-name">{e(self.cfg["name"])}</span><span class="brand-tag">Pašvaldības SIA</span></span></a>
{self.nav_html(cur)}
<div class="header-actions">
<a class="search-btn" href="{e(s.rel(cur, "/meklet"))}" data-search-open role="button" aria-label="Meklēt vietnē">{icon("search")}<span>Meklēt</span><kbd>/</kbd></a>
<button type="button" class="menu-btn" aria-expanded="false" aria-controls="nav">{icon("menu", "when-closed")}{icon("x", "when-open")}<span>Izvēlne</span></button>
</div></div></header>'''

    def footer(self, cur):
        s, c = self.s, self.c

        def col(title, paths):
            links = ''.join(f'<li><a href="{e(s.rel(cur, p))}">{e(s.title(p, label))}</a></li>'
                            for p, label in paths if p in s.built)
            return f'<div class="footer-col"><h2>{e(title)}</h2><ul>{links}</ul></div>'

        clients = [(t['path'], None) for t in s.nav if not t['mega']]
        company = [('/par-mums', None), (s.facts['newsPage'], None), ('/projekti', None), ('/vides-politika', None),
                   ('/iepirkumi', None), ('/par-mums/vakances', None), (s.facts['mediaPage'], None)]
        docs = [('/normativie-akti', None), ('/pamatprincipi-un-standarti/pamatprincipi-un-standarti', None),
                ('/par-mums/parskati', None), ('/pamatprincipi-un-standarti/trauksmes-celsana', None),
                ('/par-mums/privatuma-politika', None), ('/projekti/viegli-lasit', None)]
        social = ''.join(f'<li><a href="{e(x["url"])}" target="_blank" rel="noopener">{e(x["label"])}{icon("arrow-up-right")}</a></li>'
                         for x in self.cfg.get('social', []))
        return f'''<footer class="site-footer">
<div class="container">
<div class="footer-grid">
<div class="footer-col footer-contact">
<p class="footer-brand"><span class="brand-mark"><img src="{s.root(cur)}assets/img/logo-mark.png" width="56" height="56" alt="" loading="lazy"></span><span>{e(self.cfg["legalName"])}</span></p>
<ul class="contact-list">
<li>{icon("map-pin")}<a href="{e(c["mapUrl"])}" target="_blank" rel="noopener">{e(c["address"])}</a></li>
<li>{icon("phone")}<span>Klientu daļa: <a href="tel:+371{c["clientPhone"]}">{fmt_phone(c["clientPhone"])}</a></span></li>
<li>{icon("phone")}<span>Administrācija: <a href="tel:+371{c["phone"]}">{fmt_phone(c["phone"])}</a></span></li>
<li>{icon("mail")}<a href="mailto:{e(c["email"])}">{e(c["email"])}</a></li>
<li>{icon("triangle-alert")}<span>Siltumtrašu avārijas: <a href="tel:+371{c["emergencyPhone"]}">{fmt_phone(c["emergencyPhone"])}</a></span></li>
</ul>
</div>
{col("Klientiem", clients)}
{col("Uzņēmums", company)}
{col("Dokumenti", docs)}
</div>
<div class="footer-bottom">
<p>© {s.year} {e(self.cfg["name"])}. Visas tiesības aizsargātas.</p>
<ul class="footer-social">{social}<li><a href="https://www.ventspils.lv/" target="_blank" rel="noopener">ventspils.lv{icon("arrow-up-right")}</a></li></ul>
<a class="to-top" href="#top">{icon("chevron-up")}Uz augšu</a>
</div>
</div>
</footer>'''

    def search_dialog(self, cur):
        hints = ''.join(f'<button type="button" class="chip" data-search-hint>{e(h)}</button>'
                        for h in self.cfg.get('searchHints', []))
        return f'''<dialog class="search-dialog" id="search-dialog" aria-label="Meklēšana">
<form class="search-form" action="{e(self.s.rel(cur, "/meklet"))}" method="get" role="search" data-search>
<label class="sr-only" for="search-dialog-input">Meklēt vietnē</label>
{icon("search")}<input id="search-dialog-input" type="search" name="q" placeholder="Meklēt vietnē…" autocomplete="off" spellcheck="false">
<button type="button" class="tool" data-search-close aria-label="Aizvērt meklēšanu">{icon("x")}</button>
</form>
<div class="search-hints"><span>Bieži meklē:</span>{hints}</div>
<div class="search-results" data-search-results aria-live="polite"></div>
</dialog>'''

    def layout(self, cur, title, main, description='', canonical='', body_class=''):
        s = self.s
        root = s.root(cur)
        full = title if cur == '/' else f'{title} | {self.cfg["name"]}'
        desc = description or self.cfg['description']
        robots = '' if self.cfg.get('indexable') else '<meta name="robots" content="noindex, nofollow">\n'
        canon = f'<link rel="canonical" href="{e(canonical)}">\n' if canonical else ''
        return f'''<!doctype html>
<html lang="lv" class="no-js" data-root="{root}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(full)}</title>
<meta name="description" content="{e(desc[:300])}">
{robots}{canon}<meta name="theme-color" content="#b93414">
<meta property="og:title" content="{e(full)}">
<meta property="og:description" content="{e(desc[:300])}">
<meta property="og:locale" content="lv_LV">
<link rel="icon" href="{root}assets/img/favicon.ico">
<script>(function(d){{d.className=d.className.replace('no-js','js');try{{var t=localStorage.getItem('vs-theme'),x=localStorage.getItem('vs-text');if(t)d.setAttribute('data-theme',t);if(x)d.setAttribute('data-text',x)}}catch(e){{}}}})(document.documentElement)</script>
<link rel="stylesheet" href="{root}assets/css/main.css?v={s.version}">
</head>
<body class="{body_class}" id="top">
{self.header(cur)}
<main id="saturs" tabindex="-1">
{main}
</main>
{self.footer(cur)}
{self.search_dialog(cur)}
<script src="{root}assets/js/main.js?v={s.version}" defer></script>
</body>
</html>
'''

    # -- reusable pieces ---------------------------------------------------
    def breadcrumbs(self, cur, title):
        s = self.s
        parts = [f'<li><a href="{e(s.rel(cur, "/"))}">Sākums</a></li>']
        for p in s.crumbs(cur):
            parts.append(f'<li><a href="{e(s.rel(cur, p))}">{e(s.title(p))}</a></li>')
        parts.append(f'<li aria-current="page">{e(title)}</li>')
        return f'<nav class="crumbs" aria-label="Atrašanās vieta"><ol>{"".join(parts)}</ol></nav>'

    def page_head(self, cur, title, lead='', meta='', narrow=False):
        lead_html = f'<p class="lead">{e(lead)}</p>' if lead else ''
        return (f'<div class="page-head{" narrow" if narrow else ""}"><div class="container">{self.breadcrumbs(cur, title)}'
                f'{meta}<h1>{e(title)}</h1>{lead_html}</div></div>')

    def side_nav(self, cur):
        s = self.s
        sec = s.section.get(cur)
        if not sec:
            return ''
        links = ''.join(
            f'<li><a href="{e(s.rel(cur, c["path"]))}"{self._cur(cur, c["path"])}>{e(c["title"])}</a></li>'
            for c in sec['children'])
        label = 'Iepirkumu arhīvs' if sec.get('archive') else sec['title']
        head = (f'<a class="side-title" href="{e(s.rel(cur, sec["path"]))}"{self._cur(cur, sec["path"])}>'
                f'{icon(sec.get("icon"))}<span>{e(label)}</span></a>')
        return (f'<aside class="side"><details class="side-nav" open><summary>{icon("menu")}Šajā sadaļā'
                f'{icon("chevron-down")}</summary>{head}<ul>{links}</ul></details></aside>')

    def help_box(self, cur):
        c, s = self.c, self.s
        return f'''<aside class="help-box" aria-label="Palīdzība">
<div><h2>Neatradāt meklēto?</h2><p>Klientu daļas speciālisti palīdzēs — {e(c["clientOffices"])}.</p></div>
<ul>
<li><a class="btn btn-light" href="tel:+371{c["clientPhone"]}">{icon("phone")}{fmt_phone(c["clientPhone"])}</a></li>
<li><a class="btn btn-ghost" href="mailto:{e(c["clientEmail"])}">{icon("mail")}{e(c["clientEmail"])}</a></li>
<li><a class="btn btn-ghost" href="{e(s.rel(cur, s.facts["hoursPage"]))}">{icon("clock")}Darba laiks</a></li>
</ul>
</aside>'''

    def body(self, page):
        """Imported HTML -> final HTML (links, files, media, tables)."""
        s = self.s
        out = s.rewrite(page.body, page.path)

        def link(m):
            attrs = m.group(1)
            href = re.search(r'href="([^"]*)"', attrs)
            ext = FILE_EXT.search(urllib.parse.unquote(html.unescape(href.group(1)))) if href else None
            if ext and 'class=' not in attrs and not re.search(r'\.(jpe?g|png)', ext.group(0), re.I):
                kind = ext.group(1).lower()
                kind = {'docx': 'doc', 'xlsx': 'xls', 'pptx': 'ppt', 'rar': 'zip', '7z': 'zip', 'asice': 'edoc'}.get(kind, kind)
                attrs += f' class="file" data-ext="{kind}"'
            return f'<a{attrs}>'
        out = re.sub(r'<a(\s[^>]*)>', link, out)
        out = re.sub(r'<img ', '<img loading="lazy" decoding="async" ', out)
        out = re.sub(r'<figure data-youtube="([\w-]+)"></figure>', lambda m: self.youtube(m.group(1)), out)
        if page.path == s.facts['tariffPage'] and s.tariff:
            out = re.sub(r'<div class="table-wrap"><table>.*?</table>\s*</div>', lambda m: self.tariff_table(), out,
                         count=1, flags=re.S)
        return out

    def youtube(self, vid, title='Video', thumb=''):
        thumb = thumb or f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg'
        return (f'<div class="video" data-youtube="{e(vid)}"><a href="https://www.youtube.com/watch?v={e(vid)}" '
                f'target="_blank" rel="noopener" aria-label="Atskaņot video: {e(title)}">'
                f'<img src="{e(thumb)}" alt="" loading="lazy" decoding="async">'
                f'<span class="play">{icon("play")}</span></a></div>')

    def tariff_table(self):
        rows = self.s.tariff
        top = max(r['value'] for r in rows)
        out = ['<div class="table-wrap"><table class="tariff-table"><thead><tr><th scope="col">Periods</th>'
               '<th scope="col">Tarifs bez PVN</th><th scope="col"><span class="sr-only">Salīdzinājums</span></th></tr></thead>']
        for i, r in enumerate(rows):
            badge = ' <span class="badge">Spēkā</span>' if i == 0 else ''
            cls = ' class="is-current"' if i == 0 else ''
            out.append(f'<tr{cls}><td>{e(r["period"])}{badge}</td><td class="num">{e(r["text"])} EUR/MWh</td>'
                       f'<td class="bar" aria-hidden="true"><span style="--w:{r["value"] / top * 100:.1f}%"></span></td></tr>')
        out.append('</table></div>')
        return ''.join(out)

    def files(self, page):
        files = page.meta.get('files') or []
        if not files:
            return ''
        items = []
        for f in files:
            url = f['url']
            ext = FILE_EXT.search(urllib.parse.unquote(url))
            kind = (ext.group(1).lower() if ext else 'file')
            kind = {'docx': 'doc', 'xlsx': 'xls'}.get(kind, kind)
            items.append(f'<li><a class="file" data-ext="{kind}" href="{e(self.s.media(url))}" target="_blank">{e(f["title"])}</a></li>')
        return f'<section class="attachments"><h2>Pielikumi</h2><ul class="links">{"".join(items)}</ul></section>'

    def news_card(self, cur, p, big=False):
        s = self.s
        img = (f'<span class="card-img"><img src="{e(s.media(p.image))}" alt="" loading="lazy" decoding="async"></span>'
               if p.image else '<span class="card-img card-img-empty"></span>')
        summary = p.meta.get('summary') or p.excerpt(140)
        tag = 'h3'
        return (f'<article class="news-card{" news-card-big" if big else ""}"><a href="{e(s.rel(cur, p.path))}">{img}'
                f'<span class="card-body"><time datetime="{e(p.date)}">{e(fmt_date(p.date))}</time>'
                f'<{tag}>{e(p.title)}</{tag}><span class="card-text">{e(summary)}</span>'
                f'<span class="more">Lasīt vairāk{icon("arrow-right")}</span></span></a></article>')

    def link_card(self, cur, path, title, text, ic):
        return (f'<li><a class="task-card" href="{e(self.s.rel(cur, path))}"><span class="task-icon">{icon(ic or "file-text")}</span>'
                f'<span class="task-body"><span class="task-title">{e(title)}</span>'
                f'<span class="task-text">{e(text)}</span></span>{icon("arrow-right", "task-arrow")}</a></li>')

    def hours_table(self):
        rows = ''.join(f'<tr data-day="{e(r["day"].lower())}"><th scope="row">{e(r["day"])}</th>'
                       f'<td>{" ".join("<span>" + e(t) + "</span>" for t in r["times"])}</td></tr>' for r in self.s.hours)
        return f'<table class="hours">{rows}</table>' if rows else ''

    def index(self, page, section):
        self.search.append([page.title, self.s.file(page.path), section, page.text])

    # -- pages -------------------------------------------------------------
    def home(self):
        s, c, cur = self.s, self.c, '/'
        hints = ''.join(f'<a class="chip" href="{e(s.rel(cur, "/meklet"))}?q={urllib.parse.quote(h)}" data-search-hint>{e(h)}</a>'
                        for h in self.cfg.get('searchHints', []))
        tariff = ''
        if s.tariff:
            now = s.tariff[0]
            prev = f'<span>Iepriekš: {e(s.tariff[1]["text"])} EUR/MWh</span>' if len(s.tariff) > 1 else ''
            spark = self.sparkline([r['value'] for r in s.tariff[:10]][::-1])
            tariff = f'''<a class="stat-card" href="{e(s.rel(cur, s.facts["tariffPage"]))}">
<span class="stat-label">{icon("coins")}Siltumenerģijas tarifs</span>
<span class="stat-value"><strong>{e(now["text"])}</strong><span>EUR/MWh</span></span>
<span class="stat-note">bez PVN · spēkā no {e(now["start"])}</span>
{spark}
<span class="stat-foot">{prev}<span class="more">Tarifa vēsture{icon("arrow-right")}</span></span>
</a>'''
        alert = f'''<div class="alert-card">
<p class="alert-title">{icon("triangle-alert")}Avārija vai bojājums?</p>
<p>Karstā ūdens noplūde vai tvaiki uz ielas:</p>
<a class="alert-phone" href="tel:+371{c["emergencyPhone"]}">{icon("phone")}{fmt_phone(c["emergencyPhone"])}</a>
<p class="alert-note">Nav apkures vai karstā ūdens dzīvoklī? Sazinieties ar savas mājas apsaimniekotāju.</p>
<a class="more" href="{e(s.rel(cur, s.facts["emergencyPage"]))}">Kā rīkoties{icon("arrow-right")}</a>
</div>'''
        hero = f'''<section class="hero"><div class="container hero-in">
<div class="hero-copy">
<p class="eyebrow">{e(self.cfg["legalName"])}</p>
<h1>Siltums Ventspils mājām</h1>
<p class="hero-lead">Centralizētā siltumapgāde — ērti, droši, ilgtspējīgi. Šeit atradīsiet tarifu, norēķinu kārtību, pieslēguma nosacījumus un kontaktus.</p>
<form class="hero-search" action="{e(s.rel(cur, "/meklet"))}" method="get" role="search" data-search-proxy>
<label class="sr-only" for="hero-q">Meklēt vietnē</label>
{icon("search")}<input id="hero-q" type="search" name="q" placeholder="Ko vēlaties atrast?" autocomplete="off">
<button class="btn btn-primary" type="submit">Meklēt</button>
</form>
<p class="hero-hints"><span>Bieži meklē:</span>{hints}</p>
</div>
<div class="hero-cards">{tariff}{alert}</div>
</div></section>'''

        tasks = ''.join(self.link_card(cur, t['path'], t['label'], t['text'], t['icon']) for t in self.cfg['homeTasks'])
        tasks = f'''<section class="section"><div class="container">
<div class="section-head"><h2>Ātrā piekļuve</h2><p>Svarīgākā informācija ikdienas jautājumos — viena klikšķa attālumā.</p></div>
<ul class="task-grid">{tasks}</ul>
</div></section>'''

        groups = []
        for top in s.nav:
            if top['mega']:
                continue
            links = ''.join(f'<li><a href="{e(s.rel(cur, ch["path"]))}">{icon(ch["icon"])}<span>{e(ch["title"])}</span></a></li>'
                            for ch in top['children'])
            groups.append(f'''<article class="group-card">
<h3><a href="{e(s.rel(cur, top["path"]))}">{icon(top["icon"])}<span>{e(top["title"])}</span></a></h3>
<p>{e(top["intro"])}</p><ul>{links}</ul></article>''')
        audiences = f'''<section class="section section-tint"><div class="container">
<div class="section-head"><h2>Informācija klientiem</h2><p>Izvēlieties savu situāciju — katrā sadaļā ir viss nepieciešamais vienuviet.</p></div>
<div class="group-grid">{"".join(groups)}</div>
</div></section>'''

        latest = s.news[:5]
        news = ''
        if latest:
            rest = ''.join(self.news_card(cur, p) for p in latest[1:])
            news = f'''<section class="section"><div class="container">
<div class="section-head section-head-row"><div><h2>Jaunumi</h2><p>Aktualitātes par siltumapgādi, tarifu un remontdarbiem.</p></div>
<a class="btn btn-ghost" href="{e(s.rel(cur, s.facts["newsPage"]))}">Visi jaunumi{icon("arrow-right")}</a></div>
<div class="news-home">{self.news_card(cur, latest[0], True)}<div class="news-home-list">{rest}</div></div>
</div></section>'''

        stats = ''.join(f'<li><strong>{e(x["value"])}</strong><span>{e(x["label"])}</span></li>'
                        for x in self.cfg.get('homeStats', []))
        about_links = ''.join(
            f'<li><a href="{e(s.rel(cur, p))}">{icon(ic)}<span>{e(s.title(p))}</span>{icon("arrow-right")}</a></li>'
            for p, ic in [('/par-mums', 'factory'), ('/projekti', 'target'), ('/vides-politika', 'leaf'),
                          ('/iepirkumi', 'briefcase')])
        about = f'''<section class="section section-dark"><div class="container about">
<div class="about-copy"><p class="eyebrow">Par uzņēmumu</p><h2>Siltumu ražojam no koksnes šķeldas</h2>
<p>{e(self.cfg.get("homeAbout", ""))}</p><ul class="about-links">{about_links}</ul></div>
<ul class="stats">{stats}</ul>
</div></section>'''

        contact = f'''<section class="section"><div class="container contact">
<div class="contact-copy"><div class="section-head"><h2>Klientu daļa</h2><p>Speciālistu konsultācijas un kase — {e(c["clientOffices"])}.</p></div>
<ul class="contact-list contact-list-lg">
<li>{icon("phone")}<span><small>Tālrunis</small><a href="tel:+371{c["clientPhone"]}">{fmt_phone(c["clientPhone"])}</a></span></li>
<li>{icon("mail")}<span><small>E-pasts</small><a href="mailto:{e(c["clientEmail"])}">{e(c["clientEmail"])}</a></span></li>
<li>{icon("map-pin")}<span><small>Adrese</small><a href="{e(c["mapUrl"])}" target="_blank" rel="noopener">{e(c["address"])}</a></span></li>
</ul>
<a class="btn btn-primary" href="{e(s.rel(cur, s.facts["contactsPage"]))}">Visi kontakti{icon("arrow-right")}</a></div>
<div class="hours-card"><h3>{icon("clock")}Klientu daļas un kases darba laiks</h3>{self.hours_table()}</div>
</div></section>'''

        main = hero + tasks + audiences + news + about + contact
        self.write(cur, self.layout(cur, f'{self.cfg["name"]} — {self.cfg["tagline"]}', main,
                                    canonical=s.origin, body_class='home'))

    def sparkline(self, values):
        if len(values) < 2:
            return ''
        lo, hi = min(values), max(values)
        span = (hi - lo) or 1
        w, h, pad = 240, 56, 6
        step = (w - 2 * pad) / (len(values) - 1)
        pts = [(pad + i * step, pad + (h - 2 * pad) * (1 - (v - lo) / span)) for i, v in enumerate(values)]
        line = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        area = f'{pad},{h} ' + line + f' {w - pad},{h}'
        lx, ly = pts[-1]
        return (f'<svg class="spark" viewBox="0 0 {w} {h}" preserveAspectRatio="none" aria-hidden="true">'
                f'<polygon points="{area}"/><polyline points="{line}"/><circle cx="{lx:.1f}" cy="{ly:.1f}" r="3.5"/></svg>')

    def standard(self, page):
        s, cur = self.s, page.path
        sec = s.section.get(cur)
        is_landing = sec is not None and sec['path'] == cur and not sec.get('archive')
        body = self.body(page)
        parts = []

        if cur == s.facts['tariffPage'] and s.tariff:
            now = s.tariff[0]
            parts.append(f'''<div class="stat-banner"><span class="stat-label">{icon("coins")}Spēkā esošais tarifs</span>
<span class="stat-value"><strong>{e(now["text"])}</strong><span>EUR/MWh + PVN</span></span>
<span class="stat-note">no {e(now["start"])}</span></div>''')
        if cur == s.facts['emergencyPage']:
            c = self.c
            parts.append(f'''<div class="alert-card alert-card-wide"><p class="alert-title">{icon("triangle-alert")}Ārējo siltumtrašu avāriju pieteikšana</p>
<a class="alert-phone" href="tel:+371{c["emergencyPhone"]}">{icon("phone")}{fmt_phone(c["emergencyPhone"])}</a></div>''')
        if cur == s.facts['contactsPage']:
            parts.append(self.contact_cards(cur))

        lead_img = ''
        if page.image and not is_landing:
            lead_img = f'<figure class="lead-img"><img src="{e(s.media(page.image))}" alt="" loading="lazy" decoding="async"></figure>'

        children = ''
        if is_landing:
            cards = ''.join(self.link_card(cur, ch['path'], ch['title'],
                                           s.pages[ch['path']].excerpt(120) if ch['path'] in s.pages else '',
                                           ch.get('icon')) for ch in sec['children'])
            children = f'<ul class="task-grid task-grid-2">{cards}</ul>'

        wide = ' prose-wide' if re.search(r'<table', body) else ''
        prose = f'<div class="prose{wide}">{body}</div>' if body.strip() else ''
        empty = ''
        if not children and not re.sub(r'<h[2-4][^>]*>.*?</h[2-4]>|<[^>]+>|\s+', '', body, flags=re.S):
            empty = '<p class="empty">Šobrīd šajā sadaļā aktuālas informācijas nav.</p>'
        intro = sec['intro'] if is_landing and sec.get('intro') else ''
        side = self.side_nav(cur)
        content = ''.join(parts) + (lead_img if not parts else '') + prose + children + empty + self.files(page)
        main = (self.page_head(cur, page.title, intro, narrow=not side) +
                f'<div class="container layout{" has-side" if side else ""}">{side}'
                f'<article class="content">{content}{self.help_box(cur)}</article></div>')
        self.write(cur, self.layout(cur, page.title, main, description=page.excerpt(200),
                                    canonical=page.meta.get('source', '')))
        if cur not in s.unlisted and (body.strip() or children):
            top = s.top.get(cur)
            label = s.nav[top]['title'] if top is not None else ''
            self.index(page, sec['title'] if sec and sec['path'] != cur else label)

    def contact_cards(self, cur):
        c, s = self.c, self.s
        return f'''<div class="contact-cards">
<section class="c-card"><h2>{icon("users")}Klientu daļa</h2>
<p>{e(c["clientOffices"])}</p>
<ul class="contact-list"><li>{icon("phone")}<a href="tel:+371{c["clientPhone"]}">{fmt_phone(c["clientPhone"])}</a></li>
<li>{icon("mail")}<a href="mailto:{e(c["clientEmail"])}">{e(c["clientEmail"])}</a></li></ul>
{self.hours_table()}</section>
<section class="c-card"><h2>{icon("landmark")}Administrācija</h2>
<p>{e(c["address"])}</p>
<ul class="contact-list"><li>{icon("phone")}<a href="tel:+371{c["phone"]}">{fmt_phone(c["phone"])}</a></li>
<li>{icon("mail")}<a href="mailto:{e(c["email"])}">{e(c["email"])}</a></li>
<li>{icon("external-link")}<a href="{e(c["eAddress"])}" target="_blank" rel="noopener">Rakstīt e-adresē</a></li>
<li>{icon("map-pin")}<a href="{e(c["mapUrl"])}" target="_blank" rel="noopener">Skatīt kartē</a></li></ul></section>
<section class="c-card c-card-alert"><h2>{icon("triangle-alert")}Siltumtrašu avārijas</h2>
<p>Karstā ūdens noplūde vai tvaiki uz ielas.</p>
<a class="alert-phone" href="tel:+371{c["emergencyPhone"]}">{icon("phone")}{fmt_phone(c["emergencyPhone"])}</a>
<a class="more" href="{e(s.rel(cur, s.facts["emergencyPage"]))}">Kā rīkoties{icon("arrow-right")}</a></section>
</div><h2 class="h-sep">Visi kontakti</h2>'''

    def article(self, page, newer, older):
        s, cur = self.s, page.path
        body = self.body(page)
        img = (f'<figure class="lead-img"><img src="{e(s.media(page.image))}" alt="" decoding="async"></figure>'
               if page.image else '')
        meta = f'<p class="page-meta">{icon("calendar")}<time datetime="{e(page.date)}">{e(fmt_date(page.date))}</time></p>'
        nav = []
        if newer:
            nav.append(f'<a class="pager-link" href="{e(s.rel(cur, newer.path))}" rel="next"><small>{icon("arrow-left")}Jaunāks</small><span>{e(newer.title)}</span></a>')
        else:
            nav.append('<span></span>')
        if older:
            nav.append(f'<a class="pager-link pager-next" href="{e(s.rel(cur, older.path))}" rel="prev"><small>Vecāks{icon("arrow-right")}</small><span>{e(older.title)}</span></a>')
        others = [p for p in s.news if p.path != cur][:3]
        more = ''.join(self.news_card(cur, p) for p in others)
        main = (self.page_head(cur, page.title, page.meta.get('summary', ''), meta, narrow=True) +
                f'<div class="container layout layout-article"><article class="content">{img}'
                f'<div class="prose">{body}</div>{self.files(page)}'
                f'<nav class="pager" aria-label="Citi raksti">{"".join(nav)}</nav></article></div>'
                f'<section class="section section-tint"><div class="container"><div class="section-head section-head-row">'
                f'<h2>Jaunākās ziņas</h2><a class="btn btn-ghost" href="{e(s.rel(cur, s.facts["newsPage"]))}">Visi jaunumi{icon("arrow-right")}</a></div>'
                f'<div class="news-grid">{more}</div></div></section>')
        self.write(cur, self.layout(cur, page.title, main, description=page.meta.get('summary') or page.excerpt(200),
                                    canonical=page.meta.get('source', '')))
        text = (page.meta.get('summary', '') + ' ' + page.text)[:700]
        self.search.append([page.title, s.file(cur), 'Jaunumi · ' + page.date[:4], text])

    def news_index(self):
        s = self.s
        cur = s.facts['newsPage']
        years = sorted({p.date[:4] for p in s.news if p.date}, reverse=True)
        options = ''.join(f'<option value="{y}">{y}</option>' for y in years)
        cards = ''.join(self.news_card(cur, p) for p in s.news[:12])
        main = (self.page_head(cur, 'Jaunumi', 'Uzņēmuma aktualitātes, paziņojumi par tarifu un siltumapgādes darbiem.') +
                f'''<div class="container news-page">
<form class="filters" data-news-filter>
<label class="field field-grow"><span>Meklēt jaunumos</span><span class="input-icon">{icon("search")}<input type="search" name="q" placeholder="Atslēgvārds…" autocomplete="off"></span></label>
<label class="field"><span>Gads</span><select name="year"><option value="">Visi gadi</option>{options}</select></label>
<p class="filters-count" data-news-count aria-live="polite">{len(s.news)} ieraksti</p>
</form>
<div class="news-grid" data-news-list>{cards}</div>
<div class="load-more"><button type="button" class="btn btn-ghost" data-news-more>Rādīt vairāk</button></div>
<noscript><p class="empty">Lai pārlūkotu visu jaunumu arhīvu, ieslēdziet pārlūkā JavaScript.</p></noscript>
</div>''')
        self.write(cur, self.layout(cur, 'Jaunumi', main, canonical=s.origin + cur))
        data = [[p.title, s.file(p.path), p.date, p.meta.get('summary') or p.excerpt(140),
                 s.media(p.image) if p.image else ''] for p in s.news]
        (s.out / 'assets/js').mkdir(parents=True, exist_ok=True)
        (s.out / 'assets/js/news-index.js').write_text(
            'window.VS_NEWS=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';', encoding='utf-8')

    def media_card(self, cur, p, video=False):
        s = self.s
        img = f'<img src="{e(s.media(p.image))}" alt="" loading="lazy" decoding="async">' if p.image else ''
        play = f'<span class="play">{icon("play")}</span>' if video else ''
        count = ''
        if not video and p.meta.get('photos'):
            count = f'<span class="media-count">{icon("images")}{len(p.meta["photos"])}</span>'
        return (f'<li><a class="media-card" href="{e(s.rel(cur, p.path))}"><span class="media-thumb">{img}{play}{count}</span>'
                f'<span class="media-title">{e(p.title)}</span></a></li>')

    def media_index(self):
        s = self.s
        cur = s.facts['mediaPage']
        videos = ''.join(self.media_card(cur, p, True) for p in s.videos)
        photos = ''.join(self.media_card(cur, p) for p in s.galleries)
        main = (self.page_head(cur, 'Foto un video', 'Uzņēmuma notikumi, projekti un sižeti.') +
                f'<div class="container media-page"><section><h2>Fotogalerijas</h2><ul class="media-grid">{photos}</ul></section>'
                f'<section><h2>Video</h2><ul class="media-grid">{videos}</ul></section></div>')
        self.write(cur, self.layout(cur, 'Foto un video', main, canonical=s.origin + cur))
        self.search.append(['Foto un video', s.file(cur), 'Par uzņēmumu', 'Fotogalerijas un video'])

    def gallery(self, page):
        s, cur = self.s, page.path
        photos = page.meta.get('photos') or []
        items = ''.join(
            f'<li><a href="{e(s.media(ph["full"]))}" data-lightbox><img src="{e(s.media(ph["thumb"]))}" alt="{e(page.title)} — {i + 1}. attēls" loading="lazy" decoding="async"></a></li>'
            for i, ph in enumerate(photos))
        body = self.body(page)
        prose = f'<div class="prose">{body}</div>' if body.strip() else ''
        meta = f'<p class="page-meta">{icon("images")}{len(photos)} attēli</p>'
        main = (self.page_head(cur, page.title, '', meta) +
                f'<div class="container media-page">{prose}<ul class="photo-grid">{items}</ul>'
                f'<p><a class="btn btn-ghost" href="{e(s.rel(cur, s.facts["mediaPage"]))}">{icon("arrow-left")}Visas galerijas</a></p></div>')
        self.write(cur, self.layout(cur, page.title, main, canonical=page.meta.get('source', '')))
        self.search.append([page.title, s.file(cur), 'Fotogalerija', ''])

    def video(self, page):
        s, cur = self.s, page.path
        vid = page.meta.get('youtube')
        player = self.youtube(vid, page.title, s.media(page.image) if page.image else '') if vid else ''
        body = self.body(page)
        prose = f'<div class="prose">{body}</div>' if body.strip() else ''
        main = (self.page_head(cur, page.title, narrow=True) +
                f'<div class="container layout layout-article"><article class="content">{player}{prose}'
                f'<p><a class="btn btn-ghost" href="{e(s.rel(cur, s.facts["mediaPage"]))}">{icon("arrow-left")}Visi video</a></p></article></div>')
        self.write(cur, self.layout(cur, page.title, main, canonical=page.meta.get('source', '')))
        self.search.append([page.title, s.file(cur), 'Video', ''])

    def search_page(self):
        cur = '/meklet'
        main = (self.page_head(cur, 'Meklēšana') +
                f'''<div class="container search-page">
<form class="search-form search-form-page" action="" method="get" role="search" data-search data-search-page>
<label class="sr-only" for="search-page-input">Meklēt vietnē</label>
{icon("search")}<input id="search-page-input" type="search" name="q" placeholder="Meklēt vietnē…" autocomplete="off" spellcheck="false">
<button class="btn btn-primary" type="submit">Meklēt</button>
</form>
<p class="filters-count" data-search-count aria-live="polite"></p>
<div class="search-results search-results-page" data-search-results></div>
<noscript><p class="empty">Meklēšanai nepieciešams JavaScript.</p></noscript>
</div>''')
        self.write(cur, self.layout(cur, 'Meklēšana', main))

    def not_found(self):
        base = self.cfg.get('basePath', '/')
        page = self.layout('/', 'Lapa nav atrasta', self.page_head('/', 'Lapa nav atrasta',
                           'Iespējams, lapa ir pārvietota vai adrese ievadīta kļūdaini.') +
                           '<div class="container"><p class="empty"><a class="btn btn-primary" href="index.html">Uz sākumlapu</a> '
                           '<a class="btn btn-ghost" href="meklet.html">Meklēt vietnē</a></p></div>')
        page = page.replace('<head>', f'<head>\n<base href="{e(base)}">', 1)
        (self.s.out / '404.html').write_text(page, encoding='utf-8')

    # -- output ------------------------------------------------------------
    def write(self, path, text):
        target = self.s.out / self.s.file(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')

    def assets(self):
        s = self.s
        out = s.out / 'assets'
        for name in ('fonts', 'img', 'js'):
            shutil.copytree(ROOT / 'src' / name, out / name, dirs_exist_ok=True)
        css = (ROOT / 'src/css/main.css').read_text(encoding='utf-8')
        rules = []
        for svg in sorted((ROOT / 'src/icons').glob('*.svg')):
            data = svg.read_text(encoding='utf-8').strip()
            data = re.sub(r'\s+', ' ', data).replace('"', "'")
            data = data.replace('%', '%25').replace('#', '%23').replace('<', '%3C').replace('>', '%3E')
            rules.append(f'.i-{svg.stem}{{--i:url("data:image/svg+xml,{data}")}}')
        css += '\n/* icons (generated from src/icons) */\n' + '\n'.join(rules) + '\n'
        (out / 'css').mkdir(parents=True, exist_ok=True)
        (out / 'css/main.css').write_text(css, encoding='utf-8')
        js = (ROOT / 'src/js/main.js').read_text(encoding='utf-8')
        s.version = hashlib.sha1((css + js).encode()).hexdigest()[:8]

    def run(self):
        s = self.s
        if s.out.exists():
            shutil.rmtree(s.out)
        s.out.mkdir(parents=True)
        self.assets()
        self.home()
        for i, page in enumerate(s.news):
            self.article(page, s.news[i - 1] if i else None, s.news[i + 1] if i + 1 < len(s.news) else None)
        for page in s.galleries:
            self.gallery(page)
        for page in s.videos:
            self.video(page)
        for page in s.pages.values():
            if page.type == 'page':
                self.standard(page)
        self.news_index()
        self.media_index()
        self.search_page()
        self.not_found()
        (s.out / 'assets/js/search-index.js').write_text(
            'window.VS_SEARCH=' + json.dumps(self.search, ensure_ascii=False, separators=(',', ':')) + ';',
            encoding='utf-8')
        (s.out / '.nojekyll').write_text('', encoding='utf-8')
        if not self.cfg.get('indexable'):
            (s.out / 'robots.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')
        total = sum(1 for _ in s.out.rglob('*.html'))
        print(f'built {total} pages -> {s.out.relative_to(ROOT) if s.out.is_relative_to(ROOT) else s.out}/')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=str(ROOT / 'docs'))
    args = ap.parse_args()
    Builder(Site(Path(args.out).resolve())).run()


if __name__ == '__main__':
    sys.exit(main())
