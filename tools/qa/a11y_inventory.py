#!/usr/bin/env python3
"""List the content that the accessibility statement calls "not yet accessible", as an Excel workbook
the company fills in: inline images without a text alternative, YouTube videos and photo galleries.

    python3 tools/qa/a11y_inventory.py pieklustamiba-saraksts.xlsx

Needs openpyxl. Re-run it for the yearly accessibility review: decisions are not carried over,
so keep the filled-in copy and compare.
"""
import collections
import html
import posixpath
import re
import sys
import urllib.parse
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402

FONT = 'Arial'
HEAD = PatternFill('solid', fgColor='2D2520')
INPUT = PatternFill('solid', fgColor='FFF4CC')   # cells the company fills in
THIN = Side(style='thin', color='D9D0C5')
# File names that often belong to pictures with text in them (posters, schemes, maps, charts, banners)
TEXTY = re.compile(r'logo|sh[eē]m|karte|grafik|plakat|afi[sš]|tabul|diagram|sludin|skat|scan|ekr[aā]n|bann?er|info', re.I)


def text_before(body, pos, limit=160):
    raw = re.sub(r'<[^>]+>', ' ', body[max(0, pos - 1500):pos])
    raw = re.sub(r'\s+', ' ', html.unescape(raw)).strip()
    return ('…' + raw[-limit:]) if len(raw) > limit else raw


def hint(src, attrs):
    name = urllib.parse.unquote(posixpath.basename(urllib.parse.urlparse(src).path))
    notes = []
    w = re.search(r'width="(\d+)"', attrs)
    h = re.search(r'height="(\d+)"', attrs)
    if w and h and int(h.group(1)) and int(w.group(1)) / int(h.group(1)) >= 4:
        notes.append('plats un zems — iespējams, teksts vai reklāmkarogs')
    if TEXTY.search(name):
        notes.append('nosaukums liecina par shēmu, karti, logo vai plakātu')
    if name.lower().endswith(('.png', '.gif')):
        notes.append('PNG/GIF — bieži grafika ar tekstu')
    size = f'{w.group(1)}×{h.group(1)}' if w and h else ''
    return name, size, '; '.join(notes)


