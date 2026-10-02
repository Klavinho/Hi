#!/usr/bin/env python3
"""Pārvērš ierunātas rindas dziedājumā pēc dziesmas melodijas.

Ievade: 14 runas faili vocals/raw/01.* … 14.* (viena rinda katrā, secība kā
VOCAL_LINES), jebkurā formātā, ko saprot ffmpeg. Ar --espeak tā vietā
izmanto espeak-ng latviešu balsi (pagaidu balss testēšanai).

Katrā rindā atrod zilbes, ar WORLD vokoderu izstiepj patskaņus līdz nošu
garumam (līdzskaņi paliek dabiski), aizstāj balss augstumu ar melodiju
(ar nelielu ieslīdi un vibrato) un saliek visas rindas vienā celiņā
build/vocals.wav, ko song.py iemiksē dziesmā.
"""
import argparse
import ctypes
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numba
import numpy as np
import pyworld as pw

import song

SR = song.SR
FP = 5.0  # WORLD kadra solis, ms
HERE = Path(__file__).resolve().parent
RAW = HERE / "vocals" / "raw"
LINES = song.melody_lines()
VOCAL_LINES = list(dict.fromkeys(ln["text"] for ln in LINES))  # 14 unikālas rindas
PRE = 0.4  # sekundes pirms rindas sākuma, kur var sākties pirmā zilbes līdzskanis
VOWELS = "aāeēiīouū"


def load_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
                          "-f", "f64le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, "<f8").copy()


def espeak_lines(dest):
    dest.mkdir(parents=True, exist_ok=True)
    for i, text in enumerate(VOCAL_LINES, 1):
        subprocess.run(["espeak-ng", "-v", "lv+f3", "-s", "115", "-p", "60",
                        "-w", str(dest / f"{i:02d}.wav"), text], check=True)
    return dest


def find_sources(src):
    files = {}
    for p in sorted(src.iterdir()):
        m = re.match(r"(\d+)", p.stem)
        if m and p.is_file():
            files[int(m[1])] = p
    missing = [i for i in range(1, len(VOCAL_LINES) + 1) if i not in files]
    if missing:
        raise SystemExit(f"{src}: trūkst rindu {missing} (vajag failus 01…{len(VOCAL_LINES):02d})")
    return [files[i] for i in range(1, len(VOCAL_LINES) + 1)]


# --- Izlīdzināšana ar espeak-ng atsauci (kā aeneas) -------------------------

REF_VOICE = ("lv+f3", 130, 60)  # balss, ātrums, augstums


def _espeak_child(text, out):
    """Bērnprocess: sintezē atsauci ar libespeak-ng un saglabā fonēmu laikus."""
    lib = ctypes.CDLL("libespeak-ng.so.1")

    class Event(ctypes.Structure):
        _fields_ = [("type", ctypes.c_int), ("uid", ctypes.c_uint), ("text_position", ctypes.c_int),
                    ("length", ctypes.c_int), ("audio_position", ctypes.c_int), ("sample", ctypes.c_int),
                    ("user_data", ctypes.c_void_p), ("id", ctypes.c_char * 8)]
    callback_t = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int,
                                  ctypes.POINTER(Event))
    sr = lib.espeak_Initialize(2, 0, None, 1)  # sinhroni, ar fonēmu notikumiem
    voice, rate, pitch = REF_VOICE
    lib.espeak_SetVoiceByName(voice.encode())
    lib.espeak_SetParameter(1, rate, 0)
    lib.espeak_SetParameter(3, pitch, 0)
    audio, phonemes = [], []

    def collect(wav, n, ev):
        if n > 0:
            audio.append(np.ctypeslib.as_array(wav, (n,)).copy())
        i = 0
        while ev[i].type != 0:
            if ev[i].type == 7:  # espeakEVENT_PHONEME
                phonemes.append((ev[i].sample / sr, ev[i].id.decode(errors="replace")))
            i += 1
        return 0
    cb = callback_t(collect)
    lib.espeak_SetSynthCallback(cb)
    data = text.encode()
    lib.espeak_Synth(data, len(data) + 1, 0, 1, 0, 1, None, None)
    a = np.concatenate(audio) / 32768.0
    x = np.interp(np.arange(int(len(a) * SR / sr)) / SR, np.arange(len(a)) / sr, a)
    np.savez(out, audio=x, times=[t for t, _ in phonemes], names=[p for _, p in phonemes])


