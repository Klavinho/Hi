# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Galvenais lietotājs (apstiprināts): Ventspils iedzīvotājs ar ikdienas jautājumu — dzīvokļa iemītnieks, kurš meklē informāciju par rēķiniem un norēķiniem, tarifu, klientu pieņemšanas laiku vai atbildi uz bieži uzdotu jautājumu.

Citas auditorijas, kas redzamas lapas saturā un izvēlnē, bet ir sekundāras attiecībā pret galveno lietotāju:

- cilvēks avārijas vai bojājuma brīdī (nav apkures, noplūde), kam uzreiz jāatrod, kur zvanīt;
- ēku pārvaldnieki (tehniskie noteikumi, līgumi, izziņas, patēriņa dati);
- jauni klienti, kas vēlas pieslēgties centralizētajai siltumapgādei;
- piegādātāji, darba meklētāji un sabiedrība (iepirkumi, vakances, pārskati, pārvaldības dokumenti).

## Product Purpose

Pašvaldības SIA „Ventspils siltums” mājaslapa: uzņēmums ražo un piegādā siltumenerģiju Ventspilī. Lapa ir esošās vietnes https://ventspilssiltums.lv/lv pārbūve ar mērķi, ko formulēja pasūtītājs: lai to būtu vieglāk izmantot un tā izskatītos pēc mūsdienu pieredzes.

Panākums: iedzīvotājs savu ikdienas jautājumu atrisina ātri un bez zvanīšanas, un neviens esošais saturs pārbūvē nepazūd.

## Positioning

Vienīgais oficiālais informācijas avots par centralizēto siltumapgādi Ventspilī: spēkā esošais tarifs, norēķinu kārtība, pieņemšanas laiki, avāriju pieteikšana un uzņēmuma publiskojamie dokumenti.

## Operating Context

- Projekta īpašnieks strādā uzņēmumā un saturu var saskaņot uzņēmuma iekšienē (apstiprināts).
- Esošā vietne darbojas uz Drupal 9, un tai nav piekļuves; pārbūve ir statiska vietne šajā repozitorijā (`content/` → `tools/build.py` → `docs/`), publicēšanai paredzēts `netlify.toml`.
- Klientu apkalpošana notiek arī klātienē (Pils ielā 12 un Talsu ielā 84) un pa tālruni; lapa šos kanālus papildina, nevis aizstāj.
- Lapa ir priekšskatījuma statusā: paziņojuma josla un aizliegums meklētājiem (`indexable: false`, `previewNotice: true`) paliek līdz palaišanai.

## Capabilities and Constraints

Apstiprināti ierobežojumi:

- Viss esošais saturs paliek pieejams (783 importētas lapas un dokumenti); teksti netiek pārrakstīti bez saskaņošanas.
- Tikai latviešu valoda; citas valodu versijas pagaidām nav vajadzīgas.
- Lapā ir meklēšana, izvēlne pa auditorijām, sākumlapas ātrās darbības un kontaktu/avārijas tālruņi (`site.json`).
- Lapa „Pārtraukumi un remontdarbi” apkopo paziņojumus no jaunumiem automātiski; sākumlapā ir josla ar jaunāko paziņojumu.
- Tiešsaistes veidlapas: rēķina pieteikšana e-pastā (esošs pakalpojums, līdz šim tikai pa e-pastu vai tālruni) un ziņojums par bojājumu, kas nav steidzams. Avārijas joprojām tikai pa tālruni 636 02 240.
- Apmeklējumu statistika bez sīkdatnēm ir sagatavota, bet izslēgta, līdz uzņēmums izvēlas rīku.

Vēl neizlemts vai gaida uzņēmuma apstiprinājumu:

- Sākumlapas teksti un skaitļi blokā „Par uzņēmumu” (`homeStats`, `homeAbout`) ir sagatavoti pārbūves laikā un nav uzņēmuma apstiprināti.
- VISI LIELIE BURTI virsrakstos automātiski pārvērsti parastā rakstībā; juridiskās lapas jāpārlasa.
- Attēli un dokumenti tiek ielādēti no ventspilssiltums.lv (`assetBase`); nav izlemts, vai tos pārcelt.
- Nav zināms, vai un kad pārbūve aizstās esošo vietni un kur tā tiks izvietota.
- Kur nonāk veidlapu pieteikumi (Netlify Forms vai uzņēmuma sistēma) un kas tos apstrādā; privātuma politika jāpapildina.
- Piekļūstamības paziņojums vietnē pagaidām nav publicēts (melnraksts `drafts/pieklustamibas-pazinojums.html`): jāiegūst uzņēmuma dati nesamērīgā sloga aprēķinam un termiņiem, jāapstiprina atbildīgā persona un sūdzību kārtība. „Viegli lasīt” tekstu vēl jāapstiprina.
- Zīmola krāsa: vietnē `#b93414`, esošajā vietnē `#d2232a` (pretrunā ar apņemšanos saglabāt krāsas) — jāsaskaņo.
- Galvenie lietotāju uzdevumi vēl nav pārbaudīti ar lietotājiem; ieteikta neliela aptauja (~30 atbildes) un lietojamības tests ar 5 cilvēkiem.

## Brand Commitments

- Nosaukums: Ventspils siltums; juridiski — Pašvaldības SIA „Ventspils siltums”.
- Esošais logotips un uzņēmuma krāsas paliek nemainīgas (apstiprināts); mainās izkārtojums un lietojamība, nevis identitāte.
- Pieejamais logotipa fails ir izgriezts no 55 px bitkartes; kvalitatīvs oriģināls (vēlams vektoru formātā) vēl jāsaņem no uzņēmuma.

## Evidence on Hand

- `content/`: 783 no esošās vietnes importētas lapas (īsts saturs).
- `site.json`: kontakti, tālruņi, adreses, izvēlne.
- Nav un nedrīkst izdomāt: klientu atsauksmes, statistiku, jaunus skaitļus par uzņēmumu, tarifu vērtības ārpus importētā satura.

## Product Principles

1. Iedzīvotāja ikdienas jautājums pirmajā vietā: rēķini, tarifs, darba laiks un biežākie jautājumi ir sasniedzami visīsākajā ceļā.
2. Avārijas kontakts vienmēr ir atrodams bez meklēšanas.
3. Nekas nepazūd: pārbūve pārkārto un atvieglo piekļuvi, bet neizmet saturu.
4. Oficiāls avots raksta tikai apstiprinātus faktus; neapstiprinātais tiek atzīmēts, nevis noklusēts.
5. Lapa ir lietojama ikvienam, arī ar palīgtehnoloģijām un mazā ekrānā.

## Accessibility & Inclusion

Lapai jāatbilst valsts un pašvaldību iestāžu tīmekļvietņu piekļūstamības prasībām — WCAG 2.1 AA (apstiprināts). Mērķis ir WCAG 2.2 AA, kā ieteikts 2026. gada novembra pētījuma ziņojumā par vietnes pārbūvi. Piekļūstamības paziņojums (MK noteikumi Nr. 445) ir sagatavots kā melnraksts un tiks publicēts, kad uzņēmums to papildinās.
