#!/usr/bin/env python3
"""Uzzīmē mūzikas video dziesmai "Mākslīgais intelekts Latvijā".

Python zīmē fonu (nakts debesis, neironu tīkls, kas pulsē ar bungām, Rīgas
siluets un Daugava ar atspulgu), FFmpeg pievieno skaņas viļņa vizualizāciju
upē, karaoke tekstu (ASS) un audio. Vispirms jāpalaiž song.py.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, FPS = 1280, 720, 30
HORIZON = 600
STRIPE = 12  # karoga josla apakšā
HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
OUT = HERE / "out"
rng = np.random.default_rng(18)

CARMINE = (158, 48, 57)
PALETTE = {  # tīkla krāsa katrai daļai
    "intro": (110, 190, 255), "verse": (110, 190, 255), "chorus": (255, 95, 110),
    "bridge": (255, 170, 60), "outro": (110, 190, 255),
}


# --- Statiskie slāņi -------------------------------------------------------

def sky():
    y = np.linspace(0, 1, HORIZON)[:, None]
    top, low = np.array([8, 10, 26]), np.array([46, 16, 36])
    grad = (top + (low - top) * y ** 1.6)[:, None, :].repeat(W, axis=1)
    img = np.zeros((H, W, 3))
    img[:HORIZON] = grad
    img[HORIZON:] = (10, 8, 20)
    for _ in range(140):  # zvaigznes
        x, yy = rng.integers(0, W), int(rng.integers(0, HORIZON - 160) * rng.random())
        img[yy, x] = np.minimum(img[yy, x] + rng.integers(60, 200), 255)
    return Image.fromarray(img.astype(np.uint8)).convert("RGBA")


def riga_skyline():
    """Rīgas siluets: Gaismas pils, Vanšu tilts, Doms, Jēkaba un Pētera baznīcas,
    Zinātņu akadēmija, Saules akmens un Zaķusalas TV tornis."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink = (6, 6, 14, 255)
    hy = HORIZON
    # zema apbūve visā platumā
    x = 0
    while x < W:
        w = int(rng.integers(26, 60))
        top = hy - int(rng.integers(10, 38))
        d.rectangle([x, top, x + w, hy], fill=ink)
        if rng.random() < 0.5:  # divslīpju jumts
            d.polygon([(x, top), (x + w // 2, top - int(rng.integers(6, 16))), (x + w, top)], fill=ink)
        x += w
    # Gaismas pils
    d.polygon([(40, hy), (90, 575), (130, 540), (170, 490), (185, 468), (200, 468),
               (215, 495), (240, 535), (265, 568), (285, hy)], fill=ink)
    # Vanšu tilts
    d.rectangle([292, 512, 298, hy], fill=ink)
    d.rectangle([285, 586, 430, 590], fill=ink)
    for k in range(1, 7):
        d.line([(295, 516 + k * 3), (295 + k * 20, 588)], fill=ink, width=1)
        d.line([(295, 516 + k * 3), (295 - k * 9, 588)], fill=ink, width=1)
    # Doms
    d.rectangle([452, 520, 486, hy], fill=ink)
    d.ellipse([449, 494, 489, 530], fill=ink)
    d.rectangle([462, 470, 476, 500], fill=ink)
    d.polygon([(462, 470), (469, 445), (476, 470)], fill=ink)
    d.rectangle([400, 560, 560, hy], fill=ink)
    d.polygon([(400, 560), (480, 540), (560, 560)], fill=ink)
    # Jēkaba baznīca
    d.rectangle([536, 535, 554, hy], fill=ink)
    d.polygon([(534, 536), (545, 470), (556, 536)], fill=ink)
    # Pētera baznīca
    d.rectangle([600, 565, 700, hy], fill=ink)
    d.polygon([(600, 565), (650, 545), (700, 565)], fill=ink)
    d.rectangle([622, 520, 658, hy], fill=ink)
    d.rectangle([628, 496, 652, 522], fill=ink)
    d.ellipse([626, 486, 654, 504], fill=ink)
    d.rectangle([633, 468, 647, 492], fill=ink)
    d.ellipse([631, 460, 649, 474], fill=ink)
    d.rectangle([636, 440, 644, 464], fill=ink)
    d.polygon([(635, 442), (640, 392), (645, 442)], fill=ink)
    d.line([(640, 392), (640, 382)], fill=ink, width=2)
    d.polygon([(637, 384), (645, 381), (641, 386)], fill=ink)  # gailis
    # Zinātņu akadēmija
    d.rectangle([880, 545, 1010, hy], fill=ink)
    d.rectangle([900, 505, 990, 545], fill=ink)
    d.rectangle([915, 472, 975, 505], fill=ink)
    d.rectangle([930, 446, 960, 472], fill=ink)
    d.polygon([(932, 446), (945, 405), (958, 446)], fill=ink)
    d.line([(945, 405), (945, 392)], fill=ink, width=2)
    # Saules akmens
    d.polygon([(1035, hy), (1035, 500), (1080, 522), (1080, hy)], fill=ink)
    # Zaķusalas TV tornis
    d.polygon([(1140, hy), (1172, 450), (1178, 450), (1150, hy)], fill=ink)
    d.polygon([(1205, hy), (1178, 450), (1172, 450), (1195, hy)], fill=ink)
    d.polygon([(1170, hy), (1173, 450), (1177, 450), (1180, hy)], fill=ink)
    d.rectangle([1171, 330, 1179, 452], fill=ink)
    d.rectangle([1162, 384, 1188, 398], fill=ink)
    d.rectangle([1166, 420, 1184, 428], fill=ink)
    d.line([(1175, 330), (1175, 255)], fill=ink, width=3)
    # logi
    for _ in range(170):
        x, y = int(rng.integers(0, W)), int(rng.integers(hy - 45, hy - 4))
        if img.getpixel((x, y))[3] and img.getpixel((x + 2, y + 3))[3]:
            d.rectangle([x, y, x + 2, y + 3], fill=(255, 205, 120, int(rng.integers(90, 200))))
    return img


def river(skyline):
    """Daugava: saspiests, iekrāsots, viļņots siluets kā atspulgs."""
    ref = skyline.crop((0, HORIZON - 260, W, HORIZON)).transpose(Image.FLIP_TOP_BOTTOM)
    ref = ref.resize((W, 110))
    a = np.array(ref).astype(float)
    a[..., :3] = a[..., :3] * 0.3 + np.array(CARMINE) * 0.15
    a[..., 3] *= np.linspace(0.55, 0.0, 110)[:, None]
    for y in range(0, 110, 3):  # viļņu nobīde
        a[y] = np.roll(a[y], int(3 * np.sin(y * 0.7)), axis=0)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(Image.fromarray(a.astype(np.uint8)), (0, HORIZON))
    d = ImageDraw.Draw(layer)
    s = STRIPE  # Latvijas karogs 2:1:2
    d.rectangle([0, H - s, W, H], fill=CARMINE + (255,))
    d.rectangle([0, H - s + 5, W, H - s + 6], fill=(255, 255, 255, 255))
    return layer


# --- Neironu tīkls ---------------------------------------------------------

class Network:
    def __init__(self, n=52):
        self.base = np.column_stack([rng.uniform(20, W - 20, n), rng.uniform(40, HORIZON - 70, n)])
        self.amp = rng.uniform(10, 32, (n, 2))
        self.freq = rng.uniform(0.04, 0.16, (n, 2))
        self.phase = rng.uniform(0, 2 * np.pi, (n, 2))
        self.pulses = []  # (no, uz, sākuma laiks)

    def positions(self, t):
        return self.base + self.amp * np.sin(2 * np.pi * self.freq * t + self.phase)

    def draw(self, img, t, color, energy, beat, fade):
        p = self.positions(t)
        diff = p[:, None, :] - p[None, :, :]
        dist = np.hypot(diff[..., 0], diff[..., 1])
        reach = 175 + 40 * energy
        d = ImageDraw.Draw(img, "RGBA")
        ii, jj = np.where(np.triu(dist < reach, 1))
        bright = (0.25 + 0.75 * beat) * fade
        for i, j in zip(ii, jj):
            a = int(255 * bright * 0.55 * (1 - dist[i, j] / reach))
            d.line([tuple(p[i]), tuple(p[j])], fill=color + (a,), width=1)
        for k, (x, y) in enumerate(p):
            r = 2.2 + 2.5 * beat * (0.5 + 0.5 * np.sin(k * 1.7))
            d.ellipse([x - r * 3, y - r * 3, x + r * 3, y + r * 3], fill=color + (int(40 * fade * (0.3 + beat)),))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(220 * fade)))
        # datu impulsi pa savienojumiem
        alive = []
        for i, j, t0 in self.pulses:
            u = (t - t0) / 0.45
            if 0 <= u <= 1 and dist[i, j] < reach * 1.2:
                x, y = p[i] + (p[j] - p[i]) * u
                d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255, int(230 * fade)))
                alive.append((i, j, t0))
        self.pulses = alive
        return ii, jj

    def spawn(self, t, edges, count):
        ii, jj = edges
        if len(ii):
            for e in rng.choice(len(ii), size=min(count, len(ii)), replace=False):
                i, j = (ii[e], jj[e]) if rng.random() < 0.5 else (jj[e], ii[e])
                self.pulses.append((i, j, t))


