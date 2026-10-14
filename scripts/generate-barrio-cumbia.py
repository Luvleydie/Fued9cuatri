"""Render a short original cumbia loop with only Python's standard library.

The melody and percussion are composed here; no recordings are used.
Run from anywhere with: python scripts/generate-barrio-cumbia.py
"""

from array import array
import math
from pathlib import Path
import random
import sys
import wave


RATE = 22050
BPM = 108
BEAT = 60 / BPM
BARS = 12
SAMPLES = round(BARS * 4 * BEAT * RATE)
mix = array("d", [0.0]) * SAMPLES
random.seed(1082026)


def note_frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add_sound(start_beat, duration, voice):
    """Wrap decay tails at the seam so the entire score can loop."""
    offset = round(start_beat * BEAT * RATE)
    for i in range(round(duration * RATE)):
        mix[(offset + i) % SAMPLES] += voice(i / RATE)


def accordion(start, midi, beats, level=0.1):
    frequency = note_frequency(midi)
    length = beats * BEAT

    def voice(t):
        attack = min(t / 0.018, 1)
        release = min((length + 0.045 - t) / 0.08, 1)
        envelope = attack * max(0, release) * (0.78 + 0.22 * math.exp(-t * 7))
        vibrato = 0.004 * math.sin(2 * math.pi * 5.2 * t)
        phase = 2 * math.pi * frequency * t + vibrato
        reed = math.sin(phase) + 0.34 * math.sin(2 * phase) + 0.17 * math.sin(3 * phase)
        return level * envelope * reed

    add_sound(start, length + 0.045, voice)


def bass(start, midi, beats=0.65):
    frequency = note_frequency(midi)
    length = beats * BEAT

    def voice(t):
        envelope = min(t / 0.012, 1) * math.exp(-t * 4.5) * max(0, 1 - (t / length) ** 6)
        return 0.19 * envelope * (math.sin(2 * math.pi * frequency * t) + 0.18 * math.sin(4 * math.pi * frequency * t))

    add_sound(start, length, voice)


def kick(start):
    def voice(t):
        phase = 2 * math.pi * (47 * t + 43 * (1 - math.exp(-t * 22)) / 22)
        return 0.17 * math.exp(-t * 16) * math.sin(phase)

    add_sound(start, 0.3, voice)


def conga(start, frequency, level):
    def voice(t):
        tone = math.sin(2 * math.pi * frequency * t) + 0.22 * math.sin(2 * math.pi * frequency * 1.55 * t)
        slap = random.uniform(-1, 1) * math.exp(-t * 150)
        return level * (tone * math.exp(-t * 27) + slap * 0.5) * min(t / 0.001, 1)

    add_sound(start, 0.24, voice)


def guiro(start, length=0.16, level=0.045):
    previous = 0.0

    def voice(t):
        nonlocal previous
        noise = random.uniform(-1, 1)
        scrape = noise - previous
        previous = noise
        ridges = 0.23 + 0.77 * max(0, math.sin(2 * math.pi * 74 * t))
        envelope = min(t / 0.005, 1) * max(0, 1 - t / length)
        return level * scrape * ridges * envelope

    add_sound(start, length, voice)


# Four original bars in C major, repeated three times. Each tuple is
# (beat within the bar, MIDI pitch, length in beats).
melody = [
    [(0, 64, .75), (1, 67, .5), (1.75, 69, .25), (2, 67, .75), (3, 64, .5), (3.5, 62, .35)],
    [(0, 65, .5), (.75, 69, .5), (1.5, 72, .4), (2.25, 69, .5), (3, 67, .75)],
    [(0, 67, .5), (.75, 71, .5), (1.5, 74, .4), (2.25, 72, .35), (2.75, 71, .5), (3.5, 67, .35)],
    [(0, 64, .75), (1, 67, .5), (1.75, 64, .3), (2.5, 62, .4), (3.25, 60, .55)],
]
chords = [(48, 52, 55), (53, 57, 60), (43, 47, 50), (48, 52, 55)]

for bar in range(BARS):
    start = bar * 4
    chord = chords[bar % 4]
    root = chord[0] - 12
    for position, pitch in [(0, root), (1.5, root + 7), (2, root), (3.5, root + 7)]:
        bass(start + position, pitch)
    for position in [0, 2]:
        kick(start + position)
    for position, frequency, level in [(0.5, 176, .1), (1, 230, .09), (1.75, 290, .065), (2.5, 176, .1), (3, 230, .09), (3.75, 290, .065)]:
        conga(start + position, frequency, level)
    for half_beat in range(8):
        guiro(start + half_beat * .5, level=.055 if half_beat % 2 else .036)
    for position in [.5, 1.5, 2.5, 3.5]:
        for pitch in chord:
            accordion(start + position, pitch + 12, .23, .026)
    for position, pitch, length in melody[bar % 4]:
        accordion(start + position, pitch + (12 if bar >= 8 else 0), length, .085)

peak = max(abs(sample) for sample in mix)
gain = .76 / peak
pcm = array("h", (round(sample * gain * 32767) for sample in mix))
if sys.byteorder != "little":
    pcm.byteswap()
destination = Path(__file__).resolve().parents[1] / "src" / "assets" / "music" / "cumbia-de-la-ruta.wav"
destination.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(destination), "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(pcm.tobytes())
print(f"Created {destination}: {SAMPLES / RATE:.3f}s, {destination.stat().st_size:,} bytes, peak 0.76.")
