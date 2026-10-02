#!/usr/bin/env python3
"""Sintezē dziesmu "Mākslīgais intelekts Latvijā".

Izveido build/song.wav (audio) un build/timeline.json (sitienu, daļu un
teksta laiki, ko izmanto video.py). Vokāla vietā melodiju spēlē sintezators
ar katras zilbes patskaņa formantiem, tāpēc tas "dzied" a, e, i, o, u.
"""
import json
import re
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 112
BEAT = 60 / BPM
EIGHTH = BEAT / 2
BAR = 4 * BEAT
TAIL = 2.5  # sekundes reverberācijas astei pēc pēdējā takta
VOCAL_DB = -15.0  # vokāla skaļums (RMS dziedātajās vietās), dBFS
VOCAL_GAIN = 1.0

BUILD = Path(__file__).resolve().parent / "build"
rng = np.random.default_rng(2026)

# --- Harmonija -------------------------------------------------------------

CHORDS = {  # pad balsis (MIDI)
    "Am": [57, 60, 64],
    "F": [57, 60, 65],
    "C": [55, 60, 64],
    "G": [55, 59, 62],
    "Dm": [57, 62, 65],
}
BASS_ROOT = {"Am": 45, "F": 41, "C": 48, "G": 43, "Dm": 50}

VERSE = ["Am", "F", "C", "G"] * 2
CHORUS = ["F", "C", "G", "Am"] * 2
SECTIONS = [
    ("intro", "Ievads", ["Am", "F", "C", "G"]),
    ("verse1", "1. pants", VERSE),
    ("chorus1", "Piedziedājums", CHORUS),
    ("verse2", "2. pants", VERSE),
    ("chorus2", "Piedziedājums", CHORUS),
    ("bridge", "Tilts", ["Dm", "Am", "F", "G"]),
    ("chorus3", "Piedziedājums", CHORUS),
    ("outro", "Nobeigums", ["Am", "F", "G", "Am"]),
]

# --- Teksts un melodija ----------------------------------------------------
# Katrai zilbei viena nots "Nots:ilgums", ilgums astotdaļās. Rinda = 2 takti.

CHORUS_LINES = [
    ("Mākslīgais intelekts Latvijā,",
     "C5:1 C5:1 A4:2 G4:1 A4:1 C5:2 E5:1 D5:1 C5:5"),
    ("Runā ar mums mūsu valodā,",
     "D5:1 D5:1 B4:2 G4:1 A4:1 B4:2 C5:1 B4:1 A4:5"),
    ("Zem ziemeļu zvaigznēm, jaunā laikmetā —",
     "A4:1 A4:1 C5:1 A4:1 C5:1 E5:2 D5:1 C5:1 D5:1 D5:1 E5:4"),
    ("Mākslīgais intelekts Latvijā!",
     "C5:1 C5:1 B4:2 G4:1 A4:1 B4:2 C5:1 B4:1 A4:5"),
]
LYRICS = {
    "verse1": [
        ("Pār Daugavu aust rīts, serveri dūc,",
         "E4:1 A4:1 A4:1 A4:1 C5:2 B4:2 A4:1 A4:1 G4:1 A4:4"),
        ("No Rīgas līdz jūrai dati kā upe plūst.",
         "G4:1 C5:1 C5:1 C5:1 E5:1 D5:1 C5:1 G4:1 G4:1 A4:1 B4:1 G4:4"),
        ("Es jautāju latviski — atbild man tā,",
         "E4:1 A4:1 A4:1 A4:1 C5:1 B4:1 A4:2 A4:1 C5:1 C5:1 A4:4"),
        ("Ka katra garumzīme ir savā vietā.",
         "G4:1 C5:1 C5:1 C5:1 E5:1 D5:1 C5:1 B4:1 A4:1 B4:1 C5:1 D5:4"),
    ],
    "verse2": [
        ("Barona dainas tagad mākonī mīt,",
         "E4:1 A4:1 A4:1 A4:1 C5:1 B4:1 A4:2 G4:1 A4:1 A4:1 C5:4"),
        ("Skolēns no Valmieras kodē līdz rīt'.",
         "G4:1 C5:1 C5:1 C5:1 E5:1 D5:1 C5:1 G4:1 A4:2 B4:5"),
        ("Ne aizvietot mūs, bet palīdzēt nākt,",
         "E4:1 A4:1 A4:1 A4:1 C5:2 B4:1 A4:1 A4:1 C5:1 A4:5"),
        ("Kopā mēs varam jaunu stāstu sākt.",
         "G4:1 C5:1 C5:1 C5:1 E5:1 D5:1 C5:1 B4:1 C5:2 D5:5"),
    ],
    "chorus1": CHORUS_LINES,
    "chorus2": CHORUS_LINES,
    "chorus3": CHORUS_LINES,
    "bridge": [
        ("Jāņu naktī ugunis, ekrānos zvaigznes,",
         "A4:1 A4:1 D5:1 D5:1 F5:1 E5:1 D5:2 C5:1 C5:1 E5:1 C5:1 A4:3"),
        ("Cilvēks un mašīna — viena dziesma.",
         "A4:2 C5:1 C5:1 C5:1 F5:1 E5:2 D5:1 C5:1 B4:2 D5:3"),
    ],
}

