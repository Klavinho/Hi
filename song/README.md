# Mākslīgais intelekts Latvijā

Dziesma ar mūzikas video, kas pilnībā radīta ar kodu, bez ierakstiem vai gatavām skaņām.

- `out/maksligais-intelekts-latvija.mp4`: mūzikas video (1280×720, karaoke teksts)
- `out/maksligais-intelekts-latvija.mp3`: dziesma
- `lyrics.md`: dziesmas teksts un akordi

## Kā tas uzbūvēts

- **`song.py`** sintezē visu audio ar NumPy: bungas, basu, pad, arpedžo un melodiju.
  Melodiju spēlē sintezators, kas katrai zilbei izmanto tās patskaņa formantus
  (a, e, i, o, u). Dziesmas teksts un notis glabājas vienā vietā, un skripts pārbauda,
  ka zilbju skaits sakrīt ar nošu skaitu. Ja ir `build/vocals.wav`, tas tiek iemiksēts
  kā galvenais vokāls, un sintezatora melodija paliek klusi fonā.
- **`vocals.py`** pārvērš ierunātas rindas dziedājumā:
  1. espeak-ng ierunā to pašu rindu un dod precīzus fonēmu laikus;
     DTW pēc MFCC pazīmēm salīdzina to ar ierakstu (kā *aeneas* izlīdzinātājā);
  2. pēc šīs vadlīnijas un enerģijas ielejām runu sadala zilbēs;
  3. WORLD vokoders (`pyworld`) izstiepj patskaņus līdz nošu garumam (līdzskaņi
     paliek dabiski), nomaina balss augstumu uz melodiju ar nelielu ieslīdi un vibrato.

  Zilbju dalīšana pārbaudīta pret espeak-ng fonēmu laikiem sešām dažādām balsīm un
  runas ātrumiem: 97–100 % zilbju trāpa pareizajā vietā.
- **`video.py`** zīmē nakts Rīgas siluetu, Daugavu ar atspulgu un neironu tīklu, kas
  pulsē ar bungām un maina krāsu pa daļām (pants zils, piedziedājums karmīnsarkans,
  tilts kā Jāņu uguns). FFmpeg pievieno skaņas viļņu upē un karaoke tekstu.

## Atkārtota uzbūve

```sh
apt-get install espeak-ng ffmpeg   # ffmpeg ar libass un libx264
pip install numpy pillow pyworld numba

python3 vocals.py                  # vocals/raw/01…14.* → build/vocals.wav
python3 song.py                    # build/song.wav, build/timeline.json
python3 video.py                   # out/maksligais-intelekts-latvija.mp4
```

`vocals.py` sagaida 14 runas failus `vocals/raw/01.*` … `14.*` (jebkurš ffmpeg formāts),
pa vienai rindai katrā, secībā kā `lyrics.md`; piedziedājums tiek izmantots atkārtoti.
Testēšanai var palaist `python3 vocals.py --espeak`, kas izmanto espeak-ng pagaidu balsi.
Bez `build/vocals.wav` dziesma tiek uzbūvēta tikai ar sintezatora melodiju.
