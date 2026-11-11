#!/usr/bin/env python3
"""Check that every internal link and asset reference in the built site resolves to a file.

    python3 tools/qa/linkcheck.py            # checks ./docs
    python3 tools/qa/linkcheck.py some/dir

Exits with status 1 when a broken target or a duplicate id is found.
"""
import collections
import os
import re
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
site = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, 'docs')

broken, examples, duplicate_ids, pages = collections.Counter(), {}, [], 0
for dirpath, _, files in os.walk(site):
    for name in files:
        if not name.endswith('.html') or name == '404.html':  # 404.html uses <base href>
            continue
        pages += 1
        path = os.path.join(dirpath, name)
        with open(path, encoding='utf-8') as fh:
            html = fh.read()
        ids = collections.Counter(re.findall(r'\sid="([^"]+)"', html))
        dup = [i for i, n in ids.items() if n > 1]
        if dup:
            duplicate_ids.append((os.path.relpath(path, site), dup[:3]))
        for _attr, value in re.findall(r'\b(href|src|action)="([^"]*)"', html):
            value = value.replace('&amp;', '&')
            if not value or value.startswith(('mailto:', 'tel:', '#', 'data:')):
                continue
            if re.match(r'^[a-z][a-z0-9+.-]*:', value, re.I):
                continue  # external
            target = urllib.parse.unquote(value.split('#')[0].split('?')[0])
            if target and not os.path.exists(os.path.normpath(os.path.join(dirpath, target))):
                broken[target] += 1
                examples.setdefault(target, os.path.relpath(path, site))

print(f'{pages} pages checked, {len(broken)} broken targets, {len(duplicate_ids)} pages with duplicate ids')
for target, count in broken.most_common(20):
    print(f'  BROKEN x{count}: {target}  (e.g. in {examples[target]})')
for page, ids in duplicate_ids[:10]:
    print(f'  DUPLICATE IDS in {page}: {ids}')
sys.exit(1 if broken or duplicate_ids else 0)