# Latviešu zilbes kodols: divskaņi vai viens patskanis.
SYLLABLE_RE = re.compile(r"ai|au|ei|ie|ui|[aāeēiīouū]")
# Formanti F1, F2, F3 (Hz) katram patskanim.
FORMANTS = {
    "a": (800, 1200, 2500), "e": (500, 1800, 2500), "i": (300, 2300, 3000),
    "o": (500, 900, 2400), "u": (350, 800, 2300),
}
PLAIN = str.maketrans("āēīū", "aeiu")


def syllables(text):
    return SYLLABLE_RE.findall(text.lower())


def note_midi(name):
    base = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[name[0]]
    return 12 * (int(name[-1]) + 1) + base + name.count("#")


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# --- Sintēzes bloki --------------------------------------------------------

def env_adsr(n, a, d, s, r):
    """ADSR aploksne n paraugiem (laiki sekundēs, s ir līmenis)."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    nr = min(int(r * SR), n)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def additive(phase, f0, weight, fmax=6000.0):
    """Joslā ierobežots harmonisks tonis: sum weight(k, k*f0) * sin(k*phase)."""
    out = np.zeros_like(phase)
    k = 1
    while k * f0 < min(fmax, SR / 2 - 500):
        w = weight(k, k * f0)
        if w:
            out += w * np.sin(k * phase)
        k += 1
    return out


def saw_weight(roll):
    return lambda k, f: 1.0 / k ** roll


def square_weight(k, f):
    return 1.0 / k if k % 2 else 0.0


def vowel_weight(vowel):
    f1, f2, f3 = FORMANTS[vowel]

    def w(k, f):
        peaks = (1.0 + 6 * np.exp(-((f - f1) / 160) ** 2)
                 + 4 * np.exp(-((f - f2) / 220) ** 2)
                 + 1.5 * np.exp(-((f - f3) / 300) ** 2))
        return peaks / k ** 1.1
    return w


class Mixer:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def add(self, name, t, sig, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= self.n:
            return
        sig = sig[: self.n - i]
        ang = (pan + 1) * np.pi / 4
        b = self.bus(name)
        b[0, i:i + len(sig)] += sig * gain * np.cos(ang)
        b[1, i:i + len(sig)] += sig * gain * np.sin(ang)


def tone(freq, dur, weight, adsr, detune_cents=(0.0,), vibrato=0.0, fmax=6000.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for c in detune_cents:
        f = freq * 2 ** (c / 1200)
        phase = 2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)
        if vibrato:  # dziļums pustoņos, iesākas pēc ~0.2 s
            rel = (2 ** (vibrato / 12) - 1) * np.clip((t - 0.18) / 0.25, 0, 1)
            phase -= f * rel / 5.5 * np.cos(2 * np.pi * 5.5 * t)
        out += additive(phase, f, weight, fmax)
    return out / len(detune_cents) * env_adsr(n, *adsr)


def kick(n=int(0.45 * SR)):
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = rng.standard_normal(n) * np.exp(-t / 0.003) * 0.3
    return body + click


def noise_hp(n):
    return np.diff(rng.standard_normal(n + 1)) / 2


def snare(n=int(0.3 * SR)):
    t = np.arange(n) / SR
    return (noise_hp(n) * np.exp(-t / 0.11) * 0.9
            + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.6)


def hat(decay):
    n = int((decay * 6 + 0.01) * SR)
    t = np.arange(n) / SR
    return np.diff(noise_hp(n + 1)) * np.exp(-t / decay)


def crash():
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    return noise_hp(n) * np.exp(-t / 0.9)


def fft_convolve(x, h):
    n = len(x) + len(h) - 1
    size = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)
    return y[: len(x)]


def reverb(stereo, seconds=2.4, decay=0.55):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(stereo)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / decay)
        ir = np.convolve(ir, np.ones(6) / 6, mode="same")  # tumšāka aste
        ir[: int(0.02 * SR)] = 0  # pirmsaizture
        out[ch] = fft_convolve(stereo[ch], ir / np.sqrt(np.sum(ir ** 2)))
    return out


def sidechain(stereo, kicks, depth=0.55, release=0.16):
    g = np.ones(stereo.shape[1])
    for tk in kicks:
        i = int(tk * SR)
        m = min(int(0.5 * SR), len(g) - i)
        if m > 0:
            g[i:i + m] = np.minimum(g[i:i + m], 1 - depth * np.exp(-np.arange(m) / SR / release))
    return stereo * g


# --- Aranžējums ------------------------------------------------------------

def melody_lines():
    """Katra dziedātā rinda ar tās nošu laikiem dziesmā (sekundēs)."""
    out, t0 = [], 0.0
    for sid, _, chords in SECTIONS:
        for li, (text, melody) in enumerate(LYRICS.get(sid, [])):
            notes = [(n.split(":")[0], int(n.split(":")[1])) for n in melody.split()]
            syl = syllables(text)
            assert len(syl) == len(notes), f"{sid}: '{text}' {len(syl)} zilbes, {len(notes)} notis"
            assert sum(d for _, d in notes) <= 16, f"{sid}: '{text}' par garu"
            tl = t0 + li * 2 * BAR
            pos, events = 0, []
            for (name, d), v in zip(notes, syl):
                events.append({"midi": note_midi(name), "len": d, "vowel": v[0].translate(PLAIN),
                               "start": tl + pos * EIGHTH, "end": tl + (pos + d) * EIGHTH})
                pos += d
            out.append({"section": sid, "text": text, "start": tl, "end": tl + 2 * BAR,
                        "notes": events})
        t0 += len(chords) * BAR
    return out


def load_vocals():
    """build/vocals.wav no vocals.py (mono), ja tāds ir."""
    path = BUILD / "vocals.wav"
    if not path.exists():
        return None, None
    with wave.open(str(path)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        v = np.frombuffer(w.readframes(w.getnframes()), "<i2") / 32768.0
    # skaļuma normalizācija pēc dziedātajām vietām (neatkarīgi no balss avota)
    env = np.sqrt(np.convolve(v ** 2, np.ones(2205) / 2205, mode="same"))
    sung = env > 0.1 * env.max()
    v = v * 10 ** (VOCAL_DB / 20) / np.sqrt(np.mean(v[sung] ** 2))
    meta = BUILD / "vocals.json"
    credit = json.loads(meta.read_text())["credit"] if meta.exists() else None
    return v, credit


def build():
    bars = [(sid, label, ch) for sid, label, chords in SECTIONS for ch in chords]
    total = len(bars) * BAR
    mix = Mixer(total + TAIL)
    kicks, sections, lines = [], [], []
    hat_c, hat_o, kick_s, snare_s, crash_s = hat(0.025), hat(0.12), kick(), snare(), crash()

    t0 = 0.0
    for sid, label, chords in SECTIONS:
        kind = sid.rstrip("0123456789")
        sections.append({"id": sid, "kind": kind, "label": label,
                         "start": t0, "end": t0 + len(chords) * BAR})
        if kind in ("verse", "chorus", "bridge", "outro") and sid != "verse1":
            mix.add("drums", t0, crash_s, 0.22, 0.3)

        # Pad: apvieno blakus taktus ar vienu akordu
        i = 0
        while i < len(chords):
            j = i
            while j + 1 < len(chords) and chords[j + 1] == chords[i]:
                j += 1
            dur = (j - i + 1) * BAR
            pad_gain = {"intro": 0.13, "verse": 0.10, "chorus": 0.12,
                        "bridge": 0.14, "outro": 0.13}[kind]
            last = sid == "outro" and j == len(chords) - 1
            for v, m in enumerate(CHORDS[chords[i]]):
                sig = tone(hz(m), dur + (2.0 if last else 0.15), saw_weight(1.6),
                           (0.35, 1.0, 1.0, 0.5 if not last else 2.0),
                           detune_cents=(-9, 0, 9), fmax=3000)
                mix.add("pad", t0 + i * BAR, sig, pad_gain, (-0.5, 0.0, 0.5)[v])
            i = j + 1

        for b, ch in enumerate(chords):
            tb = t0 + b * BAR
            root = BASS_ROOT[ch]

            # Bungas (astotdaļu režģis)
            k_pat, s_pat, h_pat, o_pat = set(), set(), set(), set()
            if kind == "intro" and b >= 2:
                h_pat = set(range(0, 8, 2))
            elif kind == "verse":
                k_pat, s_pat, h_pat = {0, 4, 5}, {2, 6}, set(range(8))
            elif kind == "chorus":
                k_pat, s_pat, h_pat, o_pat = {0, 2, 4, 6}, {2, 6}, {0, 2, 4, 6}, {1, 3, 5, 7}
            elif kind == "bridge":
                h_pat = {0, 2, 4, 6}
                if b == 2:
                    k_pat = {0, 4}
            elif kind == "outro" and b < 2:
                k_pat, s_pat, h_pat = {0, 4}, {2, 6}, set(range(8))
            for e in k_pat:
                mix.add("drums", tb + e * EIGHTH, kick_s, 0.55)
                kicks.append(tb + e * EIGHTH)
            for e in s_pat:
                mix.add("drums", tb + e * EIGHTH, snare_s, 0.30, 0.05)
                mix.add("send", tb + e * EIGHTH, snare_s, 0.10)
            for e in h_pat:
                mix.add("drums", tb + e * EIGHTH, hat_c, 0.10 if e % 2 else 0.07, 0.35)
            for e in o_pat:
                mix.add("drums", tb + e * EIGHTH, hat_o, 0.08, 0.35)
            if kind == "bridge" and b == 3:  # virpulis pirms pēdējā piedziedājuma
                for s in range(16):
                    mix.add("drums", tb + s * BEAT / 4, snare_s, 0.08 + 0.3 * s / 15, -0.05)

            # Bass
            if kind == "verse":
                for e in range(8):
                    sig = tone(hz(root - 12), EIGHTH * 0.9, saw_weight(1.3),
                               (0.005, 0.12, 0.35, 0.03), fmax=1500)
                    mix.add("bass", tb + e * EIGHTH, sig, 0.30)
            elif kind == "chorus":
                for e in range(8):
                    m = root - 12 + (12 if e % 2 else 0)
                    sig = tone(hz(m), EIGHTH * 0.9, saw_weight(1.2),
                               (0.004, 0.10, 0.4, 0.03), fmax=1800)
                    mix.add("bass", tb + e * EIGHTH, sig, 0.30)
            elif kind == "bridge" or (kind == "outro" and b < 3):
                sig = tone(hz(root - 12), BAR, saw_weight(1.5), (0.02, 0.6, 0.6, 0.2), fmax=900)
                mix.add("bass", tb, sig, 0.30)
            elif kind == "outro":
                sig = tone(hz(root - 12), BAR + 2.0, saw_weight(1.5), (0.02, 1.0, 0.5, 2.0), fmax=900)
                mix.add("bass", tb, sig, 0.30)

            # Arpedžo (sešpadsmitdaļas)
            arp_on = (kind in ("intro", "chorus") or (kind == "verse" and sid == "verse2")
                      or (kind == "bridge" and b >= 2) or (kind == "outro" and b < 3))
            if arp_on:
                notes = sorted(CHORDS[ch])
                pattern = [0, 1, 2, 1, 2, 0, 1, 2] * 2
                gain = {"intro": 0.13, "verse": 0.07, "chorus": 0.12,
                        "bridge": 0.11, "outro": 0.11}[kind]
                for s, p in enumerate(pattern):
                    m = notes[p] + 12 + (12 if s % 8 == 7 else 0)
                    sig = tone(hz(m), BEAT / 4 * 1.6, square_weight,
                               (0.003, 0.09, 0.0, 0.02), fmax=5000)
                    pan = 0.4 if s % 2 else -0.4
                    mix.add("arp", tb + s * BEAT / 4, sig, gain, pan)
                    mix.add("send", tb + s * BEAT / 4, sig, gain * 0.25, -pan)

        t0 += len(chords) * BAR

    # Melodija (sintezators) un vokāls
    vocals, credit = load_vocals()
    lead_gain = 0.10 if vocals is None else 0.025  # ar vokālu sintezators paliek klusi fonā
    for ln in melody_lines():
        for nt in ln["notes"]:
            d, start = nt["len"], nt["start"]
            dur = d * EIGHTH * (0.92 if d == 1 else 0.97)
            sig = tone(hz(nt["midi"]), dur, vowel_weight(nt["vowel"]),
                       (0.02, 0.3, 0.8, 0.06), detune_cents=(-4, 4),
                       vibrato=0.35 if d >= 2 else 0.0, fmax=5000)
            mix.add("lead", start, sig, lead_gain, -0.05)
            mix.add("send", start, sig, lead_gain * 0.35)
            # aizture (punktēta astotdaļa)
            for k, g in ((1, 0.25), (2, 0.12)):
                mix.add("lead", start + k * 0.75 * BEAT, sig, lead_gain * g, (-0.6, 0.6)[k % 2])
            if ln["section"] == "chorus3":  # pēdējā piedziedājumā oktāva augstāk
                sig2 = tone(hz(nt["midi"] + 12), dur, vowel_weight(nt["vowel"]),
                            (0.02, 0.3, 0.8, 0.06), vibrato=0.25 if d >= 2 else 0.0, fmax=6000)
                mix.add("lead", start, sig2, lead_gain * 0.35, 0.2)
        # vārdu laiki karaoke subtitriem
        words, si = [], 0
        for w in ln["text"].split():
            n = len(syllables(w))
            if n == 0:  # piem., domuzīme — pievieno iepriekšējam vārdam
                words[-1]["text"] += " " + w
                continue
            words.append({"text": w, "start": ln["notes"][si]["start"],
                          "end": ln["notes"][si + n - 1]["end"]})
            si += n
        lines.append({k: ln[k] for k in ("section", "text", "start", "end")} | {"words": words})
    if vocals is not None:
        mix.add("vocal", 0.0, vocals, VOCAL_GAIN)
        mix.add("send", 0.0, vocals, VOCAL_GAIN * 0.30)
        for k, g in ((1, 0.20), (2, 0.09)):
            mix.add("vocal", k * 0.75 * BEAT, vocals, VOCAL_GAIN * g, (-0.6, 0.6)[k % 2])

    # --- Miksēšana un masterings ---
    chorus_kicks = [k for k in kicks
                    if any(s["kind"] == "chorus" and s["start"] <= k < s["end"] for s in sections)]
    pad = sidechain(mix.bus("pad"), chorus_kicks)
    bass = sidechain(mix.bus("bass"), chorus_kicks, depth=0.45)
    arp = sidechain(mix.bus("arp"), chorus_kicks, depth=0.35)
    wet = reverb(mix.bus("send") + 0.35 * pad + 0.2 * mix.bus("lead"))
    master = (mix.bus("drums") + bass + pad + arp + mix.bus("lead") + mix.bus("vocal")
              + 0.30 * wet)
    master /= np.max(np.abs(master))
    master = np.tanh(1.6 * master) / np.tanh(1.6)  # maigs piesātinājums
    master *= 10 ** (-1 / 20) / np.max(np.abs(master))
    fade = int(1.0 * SR)
    master[:, -fade:] *= np.linspace(1, 0, fade)

    BUILD.mkdir(exist_ok=True)
    pcm = (master.T * 32767).astype("<i2")
    with wave.open(str(BUILD / "song.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    timeline = {"bpm": BPM, "duration": master.shape[1] / SR, "song_end": total,
                "kicks": sorted(kicks), "sections": sections, "lines": lines,
                "voice_credit": credit}
    (BUILD / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1))
    print(f"song.wav: {master.shape[1] / SR:.1f} s, {len(lines)} teksta rindas"
          + (f", vokāls: {credit}" if vocals is not None else ""))


if __name__ == "__main__":
    build()
