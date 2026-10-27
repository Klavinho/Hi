/* Debets & Kredīts — kursa saturs.
 *
 * Katra nodarbība ir soļu virkne. Jautājumos automātiski var pārlasīt pēdējo skaidrojumu
 * pirms tiem; ar `context: 'open'` tas ir atvērts jau sākumā (ja jautājums tieši uz to atsaucas).
 * Soļu veidi:
 *   info    — skaidrojums (title, body, visual, after)
 *   choice  — viena pareizā atbilde (options: [{t, ok, why}])
 *   multi   — vairākas pareizās atbildes
 *   number  — skaitliska atbilde (answer, tol, wrong: [{v, msg}])
 *   sort    — posteņu šķirošana grupās (buckets, items: [{t, b, v}])
 *   scale   — svari: līdzsvaro pašu kapitālu ar slīdni
 *   effect  — darījuma ietekme uz bilances posteņiem (+ / 0 / −)
 *   quick   — ātrā kārta: virkne īsu jautājumu
 *   entry   — kontējums: izvēlies debeta un kredīta kontu (d, k, amount)
 *             vai salikts ieraksts ar vairākām rindām (lines: [{s: 'd'|'k', a: konts, v: summa}])
 */
(function () {
  'use strict';
  const V = window.V;

  const accounts = {
    kase:   { name: 'Kase', type: 'A', grp: 'AL' },
    banka:  { name: 'Nauda bankā', type: 'A', grp: 'AL' },
    pamatl: { name: 'Pamatlīdzekļi', type: 'A', grp: 'IL' },
    kraj:   { name: 'Krājumi', type: 'A', grp: 'AL' },
    deb:    { name: 'Pircēju parādi', type: 'A', grp: 'AL' },
    pk:     { name: 'Pamatkapitāls', type: 'PK' },
    aizn:   { name: 'Aizņēmumi no bankas', type: 'S' },
    piegad: { name: 'Parādi piegādātājiem', type: 'S' },
    ienp:   { name: 'Ieņēmumi no pakalpojumiem', type: 'I' },
    ien:    { name: 'Ieņēmumi no pārdošanas', type: 'I' },
    mat:    { name: 'Izejvielu izmaksas', type: 'E' },
    alga:   { name: 'Algu izmaksas', type: 'E' },
    pvnA:   { name: 'Aprēķinātais PVN', type: 'S' },
    priek:  { name: 'Priekšnodoklis', type: 'A', grp: 'AL' },
  };

  const units = [
    { id: 'u1', title: 'Grāmatvedības valoda', blurb: 'Ko grāmatvedība skaita un kāpēc bilance vienmēr sakrīt.', lessons: ['l1', 'l2', 'l3'] },
    { id: 'u2', title: 'Darījumi un bilance', blurb: 'Kā katrs pirkums un maksājums pārvieto skaitļus.', lessons: ['l4', 'l5'] },
    { id: 'u3', title: 'Divkāršais ieraksts', blurb: 'Debets, kredīts un T-konti: grāmatveža galvenais instruments.', lessons: ['l6', 'l7', 'l8'] },
    { id: 'u4', title: 'Peļņa un principi', blurb: 'Kad nauda kļūst par ieņēmumiem un kāpēc grāmatvedis ir piesardzīgs.', lessons: ['l9', 'l10', 'l11'] },
    { id: 'u5', title: 'Pievienotās vērtības nodoklis', blurb: 'Nodoklis, kas ir katrā čekā: kā to aprēķināt, iegrāmatot un kam to maksāt.', lessons: ['pvn1', 'pvn2'] },
    { id: 'u6', title: 'Naudas plūsma', blurb: 'Kāpēc peļņa vēl nav nauda un kā izsekot katram eiro.', lessons: ['nauda1', 'nauda2'] },
    { id: 'u7', title: 'Prakse', blurb: 'Viena mēneša grāmatvedība kafejnīcai no pirmā ieraksta līdz visiem trim pārskatiem.', lessons: ['l12'] },
  ];

  // Kafejnīcas aprīlis: turpina simulācijas martu (naudas atlikums 9 300 €, piegādātājam parādā 500 €).
  const APRIL_BANK = [
    ['03.04.', 'SIA «Grauzdētava», rēķins Nr. 118 (marta parāds)', -500],
    ['05.04.', 'Kafijas dzirnaviņas, jauna iekārta', -1200],
    ['10.04.', 'Aizņēmuma atmaksa bankai', -400],
    ['15.04.', 'Karšu maksājumi 1.–15.04.', 2400],
    ['20.04.', 'SIA «Grauzdētava», rēķins Nr. 131', -1300],
    ['30.04.', 'Telpu noma, aprīlis', -800],
    ['30.04.', 'Alga baristam', -1500],
    ['30.04.', 'Karšu maksājumi 16.–30.04.', 2800],
  ];
  const APRIL_CF = [
    { t: 'Pamatdarbība', total: 'Pamatdarbības naudas plūsma', rows: [['Klientu maksājumi', 5200], ['Samaksāts piegādātājiem', -1800], ['Telpu noma', -800], ['Algas', -1500]] },
    { t: 'Ieguldīšanas darbība', total: 'Ieguldīšanas darbības naudas plūsma', rows: [['Kafijas dzirnaviņas', -1200]] },
    { t: 'Finansēšanas darbība', total: 'Finansēšanas darbības naudas plūsma', rows: [['Aizņēmuma atmaksa', -400]] },
  ];
  const PVN_ACCTS = ['banka', 'deb', 'pamatl', 'kraj', 'priek', 'ienp', 'pvnA', 'piegad'];

  const lessons = {};

  /* =====================================================================
   * 1. nodaļa — Grāmatvedības valoda
   * ===================================================================== */

  lessons.l1 = {
    title: 'Kas ir grāmatvedība?',
    desc: 'Saimnieciskie darījumi, dokumenti un tie, kam vajag skaitļus.',
    takeaways: [
      'Grāmatvedība uzskaita **saimnieciskos darījumus**: notikumus, kurus var izteikt naudā.',
      'Katram ierakstam vajag **attaisnojuma dokumentu**.',
      '**Bilance** rāda stāvokli vienā datumā, **peļņas vai zaudējumu aprēķins** — rezultātu periodā.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Iepazīsties ar Līgu',
        body: 'Līga atver kafejnīcu «Pupa». Lai to vadītu, viņai regulāri jāatbild uz trim jautājumiem.',
        visual: V.cards([
          { k: '1', t: 'Kas kafejnīcai pieder?', d: 'Nauda, kafijas automāts, pupiņas noliktavā.', tone: 'a' },
          { k: '2', t: 'Ko kafejnīca ir parādā?', d: 'Bankai, piegādātājiem, darbiniekiem.', tone: 's' },
          { k: '3', t: 'Vai kafejnīca pelna?', d: 'Vai ieņēmumi pārsniedz izdevumus?', tone: 'pk' },
        ]),
        after: 'Grāmatvedība ir sistēma, kas uz šiem jautājumiem atbild ar skaitļiem: precīzi, pārbaudāmi un vienmēr pēc vieniem noteikumiem.',
      },
      {
        type: 'choice',
        prompt: 'Grāmatvedība uzskaita **saimnieciskos darījumus**: notikumus, kas maina uzņēmuma mantu, parādus vai kapitālu un ko var izteikt naudā. Kurš no šiem ir saimnieciskais darījums?',
        options: [
          { t: 'Līga izdomā kafejnīcas nosaukumu', why: 'Ideja ir svarīga, bet tā nemaina ne naudu, ne mantu, ne parādus.' },
          { t: 'Līga nopērk kafijas automātu par 6 000 €', ok: true },
          { t: 'Draudzene iesaka cept kanēļmaizītes', why: 'Padoms nemaina uzņēmuma mantu, un to nevar izteikt naudā.' },
          { t: 'Līga izveido kafejnīcai bezmaksas Instagram kontu', why: 'Bezmaksas konta izveide neko nemaina uzņēmuma finansēs.' },
        ],
        explain: 'Automāta pirkums maina uzņēmuma mantu: naudas kļūst mazāk, aprīkojuma vairāk. To var izteikt naudā: 6 000 €.',
      },
      {
        type: 'info',
        title: 'Ceļš no čeka līdz pārskatam',
        body: 'Katrs darījums iziet vienu un to pašu ceļu.',
        visual: V.flow([
          { t: 'Dokuments', d: 'Rēķins, čeks vai līgums apliecina, ka darījums notika.' },
          { t: 'Grāmatojums', d: 'Darījumu ieraksta attiecīgajos kontos.' },
          { t: 'Konti', d: 'Kontos uzkrājas visi viena veida darījumi.' },
          { t: 'Pārskati', d: 'No kontu atlikumiem sastāda bilanci un peļņas vai zaudējumu aprēķinu.' },
        ]),
      },
      {
        type: 'multi',
        prompt: 'Kam būs vajadzīga kafejnīcas grāmatvedības informācija? Atzīmē visus pareizos.',
        options: [
          { t: 'Līgai, lai lemtu par cenām', ok: true },
          { t: 'Bankai, pirms tā izsniedz aizņēmumu', ok: true },
          { t: 'Valsts ieņēmumu dienestam, lai pārbaudītu nodokļus', ok: true },
          { t: 'Garāmgājējam, kurš izvēlas, kur iedzert kafiju', why: 'Garāmgājējam svarīgāka ir kafijas garša, nevis bilance.' },
        ],
        explain: 'Grāmatvedības informāciju izmanto gan iekšējie lietotāji (īpašnieks, vadītāji), gan ārējie (banka, VID, investori, piegādātāji).',
      },
      {
        type: 'choice',
        prompt: 'Katram ierakstam grāmatvedībā jābūt pamatotam. Kā sauc dokumentu, kas apliecina, ka darījums ir noticis, piemēram, rēķinu vai čeku?',
        options: [
          { t: 'Gada pārskats', why: 'Gada pārskats apkopo visu gada darbību. To nesastāda katram darījumam.' },
          { t: 'Kontu plāns', why: 'Kontu plāns ir uzņēmuma kontu saraksts, nevis darījuma apliecinājums.' },
          { t: 'Attaisnojuma dokuments', ok: true },
          { t: 'Bilance', why: 'Bilance rāda kopējo stāvokli, nevis atsevišķu darījumu.' },
        ],
        explain: 'Bez attaisnojuma dokumenta nav grāmatojuma. Tā jebkurš pārbaudītājs var izsekot katram skaitlim līdz tā avotam.',
      },
      {
        type: 'choice',
        prompt: 'Līga grib zināt: «Cik naudas, aprīkojuma un parādu kafejnīcai ir 31. decembrī?» Kurš pārskats atbild uz šo jautājumu?',
        options: [
          { t: 'Bilance', ok: true },
          { t: 'Peļņas vai zaudējumu aprēķins', why: 'Tas rāda, cik nopelnīts periodā, piemēram, gadā. Uz jautājumu «kas pieder konkrētā dienā» tas neatbild.' },
        ],
        explain: 'Bilance ir momentuzņēmums: stāvoklis vienā datumā. Peļņas vai zaudējumu aprēķins stāsta, kas notika periodā.',
      },
    ],
  };

  lessons.l2 = {
    title: 'Aktīvi, saistības un pašu kapitāls',
    desc: 'Trīs vārdi, ar kuriem var aprakstīt jebkuru uzņēmumu.',
    takeaways: [
      '**Aktīvi** ir resursi, ko uzņēmums kontrolē un kas nesīs labumu nākotnē.',
      '**Saistības** ir uzņēmuma parādi citiem.',
      '**Pašu kapitāls** ir īpašnieka daļa: ieguldījumi plus nopelnītā peļņa.',
      'Uzņēmums un tā īpašnieks grāmatvedībā ir nošķirti.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Aktīvi strādā uzņēmuma labā',
        body: '**Aktīvi** ir resursi, ko uzņēmums kontrolē un no kuriem sagaida labumu nākotnē. Līgas kafejnīcā tie ir, piemēram:',
        visual: V.chips(['Nauda bankā', 'Kafijas automāts', 'Galdi un krēsli', 'Kafijas pupiņas noliktavā'], 'a'),
      },
      {
        type: 'choice',
        prompt: 'Kāds uzņēmums pasūtīja ēdināšanu par 120 € un samaksās nākamnedēļ. Vai šis parāds ir kafejnīcas aktīvs?',
        options: [
          { t: 'Nē, nauda vēl nav saņemta', why: 'Arī tiesības saņemt naudu ir resurss. Klientu parādus sauc par debitoriem, un tie ir aktīvi.' },
          { t: 'Jā, tās ir tiesības saņemt naudu', ok: true },
        ],
        explain: 'Klientu parādi jeb **debitori** ir aktīvi: kafejnīca sagaida, ka tie pārvērtīsies naudā.',
      },
      {
        type: 'info',
        title: 'Kas finansē aktīvus?',
        body: 'Katrs eiro, kas ieguldīts aktīvos, ir no kaut kurienes nācis. Avoti ir tikai divi.',
        visual: V.cards([
          { t: 'Saistības', d: 'Nauda, kas jāatdod: bankas aizņēmums, neapmaksāti piegādātāju rēķini, neizmaksātas algas, nodokļi.', tone: 's' },
          { t: 'Pašu kapitāls', d: 'Īpašnieka daļa: paša ieguldītā nauda un uzņēmuma nopelnītā, bet neizmaksātā peļņa.', tone: 'pk' },
        ]),
      },
      {
        type: 'choice',
        prompt: 'Līga no saviem uzkrājumiem iegulda kafejnīcas pamatkapitālā 8 000 €. Kā kafejnīcas bilancē parādās šis finansējuma avots?',
        options: [
          { t: 'Kā saistības pret Līgu', why: 'Īpašnieka ieguldījums pamatkapitālā nav aizņēmums: to nav jāatdod noteiktā termiņā.' },
          { t: 'Kā ieņēmumi', why: 'Ieņēmumus uzņēmums nopelna, pārdodot preces vai pakalpojumus. Īpašnieka ieguldījums nav nopelnīts.' },
          { t: 'Kā pašu kapitāls', ok: true },
        ],
        explain: 'Nauda bankā (aktīvs) palielinās par 8 000 €, un tieši par tikpat palielinās pašu kapitāls.',
      },
      {
        type: 'sort',
        prompt: 'Sašķiro kafejnīcas bilances posteņus.',
        buckets: [
          { id: 'A', label: 'Aktīvi', tone: 'a' },
          { id: 'S', label: 'Saistības', tone: 's' },
          { id: 'PK', label: 'Pašu kapitāls', tone: 'pk' },
        ],
        items: [
          { t: 'Nauda bankā', b: 'A' },
          { t: 'Bankas aizņēmums', b: 'S' },
          { t: 'Līgas ieguldītais pamatkapitāls', b: 'PK' },
          { t: 'Kafijas automāts', b: 'A' },
          { t: 'Neapmaksāts piena piegādātāja rēķins', b: 'S' },
          { t: 'Kafijas pupiņas noliktavā', b: 'A' },
          { t: 'Iepriekšējo gadu nesadalītā peļņa', b: 'PK' },
          { t: 'Neizmaksātā decembra alga', b: 'S' },
          { t: 'Klienta neapmaksātais rēķins', b: 'A' },
        ],
        hint: 'Jautā sev: vai tas kafejnīcai **ir**, vai kafejnīca to **ir parādā**, vai tas pienākas **īpašniekam**?',
        explain: 'Aktīvi ir tas, kas uzņēmumam ir. Saistības — tas, ko tas ir parādā citiem. Pašu kapitāls — īpašnieka ieguldījums un uzkrātā peļņa.',
      },
      {
        type: 'choice',
        prompt: 'Līga ar savu personīgo automašīnu brauc iepirkties kafejnīcai. Vai automašīna ir kafejnīcas aktīvs?',
        options: [
          { t: 'Jā, jo to izmanto kafejnīcas vajadzībām', why: 'Automašīna pieder Līgai personīgi. Uzņēmuma bilancē iekļauj tikai uzņēmuma resursus.' },
          { t: 'Nē, jo tā pieder Līgai, nevis uzņēmumam', ok: true },
        ],
        explain: 'Uzņēmums un tā īpašnieks grāmatvedībā ir atsevišķi. Kafejnīcas bilancē ir tikai kafejnīcas manta un parādi.',
      },
    ],
  };

  lessons.l3 = {
    title: 'Grāmatvedības vienādojums',
    desc: 'Kāpēc bilance vienmēr ir līdzsvarā.',
    takeaways: [
      '**Aktīvi = Saistības + Pašu kapitāls.**',
      'Pašu kapitāls = Aktīvi − Saistības.',
      'Ja saistības pārsniedz aktīvus, pašu kapitāls ir negatīvs.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Viena summa, divi skatpunkti',
        body: 'Aktīvi parāda, **kur** nauda ir ieguldīta. Saistības un pašu kapitāls parāda, **no kurienes** tā nāk. Tā ir viena un tā pati summa, tikai aprakstīta divreiz. Tāpēc svari vienmēr ir līdzsvarā.',
        visual: () => V.scale({ A: 14000, S: 5000, PK: 9000 }, { max: 16000 }).el,
        after: '==Aktīvi = Saistības + Pašu kapitāls==. Šis ir grāmatvedības pamatvienādojums.',
      },
      {
        type: 'scale',
        prompt: 'Kafejnīcas aktīvi ir 14 000 €, bankas aizņēmums ir 5 000 €. Iestati pašu kapitālu tā, lai svari būtu līdzsvarā.',
        A: 14000, S: 5000, start: 2000, min: 0, rangeMax: 15000, step: 500, max: 16000, answer: 9000,
        explain: '14 000 = 5 000 + 9 000. Pašu kapitāls ir tas, kas paliktu pāri no aktīviem pēc visu parādu nomaksas.',
      },
      {
        type: 'number',
        prompt: 'Cik liels ir pašu kapitāls?',
        visual: V.eq(22000, 7500, '?'),
        answer: 14500,
        hint: 'Pārveido vienādojumu: Pašu kapitāls = Aktīvi − Saistības.',
        wrong: [{ v: 29500, msg: 'Saistības no aktīviem jāatņem: Pašu kapitāls = Aktīvi − Saistības.' }],
        explain: 'Pašu kapitāls = 22 000 − 7 500 = 14 500 €.',
      },
      {
        type: 'number',
        prompt: 'Cik lielas ir kafejnīcas saistības?',
        visual: V.bilance({
          a: [{ l: 'Aprīkojums', v: 9000 }, { l: 'Krājumi', v: 1000 }, { l: 'Nauda', v: 3000 }],
          p: [{ l: 'Pašu kapitāls', v: 8000 }, { l: 'Saistības', v: '?' }],
          totals: false,
        }),
        answer: 5000,
        hint: 'Vispirms saskaiti visus aktīvus. Pasīva kopsummai jābūt tieši tikpat lielai.',
        wrong: [{ v: 21000, msg: 'Pašu kapitāls ir jāatņem no aktīviem: 13 000 − 8 000.' }],
        explain: 'Aktīvi kopā: 9 000 + 1 000 + 3 000 = 13 000 €. Saistības = 13 000 − 8 000 = 5 000 €.',
      },
      {
        type: 'choice',
        prompt: 'Uzņēmumam ir aktīvi 10 000 € un saistības 12 000 €. Ko var teikt par tā pašu kapitālu?',
        options: [
          { t: 'Tas ir 22 000 €', why: 'Saistības aktīviem nepieskaita, tās atņem: 10 000 − 12 000.' },
          { t: 'Tas ir negatīvs: −2 000 €', ok: true },
          { t: 'Tāds uzņēmums nevar pastāvēt', why: 'Var gan, taču negatīvs pašu kapitāls ir brīdinājuma signāls: uzņēmums ir parādā vairāk, nekā tam pieder.' },
        ],
        explain: '10 000 − 12 000 = −2 000 €. Pat pārdodot visus aktīvus, uzņēmums nevarētu atdot visus parādus.',
      },
      {
        type: 'info',
        title: 'Tā izskatās bilance',
        body: 'Latvijā bilanci sastāda divās daļās. Kreisajā pusē ir **Aktīvs**, labajā — **Pasīvs**: pašu kapitāls, uzkrājumi un kreditori jeb saistības. Kopsummas vienmēr sakrīt. Grāmatveži zem kopsummas velk dubultsvītru.',
        visual: V.bilance({
          date: '31.03.',
          a: [{ l: 'Aprīkojums', v: 9000 }, { l: 'Krājumi', v: 1000 }, { l: 'Nauda', v: 3000 }],
          p: [{ l: 'Pašu kapitāls', v: 8000 }, { l: 'Kreditori', v: 5000 }],
          check: true,
        }),
      },
    ],
  };

  /* =====================================================================
   * 2. nodaļa — Darījumi un bilance
   * ===================================================================== */

  lessons.l4 = {
    title: 'Kā darījumi maina bilanci',
    desc: 'Četri darījumu veidi un vienādojums, kas nekad nesalūzt.',
    takeaways: [
      'Katrs darījums maina **vismaz divus** bilances posteņus.',
      'Veidi ir četri: aktīvi ↑ pasīvi ↑, aktīvi ↓ pasīvi ↓, aktīvu maiņa, pasīvu maiņa.',
      'Pēc jebkura darījuma aktīvi joprojām ir vienādi ar saistībām plus pašu kapitālu.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Četri veidi, kā mainīties',
        body: 'Katrs darījums skar vismaz divus posteņus. Vienādojums paliek līdzsvarā, jo izmaiņas notiek vienā no četriem veidiem:',
        visual: V.cards([
          { t: 'Aktīvi ↑ Pasīvi ↑', d: 'Saņemts aizņēmums: nauda ↑, saistības ↑.', tone: 'a' },
          { t: 'Aktīvi ↓ Pasīvi ↓', d: 'Atmaksāts aizņēmums: nauda ↓, saistības ↓.', tone: 's' },
          { t: 'Aktīvs ↑ Aktīvs ↓', d: 'Nopirkts aprīkojums: aprīkojums ↑, nauda ↓.', tone: 'a' },
          { t: 'Pasīvs ↑ Pasīvs ↓', d: 'Parāds piegādātājam pārvērsts ilgtermiņa aizdevumā.', tone: 's' },
        ]),
      },
      {
        type: 'effect',
        prompt: 'Kafejnīca saņem bankas aizņēmumu 5 000 €. Norādi, kuri posteņi palielinās (+), samazinās (−) vai nemainās (0).',
        amount: 5000,
        rows: [
          { name: 'Nauda bankā', side: 'A', v: 8000, ans: 1 },
          { name: 'Aprīkojums', side: 'A', v: 0 },
          { name: 'Bankas aizņēmums', side: 'S', v: 0, ans: 1 },
          { name: 'Pamatkapitāls', side: 'PK', v: 8000 },
        ],
        explain: 'Nauda bankā ↑ 5 000 € un aizņēmums ↑ 5 000 €. Abas puses pieaug vienādi: 13 000 = 5 000 + 8 000.',
      },
      {
        type: 'effect',
        prompt: 'Kafejnīca nopērk kafijas automātu par 6 000 € un samaksā no bankas konta.',
        amount: 6000,
        rows: [
          { name: 'Nauda bankā', side: 'A', v: 13000, ans: -1 },
          { name: 'Aprīkojums', side: 'A', v: 0, ans: 1 },
          { name: 'Bankas aizņēmums', side: 'S', v: 5000 },
          { name: 'Pamatkapitāls', side: 'PK', v: 8000 },
        ],
        explain: 'Viens aktīvs pārvēršas citā. Aktīvu kopsumma nemainās: joprojām 13 000 €.',
      },
      {
        type: 'effect',
        prompt: 'Kafejnīca atmaksā bankai 1 000 € no aizņēmuma.',
        amount: 1000,
        rows: [
          { name: 'Nauda bankā', side: 'A', v: 7000, ans: -1 },
          { name: 'Aprīkojums', side: 'A', v: 6000 },
          { name: 'Bankas aizņēmums', side: 'S', v: 5000, ans: -1 },
          { name: 'Pamatkapitāls', side: 'PK', v: 8000 },
        ],
        explain: 'Samazinās gan aktīvi, gan saistības: 12 000 = 4 000 + 8 000.',
      },
      {
        type: 'choice',
        context: 'open',
        prompt: 'Kafejnīca vienojas ar piegādātāju: 2 000 € parādu par precēm tā atmaksās divu gadu laikā kā aizdevumu. Kurš no četriem veidiem tas ir?',
        options: [
          { t: 'Aktīvi ↑ Pasīvi ↑', why: 'Neviens jauns aktīvs nerodas: nauda nekustas.' },
          { t: 'Aktīvi ↓ Pasīvi ↓', why: 'Parāds nav atmaksāts, tas tikai mainījis formu.' },
          { t: 'Aktīvs ↑ Aktīvs ↓', why: 'Aktīvi paliek tādi paši kā iepriekš.' },
          { t: 'Pasīvs ↑ Pasīvs ↓', ok: true },
        ],
        explain: 'Parāds piegādātājam ↓ 2 000 €, ilgtermiņa aizdevums ↑ 2 000 €. Mainās tikai pasīva struktūra.',
      },
      {
        type: 'choice',
        prompt: 'Kafejnīca nopērk krājumus par 500 € ar pēcapmaksu. Kas notiek ar bilances kopsummu?',
        options: [
          { t: 'Palielinās par 500 €', ok: true },
          { t: 'Nemainās', why: 'Nauda nav samaksāta, tātad aktīvi nav apmainīti. Krājumi ↑ un parāds piegādātājam ↑.' },
          { t: 'Samazinās par 500 €', why: 'Nekas nesamazinās: rodas gan jauns aktīvs, gan jaunas saistības.' },
        ],
        explain: 'Krājumi ↑ 500 € (aktīvs) un parādi piegādātājiem ↑ 500 € (saistības). Abas puses pieaug vienādi.',
      },
    ],
  };

  lessons.l5 = {
    title: 'Bilances uzbūve',
    desc: 'Ilgtermiņa un apgrozāmie līdzekļi, pasīva sadaļas.',
    takeaways: [
      'Aktīvu iedala **ilgtermiņa ieguldījumos** un **apgrozāmajos līdzekļos**.',
      'Pasīvu veido **pašu kapitāls**, **uzkrājumi** un **kreditori**.',
      'Izšķirošais kritērijs ir lietošanas ilgums: vairāk vai mazāk par gadu.',
      'Bilance ir momentuzņēmums: stāvoklis vienā datumā.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Bilances sadaļas',
        body: 'Bilancē posteņus grupē pēc to rakstura. Ilgtermiņa ieguldījumus izmanto ilgāk par gadu, apgrozāmie līdzekļi apgrozās gada laikā.',
        visual: V.bilance({
          a: [
            { h: 'Ilgtermiņa ieguldījumi' }, { l: 'Pamatlīdzekļi' }, { l: 'Nemateriālie ieguldījumi' },
            { h: 'Apgrozāmie līdzekļi' }, { l: 'Krājumi' }, { l: 'Debitori' }, { l: 'Nauda' },
          ],
          p: [
            { h: 'Pašu kapitāls' }, { l: 'Pamatkapitāls' }, { l: 'Nesadalītā peļņa' },
            { h: 'Uzkrājumi' }, { l: 'Paredzamās saistības' },
            { h: 'Kreditori' }, { l: 'Ilgtermiņa parādi' }, { l: 'Īstermiņa parādi' },
          ],
          totals: false,
        }),
        after: 'Tipiskā Latvijas kontu plānā konti numurēti tieši šādā secībā: **1.** klase — ilgtermiņa ieguldījumi, **2.** — apgrozāmie līdzekļi, **3.** — pašu kapitāls, **4.** — uzkrājumi, **5.** — kreditori.',
      },
      {
        type: 'sort',
        prompt: 'Ilgtermiņa ieguldījums vai apgrozāmais līdzeklis?',
        buckets: [
          { id: 'IL', label: 'Ilgtermiņa ieguldījumi', tone: 'a' },
          { id: 'AL', label: 'Apgrozāmie līdzekļi', tone: 'a' },
        ],
        items: [
          { t: 'Kafijas automāts', b: 'IL' },
          { t: 'Kafijas pupiņas', b: 'AL' },
          { t: 'Kafejnīcas mēbeles', b: 'IL' },
          { t: 'Nauda kasē', b: 'AL' },
          { t: 'Kases programmas licence uz 5 gadiem', b: 'IL' },
          { t: 'Klienta neapmaksātais rēķins', b: 'AL' },
          { t: 'Vienreizlietojamās krūzītes', b: 'AL' },
        ],
        hint: 'Vai to izmantos ilgāk par gadu?',
        explain: 'Automāts, mēbeles un licence kalpos vairākus gadus. Pupiņas, krūzītes, klientu parādi un nauda apgrozās īsā laikā.',
      },
      {
        type: 'choice',
        prompt: 'Kas ir galvenais kritērijs, lai aktīvu uzskaitītu kā ilgtermiņa ieguldījumu?',
        options: [
          { t: 'Tas maksā vairāk nekā 1 000 €', why: 'Uzņēmumi mēdz noteikt vērtības slieksni, taču izšķirošais ir lietošanas ilgums. Dārga pupiņu partija tik un tā ir krājumi.' },
          { t: 'To izmantos ilgāk par vienu gadu', ok: true },
          { t: 'Tas ir fiziski liels', why: 'Arī programmatūras licence var būt ilgtermiņa ieguldījums: nemateriāla, bet ilgi lietojama.' },
        ],
        explain: 'Ilgtermiņa ieguldījumi kalpo ilgāk par gadu. Tāpēc to izmaksas sadala pa lietošanas laiku (par to vairāk 4. nodaļā).',
      },
      {
        type: 'sort',
        prompt: 'Saliec bilanci: sašķiro posteņus Aktīvā un Pasīvā. Kopsummām jāsakrīt.',
        totals: true,
        buckets: [
          { id: 'A', label: 'Aktīvs', tone: 'a' },
          { id: 'P', label: 'Pasīvs', tone: 's' },
        ],
        items: [
          { t: 'Pamatkapitāls', v: 8000, b: 'P' },
          { t: 'Pamatlīdzekļi', v: 6000, b: 'A' },
          { t: 'Bankas aizņēmums', v: 3000, b: 'P' },
          { t: 'Krājumi', v: 1200, b: 'A' },
          { t: 'Parādi piegādātājiem', v: 1000, b: 'P' },
          { t: 'Nauda', v: 4800, b: 'A' },
        ],
        hint: 'Aktīvā ir tas, kas uzņēmumam ir. Pasīvā ir tas, no kurienes tas nāk.',
        explain: 'Aktīvs: 6 000 + 1 200 + 4 800 = 12 000 €. Pasīvs: 8 000 + 3 000 + 1 000 = 12 000 €. Bilance sakrīt.',
      },
      {
        type: 'number',
        prompt: 'Cik lieli šajā bilancē ir apgrozāmie līdzekļi kopā?',
        visual: V.bilance({
          a: [{ h: 'Ilgtermiņa ieguldījumi' }, { l: 'Pamatlīdzekļi', v: 6000 }, { h: 'Apgrozāmie līdzekļi' }, { l: 'Krājumi', v: 1200 }, { l: 'Nauda', v: 4800 }],
          p: [{ h: 'Pašu kapitāls' }, { l: 'Pamatkapitāls', v: 8000 }, { h: 'Kreditori' }, { l: 'Bankas aizņēmums', v: 3000 }, { l: 'Parādi piegādātājiem', v: 1000 }],
        }),
        answer: 6000,
        hint: 'Apgrozāmie līdzekļi šeit ir krājumi un nauda.',
        wrong: [{ v: 12000, msg: 'Tā ir visa aktīva kopsumma. Pamatlīdzekļi ir ilgtermiņa ieguldījumi, tos neskaita.' }],
        explain: 'Krājumi 1 200 € + nauda 4 800 € = 6 000 €. Pamatlīdzekļi pieder ilgtermiņa ieguldījumiem.',
      },
      {
        type: 'choice',
        prompt: 'Kāpēc bilanci sauc par momentuzņēmumu?',
        options: [
          { t: 'To var sastādīt ļoti ātri', why: 'Bilances sastādīšana var prasīt daudz darba. Nosaukums ir par laiku, ko tā attēlo.' },
          { t: 'Tā rāda visa gada darbību', why: 'Gada darbību rāda peļņas vai zaudējumu aprēķins.' },
          { t: 'Tā rāda stāvokli vienā konkrētā datumā', ok: true },
        ],
        explain: 'Bilanci vienmēr sastāda uz datumu, piemēram, uz 31. decembri. Nākamajā dienā skaitļi jau var būt citi.',
      },
    ],
  };

  /* =====================================================================
   * 3. nodaļa — Divkāršais ieraksts
   * ===================================================================== */

  lessons.l6 = {
    title: 'T-konts',
    desc: 'Debets pa kreisi, kredīts pa labi.',
    takeaways: [
      'Katram bilances postenim ir savs **konts**. To zīmē kā burtu T.',
      '**Debets** ir kreisā puse, **kredīts** ir labā.',
      'Aktīva kontā: SA + D apgrozījums − K apgrozījums = BA.',
      'Pasīva kontā viss ir otrādi: atlikums un palielinājumi ir kredītā.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Konts izskatās pēc burta T',
        body: 'Lai izsekotu katram postenim, grāmatvedis tam atver **kontu**. To ērti attēlot kā burtu T: kreisā puse ir **debets (D)**, labā ir **kredīts (K)**.',
        visual: V.tpair(V.tacct('Nauda bankā', { tone: 'a' })),
        after: 'Debets un kredīts nenozīmē «labi» un «slikti». Tie ir tikai pušu nosaukumi, kas cēlušies no latīņu *debere* (būt parādā) un *credere* (uzticēt).',
      },
      {
        type: 'choice',
        prompt: 'Ko nozīmē «debetēt kontu»?',
        options: [
          { t: 'Samazināt konta atlikumu', why: 'Tas atkarīgs no konta veida. Debets ir puse, nevis virziens.' },
          { t: 'Ierakstīt summu konta kreisajā pusē', ok: true },
          { t: 'Ierakstīt summu konta labajā pusē', why: 'Labā puse ir kredīts.' },
        ],
        explain: 'Debetēt nozīmē rakstīt kreisajā pusē, kreditēt nozīmē rakstīt labajā.',
      },
      {
        type: 'info',
        title: 'Atlikums aktīva kontā',
        body: 'Aktīva kontā sākuma atlikums (SA) un palielinājumi ir debetā, samazinājumi ir kredītā. Beigu atlikumu (BA) aprēķina tā:',
        visual:
          V.formula('**SA** + debeta apgrozījums − kredīta apgrozījums = **BA**') +
          V.tpair(V.tacct('Kase', { open: { side: 'd', v: 500 }, d: [300, 200], k: [400], close: { side: 'd', v: 600 }, tone: 'a' })),
        after: '500 + (300 + 200) − 400 = 600 €. Apgrozījums ir visu vienas puses ierakstu summa periodā.',
      },
      {
        type: 'number',
        prompt: 'Aprēķini konta «Nauda bankā» beigu atlikumu.',
        visual: V.tpair(V.tacct('Nauda bankā', { open: { side: 'd', v: 2000 }, d: [1500, 700], k: [400, 1200], close: { side: 'd', v: '?' }, tone: 'a' })),
        answer: 2600,
        hint: 'Sākuma atlikums + visi debeta ieraksti − visi kredīta ieraksti.',
        wrong: [{ v: 5800, msg: 'Kredīta ieraksti aktīva kontā atlikumu samazina, tie jāatņem.' }],
        explain: '2 000 + (1 500 + 700) − (400 + 1 200) = 2 600 €.',
      },
      {
        type: 'number',
        prompt: 'Pasīva kontā viss ir spoguļattēlā: atlikums un palielinājumi ir kredītā. Aprēķini beigu atlikumu.',
        visual: V.tpair(V.tacct('Parādi piegādātājiem', { open: { side: 'k', v: 1000 }, d: [1200], k: [800], close: { side: 'k', v: '?' }, tone: 's' })),
        answer: 600,
        hint: 'Pasīva kontā: SA + kredīta apgrozījums − debeta apgrozījums.',
        wrong: [{ v: 1400, msg: 'Pasīva kontā palielinājumi ir kredītā, bet samazinājumi debetā. Tātad 800 pieskaita, 1 200 atņem.' }],
        explain: '1 000 + 800 − 1 200 = 600 €. Kafejnīca vēl ir parādā piegādātājiem 600 €.',
      },
      {
        type: 'choice',
        prompt: 'Kurā konta pusē parasti ir aktīva konta atlikums?',
        options: [
          { t: 'Debetā', ok: true },
          { t: 'Kredītā', why: 'Kredītā parasti ir pasīva kontu atlikumi.' },
          { t: 'Atkarīgs no mēneša', why: 'Atlikuma puse ir atkarīga no konta veida, nevis no laika.' },
        ],
        explain: 'Aktīvi ir vienādojuma kreisajā pusē, tāpēc to atlikumi ir kreisajā jeb debeta pusē.',
      },
    ],
  };

  lessons.l7 = {
    title: 'Debeta un kredīta likumi',
    desc: 'Kad rakstīt pa kreisi un kad pa labi.',
    takeaways: [
      'Aktīvi: palielinājums **debetā**, samazinājums **kredītā**.',
      'Saistības un pašu kapitāls: palielinājums **kredītā**, samazinājums **debetā**.',
      'Ieņēmumi ir kredītā, izdevumi ir debetā.',
      'Katrā darījumā debets = kredīts.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Likums izriet no vienādojuma',
        body: 'Aktīvi ir vienādojuma kreisajā pusē, tāpēc tie aug debetā. Saistības un pašu kapitāls ir labajā pusē, tāpēc tie aug kredītā.',
        visual: V.rules([
          ['Aktīvi', 'D', 'K', 'a'],
          ['Saistības', 'K', 'D', 's'],
          ['Pašu kapitāls', 'K', 'D', 'pk'],
        ]),
      },
      {
        type: 'quick',
        prompt: 'Debets vai kredīts? Atbildi, cik ātri vari.',
        options: ['Debets', 'Kredīts'],
        optTone: ['d', 'k'],
        items: [
          { t: 'Nauda bankā palielinās', a: 0, why: 'Aktīvs aug debetā.' },
          { t: 'Bankas aizņēmums palielinās', a: 1, why: 'Saistības aug kredītā.' },
          { t: 'Krājumi samazinās', a: 1, why: 'Aktīvs samazinās kredītā.' },
          { t: 'Parāds piegādātājam samazinās', a: 0, why: 'Saistības samazinās debetā.' },
          { t: 'Pamatkapitāls palielinās', a: 1, why: 'Pašu kapitāls aug kredītā.' },
          { t: 'Pamatlīdzekļi palielinās', a: 0, why: 'Aktīvs aug debetā.' },
        ],
      },
      {
        type: 'choice',
        prompt: 'Katrā grāmatojumā debeta summām jābūt … kredīta summām.',
        options: [
          { t: 'lielākām par', why: 'Tad bilance vairs nebūtu līdzsvarā.' },
          { t: 'vienādām ar', ok: true },
          { t: 'mazākām par', why: 'Tad bilance vairs nebūtu līdzsvarā.' },
        ],
        explain: 'Debets = kredīts. Tieši tāpēc bilance vienmēr sakrīt, un to var izmantot kļūdu meklēšanai.',
      },
      {
        type: 'info',
        title: 'Ieņēmumi un izdevumi',
        body: 'Ieņēmumi palielina pašu kapitālu, tāpēc tos grāmato **kredītā**. Izdevumi samazina pašu kapitālu, tāpēc tos grāmato **debetā**.',
        visual: V.rules([
          ['Ieņēmumi', 'K', 'D', 'pk'],
          ['Izdevumi', 'D', 'K', 'pk'],
        ]),
      },
      {
        type: 'quick',
        prompt: 'Vēl viena kārta, tagad ar ieņēmumiem un izdevumiem.',
        options: ['Debets', 'Kredīts'],
        optTone: ['d', 'k'],
        items: [
          { t: 'Ieņēmumi no kafijas pārdošanas', a: 1, why: 'Ieņēmumi palielina pašu kapitālu, tātad kredīts.' },
          { t: 'Darbinieku algu izmaksas', a: 0, why: 'Izdevumi ir debetā.' },
          { t: 'Klientu parādi palielinās', a: 0, why: 'Debitori ir aktīvs, un aktīvs aug debetā.' },
          { t: 'Elektrības izmaksas', a: 0, why: 'Izdevumi ir debetā.' },
          { t: 'Parāds VID par nodokļiem palielinās', a: 1, why: 'Parāds valstij ir saistības, tās aug kredītā.' },
          { t: 'Ieņēmumi no ēdināšanas pakalpojuma', a: 1, why: 'Ieņēmumi ir kredītā.' },
        ],
      },
      {
        type: 'choice',
        prompt: 'Kurš apgalvojums vislabāk apraksta divkāršo ierakstu?',
        options: [
          { t: 'Katru darījumu ieraksta divreiz vienā un tajā pašā kontā', why: 'Tad konta atlikums būtu divreiz lielāks, un nekas netiktu pārbaudīts.' },
          { t: 'Katru darījumu ieraksta divās programmās drošības pēc', why: 'Divkāršais ieraksts ir metode, nevis rezerves kopija.' },
          { t: 'Katru darījumu ieraksta vismaz divos kontos: debetā un kredītā ar vienādām summām', ok: true },
        ],
        explain: 'Šo metodi 1494. gadā aprakstīja itāļu matemātiķis Luka Pačoli. Tā joprojām ir katras grāmatvedības pamatā.',
      },
    ],
  };

  lessons.l8 = {
    title: 'Kontējumi',
    desc: 'No darījuma apraksta līdz grāmatojumam.',
    takeaways: [
      'Kontējums nosaka **debetējamo kontu**, **kreditējamo kontu** un **summu**.',
      'Secība: kuri konti mainās → kāda veida tie ir → palielinās vai samazinās → likums.',
      'Kontējumu var nolasīt arī otrādi, kā darījuma aprakstu.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Četri jautājumi katram darījumam',
        body: '**Kontējums** jeb grāmatojums norāda, kuru kontu debetēt, kuru kreditēt un par kādu summu. To pieraksta tā: **D Nauda bankā / K Aizņēmumi no bankas 5 000 €**. Lai to atrastu, uzdod četrus jautājumus:',
        visual: V.flow([
          { t: 'Kuri konti mainās?', d: 'Parasti divi: piemēram, nauda un aizņēmums.' },
          { t: 'Kāda veida tie ir?', d: 'Aktīvs, saistības, pašu kapitāls, ieņēmumi vai izdevumi.' },
          { t: 'Palielinās vai samazinās?', d: 'Skaties uz katru kontu atsevišķi.' },
          { t: 'Piemēro likumu', d: 'Aktīvi aug debetā, pasīvi aug kredītā.' },
        ]),
      },
      {
        type: 'entry',
        prompt: 'Klients samaksā kasē 300 € skaidrā naudā par ēdināšanas pakalpojumu.',
        amount: 300,
        accounts: ['kase', 'banka', 'pamatl', 'piegad', 'aizn', 'ienp'],
        d: 'kase', k: 'ienp',
        hint: 'Kas notiek ar naudu kasē? Un kāpēc klients maksā?',
        explain: 'Kase (aktīvs) ↑ → debets. Ieņēmumi ↑ → kredīts.',
      },
      {
        type: 'entry',
        prompt: 'Kafejnīca iemaksā 500 € no kases savā bankas kontā.',
        amount: 500,
        accounts: ['kase', 'banka', 'pamatl', 'piegad', 'aizn', 'ienp'],
        d: 'banka', k: 'kase',
        hint: 'Nauda tikai pārvietojas no viena aktīva uz otru.',
        explain: 'Nauda bankā ↑ → debets. Kase ↓ → kredīts. Aktīvu kopsumma nemainās.',
      },
      {
        type: 'entry',
        prompt: 'Kafejnīca nopērk datoru par 900 € ar pēcapmaksu.',
        amount: 900,
        accounts: ['kase', 'banka', 'pamatl', 'piegad', 'aizn', 'ienp'],
        d: 'pamatl', k: 'piegad',
        hint: 'Nauda vēl nav samaksāta. Kas rodas tās vietā?',
        explain: 'Pamatlīdzekļi ↑ → debets. Parādi piegādātājiem ↑ → kredīts.',
      },
      {
        type: 'entry',
        prompt: 'Kafejnīca atmaksā bankai 1 000 € no aizņēmuma.',
        amount: 1000,
        accounts: ['kase', 'banka', 'pamatl', 'piegad', 'aizn', 'ienp'],
        d: 'aizn', k: 'banka',
        hint: 'Saistības samazinās, un saistību samazinājums ir debetā.',
        explain: 'Aizņēmumi (saistības) ↓ → debets. Nauda bankā ↓ → kredīts.',
      },
      {
        type: 'choice',
        prompt: 'Grāmatojums: **D Parādi piegādātājiem / K Nauda bankā 400 €**. Kas notika?',
        options: [
          { t: 'Kafejnīca saņēma no piegādātāja rēķinu par 400 €', why: 'Tad parāds pieaugtu, un parāda pieaugums ir kredītā, nevis debetā.' },
          { t: 'Kafejnīca samaksāja piegādātājam 400 €', ok: true },
          { t: 'Piegādātājs samaksāja kafejnīcai 400 €', why: 'Tad nauda bankā pieaugtu, un tas būtu debets.' },
        ],
        explain: 'Parāds samazinās (D) un nauda samazinās (K): rēķins ir apmaksāts.',
      },
    ],
  };

  /* =====================================================================
   * 4. nodaļa — Peļņa un principi
   * ===================================================================== */

  lessons.l9 = {
    title: 'Ieņēmumi, izdevumi un peļņa',
    desc: 'Peļņas vai zaudējumu aprēķins un nolietojums.',
    takeaways: [
      '**Peļņa = ieņēmumi − izdevumi.**',
      'Aizņēmums un īpašnieka ieguldījums nav ieņēmumi.',
      'Peļņa palielina pašu kapitālu.',
      'Pamatlīdzekļa izmaksas sadala pa lietošanas laiku: tas ir **nolietojums**.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Bilance ir fotogrāfija, peļņas aprēķins ir filma',
        body: '**Peļņas vai zaudējumu aprēķins** parāda, kas notika periodā, piemēram, mēnesī vai gadā: ieņēmumi mīnus izdevumi.',
        visual: V.pnl({
          title: 'Kafejnīca «Pupa», marts',
          I: [['Kafijas un kūku pārdošana', 4500]],
          E: [['Izejvielas', 900], ['Algas', 1500], ['Telpu noma', 800]],
        }),
      },
      {
        type: 'sort',
        prompt: 'Ieņēmumi, izdevumi vai ne viens, ne otrs?',
        buckets: [
          { id: 'I', label: 'Ieņēmumi', tone: 'pk' },
          { id: 'E', label: 'Izdevumi', tone: 's' },
          { id: 'N', label: 'Ne viens, ne otrs', tone: 'n' },
        ],
        items: [
          { t: 'Pārdota kafija', b: 'I' },
          { t: 'Saņemts bankas aizņēmums', b: 'N' },
          { t: 'Telpu noma', b: 'E' },
          { t: 'Ēdināšana uzņēmuma pasākumam', b: 'I' },
          { t: 'Īpašnieka ieguldījums pamatkapitālā', b: 'N' },
          { t: 'Darbinieku algas', b: 'E' },
          { t: 'Nopirkts kafijas automāts', b: 'N' },
          { t: 'Elektrība', b: 'E' },
        ],
        hint: 'Uzmanies no slazdiem: ne katra naudas ienākšana ir ieņēmumi, un ne katrs maksājums ir izdevumi.',
        explain: 'Aizņēmums jāatdod, tātad tās ir saistības. Īpašnieka ieguldījums ir pašu kapitāls. Automāts ir aktīvs, un izdevumos tas nonāk pakāpeniski, caur nolietojumu.',
      },
      {
        type: 'number',
        prompt: 'Aprēķini kafejnīcas mēneša peļņu.',
        visual: V.pnl({
          title: 'Kafejnīca «Pupa», aprīlis',
          I: [['Kafijas un kūku pārdošana', 4500]],
          E: [['Izejvielas', 900], ['Algas', 1500], ['Telpu noma', 800], ['Elektrība', 150]],
          hide: true,
        }),
        answer: 1150,
        hint: 'Saskaiti visus izdevumus un atņem tos no ieņēmumiem.',
        wrong: [{ v: 7850, msg: 'Izdevumi no ieņēmumiem jāatņem, nevis jāpieskaita.' }],
        explain: '4 500 − (900 + 1 500 + 800 + 150) = 4 500 − 3 350 = 1 150 €.',
      },
      {
        type: 'choice',
        prompt: 'Kafejnīca nopelnīja 1 150 € peļņu. Kas notiek bilancē?',
        options: [
          { t: 'Saistības palielinās par 1 150 €', why: 'Peļņa nav parāds kādam citam. Tā pieder īpašniekam.' },
          { t: 'Nekas, peļņa redzama tikai peļņas vai zaudējumu aprēķinā', why: 'Peļņa savieno abus pārskatus: to pieskaita bilances pašu kapitālam.' },
          { t: 'Pašu kapitāls palielinās par 1 150 €', ok: true },
        ],
        explain: 'Peļņa ir īpašnieka ieguvums, tāpēc tā palielina pašu kapitālu. Bilancē to rāda kā pārskata perioda peļņu, vēlāk kā nesadalīto peļņu.',
      },
      {
        type: 'info',
        title: 'Nolietojums',
        body: 'Kafijas automāts par 6 000 € kalpos 5 gadus. Būtu dīvaini visus 6 000 € uzskatīt par pirmā mēneša izdevumiem, jo automāts strādās vēl 59 mēnešus. Tāpēc tā vērtību sadala pa lietošanas laiku. To sauc par **nolietojumu**.',
        visual: V.formula('Lineārais nolietojums = (iegādes vērtība − atlikusī vērtība) ÷ lietošanas laiks') + V.years(5, 1200, 6000),
      },
      {
        type: 'number',
        prompt: 'Cik liels ir automāta nolietojums **mēnesī**, ja to aprēķina lineāri un atlikusī vērtība ir 0 €?',
        answer: 100,
        hint: '5 gadi ir 60 mēneši.',
        wrong: [{ v: 1200, msg: 'Tas ir gada nolietojums. Jautājums ir par vienu mēnesi.' }],
        explain: '6 000 € ÷ 60 mēneši = 100 € mēnesī. Katru mēnesi grāmato: D Nolietojuma izmaksas / K Pamatlīdzekļu nolietojums.',
      },
    ],
  };

  lessons.l10 = {
    title: 'Uzkrāšanas princips',
    desc: 'Kad atzīt ieņēmumus un izdevumus.',
    takeaways: [
      'Ieņēmumus atzīst, kad tie **nopelnīti**, nevis kad saņemta nauda.',
      'Izdevumus atzīst periodā, **uz kuru tie attiecas**.',
      'Saņemts avanss ir saistības. Samaksāts avanss ir aktīvs.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Nauda un peļņa nekustas vienlaikus',
        body: 'Pēc **uzkrāšanas principa** ieņēmumus un izdevumus atzīst tajā periodā, uz kuru tie attiecas, neatkarīgi no tā, kad nauda saņemta vai samaksāta.',
        visual: V.timeline([
          { m: 'Marts', t: 'Pakalpojums sniegts', d: 'Ieņēmumi atzīti: **D Pircēju parādi / K Ieņēmumi**' },
          { m: 'Aprīlis', t: 'Klients samaksā', d: 'Parāds kļūst par naudu: **D Nauda bankā / K Pircēju parādi**' },
        ]),
      },
      {
        type: 'choice',
        prompt: 'Martā kafejnīca apkalpo uzņēmuma pasākumu par 1 000 €. Klients samaksā aprīlī. Kurā mēnesī kafejnīcai ir ieņēmumi?',
        options: [
          { t: 'Aprīlī', why: 'Aprīlī tikai pircēja parāds pārvēršas naudā. Ieņēmumi ir nopelnīti martā.' },
          { t: 'Martā', ok: true },
          { t: 'Pa pusei katrā mēnesī', why: 'Pakalpojums pilnībā sniegts martā.' },
        ],
        explain: 'Martā: D Pircēju parādi / K Ieņēmumi 1 000 €. Aprīlī: D Nauda bankā / K Pircēju parādi 1 000 €.',
      },
      {
        type: 'number',
        prompt: 'Janvārī kafejnīca samaksā telpu nomu par visu gadu uz priekšu: 9 600 €. Cik nomas izdevumu jāatzīst janvārī?',
        answer: 800,
        hint: 'Noma attiecas uz 12 mēnešiem.',
        wrong: [{ v: 9600, msg: 'Tā ir visa samaksātā summa. Janvāra izdevumi ir tikai janvārim atbilstošā daļa.' }],
        explain: '9 600 € ÷ 12 = 800 €. Pārējie 8 800 € janvāra beigās ir nākamo periodu izmaksas: aktīvs, kas izlietosies nākamajos mēnešos.',
      },
      {
        type: 'choice',
        prompt: 'Decembrī darbinieki nostrādāja visu mēnesi, bet algu 1 500 € izmaksās 5. janvārī. Kurā mēnesī jāatzīst algu izmaksas?',
        options: [
          { t: 'Decembrī', ok: true },
          { t: 'Janvārī', why: 'Janvārī tikai nomaksā parādu. Darbs, un līdz ar to izmaksas, radās decembrī.' },
        ],
        explain: 'Decembrī: D Algu izmaksas / K Parādi darbiniekiem. Janvārī: D Parādi darbiniekiem / K Nauda bankā.',
      },
      {
        type: 'multi',
        prompt: 'Kuri no šiem ir kafejnīcas **marta** ieņēmumi? Atzīmē visus.',
        options: [
          { t: 'Martā pārdota kafija, klients maksā ar karti', ok: true },
          { t: 'Martā saņemts avanss par pasākumu maijā', why: 'Pakalpojums vēl nav sniegts. Līdz tam saņemtais avanss ir saistības pret klientu.' },
          { t: 'Martā sniegts pakalpojums, ko klients apmaksās maijā', ok: true },
          { t: 'Martā saņemta samaksa par februārī sniegtu pakalpojumu', why: 'Šie ieņēmumi jau atzīti februārī. Martā tikai saņemta nauda.' },
        ],
        explain: 'Svarīgs ir brīdis, kad ieņēmumi nopelnīti. Saņemts avanss ir saistības, līdz pakalpojums sniegts.',
      },
    ],
  };

  lessons.l11 = {
    title: 'Grāmatvedības principi',
    desc: 'Noteikumi, kas padara pārskatus uzticamus.',
    takeaways: [
      '**Darbības turpināšana**: pieņem, ka uzņēmums strādās arī turpmāk.',
      '**Konsekvence**: tās pašas metodes gadu no gada.',
      '**Piesardzība**: peļņu atzīst, kad tā gūta, zaudējumus jau tad, kad tie paredzami.',
      '**Būtiskums** un **saturs pār formu** palīdz uzskaitei atspoguļot realitāti.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Principi, uz kuriem balstās pārskati',
        body: 'Latvijā vispārīgie principi ir noteikti Gada pārskatu un konsolidēto gada pārskatu likumā. Tie nodrošina, ka dažādu uzņēmumu pārskatiem var uzticēties un tos var salīdzināt.',
        visual: V.defs([
          ['Darbības turpināšana', 'Pieņem, ka uzņēmums strādās arī turpmāk un netiks likvidēts.'],
          ['Konsekvence', 'Novērtēšanas metodes nemaina no gada uz gadu bez pamatota iemesla.'],
          ['Piesardzība', 'Peļņu atzīst tikai tad, kad tā ir gūta. Paredzamās saistības un iespējamos zaudējumus ņem vērā jau tagad.'],
          ['Uzkrāšana', 'Ieņēmumus un izdevumus atzīst periodā, uz kuru tie attiecas.'],
          ['Būtiskums', 'Nenozīmīgas summas drīkst uzskaitīt vienkāršāk, ja tas neizkropļo ainu.'],
          ['Saturs pār formu', 'Darījumu uzskaita pēc tā ekonomiskās būtības, nevis pēc juridiskā nosaukuma.'],
        ]),
      },
      {
        type: 'quick',
        prompt: 'Kurš princips te darbojas?',
        options: ['Piesardzība', 'Konsekvence', 'Būtiskums', 'Darbības turpināšana', 'Saturs pār formu'],
        items: [
          { t: 'Krājumu tirgus cena ir nokritusies zem iegādes cenas, tāpēc tos novērtē pēc zemākās.', a: 0, why: 'Aktīvus nenovērtē augstāk, nekā par tiem reāli var saņemt.' },
          { t: 'Nolietojumu katru gadu aprēķina ar to pašu metodi, lai pārskatus var salīdzināt.', a: 1, why: 'Vienādas metodes ļauj salīdzināt gadus.' },
          { t: 'Pildspalvas par 8 € neuzskaita kā pamatlīdzekli, bet uzreiz iekļauj izdevumos.', a: 2, why: 'Summa ir tik maza, ka tā neietekmē pārskata ainu.' },
          { t: 'Aprīkojumu novērtē, pieņemot, ka kafejnīca strādās arī nākamgad.', a: 3, why: 'Ja uzņēmumu likvidētu, aktīvus vērtētu pēc izpārdošanas cenas.' },
          { t: 'Līgumu sauc par «nomu», bet pēc 3 gadiem aprīkojums bez piemaksas pāriet kafejnīcas īpašumā. To uzskaita kā pirkumu uz nomaksu.', a: 4, why: 'Pēc būtības tas ir pirkums, lai kā līgumu sauktu.' },
          { t: 'Klients cēlis prasību tiesā, un zaudējums ir ticams. Uzkrājumu izveido jau tagad.', a: 0, why: 'Iespējamos zaudējumus atzīst, tiklīdz tie ir paredzami.' },
        ],
      },
      {
        type: 'choice',
        prompt: 'Kafejnīca paziņojusi, ka nākammēnes to likvidēs. Kuru principu vairs nevar piemērot?',
        options: [
          { t: 'Būtiskumu', why: 'Būtiskums attiecas uz summu nozīmīgumu, un tas paliek spēkā.' },
          { t: 'Darbības turpināšanu', ok: true },
          { t: 'Uzkrāšanu', why: 'Ieņēmumus un izdevumus joprojām atzīst periodā, uz kuru tie attiecas.' },
        ],
        explain: 'Ja uzņēmums beidz darbību, aktīvus novērtē pēc summas, ko par tiem var reāli saņemt, tos pārdodot.',
      },
      {
        type: 'choice',
        prompt: 'Kurš princips pieprasa atzīt nomas izdevumus tajā mēnesī, uz kuru noma attiecas, nevis kad tā samaksāta?',
        options: [
          { t: 'Uzkrāšana', ok: true },
          { t: 'Konsekvence', why: 'Konsekvence ir par metožu nemainīgumu, nevis par laika periodu.' },
          { t: 'Piesardzība', why: 'Piesardzība ir par to, lai nepārvērtētu aktīvus un peļņu.' },
        ],
        explain: 'Uzkrāšanas princips sasaista ieņēmumus un izdevumus ar periodu, nevis ar naudas kustību.',
      },
    ],
  };

  /* =====================================================================
   * 5. nodaļa — Pievienotās vērtības nodoklis
   * ===================================================================== */

  lessons.pvn1 = {
    title: 'Kā darbojas PVN',
    desc: 'Nodoklis, ko sedz pircējs, bet valstij nodod uzņēmums.',
    takeaways: [
      '**PVN** pievieno cenai. Pircējs to samaksā, uzņēmums to nodod valstij.',
      'Latvijā standarta likme ir **21 %**.',
      'No summas ar PVN nodokli aprēķina kā **summa × 21 ÷ 121**.',
      'PVN maksātājam PVN nav ne ieņēmumi, ne izdevumi.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Nodoklis katrā čekā',
        body: 'Klients kafejnīcā nopērk kapučīno. Uz čeka redzams, ka cenā jau ir iekļauts **pievienotās vērtības nodoklis (PVN)**.',
        visual: V.receipt({ shop: 'Kafejnīca «Pupa»', items: [['Kapučīno', 3.63]], net: 3, vat: 0.63, rate: 21, foot: 'Paldies un uz tikšanos!' }),
        after: 'Latvijā standarta PVN likme ir **21 %**. Dažām precēm un pakalpojumiem likums nosaka samazinātās likmes (12 % vai 5 %), bet daži darījumi ar PVN netiek aplikti. Likmes laika gaitā mainās, tāpēc aktuālās vērtības pārbaudi VID mājaslapā.',
      },
      {
        type: 'choice',
        context: 'open',
        prompt: 'Kapučīno čekā ir **0,63 € PVN**. Kam pieder šī nauda?',
        options: [
          { t: 'Kafejnīcai: tie ir tās ieņēmumi', why: 'Kafejnīca šo naudu saņem, bet tā nav nopelnīta. Tā jānodod valstij.' },
          { t: 'Valstij: kafejnīca tos tikai iekasē', ok: true },
          { t: 'Klientam: viņš tos saņems atpakaļ', why: 'Gala patērētājs PVN atpakaļ nesaņem. Tieši viņš šo nodokli sedz.' },
        ],
        explain: 'Kafejnīca PVN iekasē valsts vārdā. Līdz brīdim, kad tā to samaksā VID, tās ir kafejnīcas **saistības** pret valsti.',
      },
      {
        type: 'number',
        prompt: 'Kafejnīca uzņēmumam piedāvā ēdināšanu par **500 € bez PVN**. Cik liels būs PVN rēķinā?',
        answer: 105,
        hint: 'Pareizini cenu bez PVN ar 21 % jeb 0,21.',
        wrong: [
          { v: 605, msg: 'Tā ir summa kopā ar PVN. Jautājums ir tikai par nodokli.' },
          { v: 21, msg: '21 ir likme procentos. Aprēķini, cik eiro ir 21 % no 500 €.' },
        ],
        explain: '500 × 0,21 = 105 €. Rēķinā būs 500 € + 105 € PVN = 605 €.',
      },
      {
        type: 'info',
        title: 'Kad PVN jau ir cenā',
        body: 'Bieži zināma ir tikai gala summa. Tad PVN nevar aprēķināt kā 21 % no tās: gala summā ir 100 % cenas **plus** 21 % nodokļa, kopā 121 %.',
        visual: V.split(100, 21) + V.formula('PVN = summa ar PVN × 21 ÷ 121') + V.formula('Cena bez PVN = summa ar PVN ÷ 1,21'),
      },
      {
        type: 'number',
        prompt: 'Klients par banketu samaksā **1 210 €** (ar PVN 21 %). Cik no šīs summas ir PVN?',
        answer: 210,
        hint: 'Summa ar PVN ir 121 % no cenas. PVN ir 21 daļa no šīm 121.',
        wrong: [{ v: 254.1, msg: 'Tie ir 21 % no 1 210 €. Bet 1 210 € jau ietver nodokli, tāpēc PVN ir 21/121 daļa, ne 21/100.' }],
        explain: '1 210 × 21 ÷ 121 = 210 €. Cena bez PVN ir 1 000 €.',
      },
      {
        type: 'number',
        prompt: 'Martā kafejnīca pārdeva preces un pakalpojumus par **6 050 €** (ar PVN 21 %). Cik lieli ir marta ieņēmumi peļņas vai zaudējumu aprēķinā?',
        answer: 5000,
        hint: 'Ieņēmumos PVN neiekļauj.',
        wrong: [
          { v: 6050, msg: 'Ieņēmumos PVN neietver: tā daļa pieder valstij.' },
          { v: 4779.5, msg: 'No summas ar PVN cenu iegūst, dalot ar 1,21. Atņemot 21 %, sanāk par maz.' },
        ],
        explain: '6 050 ÷ 1,21 = 5 000 €. Atlikušie 1 050 € ir PVN, kas jānodod valstij.',
      },
      {
        type: 'choice',
        prompt: 'Kafejnīca ir reģistrēta PVN maksātāja. Vai PVN samazina tās peļņu?',
        options: [
          { t: 'Jā, peļņa samazinās par 21 %', why: 'PVN neieraksta ne ieņēmumos, ne izdevumos, tāpēc peļņu tas neietekmē.' },
          { t: 'Nē, PVN nav ne ieņēmumi, ne izdevumi', ok: true },
        ],
        explain: 'Iekasēto PVN kafejnīca nodod valstij, bet par iegādēm samaksāto PVN tā atgūst. Peļņu rēķina no summām bez PVN.',
      },
    ],
  };

  lessons.pvn2 = {
    title: 'Priekšnodoklis un PVN grāmatojumi',
    desc: 'Cik PVN jāsamaksā valstij un kā to iegrāmato.',
    takeaways: [
      '**Aprēķinātais PVN** ir no pārdošanas, **priekšnodoklis** ir no iegādēm.',
      'Valstij maksā starpību: aprēķinātais PVN − priekšnodoklis.',
      'Grāmatojumā PVN atdala no cenas: ieņēmumi un izmaksas ir bez PVN.',
      'PVN nemaksātājs priekšnodokli atskaitīt nevar, tāpēc PVN kļūst par izmaksu daļu.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Katrs maksā tikai no savas pievienotās vērtības',
        body: 'Kafija līdz klientam nonāk caur vairākiem uzņēmumiem. Katrs iekasē PVN no pircēja, bet atskaita PVN, ko pats samaksāja piegādātājam. Šo atskaitāmo PVN sauc par **priekšnodokli**.',
        visual: V.flow([
          { t: 'Grauzdētava', d: 'Pārdod pupiņas kafejnīcai: 100 € + **21 €** PVN. Valstij nodod **21 €**.' },
          { t: 'Kafejnīca', d: 'Pārdod kafiju: 300 € + **63 €** PVN. Atskaita priekšnodokli 21 €. Valstij nodod **42 €**.' },
          { t: 'Klients', d: 'Samaksā 363 €. PVN atgūt nevar, jo ir gala patērētājs.' },
        ]),
        after: 'Valsts kopā saņem 21 + 42 = 63 €, tieši 21 % no gala cenas. Kafejnīca nodokli maksā tikai no vērtības, ko tā pievienoja: 300 − 100 = 200 €.',
      },
      {
        type: 'number',
        prompt: 'Martā kafejnīcas aprēķinātais PVN no pārdošanas ir **1 050 €**. Par iepirktajām precēm tā samaksāja **420 €** PVN. Cik PVN jāsamaksā valstij par martu?',
        answer: 630,
        hint: 'Aprēķinātais PVN mīnus priekšnodoklis.',
        wrong: [
          { v: 1470, msg: 'Priekšnodokli no aprēķinātā PVN atņem, nevis pieskaita.' },
          { v: 1050, msg: 'Kafejnīca drīkst atskaitīt priekšnodokli, ko pati samaksāja piegādātājiem.' },
        ],
        explain: '1 050 − 420 = 630 €. Šo summu norāda PVN deklarācijā, ko par katru taksācijas periodu iesniedz VID.',
      },
      {
        type: 'choice',
        prompt: 'Aprīlī kafejnīca nopērk jaunu aprīkojumu, un priekšnodoklis ir **1 500 €**. Aprēķinātais PVN ir **1 100 €**. Kas notiek?',
        options: [
          { t: 'Kafejnīca maksā valstij 2 600 €', why: 'Priekšnodokli neskaita klāt. To atņem no aprēķinātā PVN.' },
          { t: 'Kafejnīca maksā valstij 1 100 €, priekšnodoklis zūd', why: 'Priekšnodoklis nezūd. Ja tas ir lielāks par aprēķināto PVN, rodas pārmaksa.' },
          { t: 'Rodas PVN pārmaksa 400 €', ok: true },
        ],
        explain: '1 100 − 1 500 = −400 €. Tā ir kafejnīcas prasība pret valsti: pārmaksu var atgūt vai ieskaitīt turpmākajos nodokļu maksājumos.',
      },
      {
        type: 'info',
        title: 'PVN grāmatojumā',
        body: 'Grāmatojot PVN atdala no cenas: ieņēmumus un iegādes uzskaita bez PVN. Nodoklis nonāk savos kontos. **Aprēķinātais PVN** ir parāds valstij (saistības), **priekšnodoklis** ir prasība pret valsti (aktīvs). Šādi ieraksti skar trīs kontus, bet debets joprojām ir vienāds ar kredītu.',
        visual: V.journal([
          { t: 'Pārdota ēdināšana par 1 210 € ar PVN', lines: [['d', 'Nauda bankā', 1210], ['k', 'Ieņēmumi no pakalpojumiem', 1000], ['k', 'Aprēķinātais PVN', 210]] },
          { t: 'Nopirktas pupiņas par 605 € ar PVN', lines: [['d', 'Krājumi', 500], ['d', 'Priekšnodoklis', 105], ['k', 'Parādi piegādātājiem', 605]] },
        ]),
        after: 'Praksē abus bieži uzskaita vienā kontā «Norēķini ar budžetu par PVN»: aprēķināto PVN kredītā, priekšnodokli debetā.',
      },
      {
        type: 'entry',
        prompt: 'Kafejnīca izraksta rēķinu uzņēmumam par ēdināšanu: 2 000 € + PVN 420 €. Klients samaksās nākammēnes.',
        accounts: PVN_ACCTS,
        lines: [{ s: 'd', a: 'deb', v: 2420 }, { s: 'k', a: 'ienp', v: 2000 }, { s: 'k', a: 'pvnA', v: 420 }],
        hint: 'Klients ir parādā visu summu ar PVN. Ieņēmumi ir bez PVN, bet nodoklis ir parāds valstij.',
        explain: 'Pircēju parādi ↑ 2 420 € (D). Ieņēmumi ↑ 2 000 € (K). Aprēķinātais PVN ↑ 420 € (K). Debets 2 420 = kredīts 2 000 + 420.',
      },
      {
        type: 'entry',
        prompt: 'Kafejnīca nopērk piena putotāju par 363 € (t. sk. PVN 63 €) un samaksā no bankas konta. Putotājs kalpos vairākus gadus.',
        accounts: PVN_ACCTS,
        lines: [{ s: 'd', a: 'pamatl', v: 300 }, { s: 'd', a: 'priek', v: 63 }, { s: 'k', a: 'banka', v: 363 }],
        hint: 'Pamatlīdzekli uzskaita bez PVN. Samaksāto PVN kafejnīca atgūs.',
        explain: 'Pamatlīdzekļi ↑ 300 € (D). Priekšnodoklis ↑ 63 € (D). Nauda bankā ↓ 363 € (K).',
      },
      {
        type: 'entry',
        prompt: 'Mēneša beigās priekšnodokli 63 € ieskaita pret aprēķināto PVN.',
        accounts: PVN_ACCTS,
        d: 'pvnA', k: 'priek', amount: 63,
        hint: 'Samazinās gan parāds valstij, gan prasība pret valsti.',
        explain: 'Aprēķinātais PVN ↓ (D), priekšnodoklis ↓ (K). Valstij vēl jāsamaksā 420 − 63 = 357 €.',
      },
      {
        type: 'choice',
        prompt: 'Neliela kafejnīca nav PVN maksātāja, jo tās apgrozījums ir zem likumā noteiktā sliekšņa. Tā nopērk pupiņas par 605 € (t. sk. PVN 105 €). Kā tā uzskaita šos 105 €?',
        options: [
          { t: 'Kā priekšnodokli, ko atgūs no valsts', why: 'Priekšnodokli atskaitīt var tikai reģistrēts PVN maksātājs.' },
          { t: 'Kā daļu no pupiņu izmaksām: krājumi ir 605 €', ok: true },
          { t: 'Neuzskaita vispār', why: 'Nauda ir samaksāta, un tā jāuzskaita. Jautājums ir tikai par to, kur.' },
        ],
        explain: 'PVN nemaksātājam samaksātais PVN ir parasta izmaksu daļa, jo atgūt to nevar. Tāpēc uzņēmums PVN maksātāju reģistrā var reģistrēties arī brīvprātīgi, pirms sasniegts slieksnis.',
      },
    ],
  };

  /* =====================================================================
   * 6. nodaļa — Naudas plūsma
   * ===================================================================== */

  lessons.nauda1 = {
    title: 'Naudas plūsmas pārskats',
    desc: 'No kurienes nauda nāk un kur tā aiziet.',
    takeaways: [
      'Peļņa un nauda nav viens un tas pats.',
      'Naudas plūsmu iedala trijās daļās: **pamatdarbība**, **ieguldīšanas darbība** un **finansēšanas darbība**.',
      'Sākuma atlikums + naudas izmaiņa = beigu atlikums, un tas sakrīt ar naudu bilancē.',
      'Nolietojums naudas plūsmā neparādās: nauda aizgāja tad, kad aprīkojumu nopirka.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Peļņa nav nauda',
        body: 'Aprīlī kafejnīca nopelnīja 2 000 € peļņu, bet naudas bankā mēneša laikā kļuva par 500 € mazāk. Kā tas iespējams?\n\nPeļņas vai zaudējumu aprēķins seko uzkrāšanas principam, bet rēķinus maksā ar naudu. Tāpēc ir trešais pārskats: **naudas plūsmas pārskats**. (Šajā nodaļā PVN vienkāršības labad neņemam vērā.)',
        visual: V.cards([
          { t: 'Bilance', d: 'Kas uzņēmumam ir un ko tas ir parādā **vienā datumā**.', tone: 'a' },
          { t: 'Peļņas vai zaudējumu aprēķins', d: 'Cik uzņēmums **nopelnīja** periodā.', tone: 'pk' },
          { t: 'Naudas plūsmas pārskats', d: 'Cik **naudas** ienāca un izgāja periodā.', tone: 's' },
        ]),
        after: 'Latvijā gada pārskatā naudas plūsmas pārskats obligāti jāsagatavo vidējām un lielām sabiedrībām. Vadībai tas noder jebkurā uzņēmumā.',
      },
      {
        type: 'choice',
        prompt: 'Vai uzņēmums, kas strādā ar peļņu, var nonākt maksātnespējā?',
        options: [
          { t: 'Nē, ja ir peļņa, naudas pietiek vienmēr', why: 'Peļņa var būt «iesaldēta» klientu parādos un krājumos, kamēr rēķini jāmaksā jau tagad.' },
          { t: 'Jā, ja nauda ienāk lēnāk, nekā jāmaksā rēķini', ok: true },
        ],
        explain: 'Daudzi uzņēmumi nonāk grūtībās naudas trūkuma dēļ, lai gan tiem ir peļņa. Tāpēc naudas plūsmai seko atsevišķi.',
      },
      {
        type: 'info',
        title: 'Trīs naudas plūsmas',
        body: 'Katru maksājumu naudas plūsmas pārskatā ieraksta vienā no trim daļām.',
        visual: V.cards([
          { t: 'Pamatdarbība', d: 'Ikdienas darbs: klientu maksājumi, algas, piegādātāji, noma, nodokļi.', tone: 'pk' },
          { t: 'Ieguldīšanas darbība', d: 'Ilgtermiņa aktīvu pirkšana un pārdošana: iekārtas, ēkas, ieguldījumi citos uzņēmumos.', tone: 'a' },
          { t: 'Finansēšanas darbība', d: 'Nauda no īpašniekiem un aizdevējiem un atpakaļ: pamatkapitāls, aizņēmumi, to atmaksa, dividendes.', tone: 's' },
        ]),
      },
      {
        type: 'sort',
        prompt: 'Kurā naudas plūsmas daļā pieder katrs maksājums?',
        buckets: [
          { id: 'P', label: 'Pamatdarbība', tone: 'pk' },
          { id: 'I', label: 'Ieguldīšana', tone: 'a' },
          { id: 'F', label: 'Finansēšana', tone: 's' },
        ],
        items: [
          { t: 'Klientu maksājumi par kafiju', b: 'P' },
          { t: 'Nopirkts kafijas automāts', b: 'I' },
          { t: 'Saņemts bankas aizņēmums', b: 'F' },
          { t: 'Izmaksātas algas', b: 'P' },
          { t: 'Pārdots vecais ledusskapis', b: 'I' },
          { t: 'Īpašnieka iemaksa pamatkapitālā', b: 'F' },
          { t: 'Samaksāts piegādātājam par pupiņām', b: 'P' },
          { t: 'Izmaksātas dividendes', b: 'F' },
          { t: 'Samaksāta telpu noma', b: 'P' },
        ],
        hint: 'Ikdienas darbs ir pamatdarbība. Ilgtermiņa aktīvi ir ieguldīšana. Nauda no īpašniekiem un bankas un atpakaļ ir finansēšana.',
        explain: 'Automāts un ledusskapis ir ilgtermiņa aktīvi, tātad ieguldīšana. Aizņēmums, pamatkapitāls un dividendes ir finansēšana. Viss pārējais ir pamatdarbība.',
      },
      {
        type: 'choice',
        prompt: 'Kurš no šiem posteņiem naudas plūsmas pārskatā **neparādās**?',
        options: [
          { t: 'Algu izmaksa', why: 'Alga tiek samaksāta naudā, tā ir pamatdarbības naudas plūsma.' },
          { t: 'Aizņēmuma atmaksa', why: 'Nauda aiziet uz banku, tā ir finansēšanas darbība.' },
          { t: 'Kafijas automāta nolietojums', ok: true },
          { t: 'Klientu maksājumi', why: 'Tā ir galvenā naudas ienākšana pamatdarbībā.' },
        ],
        explain: 'Nolietojums samazina peļņu, bet nauda par to nekur neaiziet. Nauda aizgāja tad, kad automātu nopirka, un tā bija ieguldīšanas darbība.',
      },
      {
        type: 'number',
        prompt: 'Aprēķini kafejnīcas aprīļa **pamatdarbības** naudas plūsmu.',
        visual: V.statement({ title: 'Bankas konta izraksts · aprīlis', open: 9300, rows: APRIL_BANK }),
        answer: 1100,
        hint: 'Saskaiti klientu maksājumus un atņem piegādātājus, nomu un algu. Iekārta un aizņēmums šeit neietilpst.',
        wrong: [{ v: -500, msg: 'Tā ir visa naudas izmaiņa. Dzirnaviņas ir ieguldīšanas darbība, aizņēmuma atmaksa ir finansēšanas darbība.' }],
        explain: '2 400 + 2 800 − 500 − 1 300 − 800 − 1 500 = 1 100 €.',
      },
      {
        type: 'number',
        prompt: 'Cik naudas bankā ir aprīļa beigās?',
        visual: V.cashflow({ title: 'Naudas plūsmas pārskats · aprīlis', open: 9300, hideChange: true, sections: APRIL_CF }),
        answer: 8800,
        hint: 'Saskaiti visu trīs daļu naudas plūsmas un rezultātu pieskaiti sākuma atlikumam.',
        wrong: [{ v: 9800, msg: 'Naudas izmaiņa ir negatīva: 1 100 − 1 200 − 400 = −500 €. Tā jāatņem no sākuma atlikuma.' }],
        explain: 'Naudas izmaiņa: 1 100 − 1 200 − 400 = −500 €. Beigu atlikums: 9 300 − 500 = 8 800 €. Tieši tik daudz naudas būs bilancē 30. aprīlī.',
      },
    ],
  };

  lessons.nauda2 = {
    title: 'No peļņas līdz naudai',
    desc: 'Netiešā metode: kāpēc peļņa atšķiras no naudas plūsmas.',
    takeaways: [
      '**Tiešā metode** saskaita maksājumus, **netiešā** sāk ar peļņu un to koriģē.',
      'Nolietojumu pieskaita atpakaļ: tas samazināja peļņu, bet ne naudu.',
      'Aktīvu, piemēram, pircēju parādu un krājumu, pieaugums naudu samazina.',
      'Saistību, piemēram, parādu piegādātājiem, pieaugums naudu palielina.',
    ],
    steps: [
      {
        type: 'info',
        title: 'Kur palika 900 €?',
        body: 'Aprīlī kafejnīcas peļņa bija 2 000 €, bet pamatdarbība ienesa tikai 1 100 € naudas. Atšķirība rodas, jo peļņas vai zaudējumu aprēķins seko uzkrāšanas principam.',
        visual: V.pnl({
          title: 'Kafejnīca «Pupa», aprīlis',
          I: [['Kafijas un kūku pārdošana', 5200], ['Ēdināšana uzņēmumam (vēl nav apmaksāta)', 600]],
          E: [['Izejvielas', 1400], ['Algas', 1500], ['Telpu noma', 800], ['Automāta nolietojums', 100]],
        }),
        after: 'Pamatdarbības naudas plūsmu var aprēķināt divos veidos. **Tiešā metode** saskaita visus maksājumus, kā iepriekšējā nodarbībā. **Netiešā metode** sāk ar peļņu un izlabo to par visu, kas ietekmēja peļņu, bet ne naudu.',
      },
      {
        type: 'choice',
        prompt: 'Ēdināšana uzņēmumam par 600 € ir iekļauta peļņā, bet rēķins vēl nav apmaksāts. Kā tas ietekmē naudu salīdzinājumā ar peļņu?',
        options: [
          { t: 'Nauda ir par 600 € lielāka nekā peļņa', why: 'Nauda vēl nav saņemta, tāpēc tās nevar būt vairāk.' },
          { t: 'Nauda ir par 600 € mazāka nekā peļņa', ok: true },
          { t: 'Neietekmē', why: 'Ieņēmumi ir peļņā, bet nauda vēl nav bankā. Tieši tā ir atšķirība.' },
        ],
        explain: 'Ieņēmumi ir atzīti, tāpēc peļņa ir lielāka. Nauda vēl nav saņemta: pircēju parādi pieauga par 600 €.',
      },
      {
        type: 'info',
        title: 'Īkšķa likums',
        body: 'Netiešajā metodē skatās, kā mainījās bilances posteņi, izņemot pašu naudu.',
        visual: V.cards([
          { t: 'Aktīvs ↑ → nauda −', d: 'Pircēju parādi vai krājumi pieauga: nauda «iesaldēta» tajos.', tone: 'a' },
          { t: 'Aktīvs ↓ → nauda +', d: 'Klienti nomaksāja vecos parādus vai krājumi samazinājās.', tone: 'a' },
          { t: 'Saistības ↑ → nauda +', d: 'Rēķini saņemti, bet vēl nav samaksāti.', tone: 's' },
          { t: 'Saistības ↓ → nauda −', d: 'Samaksāti arī iepriekšējo mēnešu rēķini.', tone: 's' },
        ]),
        after: 'Un vēl: **nolietojumu** pieskaita atpakaļ, jo tas samazināja peļņu, bet naudu ne.',
      },
      {
        type: 'quick',
        prompt: 'Pieskaitīt peļņai vai atņemt no tās?',
        options: ['Pieskaitīt', 'Atņemt'],
        optTone: ['pk', 's'],
        items: [
          { t: 'Nolietojums 100 €', a: 0, why: 'Nolietojums samazināja peļņu, bet nauda neaizgāja.' },
          { t: 'Pircēju parādi pieauga', a: 1, why: 'Ieņēmumi atzīti, bet nauda vēl nav saņemta.' },
          { t: 'Parādi piegādātājiem pieauga', a: 0, why: 'Izmaksas atzītas, bet vēl nav samaksātas.' },
          { t: 'Krājumi pieauga', a: 1, why: 'Nauda ieguldīta krājumos, kas vēl nav kļuvuši par izmaksām.' },
          { t: 'Pircēju parādi samazinājās', a: 0, why: 'Klienti samaksāja par iepriekšējo periodu ieņēmumiem.' },
          { t: 'Parādi piegādātājiem samazinājās', a: 1, why: 'Samaksāti arī veci rēķini, kas šī perioda peļņu neietekmēja.' },
        ],
      },
      {
        type: 'number',
        prompt: 'Aprēķini aprīļa pamatdarbības naudas plūsmu ar netiešo metodi.',
        visual: V.report({
          title: 'Kafejnīca «Pupa», aprīlis',
          rows: [
            { l: 'Peļņa', v: 2000 },
            { h: 'Korekcijas' },
            { l: 'Nolietojums', v: 100 },
            { l: 'Pircēju parādi pieauga par', v: 600 },
            { l: 'Krājumi pieauga par', v: 200 },
            { l: 'Parādi piegādātājiem samazinājās par', v: 200 },
            { l: 'Pamatdarbības naudas plūsma', v: '?', total: 'grand' },
          ],
        }),
        answer: 1100,
        hint: 'Nolietojumu pieskaiti. Pārējām trim izmaiņām piemēro īkšķa likumu.',
        wrong: [
          { v: 3100, msg: 'Ne visas korekcijas pieskaita. Aktīvu pieaugums un saistību samazinājums naudu samazina.' },
          { v: 900, msg: 'Nolietojums nav jāatņem: tas jau samazināja peļņu, bet naudu ne. To pieskaita atpakaļ.' },
          { v: 1500, msg: 'Gan krājumu pieaugums, gan parādu piegādātājiem samazinājums naudu samazina.' },
        ],
        explain: '2 000 + 100 − 600 − 200 − 200 = 1 100 €. Tieši tikpat, cik ar tiešo metodi.',
      },
      {
        type: 'choice',
        prompt: 'Tiešā metode deva 1 100 €, netiešā arī 1 100 €. Ko tas parāda?',
        options: [
          { t: 'Peļņa vienmēr ir lielāka par naudas plūsmu', why: 'Ne vienmēr. Ja klienti nomaksā vecus parādus, naudas plūsma var būt lielāka par peļņu.' },
          { t: 'Abas metodes mēra vienu un to pašu, tikai no dažādām pusēm', ok: true },
          { t: 'Nolietojums ir naudas izdevums', why: 'Tieši otrādi: nolietojumu pieskaita atpakaļ, jo nauda par to neaizgāja.' },
        ],
        explain: 'Tiešā metode parāda, **kur** nauda ienāca un aizgāja. Netiešā parāda, **kāpēc** nauda atšķiras no peļņas. Rezultāts ir viens.',
      },
    ],
  };

  /* =====================================================================
   * 7. nodaļa — Prakse: kafejnīcas pirmais mēnesis
   * ===================================================================== */

  lessons.l12 = {
    title: 'Kafejnīcas pirmais mēnesis',
    desc: 'Iegrāmato 8 darījumus un sastādi visus trīs pārskatus.',
    practice: false,
    ledger: ['banka', 'pamatl', 'kraj', 'pk', 'aizn', 'piegad', 'ien', 'mat', 'alga'],
    takeaways: [
      'Katrs darījums nonāk divos kontos ar vienādu summu.',
      'Ieņēmumi un izdevumi veido peļņu, un peļņa nonāk pašu kapitālā.',
      'Ja visi ieraksti ir pareizi, bilance sakrīt.',
      'Naudas plūsmas pārskata beigu atlikums sakrīt ar naudu bilancē.',
    ],
    steps: [
      {
        type: 'info',
        kicker: 'Simulācija',
        title: 'Kafejnīcas grāmatvedība tavās rokās',
        body: 'Kafejnīca «Pupa» sāk darbu 1. martā. Iegrāmato katru marta darījumu. Pēc katra ieraksta redzēsi, kā mainās konti un bilance.\n\nVienkāršības labad nodokļus, arī PVN, šajā simulācijā neņemam vērā.',
        visual: V.cards([
          { t: 'Aktīvi', d: 'Nauda bankā · Pamatlīdzekļi · Krājumi', tone: 'a' },
          { t: 'Saistības', d: 'Aizņēmumi no bankas · Parādi piegādātājiem', tone: 's' },
          { t: 'Pašu kapitāls', d: 'Pamatkapitāls · Ieņēmumi no pārdošanas · Izejvielu izmaksas · Algu izmaksas', tone: 'pk' },
        ]),
        after: 'Šis ir kafejnīcas kontu plāns. Ieņēmumu un izmaksu konti ir pašu kapitāla daļa: tie mēneša beigās veido peļņu.',
      },
      {
        type: 'entry',
        prompt: '**1. marts.** Līga iemaksā kafejnīcas bankas kontā 8 000 € kā pamatkapitālu.',
        amount: 8000, d: 'banka', k: 'pk', cf: 'F', memo: 'Pamatkapitāla iemaksa',
        explain: 'Nauda bankā (aktīvs) ↑ → debets. Pamatkapitāls (pašu kapitāls) ↑ → kredīts.',
      },
      {
        type: 'entry',
        prompt: '**2. marts.** Banka izsniedz kafejnīcai aizņēmumu 5 000 €.',
        amount: 5000, d: 'banka', k: 'aizn', cf: 'F', memo: 'Saņemts bankas aizņēmums',
        explain: 'Nauda ↑ → debets. Saistības pret banku ↑ → kredīts.',
      },
      {
        type: 'entry',
        prompt: '**3. marts.** Kafejnīca nopērk kafijas automātu par 6 000 € un samaksā no bankas konta.',
        amount: 6000, d: 'pamatl', k: 'banka', cf: 'I', memo: 'Nopirkts kafijas automāts',
        explain: 'Pamatlīdzekļi ↑ → debets. Nauda ↓ → kredīts. Aktīvu kopsumma nemainās.',
      },
      {
        type: 'entry',
        prompt: '**5. marts.** Piegādātājs atved kafijas pupiņas un pienu par 1 200 €. Rēķins jāapmaksā 30 dienu laikā.',
        amount: 1200, d: 'kraj', k: 'piegad',
        hint: 'Nauda vēl nav samaksāta. Kas rodas tās vietā?',
        explain: 'Krājumi ↑ → debets. Parāds piegādātājam ↑ → kredīts.',
      },
      {
        type: 'info',
        kicker: 'Virsgrāmata',
        title: 'Starpbilance',
        body: 'Četri darījumi, un bilance joprojām sakrīt. Tā tā izskatās šobrīd:',
        visual: (ctx) => V.ledgerBilance(ctx.ledger, { date: '05.03.' }),
      },
      {
        type: 'entry',
        prompt: '**Marta laikā.** Klienti par kafiju un kūkām ar kartēm samaksā kopā 4 500 €.',
        amount: 4500, d: 'banka', k: 'ien', cf: 'P', memo: 'Klientu maksājumi',
        explain: 'Nauda ↑ → debets. Ieņēmumi ↑ → kredīts. Ieņēmumi palielina pašu kapitālu.',
      },
      {
        type: 'entry',
        prompt: '**31. marts.** Inventarizācija rāda, ka mēnesī izlietotas izejvielas 900 € vērtībā.',
        amount: 900, d: 'mat', k: 'kraj',
        hint: 'Krājumi samazinās, un to vērtība kļūst par izmaksām.',
        explain: 'Izejvielu izmaksas ↑ → debets. Krājumi ↓ → kredīts.',
      },
      {
        type: 'entry',
        prompt: '**31. marts.** Barista saņem algu 1 500 € no bankas konta.',
        amount: 1500, d: 'alga', k: 'banka', cf: 'P', memo: 'Izmaksāta alga',
        explain: 'Algu izmaksas ↑ → debets. Nauda ↓ → kredīts. Dzīvē vēl jāaprēķina nodokļi, bet šeit tos izlaižam.',
      },
      {
        type: 'entry',
        prompt: '**31. marts.** Kafejnīca samaksā piegādātājam 700 € no 1 200 € rēķina.',
        amount: 700, d: 'piegad', k: 'banka', cf: 'P', memo: 'Samaksāts piegādātājam',
        hint: 'Parāds samazinās. Kurā pusē samazinās saistības?',
        explain: 'Parāds piegādātājam ↓ → debets. Nauda ↓ → kredīts. Vēl jāsamaksā 500 €.',
      },
      {
        type: 'number',
        prompt: 'Cik liela ir kafejnīcas marta peļņa?',
        visual: (ctx) => V.ledgerPnl(ctx.ledger, { hide: true, title: 'Kafejnīca «Pupa», marts' }),
        answer: 2100,
        hint: 'Ieņēmumi mīnus visas izmaksas.',
        wrong: [{ v: 4500, msg: 'Tie ir tikai ieņēmumi. No tiem jāatņem izmaksas.' }],
        explain: '4 500 − 900 − 1 500 = 2 100 €. Šī peļņa palielina pašu kapitālu.',
      },
      {
        type: 'info',
        kicker: 'Virsgrāmata',
        title: 'Marta bilance',
        body: 'Peļņa ir pievienota pašu kapitālam, un abas puses sakrīt līdz centam. Tikko tapa tava pirmā bilance.',
        visual: (ctx) => V.ledgerBilance(ctx.ledger, { date: '31.03.' }),
      },
      {
        type: 'number',
        prompt: 'Trešais pārskats. Cik liela bija kafejnīcas marta **pamatdarbības** naudas plūsma?',
        visual: (ctx) => V.ledgerCash(ctx.ledger, 'banka', { hide: 'P', title: 'Naudas plūsmas pārskats, marts' }),
        answer: 2300,
        hint: 'Saskaiti pamatdarbības rindas: klientu maksājumus, algu un samaksu piegādātājam.',
        wrong: [{ v: 2100, msg: 'Tā ir peļņa. Naudas plūsmā skaita tikai to, kas tiešām ienāca bankas kontā un izgāja no tā.' }],
        explain: '4 500 − 1 500 − 700 = 2 300 €. Peļņa bija 2 100 €. Starpība: piegādātājam vēl nav samaksāti 500 € (+500), bet krājumos palikuši 300 € (−300).',
      },
      {
        type: 'info',
        kicker: 'Virsgrāmata',
        title: 'Trīs pārskati, viens stāsts',
        body: 'Naudas plūsmas pārskata beigu atlikums sakrīt ar naudu bilancē. Tagad kafejnīcai ir visi trīs pārskati: bilance, peļņas vai zaudējumu aprēķins un naudas plūsmas pārskats.',
        visual: (ctx) => V.ledgerCash(ctx.ledger, 'banka', { check: true, title: 'Naudas plūsmas pārskats, marts' }),
      },
    ],
  };

  /* =====================================================================
   * Vārdnīca
   * ===================================================================== */

  const glossary = [
    { t: 'Aktīvi', d: 'Resursi, ko uzņēmums kontrolē un no kuriem sagaida ekonomisku labumu nākotnē: nauda, krājumi, iekārtas, klientu parādi.' },
    { t: 'Apgrozāmie līdzekļi', d: 'Aktīvi, kas apgrozās gada laikā: krājumi, debitori, nauda.' },
    { t: 'Apgrozījums (kontā)', d: 'Visu vienas konta puses ierakstu summa periodā: debeta apgrozījums vai kredīta apgrozījums.' },
    { t: 'Atlikums', d: 'Starpība starp konta debeta un kredīta pusi. Sākuma atlikums (SA) ir perioda sākumā, beigu atlikums (BA) ir perioda beigās.' },
    { t: 'Attaisnojuma dokuments', d: 'Dokuments, kas apliecina saimnieciskā darījuma faktu: rēķins, čeks, līgums, pavadzīme.' },
    { t: 'Bilance', d: 'Pārskats par uzņēmuma aktīvu un pasīvu stāvokli konkrētā datumā. Aktīva un pasīva kopsummas vienmēr sakrīt.' },
    { t: 'Būtiskuma princips', d: 'Nenozīmīgas summas drīkst uzskaitīt vienkāršotā veidā, ja tas neizkropļo pārskatu.' },
    { t: 'Darbības turpināšanas princips', d: 'Pieņēmums, ka uzņēmums strādās arī turpmāk un netiks likvidēts.' },
    { t: 'Debets (D)', d: 'Konta kreisā puse. Aktīvu un izdevumu kontos palielinājumu raksta debetā.' },
    { t: 'Debitori', d: 'Citu personu parādi uzņēmumam, piemēram, pircēju neapmaksātie rēķini. Tie ir aktīvi.' },
    { t: 'Divkāršais ieraksts', d: 'Metode, kurā katru darījumu ieraksta vismaz divos kontos ar vienādu debeta un kredīta summu.' },
    { t: 'Grāmatojums (kontējums)', d: 'Ieraksts, kas norāda debetējamo kontu, kreditējamo kontu un summu. Piemēram: D Kase / K Ieņēmumi 300 €.' },
    { t: 'Ieņēmumi', d: 'Ekonomiskā labuma pieaugums periodā, piemēram, no preču vai pakalpojumu pārdošanas. Tie palielina pašu kapitālu.' },
    { t: 'Ilgtermiņa ieguldījumi', d: 'Aktīvi, ko izmanto ilgāk par gadu: pamatlīdzekļi, nemateriālie ieguldījumi, ilgtermiņa finanšu ieguldījumi.' },
    { t: 'Izdevumi (izmaksas)', d: 'Ekonomiskā labuma samazinājums periodā, piemēram, algas, noma, izejvielas. Tie samazina pašu kapitālu.' },
    { t: 'Konsekvences princips', d: 'Uzskaites un novērtēšanas metodes gadu no gada paliek nemainīgas, lai pārskatus varētu salīdzināt.' },
    { t: 'Konts', d: 'Uzskaites vienība, kurā reģistrē viena posteņa izmaiņas. Parasti attēlo kā T-kontu.' },
    { t: 'Kontu plāns', d: 'Uzņēmuma izmantoto kontu saraksts ar numuriem. Latvijā tipiski: 1 — ilgtermiņa ieguldījumi, 2 — apgrozāmie līdzekļi, 3 — pašu kapitāls, 4 — uzkrājumi, 5 — kreditori.' },
    { t: 'Kredīts (K)', d: 'Konta labā puse. Saistību, pašu kapitāla un ieņēmumu kontos palielinājumu raksta kredītā.' },
    { t: 'Kreditori', d: 'Uzņēmuma parādi citiem: piegādātājiem, bankai, darbiniekiem, valstij.' },
    { t: 'Krājumi', d: 'Izejvielas, materiāli un preces, kas paredzēti ražošanai vai pārdošanai.' },
    { t: 'Nesadalītā peļņa', d: 'Iepriekšējo periodu peļņa, kas nav izmaksāta īpašniekiem kā dividendes. Daļa no pašu kapitāla.' },
    { t: 'Nolietojums', d: 'Pamatlīdzekļa vērtības sadalījums pa tā lietošanas laiku. Lineāri: (iegādes vērtība − atlikusī vērtība) ÷ lietošanas laiks.' },
    { t: 'Pamatkapitāls', d: 'Īpašnieku ieguldījums uzņēmumā, kas noteikts statūtos. Daļa no pašu kapitāla.' },
    { t: 'Pamatlīdzekļi', d: 'Materiālie aktīvi, ko izmanto ilgāk par gadu: iekārtas, mēbeles, transportlīdzekļi, ēkas.' },
    { t: 'Pasīvs', d: 'Bilances labā puse, kas parāda aktīvu finansējuma avotus: pašu kapitāls, uzkrājumi un kreditori.' },
    { t: 'Pašu kapitāls', d: 'Īpašniekiem piederošā aktīvu daļa: aktīvi mīnus saistības. Ietver pamatkapitālu un nesadalīto peļņu.' },
    { t: 'Peļņas vai zaudējumu aprēķins', d: 'Pārskats par ieņēmumiem, izdevumiem un darbības rezultātu periodā.' },
    { t: 'Piesardzības princips', d: 'Peļņu atzīst tikai tad, kad tā gūta, bet paredzamās saistības un iespējamos zaudējumus ņem vērā jau tagad.' },
    { t: 'Saimnieciskais darījums', d: 'Notikums, kas maina uzņēmuma aktīvus, saistības vai pašu kapitālu un ko var izteikt naudā.' },
    { t: 'Saistības', d: 'Uzņēmuma pienākums nodot resursus citiem: atmaksāt aizņēmumu, samaksāt piegādātājam, izmaksāt algu.' },
    { t: 'Saturs pār formu', d: 'Darījumu uzskaita pēc tā ekonomiskās būtības, nevis pēc juridiskās formas vai nosaukuma.' },
    { t: 'T-konts', d: 'Konta attēlojums burta T formā: debets pa kreisi, kredīts pa labi.' },
    { t: 'Uzkrājumi', d: 'Paredzamās saistības, kuru summa vai termiņš vēl nav precīzi zināms, piemēram, iespējamais tiesvedības zaudējums.' },
    { t: 'Uzkrāšanas princips', d: 'Ieņēmumus un izdevumus atzīst periodā, uz kuru tie attiecas, neatkarīgi no naudas saņemšanas vai samaksas brīža.' },
    { t: 'Virsgrāmata', d: 'Visu uzņēmuma kontu kopums ar to ierakstiem un atlikumiem. No tās sastāda pārskatus.' },
    { t: 'PVN (pievienotās vērtības nodoklis)', d: 'Patēriņa nodoklis, ko pievieno preču un pakalpojumu cenai. Uzņēmums to iekasē no pircēja un nodod valstij. Latvijā standarta likme ir 21 %.' },
    { t: 'Aprēķinātais PVN', d: 'PVN, ko uzņēmums iekasē, pārdodot preces vai pakalpojumus. Līdz samaksai tas ir uzņēmuma parāds valstij.' },
    { t: 'Priekšnodoklis', d: 'PVN, ko uzņēmums samaksājis piegādātājiem. PVN maksātājs to atskaita no aprēķinātā PVN.' },
    { t: 'PVN maksātājs', d: 'Uzņēmums, kas reģistrēts VID PVN maksātāju reģistrā. Reģistrācija ir obligāta, kad apgrozījums pārsniedz likumā noteikto slieksni. Reģistrēties var arī brīvprātīgi.' },
    { t: 'PVN deklarācija', d: 'Pārskats, ko par katru taksācijas periodu iesniedz VID. Tajā norāda aprēķināto PVN, priekšnodokli un maksājamo vai atmaksājamo summu.' },
    { t: 'Naudas plūsmas pārskats', d: 'Pārskats par naudas ienākšanu un izmaksām periodā, sadalīts pamatdarbībā, ieguldīšanas darbībā un finansēšanas darbībā.' },
    { t: 'Pamatdarbības naudas plūsma', d: 'Nauda no ikdienas darba: klientu maksājumi mīnus maksājumi piegādātājiem, darbiniekiem, par nomu un nodokļiem.' },
    { t: 'Ieguldīšanas darbības naudas plūsma', d: 'Maksājumi par ilgtermiņa aktīvu iegādi un nauda, kas saņemta, tos pārdodot.' },
    { t: 'Finansēšanas darbības naudas plūsma', d: 'Nauda no īpašniekiem un aizdevējiem un atpakaļ: pamatkapitāls, aizņēmumi, to atmaksa, dividendes.' },
    { t: 'Tiešā un netiešā metode', d: 'Divi veidi, kā aprēķināt pamatdarbības naudas plūsmu: saskaitot visus maksājumus (tiešā) vai koriģējot peļņu par posteņiem bez naudas kustības (netiešā).' },
  ];

  const order = units.flatMap((u) => u.lessons);
  order.forEach((id) => (lessons[id].id = id));

  window.COURSE = { accounts, units, lessons, order, glossary };
})();