def scrim():
    """Mīksts tumšs fons aiz teksta, lai tīkls netraucē lasīt."""
    y, x = np.mgrid[0:H, 0:W]
    r = ((x - W / 2) / 620) ** 2 + ((y - 335) / 95) ** 2
    a = np.clip(1.15 - r, 0, 1) ** 1.5 * 175
    img = np.zeros((H, W, 4), np.uint8)
    img[..., :3] = (6, 6, 16)
    img[..., 3] = a.astype(np.uint8)
    return Image.fromarray(img)


def mix(c1, c2, u):
    return tuple(int(a + (b - a) * u) for a, b in zip(c1, c2))


# --- ASS subtitri ----------------------------------------------------------

def ts(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def write_ass(tl, path):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Lyric,DejaVu Sans,50,&H00FFFFFF,&H00B8A49A,&H00200A14,&H96000000,-1,0,0,0,100,100,0,0,1,3,2,5,40,40,0,1
Style: Next,DejaVu Sans,32,&H50D8CCC4,&H50D8CCC4,&H00200A14,&H96000000,0,0,0,0,100,100,0,0,1,2,1,5,40,40,0,1
Style: Title,DejaVu Sans,66,&H00FFFFFF,&H00FFFFFF,&H0039309E,&H96000000,-1,0,0,0,100,100,1,0,1,4,3,5,40,40,0,1
Style: Sub,DejaVu Sans,26,&H00E8E0DC,&H00E8E0DC,&H00200A14,&H96000000,0,0,0,0,100,100,1,0,1,2,1,5,40,40,0,1
Style: Corner,DejaVu Sans,18,&H60FFFFFF,&H60FFFFFF,&H00200A14,&H96000000,-1,0,0,0,100,100,4,0,1,1,0,7,30,30,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    lead = 0.6
    lines = tl["lines"]
    secs = {s["id"]: s for s in tl["sections"]}
    intro, outro = secs["intro"], secs["outro"]

    for i, ln in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        joined = nxt is not None and abs(nxt["start"] - ln["end"]) < 0.01
        start = ln["start"] - lead
        end = nxt["start"] - lead if joined else ln["end"] + 0.3
        # karaoke: kumulatīvi noapaļoti centisekundes, lai nekrājas nobīde
        parts, prev_cs = [], 0
        bounds = [w["start"] for w in ln["words"]] + [ln["words"][-1]["end"]]
        lead_cs = round((bounds[0] - start) * 100)
        parts.append(f"{{\\k{lead_cs}}}")
        prev_cs = lead_cs
        for k, w in enumerate(ln["words"]):
            cs = round((bounds[k + 1] - start) * 100)
            parts.append(f"{{\\kf{cs - prev_cs}}}{w['text']} ")
            prev_cs = cs
        fade_in = 200 if not (i and abs(ln["start"] - lines[i - 1]["end"]) < 0.01) else 120
        ev.append(f"Dialogue: 1,{ts(start)},{ts(end)},Lyric,,0,0,0,,"
                  f"{{\\pos({W // 2},318)\\fad({fade_in},150)\\blur0.6}}" + "".join(parts).rstrip())
        if joined:
            ev.append(f"Dialogue: 0,{ts(start)},{ts(end)},Next,,0,0,0,,"
                      f"{{\\pos({W // 2},384)\\fad(250,100)}}{nxt['text']}")

    title = "Mākslīgais intelekts Latvijā"
    t_end = intro["end"] - lead - 0.1
    ev.append(f"Dialogue: 2,{ts(0.4)},{ts(t_end)},Title,,0,0,0,,{{\\pos({W // 2},290)\\fad(900,500)}}{title}")
    ev.append(f"Dialogue: 2,{ts(1.4)},{ts(t_end)},Sub,,0,0,0,,{{\\pos({W // 2},360)\\fad(900,500)}}"
              "elektronisks sintpops  ·  teksts, mūzika un video radīti ar kodu")
    ev.append(f"Dialogue: 2,{ts(intro['end'] - 0.2)},{ts(outro['start'] + 0.5)},Corner,,0,0,0,,"
              f"{{\\pos(30,22)\\fad(600,600)}}{title.upper()}")
    for s in tl["sections"]:
        if s["kind"] in ("verse", "chorus", "bridge"):
            ev.append(f"Dialogue: 2,{ts(s['start'] - 0.2)},{ts(s['start'] + 3.5)},Corner,,0,0,0,,"
                      f"{{\\an9\\pos({W - 30},22)\\fad(400,700)}}{s['label'].upper()}")
    o0 = outro["start"] + 0.8
    ev.append(f"Dialogue: 2,{ts(o0)},{ts(tl['duration'])},Title,,0,0,0,,{{\\pos({W // 2},290)\\fad(1000,800)}}{title}")
    ev.append(f"Dialogue: 2,{ts(o0 + 1.0)},{ts(tl['duration'])},Sub,,0,0,0,,{{\\pos({W // 2},360)\\fad(1000,800)}}"
              "Teksts, mūzika un video: Claude Code  ·  Python · NumPy · FFmpeg")
    if tl.get("voice_credit"):
        ev.append(f"Dialogue: 2,{ts(o0 + 1.5)},{ts(tl['duration'])},Sub,,0,0,0,,"
                  f"{{\\pos({W // 2},400)\\fad(1000,800)}}Balss: {tl['voice_credit']}")
    path.write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


# --- Renderēšana -----------------------------------------------------------

def section_at(tl, t):
    for s in tl["sections"]:
        if s["start"] <= t < s["end"]:
            return s
    return tl["sections"][-1]


def render():
    tl = json.loads((BUILD / "timeline.json").read_text())
    ass = BUILD / "lyrics.ass"
    write_ass(tl, ass)
    OUT.mkdir(exist_ok=True)
    out = OUT / "maksligais-intelekts-latvija.mp4"

    bg = sky()
    skyline = riga_skyline()
    glow = skyline.filter(ImageFilter.GaussianBlur(6))  # gaisma ap siluetu
    front = Image.alpha_composite(glow.point(lambda v: v // 3 if v else 0), skyline)
    front = Image.alpha_composite(front, river(skyline))
    front = Image.alpha_composite(scrim(), front)
    net = Network()
    kicks = np.array(tl["kicks"])
    dur = tl["duration"]
    frames = int(np.ceil(dur * FPS))
    bar = 4 * 60 / tl["bpm"]

    ff = subprocess.Popen([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", str(BUILD / "song.wav"),
        "-filter_complex",
        f"[1:a]showwaves=s={W}x70:mode=cline:rate={FPS}:scale=sqrt:colors=0xFFD6E0@0.45,format=rgba[w];"
        f"[0:v][w]overlay=0:{HORIZON + 22}[v1];"
        f"[v1]ass={ass}:fontsdir=/usr/share/fonts/truetype/dejavu,"
        f"fade=t=in:st=0:d=1,fade=t=out:st={dur - 2:.2f}:d=2[v]",
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "27", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(out),
    ], stdin=subprocess.PIPE)

    last_kick = -1
    for f in range(frames):
        t = f / FPS
        s = section_at(tl, t)
        # krāsa pāriet no iepriekšējās daļas krāsas viena takta laikā
        idx = tl["sections"].index(s)
        prev = tl["sections"][idx - 1]["kind"] if idx else s["kind"]
        u = min((t - s["start"]) / bar, 1.0)
        color = mix(PALETTE[prev], PALETTE[s["kind"]], u)
        k = np.searchsorted(kicks, t, side="right") - 1
        beat = float(np.exp(-(t - kicks[k]) / 0.18)) if k >= 0 else 0.0
        energy = {"intro": 0.2, "verse": 0.5, "chorus": 1.0, "bridge": 0.6, "outro": 0.3}[s["kind"]]
        fade = min(t / 4, 1.0)
        if s["kind"] == "intro":
            beat = 0.25 + 0.2 * np.sin(2 * np.pi * t / bar * 2) ** 2

        img = bg.copy()
        edges = net.draw(img, t, color, energy, beat * (0.6 + 0.4 * energy), fade)
        if k > last_kick and k >= 0:
            net.spawn(t, edges, 3 if s["kind"] == "chorus" else 1)
            last_kick = k
        img.alpha_composite(front)
        ff.stdin.write(img.convert("RGB").tobytes())
        if f % 300 == 0:
            print(f"kadrs {f}/{frames}", flush=True)
    ff.stdin.close()
    if ff.wait():
        raise SystemExit("ffmpeg kļūda")
    print(f"gatavs: {out}")


if __name__ == "__main__":
    render()
