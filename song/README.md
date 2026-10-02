# Mākslīgais intelekts Latvijā

Dziesma ar mūzikas video, kas pilnībā radīta ar kodu, bez ierakstiem vai gatavām skaņām.

- `out/maksligais-intelekts-latvija.mp4`: mūzikas video (1280×720, karaoke teksts)
- `out/maksligais-intelekts-latvija.mp3`: dziesma
- `lyrics.md`: dziesmas teksts un akordi

## Kā tas uzbūvēts

- **`song.py`** sintezē visu audio ar NumPy: bungas, basu, pad, arpedžo un melodiju.
  Vokāla vietā melodiju spēlē sintezators, kas katrai zilbei izmanto tās patskaņa
  formantus (a, e, i, o, u), tāpēc tas zilbēs "dzied" tekstu. Dziesmas teksts un notis
  glabājas vienā vietā, un skripts pārbauda, ka zilbju skaits sakrīt ar nošu skaitu.
- **`video.py`** zīmē nakts Rīgas siluetu, Daugavu ar atspulgu un neironu tīklu, kas
  pulsē ar bungām un maina krāsu pa daļām (pants zils, piedziedājums karmīnsarkans,
  tilts kā Jāņu uguns). FFmpeg pievieno skaņas viļņu upē un karaoke tekstu.

## Atkārtota uzbūve

```sh
pip install numpy pillow   # vajadzīgs arī ffmpeg ar libass un libx264
python3 song.py            # build/song.wav, build/timeline.json
python3 video.py           # out/maksligais-intelekts-latvija.mp4
```
