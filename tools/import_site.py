#!/usr/bin/env python3
"""Import the content of ventspilssiltums.lv into ./content.

Every page from the public sitemap is downloaded once (cached in .cache/),
the Drupal markup is reduced to clean, semantic HTML and written to
content/<path>.html with a small JSON front matter block.

    pip install beautifulsoup4 lxml
    python3 tools/import_site.py            # uses .cache/ when present
    python3 tools/import_site.py --refresh  # re-download everything

The build (tools/build.py) only needs the files in content/, not this script.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup, Comment, NavigableString

BASE = 'https://ventspilssiltums.lv'
LANG = '/lv'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWN_HOST = re.compile(r'^https?://(www\.)?ventspilssiltums\.lv', re.I)

# Pages that are rebuilt from data by the generator instead of imported.
SKIP = {'', '/video-foto'}


# ---------------------------------------------------------------- fetching

class Cache:
    def __init__(self, directory, refresh=False):
        self.dir = directory
        self.refresh = refresh
        os.makedirs(directory, exist_ok=True)

    def path(self, url):
        return os.path.join(self.dir, hashlib.sha1(url.encode()).hexdigest()[:16] + '.html')

    def get(self, url):
        fn = self.path(url)
        if not self.refresh and os.path.exists(fn) and os.path.getsize(fn) > 500:
            return open(fn, encoding='utf-8', errors='replace').read()
        parts = urllib.parse.urlsplit(url)
        safe = urllib.parse.urlunsplit(
            (parts.scheme, parts.netloc, urllib.parse.quote(parts.path, safe='/%'), parts.query, ''))
        last = None
        for attempt in range(4):
            try:
                req = urllib.request.Request(safe, headers={'User-Agent': UA, 'Accept-Language': 'lv'})
                with urllib.request.urlopen(req, timeout=40) as res:
                    data = res.read()
                with open(fn, 'wb') as fh:
                    fh.write(data)
                time.sleep(0.2)  # be gentle with the origin server
                return data.decode('utf-8', errors='replace')
            except Exception as exc:  # noqa: BLE001 - retry on any network error
                last = exc
                time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f'cannot fetch {url}: {last!r}')


# ---------------------------------------------------------------- helpers

def squash(text):
    return re.sub(r'\s+', ' ', (text or '').replace('\xa0', ' ')).strip()


def site_path(url):
    """'https://…/lv/par-mums/kontakti' -> '/par-mums/kontakti' ('' for home)."""
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path).rstrip('/')
    if path == LANG:
        return ''
    if path.startswith(LANG + '/'):
        return path[len(LANG):]
    return None


def asset_path(src):
    """Normalise a file/image URL to a host-less '/sites/default/files/…' path."""
    if not src:
        return src
    src = OWN_HOST.sub('', src.strip())
    return src


def is_caps(text):
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 4:
        return False
    upper = sum(1 for c in letters if c.isupper())
    return upper / len(letters) >= 0.9


WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
ROMAN = re.compile(r'^[IVXLC]+$')
NO_SENTENCE_END = {'nr', 'plkst', 'piem', 'lpp', 'tālr', 'u', 'c', 't', 'sk', 'g', 'gs', 'p', 'k'}


class Truecaser:
    """Rewrites SHOUTED TEXT in normal case.

    Capitalisation of every word is learned from the site's own running text
    (so «VENTSPILS» -> «Ventspils», «SIA» stays «SIA», «PVN» stays «PVN»).
    """

    def __init__(self):
        self.forms = {}

    def learn(self, text):
        for m in WORD.finditer(text):
            before = text[:m.start()].rstrip()
            if not before or before[-1] in '.!?:;•–—-"„“”«»(\n':
                continue  # sentence start tells us nothing about the word itself
            word = m.group(0)
            if len(word) > 1 and word.isupper() and is_caps(text):
                continue
            bucket = self.forms.setdefault(word.lower(), {})
            bucket[word] = bucket.get(word, 0) + 1

    def word(self, word, following=''):
        if ROMAN.match(word) and following.startswith('.'):
            return word
        forms = self.forms.get(word.lower())
        if forms:
            return max(forms.items(), key=lambda kv: (kv[1], kv[0].islower()))[0]
        if len(word) <= 3 and word.isascii():
            return word  # unknown short token: most likely an abbreviation
        return word.lower()

    def convert(self, text, start=True):
        out, pos = [], 0
        cap = start and not re.match(r'\W*\d', text)  # "2026. GADS" -> "2026. gads"
        prev = ''
        for m in WORD.finditer(text):
            gap = text[pos:m.start()]
            out.append(gap)
            if re.search(r'[!?]\s*$', gap):
                cap = True
            elif re.match(r'\.\s+$', gap) and prev:
                numbering = ROMAN.match(prev) or (len(prev) == 1 and prev.isupper())
                if numbering or (len(prev) > 2 and prev.lower() not in NO_SENTENCE_END):
                    cap = True
            word = self.word(m.group(0), text[m.end():m.end() + 1])
            if cap and word:
                word = word[0].upper() + word[1:]
            cap = False
            prev = m.group(0)
            out.append(word)
            pos = m.end()
        out.append(text[pos:])
        return ''.join(out)

    def apply(self, root):
        for el in root.find_all(['h2', 'h3', 'h4', 'p', 'li', 'td', 'th']):
            if el.find(['p', 'li', 'td', 'table', 'ul', 'ol']):
                continue
            if not is_caps(squash(el.get_text())):
                continue
            first = True
            prev = el.find_previous_sibling() if el.name == 'p' and el.find_parent(['td', 'th', 'li']) else None
            if prev is not None and prev.name == 'p' and not re.search(r'[.!?:]\s*$', squash(prev.get_text())):
                first = False  # continuation of a label that was split over two lines
            for node in list(el.find_all(string=True)):
                if isinstance(node, Comment) or not WORD.search(node):
                    continue
                node.replace_with(NavigableString(self.convert(str(node), start=first)))
                first = False


PHONE = re.compile(r'(?<![\d/,-])(?<!\d\.)(\+371[ \xa0]?)?((?=[26])(?:\d{8}|\d{3} \d{2} \d{3}|\d{2} \d{3} \d{3}|\d{4} \d{4}))'
                   r'(?![\d/-]|[.,]\d|\s*(?:EUR|€|MWh|kW|m2|m³|gad))')
PHONE_HINT = re.compile(r'(tālr|talr|tel\b|tel\.|mob|т\.|телефон|zvan)', re.I)


class Cleaner:
    """Turns a Drupal WYSIWYG body into tidy HTML."""

    KEEP_CLASS = {'text-align-center': 'tc', 'text-align-right': 'tr', 'rtecenter': 'tc',
                  'align-left': 'align-left', 'align-right': 'align-right', 'align-center': 'align-center',
                  'img-s': 'img-s', 'img-m': 'img-m', 'img-l': 'img-l'}
    ATTRS = {
        'a': {'href', 'target', 'title', 'data-size'},
        'img': {'src', 'alt', 'width', 'height'},
        'td': {'colspan', 'rowspan'}, 'th': {'colspan', 'rowspan', 'scope'},
        'ol': {'start', 'type'},
        'figure': {'data-youtube'},
    }
    UNWRAP = {'span', 'font', 'div', 'o:p', 'u', 'tbody', 'center', 'big', 'small', 'section', 'article'}
    DROP = {'script', 'style', 'meta', 'link', 'form', 'input', 'button', 'noscript', 'object', 'embed'}

    def __init__(self, known_paths, node_paths, truecaser=None):
        self.known = known_paths
        self.nodes = node_paths
        self.truecaser = truecaser

    # -- links ------------------------------------------------------------
    def link(self, href):
        href = (href or '').strip()
        if not href or href.startswith(('mailto:', 'tel:', '#')):
            return href
        local = OWN_HOST.sub('', href)
        if local != href or href.startswith('/'):
            if not local.startswith('/'):
                local = '/' + local
            m = re.match(r'^(?:/lv)?/node/(\d+)', local)
            if m and m.group(1) in self.nodes:
                return self.nodes[m.group(1)] or '/'
            if local.startswith('/sites/') or local.startswith('/themes/'):
                return local
            frag = ''
            if '#' in local:
                local, frag = local.split('#', 1)
                frag = '#' + frag
            p = urllib.parse.unquote(local.split('?')[0]).rstrip('/')
            if p == LANG or p == '':
                return '/' + frag
            if p.startswith(LANG + '/') and p[len(LANG):] in self.known:
                return p[len(LANG):] + frag
            if p in self.known:
                return p + frag
            return BASE + local + frag  # page we did not import: keep pointing at the origin
        if re.match(r'^[a-z][a-z0-9+.-]*:', href, re.I):
            return href
        if re.match(r'^(www\.)[^\s]+$', href):
            return 'https://' + href
        return href

    # -- main entry -------------------------------------------------------
    def clean(self, node):
        soup = BeautifulSoup(str(node), 'lxml')
        root = soup.body.find(True) if soup.body else None
        if root is None:
            return ''
        for c in root.find_all(string=lambda s: isinstance(s, Comment)):
            c.extract()
        for el in root.find_all(self.DROP):
            el.decompose()

        self._media(root, soup)
        self._images(root)
        self._iframes(root, soup)
        self._headings(root, soup)

        # attributes / classes
        for el in root.find_all(True):
            classes = [self.KEEP_CLASS[c] for c in (el.get('class') or []) if c in self.KEEP_CLASS]
            if 'red-text' in (el.get('class') or []) and el.name == 'span':
                el.name = 'mark'
            keep = self.ATTRS.get(el.name, set())
            for attr in list(el.attrs):
                if attr not in keep:
                    del el[attr]
            if el.name in ('p', 'li', 'h2', 'h3', 'h4') and not el.find_parent('table'):
                classes = []  # centred body copy is harder to read; keep alignment for table cells only
            if el.name in ('p', 'td', 'th', 'li', 'img') and classes:
                el['class'] = sorted(set(classes))
            if el.name == 'a':
                if el.get('href') is None:
                    el.unwrap()
                    continue
                el['href'] = self.link(el['href'])
                href = el['href'].strip()
                if href.startswith('tel:'):
                    href = 'tel:' + re.sub(r'[^\d+]', '', href[4:])
                elif not re.match(r'^(/|#|mailto:|https?://)', href):
                    el.unwrap()  # broken link in the source (e.g. plain text pasted into the URL field)
                    continue
                el['href'] = href.replace(' ', '%20')
                if el['href'].startswith(('http://', 'https://')):
                    el['rel'] = 'noopener'
                    el['target'] = '_blank'
                elif el.get('target') and not el['href'].startswith('/sites/'):
                    del el['target']

        for el in root.find_all(self.UNWRAP):
            el.unwrap()

        self._tables(root, soup)
        self._tidy(root)
        self._link_lists(root, soup)
        if self.truecaser:
            self.truecaser.apply(root)
        self._phones(root, soup)

        html = root.decode_contents() if root.name in ('div', 'body') else str(root)
        html = html.replace('\xa0', ' ')
        html = re.sub(r'[ \t]+', ' ', html)
        html = re.sub(r'\s*\n\s*', '\n', html)
        html = re.sub(r'(</(?:p|h2|h3|h4|ul|ol|li|tr|table|thead|div|figure|hr|blockquote)>)(?!\n)', r'\1\n', html)
        html = re.sub(r'\n{2,}', '\n', html)
        return html.strip()

    # -- pieces -----------------------------------------------------------
    def _media(self, root, soup):
        """Drupal media embeds (documents, archives) -> plain download links."""
        for media in root.select('.media'):
            link = media.find('a', href=True)
            if not link:
                media.decompose()
                continue
            a = soup.new_tag('a', href=link['href'])
            a.string = squash(link.get_text())
            size = media.find(string=re.compile(r'\(\s*[\d.,]+\s*[KMG]?B\s*\)', re.I))
            if size:
                a['data-size'] = squash(size).strip('()').replace('.', ',')
            media.replace_with(a)

    def _images(self, root):
        for img in root.find_all('img'):
            src = img.get('src', '')
            w, h = img.get('width', ''), img.get('height', '')
            tiny = w.isdigit() and h.isdigit() and int(w) <= 80 and int(h) <= 80
            if src.startswith('data:') or 'base64,' in src[:60] or not src or tiny or 'DOC-VECTOR' in src:
                img.decompose()  # inline blobs and decorative document icons
                continue
            img['src'] = asset_path(src)
            img['alt'] = squash(img.get('alt', ''))
            classes = [c for c in (img.get('class') or []) if c.startswith('align-')]
            if w.endswith('%'):
                try:
                    pct = float(w.rstrip('%'))
                    classes.append('img-s' if pct < 35 else 'img-m' if pct < 70 else 'img-l')
                except ValueError:
                    pass
            if not (w.isdigit() and h.isdigit()):
                img.attrs.pop('width', None)
                img.attrs.pop('height', None)
            img['class'] = [c for c in classes if c in self.KEEP_CLASS]
            parent = img.parent
            if parent and parent.name == 'a' and re.search(r'\.(jpe?g|png|gif|webp)(\?|$)', parent.get('href', ''), re.I):
                parent['href'] = asset_path(parent['href'])

    def _iframes(self, root, soup):
        for frame in root.find_all('iframe'):
            m = re.search(r'youtube(?:-nocookie)?\.com/embed/([\w-]{6,})', frame.get('src', ''))
            if not m:
                frame.decompose()
                continue
            fig = soup.new_tag('figure')
            fig['data-youtube'] = m.group(1)
            frame.replace_with(fig)

    def _headings(self, root, soup):
        """Normalise real and pseudo headings to h2…h4 in document order."""
        found = []
        for el in root.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']):
            text = squash(el.get_text())
            link = el.find('a')
            only_link = link is not None and squash(link.get_text()) == text
            timeish = re.search(r'\d{1,2}[.:]\d{2}\s*[-–]', text) is not None
            if el.name != 'p':
                if not text:
                    el.decompose()
                elif el.find_parent('table') or only_link or timeish or len(text) > 160:
                    el.name = 'p'  # headings used purely for styling
                    if not only_link and not el.find(['strong', 'b']) and len(text) <= 160:
                        strong = soup.new_tag('strong')
                        for child in list(el.contents):
                            strong.append(child.extract())
                        el.append(strong)
                else:
                    found.append((el, int(el.name[1])))
                continue
            if el.find_parent(['table', 'li', 'blockquote']) or el.find(['img', 'iframe', 'figure', 'table', 'br']):
                continue
            if not text or len(text) > 130 or text.endswith(('.', ',', ';')) or only_link or timeish:
                continue
            classes = el.get('class') or []
            strong = el.find(['strong', 'b'])
            all_bold = strong is not None and squash(strong.get_text()) == text
            if is_caps(text) and ('orange-text' in classes or all_bold or len(text) <= 80):
                found.append((el, 7))
        levels = sorted({lvl for _, lvl in found})
        target = {lvl: 'h%d' % min(2 + i, 4) for i, lvl in enumerate(levels)}
        for el, lvl in found:
            for inner in el.find_all(['strong', 'b', 'em', 'u', 'span']):
                inner.unwrap()
            if el.find('a') is None:
                el.string = squash(el.get_text())
            el.name = target[lvl]

    def _tables(self, root, soup):
        # nested "1. | document" tables -> lists
        for table in reversed(root.find_all('table')):
            if not table.find_parent('table'):
                continue
            rows = table.find_all('tr')
            items = []
            simple = True
            for row in rows:
                cells = row.find_all(['td', 'th'], recursive=False)
                if not cells or len(cells) > 2:
                    simple = False
                    break
                if len(cells) == 2 and not re.fullmatch(r'\d{0,3}[.)]?', squash(cells[0].get_text())):
                    simple = False
                    break
                items.append(cells[-1])
            if not simple:
                continue
            ul = soup.new_tag('ul')
            for cell in items:
                if not squash(cell.get_text()) and not cell.find(['a', 'img']):
                    continue
                li = soup.new_tag('li')
                for child in list(cell.contents):
                    li.append(child.extract())
                for p in li.find_all('p'):
                    p.unwrap()
                ul.append(li)
            if ul.find('li'):
                table.replace_with(ul)
            else:
                table.decompose()

        for table in root.find_all('table'):
            if table.find_parent('table'):
                continue
            rows = [r for r in table.find_all('tr') if r.find_parent('table') is table]
            gap = False
            for row in rows:
                cells = row.find_all(['td', 'th'], recursive=False)
                if not any(squash(c.get_text()) or c.find(['img', 'a']) for c in cells):
                    row.decompose()
                    gap = True
                    continue
                if gap:
                    row['class'] = ['gap']
                    gap = False
            rows = [r for r in table.find_all('tr') if r.find_parent('table') is table]
            if not rows:
                table.decompose()
                continue
            # single-cell paragraphs inside cells are noise
            for cell in table.find_all(['td', 'th']):
                ps = cell.find_all('p', recursive=False)
                others = [c for c in cell.contents if not (isinstance(c, NavigableString) and not squash(c)) and c not in ps]
                if len(ps) == 1 and not others:
                    cls = ps[0].get('class')
                    if cls and not cell.get('class'):
                        cell['class'] = cls
                    ps[0].unwrap()
            # header row: every cell bold (or already th)
            first = rows[0]
            cells = first.find_all(['td', 'th'], recursive=False)
            if len(rows) > 2 and len(cells) > 1 and not table.find('thead'):
                def bold(cell):
                    text = squash(cell.get_text())
                    strong = ''.join(squash(s.get_text()) for s in cell.find_all(['strong', 'b']))
                    return cell.name == 'th' or (text and strong.replace(' ', '') == text.replace(' ', ''))
                if all(bold(c) for c in cells) and not any(c.get('rowspan') for c in cells):
                    thead = soup.new_tag('thead')
                    first.extract()
                    for c in cells:
                        c.name = 'th'
                        c['scope'] = 'col'
                        for s in c.find_all(['strong', 'b', 'em']):
                            s.unwrap()
                    thead.append(first)
                    table.insert(0, thead)
            wrap = soup.new_tag('div')
            wrap['class'] = ['table-wrap']
            table.wrap(wrap)

    def _tidy(self, root):
        # collapse nbsp, drop empty inline + block elements (repeat until stable)
        for text in root.find_all(string=True):
            if '\xa0' in text:
                text.replace_with(text.replace('\xa0', ' '))
        changed = True
        while changed:
            changed = False
            for el in root.find_all(['p', 'strong', 'b', 'em', 'i', 'li', 'ul', 'ol', 'a', 'sup', 'sub', 'mark',
                                     'h2', 'h3', 'h4', 'blockquote']):
                if el.find(['img', 'iframe', 'figure', 'table']) is not None:
                    continue
                if not squash(el.get_text()):
                    if el.name in ('strong', 'b', 'em', 'i', 'sup', 'sub', 'mark') and el.get_text():
                        el.replace_with(' ')
                    else:
                        el.decompose()
                    changed = True
        for el in root.find_all('b'):
            el.name = 'strong'
        for el in root.find_all('i'):
            el.name = 'em'
        # <br> clean-up: none at the edges of a block, never more than one in a row
        for br in root.find_all('br'):
            nxt = br.next_sibling
            while isinstance(nxt, NavigableString) and not squash(nxt):
                nxt = nxt.next_sibling
            prev = br.previous_sibling
            while isinstance(prev, NavigableString) and not squash(prev):
                prev = prev.previous_sibling
            if nxt is None or prev is None or getattr(nxt, 'name', None) == 'br':
                br.decompose()
        # consecutive <hr> and leading/trailing ones
        for hr in root.find_all('hr'):
            nxt = hr.find_next_sibling()
            if nxt is None or nxt.name == 'hr' or hr.find_previous_sibling() is None:
                hr.decompose()

    def _link_lists(self, root, soup):
        """Three or more consecutive paragraphs that are nothing but a link -> <ul class="links">."""
        def link_only(el):
            if getattr(el, 'name', None) != 'p' or el.find(['img', 'figure', 'br']):
                return False
            links = el.find_all('a')
            if len(links) != 1:
                return False
            rest = squash(el.get_text()).replace(squash(links[0].get_text()), '', 1)
            return len(rest.strip(' .;,-–')) == 0

        for first in list(root.find_all('p')):
            if first.parent is None or not link_only(first):
                continue
            run, node = [first], first.next_sibling
            while node is not None:
                if isinstance(node, NavigableString):
                    if squash(node):
                        break
                    node = node.next_sibling
                    continue
                if not link_only(node):
                    break
                run.append(node)
                node = node.next_sibling
            if len(run) < 3:
                continue
            ul = soup.new_tag('ul')
            ul['class'] = ['links']
            first.insert_before(ul)
            for p in run:
                li = soup.new_tag('li')
                li.append(p.find('a').extract())
                ul.append(li)
                p.decompose()

    def _phones(self, root, soup):
        for text in list(root.find_all(string=True)):
            if isinstance(text, Comment) or text.find_parent(['a', 'h2', 'h3', 'h4']):
                continue
            raw = str(text)
            if not PHONE.search(raw):
                continue
            block = text.find_parent(['p', 'td', 'th', 'li', 'tr']) or text.parent
            context = squash(block.get_text()) if block else raw
            pieces, pos, hit = [], 0, False
            for m in PHONE.finditer(raw):
                digits = re.sub(r'\D', '', m.group(2))
                at = context.find(m.group(2))
                before = (context[max(0, at - 80):at] if at >= 0 else '') + ' ' + raw[:m.start()][-80:]
                local = digits.startswith('636') and ' ' not in m.group(2)
                if not (local or PHONE_HINT.search(before)):
                    continue
                pieces.append(raw[pos:m.start()])
                a = soup.new_tag('a', href='tel:+371' + digits)
                a.string = m.group(0)
                pieces.append(a)
                pos = m.end()
                hit = True
            if not hit:
                continue
            pieces.append(raw[pos:])
            first = pieces[0]
            new = NavigableString(first)
            text.replace_with(new)
            anchor = new
            for piece in pieces[1:]:
                node = piece if not isinstance(piece, str) else NavigableString(piece)
                anchor.insert_after(node)
                anchor = node


def plain_text(html):
    text = BeautifulSoup(html, 'lxml').get_text(' ')
    return squash(text)


# ---------------------------------------------------------------- import

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'raw'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'content'))
    ap.add_argument('--refresh', action='store_true', help='ignore the cache and download again')
    args = ap.parse_args()

    cache = Cache(args.cache, args.refresh)
    sitemap = cache.get(BASE + '/sitemap.xml')
    urls = list(dict.fromkeys(re.findall(r'<loc>([^<]+)</loc>', sitemap)))
    print(f'{len(urls)} URLs in sitemap')

    with ThreadPoolExecutor(3) as pool:
        raw = dict(zip(urls, pool.map(cache.get, urls)))

    # News teasers (summary lines) only exist on the paginated listing.
    summaries, order = {}, []
    page = 0
    while True:
        soup = BeautifulSoup(cache.get(f'{BASE}{LANG}/par-mums/jaunumi?page={page}'), 'lxml')
        rows = soup.select('.view-jaunumi .views-row')
        if not rows:
            break
        for row in rows:
            art = row.find('article')
            about = art.get('about') if art else None
            body = row.select_one('.field--name-body')
            if about:
                summaries[site_path(BASE + about)] = squash(body.get_text()) if body else ''
                order.append(site_path(BASE + about))
        page += 1
    print(f'{len(summaries)} news teasers from {page} listing pages')

    soups, known, nodes = {}, set(), {}
    for url, html in raw.items():
        path = site_path(url)
        if path is None:
            continue
        soup = BeautifulSoup(html, 'lxml')
        soups[path] = soup
        known.add(path)
        short = soup.find('link', rel='shortlink')
        m = re.search(r'/node/(\d+)', short['href']) if short and short.get('href') else None
        if m:
            nodes[m.group(1)] = path
    known.add('/par-mums/jaunumi')
    known.add('/video-foto')
    truecaser = Truecaser()
    for soup in soups.values():
        for block in soup.select('.block--siltums-system-main .field--name-body p, '
                                 '.block--siltums-system-main .field--name-body li, '
                                 '.block--siltums-system-main .field--name-body td'):
            text = squash(block.get_text())
            if text and not is_caps(text):
                truecaser.learn(text)
    cleaner = Cleaner(known, nodes, truecaser)

    # gallery / video order + video thumbnails come from the media index page
    media_order, thumbs = [], {}
    index = soups.get('/video-foto')
    if index:
        for art in index.select('[class*=views-block] article'):
            p = site_path(BASE + art.get('about', ''))
            media_order.append(p)
            img = art.find('img')
            if img:
                thumbs[p] = asset_path(img.get('src'))

    if os.path.isdir(args.out):
        shutil.rmtree(args.out)
    count = 0
    for path, soup in sorted(soups.items()):
        if path in SKIP:
            continue
        body_cls = ' '.join(soup.body.get('class') or [])
        kind = ('article' if 'node-type--article' in body_cls else 'gallery' if 'node-type--galerija' in body_cls
                else 'video' if 'node-type--video' in body_cls else 'page')
        h1 = soup.select_one('h1.page-title')
        art = soup.select_one('.block--siltums-system-main article')
        title = squash(h1.get_text()) if h1 else ''
        if is_caps(title):
            title = truecaser.convert(title)
        meta = {'title': title, 'type': kind, 'source': BASE + LANG + path}
        body_html = ''
        if art is not None:
            body = art.select_one('.field--name-body')
            if body is not None:
                body_html = cleaner.clean(body)
            lead = art.select_one('.field--name-field-liela-bilde img, .field--name-field-article-bilde img')
            if lead and lead.get('src'):
                meta['image'] = asset_path(lead['src'])
            when = art.select_one('.field--name-field-jaunums-datums time')
            if when and when.get('datetime'):
                meta['date'] = when['datetime'][:10]
            files = []
            for a in art.select('.field--name-field-faili a[href]'):
                files.append({'title': squash(a.get_text()), 'url': cleaner.link(a['href'])})
            if files:
                meta['files'] = files
            if kind == 'gallery':
                photos = []
                for a in art.select('a.colorbox[href]'):
                    img = a.find('img')
                    photos.append({'full': asset_path(a['href']), 'thumb': asset_path(img['src']) if img else asset_path(a['href'])})
                meta['photos'] = photos
                if path in thumbs:
                    meta['image'] = thumbs[path]
                elif photos:
                    meta['image'] = photos[0]['thumb']
            if kind == 'video':
                frame = art.find('iframe')
                m = re.search(r'/embed/([\w-]{6,})', frame.get('src', '')) if frame else None
                if m:
                    meta['youtube'] = m.group(1)
                if path in thumbs:
                    meta['image'] = thumbs[path]
        if kind == 'article':
            meta['summary'] = summaries.get(path, '')
        if kind in ('gallery', 'video') and path in media_order:
            meta['order'] = media_order.index(path)
        crumbs = [squash(li.get_text()) for li in soup.select('.breadcrumb-item')][1:-1]
        if crumbs:
            meta['trail'] = crumbs

        target = os.path.join(args.out, path.lstrip('/') + '.html')
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'w', encoding='utf-8') as fh:
            fh.write('---\n' + json.dumps(meta, ensure_ascii=False, indent=1) + '\n---\n' + body_html + '\n')
        count += 1
    print(f'wrote {count} files to {os.path.relpath(args.out, ROOT)}/')


if __name__ == '__main__':
    sys.exit(main())