def styled_sheet(ws, headers, widths, input_cols):
    ws.append(headers)
    for i, width in enumerate(widths, 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = width
        c = ws.cell(1, i)
        c.font = Font(name=FONT, bold=True, color='FFFFFF')
        c.fill = HEAD
        c.alignment = Alignment(wrap_text=True, vertical='center')
    ws.freeze_panes = 'A2'
    ws.row_dimensions[1].height = 32
    ws._input_cols = input_cols


def finish(ws):
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = Font(name=FONT, color=c.font.color.rgb if c.hyperlink else '000000', underline='single' if c.hyperlink else None)
            c.alignment = Alignment(wrap_text=True, vertical='top')
            c.border = Border(bottom=THIN)
            if c.column in ws._input_cols:
                c.fill = INPUT
    ws.auto_filter.ref = ws.dimensions


def link(ws, row, col, url, text=None):
    c = ws.cell(row, col, text or url)
    c.hyperlink = url
    c.font = Font(name=FONT, color='0563C1', underline='single')


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'pieklustamiba-saraksts.xlsx')
    s = build.Site(Path('/nonexistent-out'))
    origin = s.origin.rsplit('/lv', 1)[0]

    wb = Workbook()
    summary = wb.active
    summary.title = 'Kopsavilkums'

    # -- inline images ---------------------------------------------------
    img = wb.create_sheet('Attēli tekstā')
    styled_sheet(img, ['Nr.', 'Lapa', 'Lapas veids', 'Datums', 'Lapa esošajā vietnē', 'Attēls', 'Izmērs (px)',
                       'Teksts pirms attēla', 'Pazīmes, ka attēlā var būt informācija', 'Lēmums', 'Teksta apraksts (alt)',
                       'Piezīmes'],
                 [6, 34, 11, 11, 30, 30, 11, 46, 30, 20, 40, 26], {10, 11, 12})
    n = 0
    # pages first (by address), then news from the newest
    pages = sorted((p for p in s.pages.values() if p.type == 'page'), key=lambda p: p.path) + \
        sorted((p for p in s.pages.values() if p.type != 'page'), key=lambda p: (p.date or '', p.path), reverse=True)
    for p in pages:
        for m in re.finditer(r'<img\b[^>]*>', p.body):
            src = re.search(r'src="([^"]+)"', m.group(0))
            if not src:
                continue
            url = s.media(html.unescape(src.group(1)))
            name, size, notes = hint(url, m.group(0))
            n += 1
            r = n + 1
            img.append([n, p.title, 'lapa' if p.type == 'page' else 'jaunums', p.date or '', None, None, size,
                        text_before(p.body, m.start()), notes, None, None, None])
            src_page = p.meta.get('source') or origin + p.path
            link(img, r, 5, src_page, src_page.replace('https://', ''))
            link(img, r, 6, url, name)
    dv = DataValidation(type='list', formula1='"Dekoratīvs,Vajag aprakstu,Informācija jau ir tekstā,Noņemt attēlu"', allow_blank=True)
    img.add_data_validation(dv)
    dv.add(f'J2:J{n + 1}')
    finish(img)
    img_rows = n

    # -- videos --------------------------------------------------------
    vid = wb.create_sheet('Video')
    styled_sheet(vid, ['Nr.', 'Video', 'Lapa esošajā vietnē', 'YouTube', 'Subtitri', 'Lēmums', 'Piezīmes'],
                 [6, 46, 34, 30, 22, 30, 30], {5, 6, 7})
    videos = [p for p in s.videos if p.meta.get('youtube')]
    for i, p in enumerate(videos, 1):
        vid.append([i, p.title, None, None, None, None, None])
        src_page = p.meta.get('source') or origin + p.path
        link(vid, i + 1, 3, src_page, src_page.replace('https://', ''))
        yt = f'https://www.youtube.com/watch?v={p.meta["youtube"]}'
        link(vid, i + 1, 4, yt, yt.replace('https://', ''))
    dv2 = DataValidation(type='list', formula1='"Ir (cilvēka veidoti),Tikai automātiskie,Nav,Video bez runas"', allow_blank=True)
    dv3 = DataValidation(type='list', formula1='"Atstāt,Pievienot subtitrus,Pievienot teksta aprakstu,Noņemt no vietnes"', allow_blank=True)
    for v in (dv2, dv3):
        vid.add_data_validation(v)
    dv2.add(f'E2:E{len(videos) + 1}')
    dv3.add(f'F2:F{len(videos) + 1}')
    finish(vid)

    # -- galleries -----------------------------------------------------
    gal = wb.create_sheet('Galerijas')
    styled_sheet(gal, ['Nr.', 'Galerija', 'Foto', 'Lapa esošajā vietnē', 'Lēmums', 'Kopīgs apraksts galerijai', 'Piezīmes'],
                 [6, 46, 8, 34, 30, 40, 26], {5, 6, 7})
    for i, p in enumerate(s.galleries, 1):
        gal.append([i, p.title, len(p.meta.get('photos', [])), None, None, None, None])
        src_page = p.meta.get('source') or origin + p.path
        link(gal, i + 1, 4, src_page, src_page.replace('https://', ''))
    dv4 = DataValidation(type='list', formula1='"Atstāt (fotoattēli bez informācijas),Pievienot kopīgu aprakstu,Noņemt no vietnes"', allow_blank=True)
    gal.add_data_validation(dv4)
    dv4.add(f'E2:E{len(s.galleries) + 1}')
    finish(gal)

    # -- summary -------------------------------------------------------
    ws = summary
    ws.column_dimensions['A'].width = 44
    ws.column_dimensions['B'].width = 14
    ws.column_dimensions['C'].width = 14
    ws.column_dimensions['D'].width = 70
    rows = [
        ['Piekļūstamības saraksts — attēli, video un galerijas', None, None, None],
        [f'Sagatavots no vietnes satura ({build.datetime.date.today():%d.%m.%Y.}) piekļūstamības paziņojumam un ikgadējam izvērtējumam.', None, None, None],
        [None, None, None, None],
        ['Kā aizpildīt', None, None, None],
        ['Dzeltenās šūnas ir jāaizpilda; pārējās ir aizpildītas no vietnes.', None, None, None],
        ['Attēliem: „Dekoratīvs” — attēls neko nepasaka (fotogrāfija, noformējums). „Vajag aprakstu” — attēlā ir teksts, shēma, karte vai cita informācija; tad ierakstiet īsu aprakstu kolonnā „Teksta apraksts”. „Informācija jau ir tekstā” — to pašu var izlasīt blakus tekstā.', None, None, None],
        ['Piemērs: attēls ar paziņojumu „Karstā ūdens nebūs 12.–14. augustā” → Lēmums: Vajag aprakstu → Apraksts: „Paziņojums: karstā ūdens nebūs no 12. līdz 14. augustam”.', None, None, None],
        ['Video: atveriet YouTube saiti un iestatījumos (zobrats → Subtitri) pārbaudiet, vai ir subtitri. Automātiskie subtitri latviešu valodā parasti nav pietiekami precīzi.', None, None, None],
        [None, None, None, None],
        ['Kategorija', 'Kopā', 'Izlemts', 'Paskaidrojums'],
        ['Attēli tekstā', f"=COUNTA('Attēli tekstā'!A2:A{img_rows + 1})", f"=COUNTA('Attēli tekstā'!J2:J{img_rows + 1})",
         'Attēli lapās un jaunumos; visiem tagad ir tukšs teksta apraksts (alt="").'],
        ['Video', f"=COUNTA(Video!A2:A{len(videos) + 1})", f"=COUNTA(Video!E2:E{len(videos) + 1})",
         'YouTube video lapas; „Izlemts” skaita, cik video subtitri ir pārbaudīti.'],
        ['Galerijas', f"=COUNTA(Galerijas!A2:A{len(s.galleries) + 1})", f"=COUNTA(Galerijas!E2:E{len(s.galleries) + 1})",
         'Foto galerijas; katram foto tagad ir vispārīgs apraksts „<galerija> — N. attēls”.'],
        [None, None, None, None],
        ['Attēli, kam vajag aprakstu', f"=COUNTIF('Attēli tekstā'!J2:J{img_rows + 1},\"Vajag aprakstu\")", None,
         'Šos aprakstus ievietos vietnē; pārējos atstās kā dekoratīvus.'],
        ['Video bez subtitriem', f"=COUNTIF(Video!E2:E{len(videos) + 1},\"Nav\")+COUNTIF(Video!E2:E{len(videos) + 1},\"Tikai automātiskie\")", None,
         'Tie jāiekļauj piekļūstamības paziņojumā vai jāpievieno subtitri.'],
        [None, None, None, None],
        ['Netika iekļauts', None, None, None],
        ['Jaunumu un lapu galvenie attēli (virs teksta un kartītēs) netiek uzskaitīti: tie ir ilustrācijas blakus virsrakstam un vietnē apzināti atzīmēti kā dekoratīvi. Ja kādā no tiem ir svarīgs teksts (piemēram, plakāts), tas jāatkārto jaunuma tekstā.', None, None, None],
        ['Dokumenti (PDF, DOC, XLS) ir atsevišķs jautājums — paziņojumā tie norādāmi kā nesamērīgs slogs ar aprēķinu.', None, None, None],
    ]
    for r in rows:
        ws.append(r)
    for row in ws.iter_rows():
        for c in row:
            c.font = Font(name=FONT)
            c.alignment = Alignment(wrap_text=True, vertical='top')
    for r in (5, 6, 7, 8, 19, 20, 2):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
        ws.row_dimensions[r].height = 46 if r in (6, 19) else 32
    ws['A1'].font = Font(name=FONT, bold=True, size=14)
    for r in (4, 18):
        ws.cell(r, 1).font = Font(name=FONT, bold=True, size=12)
    for col in range(1, 5):
        c = ws.cell(10, col)
        c.font = Font(name=FONT, bold=True, color='FFFFFF')
        c.fill = HEAD
    ws['A5'].fill = INPUT
    ws['C10'].comment = Comment('Skaita aizpildītās dzeltenās šūnas (lēmumu vai subtitru kolonnā).', 'Vietnes pārbūve')
    wb.save(out)
    print(f'{out}: {img_rows} images, {len(videos)} videos, {len(s.galleries)} galleries')


if __name__ == '__main__':
    main()
