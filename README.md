# Debets & Kredīts

Interaktīva mājas lapa grāmatvedības pamatprincipu apguvei latviešu valodā. Mācīšanās pieeja ir līdzīga Brilliant: īsas nodarbības, kurās katrs solis ir viens neliels uzdevums. Atbildi uzreiz pārbauda un paskaidro, kāpēc tā ir pareiza vai nepareiza.

## Saturs

12 nodarbības piecās nodaļās:

| Nodaļa | Nodarbības |
| --- | --- |
| 1. Grāmatvedības valoda | Kas ir grāmatvedība? · Aktīvi, saistības un pašu kapitāls · Grāmatvedības vienādojums |
| 2. Darījumi un bilance | Kā darījumi maina bilanci · Bilances uzbūve |
| 3. Divkāršais ieraksts | T-konts · Debeta un kredīta likumi · Kontējumi |
| 4. Peļņa un principi | Ieņēmumi, izdevumi un peļņa · Uzkrāšanas princips · Grāmatvedības principi |
| 5. Prakse | Kafejnīcas pirmais mēnesis (simulācija ar virsgrāmatu un bilanci) |

Uzdevumu veidi: atbilžu izvēle, vairākas pareizās atbildes, aprēķini, posteņu šķirošana grupās, bilances svari ar slīdni, darījuma ietekme uz bilances posteņiem, ātrā kārta un kontējumi ar T-kontiem.

Papildus ir **trenažieris** (nejauši izvēlēti uzdevumi no pabeigtajām nodarbībām) un **vārdnīca** ar meklēšanu. XP, dienu sērija un pabeigtās nodarbības glabājas pārlūka `localStorage`.

## Kā palaist

Būvēšanas solis nav vajadzīgs. Atver `index.html` pārlūkā vai palaid vienkāršu serveri:

```sh
python3 -m http.server 8000
# tad atver http://localhost:8000
```

Lapu var publicēt arī ar GitHub Pages (Settings → Pages → izvēlies zaru un saknes mapi).

## Struktūra

```
index.html        lapas karkass
css/styles.css    stili (gaišais un tumšais režīms)
js/visuals.js     vizuālie palīgi: T-konti, bilance, svari, virsgrāmata
js/content.js     viss mācību saturs: nodarbības, konti, vārdnīca
js/app.js         lietotnes dzinējs: skati, nodarbību atskaņotājs, uzdevumu komponentes
```

## Kā pievienot nodarbību

Nodarbības ir datu objekti failā `js/content.js`. Piemēram, jautājums ar vienu pareizo atbildi:

```js
{
  type: 'choice',
  prompt: 'Kurā konta pusē parasti ir aktīva konta atlikums?',
  options: [
    { t: 'Debetā', ok: true },
    { t: 'Kredītā', why: 'Kredītā parasti ir pasīva kontu atlikumi.' },
  ],
  explain: 'Aktīvi ir vienādojuma kreisajā pusē, tāpēc to atlikumi ir debetā.',
}
```

Jaunās nodarbības `id` pievieno atbilstošās nodaļas `lessons` sarakstam masīvā `units`. Visi soļu veidi ir aprakstīti komentārā faila sākumā.

Piemēri ir vienkāršoti mācību nolūkiem (piemēram, simulācijā nav nodokļu). Latvijā grāmatvedību regulē Grāmatvedības likums un Gada pārskatu un konsolidēto gada pārskatu likums.