def espeak_reference(text):
    """espeak-ng izruna ar fonēmu laikiem. Katru rindu sintezē jaunā procesā,
    jo libespeak-ng notikumu laiki nobīdās pēc vairākām sintēzēm."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "ref.npz"
        subprocess.run([sys.executable, __file__, "--_ref", text, str(out)], check=True)
        d = np.load(out)
        return d["audio"], list(zip(d["times"], d["names"]))


def mfcc(x, n_frames, n_mel=40, n_ceps=13):
    """MFCC ar WORLD kadru soli, normalizēti (CMVN) runātāju salīdzināšanai."""
    n_fft = 1024
    hop = SR * FP / 1000
    xp = np.pad(x, n_fft)
    idx = (np.arange(n_frames) * hop).round().astype(int)[:, None] + np.arange(n_fft) + n_fft // 2
    frames = xp[np.clip(idx, 0, len(xp) - 1)] * np.hanning(n_fft)
    power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    edges = 700 * (10 ** (np.linspace(mel(80), mel(7600), n_mel + 2) / 2595) - 1)
    bins = np.fft.rfftfreq(n_fft, 1 / SR)
    fb = np.maximum(0, np.minimum((bins - edges[:-2, None]) / (edges[1:-1, None] - edges[:-2, None]),
                                  (edges[2:, None] - bins) / (edges[2:, None] - edges[1:-1, None])))
    logmel = np.log(power @ fb.T + 1e-10)
    k = np.arange(n_mel)
    dct = np.cos(np.pi / n_mel * (k[None, :] + 0.5) * np.arange(1, n_ceps + 1)[:, None])
    c = logmel @ dct.T
    return (c - c.mean(0)) / (c.std(0) + 1e-9)


@numba.njit(cache=True)
def _dtw(cost):
    n, m = cost.shape
    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, 0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            acc[i, j] = cost[i - 1, j - 1] + min(acc[i - 1, j - 1], acc[i - 1, j], acc[i, j - 1])
    total = np.zeros(n)
    count = np.zeros(n)
    i, j = n, m
    while i > 0 and j > 0:
        total[i - 1] += j - 1
        count[i - 1] += 1
        a, b, c = acc[i - 1, j - 1], acc[i - 1, j], acc[i, j - 1]
        if a <= b and a <= c:
            i, j = i - 1, j - 1
        elif b <= c:
            i -= 1
        else:
            j -= 1
    return total / np.maximum(count, 1)


def align_guide(x, e, text, n_syl):
    """Paredzētās zilbju robežas (kadros) runā x: DTW starp MFCC un espeak-ng
    atsauci, kuras fonēmu laiki ir zināmi. None, ja zilbes nesakrīt."""
    ref, phon = espeak_reference(text)
    vowels = [(t, phon[k + 1][0]) for k, (t, p) in enumerate(phon[:-1]) if p[0] in "aeiouAEIOU"]
    if len(vowels) != n_syl:
        return None
    fr = FP / 1000
    n_ref = int(len(ref) / SR / fr) + 1
    r_e = 10 * np.log10(smooth(ref ** 2, 441)[(np.arange(n_ref) * SR * fr).astype(int).clip(0, len(ref) - 1)] + 1e-12)
    r0, r1 = np.where(r_e > r_e.max() - 40)[0][[0, -1]]
    t0, t1 = np.where(e > e.max() - 35)[0][[0, -1]]
    A = mfcc(ref, n_ref)[r0:r1 + 1]
    B = mfcc(x, len(e))[t0:t1 + 1]
    cost = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(-1))
    to_test = _dtw(cost) + t0
    ref_bounds = [((vowels[k][1] + vowels[k + 1][0]) / 2) / fr - r0 for k in range(n_syl - 1)]
    return np.interp(ref_bounds, np.arange(len(to_test)), to_test)


# --- Zilbju atrašana ---------------------------------------------------------

def syllable_weights(text):
    """Katras zilbes paredzamais relatīvais ilgums pēc burtu skaita."""
    weights = []
    for word in re.findall(r"[^\W\d_]+", text.lower()):
        nuclei = list(song.SYLLABLE_RE.finditer(word))
        if not nuclei:
            continue
        cuts = [0]
        for a, b in zip(nuclei, nuclei[1:]):
            gap = b.start() - a.end()  # līdzskaņi starp patskaņiem: VC.CV
            cuts.append(a.end() + (1 if gap >= 2 else 0))
        cuts.append(len(word))
        for k, n in enumerate(nuclei):
            chunk = word[cuts[k]:cuts[k + 1]]
            weights.append(len(chunk) + 0.6 * sum(c in "āēīū" for c in chunk))
    return np.array(weights, float)


def smooth(x, n):
    return np.convolve(x, np.ones(n) / n, mode="same")


def segment(e, ev, voiced, weights, guide=None):
    """Sadala runu len(weights) zilbēs (dinamiskā programmēšana): katrā zilbē
    tieši viens patskaņa skaļuma maksimums, robežas enerģijas ielejās,
    ilgumi pēc iespējas tuvu paredzētajiem."""
    floor = e.max() - 35
    active = np.where(e > floor)[0]
    a0, a1 = active[0], active[-1] + 1
    n = len(weights)
    if n == 1:
        return [a0, a1]
    # patskaņu kandidāti: lokāli maksimumi ±30 ms logā formantu joslā (500–2500 Hz),
    # kur nazālie līdzskaņi (m, n) ir vāji
    w = int(30 / FP)
    # un ilgst vismaz 20 ms (līdzskaņu sprādzieni, piem., k, ir īsāki)
    peaks = [t for t in range(a0, a1) if voiced[t] and ev[t] > ev[a0:a1].max() - 18
             and ev[t] >= ev[max(a0, t - w):t + w + 1].max()
             and np.sum(ev[max(a0, t - 2 * w):t + 2 * w + 1] >= ev[t] - 6) >= int(20 / FP)]
    # robežu kandidāti: lokāli minimumi un neskanīgi kadri
    win = int(100 / FP)
    cand, depth = [], []
    for t in range(a0 + 2, a1 - 2):
        if e[t] <= e[t - 2:t + 3].min() or not voiced[t]:
            lo, hi = max(a0, t - win), min(a1, t + win)
            d = min(e[lo:t + 1].max(), e[t:hi].max()) - e[t]
            if not voiced[t]:
                d += 3
            if e[t] < floor + 10:
                d += 6  # pauze
            cand.append(t)
            depth.append(d)
    nodes = np.array([a0] + cand + [a1])
    gain = np.array([0.0] + depth + [0.0])
    m = len(nodes)

    def seg_cost(s0, s1):
        pk = [p for p in peaks if s0 <= p < s1]
        if not pk:
            return 12.0  # zilbe bez patskaņa
        c = 0.0
        for p1, p2 in zip(pk, pk[1:]):  # divi atdalīti patskaņi vienā zilbē
            dip = min(e[p1], e[p2]) - e[p1:p2 + 1].min()
            c += 0.6 * max(dip - 1.5, 0)
        return c

    expected = weights / weights.sum() * (a1 - a0)
    min_len = int(40 / FP)
    INF = 1e18
    seg = np.full((m, m), INF)
    for i in range(m):
        for j in range(i + 1, m):
            if nodes[j] - nodes[i] >= min_len:
                seg[i, j] = seg_cost(nodes[i], nodes[j])
    cost = np.full((n + 1, m), INF)
    back = np.zeros((n + 1, m), int)
    cost[0, 0] = 0
    for k in range(1, n + 1):
        for j in ([m - 1] if k == n else range(1, m - 1)):
            dur = nodes[j] - nodes[:j]
            c = (cost[k - 1, :j] + seg[:j, j]
                 + (0.5 if guide is not None else 2.0)
                 * np.log(np.maximum(dur, 1) / expected[k - 1]) ** 2)
            i = int(np.argmin(c))
            if c[i] < INF / 2:
                cost[k, j] = c[i] - 0.15 * gain[j]
                if guide is not None and k < n:  # tuvu DTW paredzētajai robežai
                    cost[k, j] += min(((nodes[j] - guide[k - 1]) / (40 / FP)) ** 2, 9.0)
                back[k, j] = i
    bounds, j = [m - 1], m - 1
    for k in range(n, 0, -1):
        j = back[k, j]
        bounds.append(j)
    return [int(nodes[j]) for j in reversed(bounds)]


# --- Runa → dziedājums -------------------------------------------------------

def analyze(x, text, use_guide=True):
    """WORLD analīze un zilbes: katrai (aktīvs sākums, patskaņa sākums,
    patskaņa beigas, aktīvas beigas) kadros."""
    f0, t = pw.harvest(x, SR, f0_floor=80, f0_ceil=600, frame_period=FP)
    sp = pw.cheaptrick(x, f0, t, SR)
    ap = pw.d4c(x, f0, t, SR)
    freqs = np.linspace(0, SR / 2, sp.shape[1])
    band = (freqs > 300) & (freqs < 3000)
    e = smooth(10 * np.log10(sp[:, band].sum(axis=1) + 1e-12), 5)
    vband = (freqs > 500) & (freqs < 2500)
    ev = smooth(10 * np.log10(sp[:, vband].sum(axis=1) + 1e-12), 5)
    voiced = f0 > 0
    weights = syllable_weights(text)
    guide = align_guide(x, e, text, len(weights)) if use_guide else None
    b = segment(e, ev, voiced, weights, guide)
    syl = []
    for i in range(len(b) - 1):
        s0, s1 = b[i], b[i + 1]
        seg_e = e[s0:s1]
        # patskaņa kodols: garākais skanīgais posms tuvu zilbes skaļuma maksimumam
        core = voiced[s0:s1] & (seg_e >= seg_e.max() - 6)
        runs, start = [], None
        for k, c in enumerate(np.append(core, False)):
            if c and start is None:
                start = k
            elif not c and start is not None:
                runs.append((start, k))
                start = None
        if runs:
            vs, ve = max(runs, key=lambda r: r[1] - r[0])
        else:
            vs, ve = (s1 - s0) // 3, 2 * (s1 - s0) // 3
        vs, ve = s0 + vs, s0 + max(ve, vs + 1)
        # līdzskaņi pirms un pēc patskaņa (bez klusuma)
        act = np.where(e[s0:s1] > e.max() - 35)[0]
        a_s, a_e = (s0 + act[0], s0 + act[-1] + 1) if len(act) else (s0, s1)
        syl.append((min(a_s, vs), vs, ve, max(a_e, ve)))
    return f0, sp, ap, voiced, b, syl


def sing_line(x, line):
    """Pārvērš vienas rindas runu dziedājumā. Atgriež signālu, kas sākas PRE
    sekundes pirms rindas sākuma."""
    f0, sp, ap, voiced, b, syl = analyze(x, line["text"])
    notes = line["notes"]
    fr = FP / 1000

    anchors = []  # (mērķa laiks, avota kadrs)
    vowel_spans = []
    prev_tail = None
    for i, (nt, (a_s, vs, ve, a_e)) in enumerate(zip(notes, syl)):
        onset = min((vs - a_s) * fr, 0.15)
        coda = min((a_e - ve) * fr, 0.15)
        ns, ne = nt["start"] - line["start"], nt["end"] - line["start"]
        if i == len(notes) - 1:
            ne -= 0.1  # elpa pēc rindas
        if prev_tail is not None:  # iepriekšējās zilbes beigas + šīs sākums dala laiku pirms ns
            room = 0.45 * prev_tail[1]
            scale = min(1.0, room / max(prev_tail[0] + onset, 1e-6))
            pc, onset = prev_tail[0] * scale, onset * scale
            anchors[-1] = (ns - onset - pc, anchors[-1][1])  # iepriekšējā patskaņa beigas
            vowel_spans[-1] = (vowel_spans[-1][0], ns - onset - pc, vowel_spans[-1][2])
            anchors.append((ns - onset - 0.001, prev_tail[2]))
        anchors += [(ns - onset, a_s), (ns, vs), (ne - coda, ve)]
        prev_tail = (coda, ne - ns, a_e)
        vowel_spans.append((ns, ne - coda, nt["midi"]))
    anchors.append((anchors[-1][0] + prev_tail[0], prev_tail[2]))
    for i in range(1, len(anchors)):  # stingri augoši mērķa laiki
        if anchors[i][0] <= anchors[i - 1][0]:
            anchors[i] = (anchors[i - 1][0] + 0.001, anchors[i][1])

    tgt = np.array([a[0] for a in anchors]) + PRE
    src = np.array([a[1] for a in anchors], float)
    n_out = int((tgt[-1] + 0.3) / fr)
    T = np.arange(n_out) * fr
    S = np.interp(T, tgt, src)
    inside = (T >= tgt[0]) & (T <= tgt[-1])

    i0 = np.clip(np.floor(S).astype(int), 0, len(f0) - 2)
    a = (S - i0)[:, None]
    sp_w = np.exp((1 - a) * np.log(sp[i0] + 1e-16) + a * np.log(sp[i0 + 1] + 1e-16))
    ap_w = (1 - a) * ap[i0] + a * ap[i0 + 1]
    src_voiced = voiced[np.clip(np.round(S).astype(int), 0, len(f0) - 1)]

    # Melodijas balss augstums: līdzskaņi ņem tuvākā patskaņa noti,
    # patskanim neliela ieslīde un vibrato garām notīm
    bounds = [(vs + PRE, ve + PRE, m) for vs, ve, m in vowel_spans]
    mids = [(bounds[k][1] + bounds[k + 1][0]) / 2 for k in range(len(bounds) - 1)]
    midi = np.array([bounds[k][2] for k in np.searchsorted(mids, T)], float)
    in_vowel = np.zeros(n_out, bool)
    for vs, ve, m in bounds:
        v = (T >= vs) & (T < ve)
        in_vowel |= v
        tt = T[v] - vs
        midi[v] += -0.35 * np.exp(-tt / 0.05)
        ramp = np.clip((tt - 0.22) / 0.25, 0, 1)
        midi[v] += 0.28 * ramp * np.sin(2 * np.pi * 5.6 * tt)
    midi = smooth(np.pad(midi, 4, mode="edge"), 7)[4:-4]  # glisando starp notīm
    f0_w = np.where((src_voiced | in_vowel) & inside, 440.0 * 2 ** ((midi - 69) / 12), 0.0)
    ap_w[in_vowel & ~src_voiced] = ap_w[in_vowel & ~src_voiced].clip(max=0.05)

    y = pw.synthesize(f0_w, np.ascontiguousarray(sp_w), np.ascontiguousarray(ap_w), SR, FP)
    gain = np.interp(np.arange(len(y)) / SR, [0, tgt[0] - 0.01, tgt[0] + 0.01, tgt[-1] - 0.03, tgt[-1] + 0.02, 1e9],
                     [0, 0, 1, 1, 0, 0])
    y *= gain
    sung = np.concatenate([y[int((vs) * SR):int(ve * SR)] for vs, ve, _ in bounds])
    y *= 0.1 / (np.sqrt(np.mean(sung ** 2)) + 1e-9)
    return y, b


def main():
    ap_ = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap_.add_argument("--espeak", action="store_true", help="pagaidu balss ar espeak-ng")
    ap_.add_argument("--src", type=Path, default=RAW, help="mape ar 01…14 runas failiem")
    ap_.add_argument("--credit", default=None, help="balss avots video titros")
    args = ap_.parse_args()

    if args.espeak:
        src = espeak_lines(song.BUILD / "espeak")
        credit = args.credit or "espeak-ng (pagaidu balss)"
    else:
        src = args.src
        credit = args.credit or "Google Gemini"
    files = find_sources(src)

    sung = {}
    for i, (path, text) in enumerate(zip(files, VOCAL_LINES), 1):
        line = next(ln for ln in LINES if ln["text"] == text)
        y, b = sing_line(load_audio(path), line)
        sung[text] = y
        segs = " ".join(f"{(b[k + 1] - b[k]) * FP / 1000:.2f}" for k in range(len(b) - 1))
        print(f"{i:02d} {path.name}: {len(b) - 1} zilbes [{segs}] s — {text}")

    total = song.BAR * sum(len(c) for _, _, c in song.SECTIONS) + song.TAIL
    track = np.zeros(int(total * SR))
    for ln in LINES:
        y = sung[ln["text"]]
        i = int(round((ln["start"] - PRE) * SR))
        track[i:i + len(y)] += y[: len(track) - i]
    peak = np.max(np.abs(track))
    track *= 0.9 / peak
    song.BUILD.mkdir(exist_ok=True)
    with wave.open(str(song.BUILD / "vocals.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track * 32767).astype("<i2").tobytes())
    (song.BUILD / "vocals.json").write_text(json.dumps({"credit": credit}, ensure_ascii=False))
    print(f"vocals.wav gatavs ({credit})")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--_ref":
        _espeak_child(sys.argv[2], sys.argv[3])
    else:
        main()
