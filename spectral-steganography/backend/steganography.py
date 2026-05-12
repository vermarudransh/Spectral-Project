

import time
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.fft import rfft, rfftfreq


# ─── Modem constants ──────────────────────────────────────────────────────────

SAMPLE_RATE  : int   = 44_100    # Hz
BIT_DURATION : float = 0.020     # seconds per bit symbol  (20 ms)
FREQ_0       : float = 1_200.0   # Hz — binary '0'  (space)
FREQ_1       : float = 2_400.0   # Hz — binary '1'  (mark)
AMPLITUDE    : float = 0.85      # peak amplitude before normalisation

# Samples per bit symbol (exactly 882 at 44100 Hz × 20 ms)
SPS = int(SAMPLE_RATE * BIT_DURATION)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _text_to_bits(text: str) -> str:

    return "".join(f"{byte:08b}" for byte in text.encode("utf-8"))


def _bits_to_text(bits: str) -> str:

    if len(bits) % 8:
        raise ValueError(f"bit string length {len(bits)} is not a multiple of 8")
    raw = bytes(int(bits[i:i+8], 2) for i in range(0, len(bits), 8))
    return raw.decode("utf-8")


def _make_tone(freq: float, n_samples: int) -> np.ndarray:
    t = np.arange(n_samples, dtype=np.float64) / SAMPLE_RATE
    return (AMPLITUDE * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


# Pre-compute the two symbol tones once
_TONE_0 = _make_tone(FREQ_0, SPS)
_TONE_1 = _make_tone(FREQ_1, SPS)

# FFT bin indices for FREQ_0 and FREQ_1
_FREQS    = rfftfreq(SPS, 1.0 / SAMPLE_RATE)
_BIN_0    = int(np.argmin(np.abs(_FREQS - FREQ_0)))
_BIN_1    = int(np.argmin(np.abs(_FREQS - FREQ_1)))


# ─── Encoder ─────────────────────────────────────────────────────────────────

def encode_to_wav(payload: str,
                  wav_out: str | Path = "stego.wav") -> dict:

    t0 = time.perf_counter()

    payload_bits = _text_to_bits(payload)
    n_payload    = len(payload_bits)

    # 16-bit big-endian length header
    header_bits  = f"{n_payload:016b}"
    full_bits    = header_bits + payload_bits
    n_total      = len(full_bits)

    # Build the sample array by stacking pre-computed tone symbols
    frames = [_TONE_1 if b == "1" else _TONE_0 for b in full_bits]
    samples = np.concatenate(frames)

    # Peak-normalise to ±1.0
    peak = np.max(np.abs(samples))
    if peak > 0.0:
        samples = samples / peak

    # Write 16-bit PCM WAV
    wav_out  = Path(wav_out)
    pcm16    = (samples * 32_767).astype(np.int16)
    wavfile.write(str(wav_out), SAMPLE_RATE, pcm16)

    t1           = time.perf_counter()
    duration_s   = len(samples) / SAMPLE_RATE
    wav_bytes    = wav_out.stat().st_size
    duration_ms  = round((t1 - t0) * 1000, 1)

    print(f"[fsk] Payload bits   {n_payload:,}  ({n_payload // 8} bytes)")
    print(f"[fsk] Total bits     {n_total:,}  (+ 16-bit header)")
    print(f"[fsk] Audio          {len(samples):,} samples  {duration_s:.2f}s")
    print(f"[fsk] WAV            {wav_bytes:,} bytes")
    print(f"[fsk] Encode time    {duration_ms} ms")

    return {
        "wav_path":   str(wav_out.resolve()),
        "duration_s": duration_s,
        "wav_bytes":  wav_bytes,
        "n_bits":     n_total,
        "duration_ms": duration_ms,
    }


# ─── Decoder ─────────────────────────────────────────────────────────────────

def decode_from_wav(wav_path: str | Path) -> str:
    
    wav_path = Path(wav_path)
    rate, data = wavfile.read(str(wav_path))

    # Normalise to float64 regardless of source bit depth
    if data.dtype == np.int16:
        samples = data.astype(np.float64) / 32_768.0
    elif data.dtype == np.int32:
        samples = data.astype(np.float64) / 2_147_483_648.0
    elif data.dtype == np.float32 or data.dtype == np.float64:
        samples = data.astype(np.float64)
    else:
        samples = data.astype(np.float64)

    # If stereo, take the left channel
    if samples.ndim == 2:
        samples = samples[:, 0]

    # Adapt SPS if the WAV was written at a different sample rate
    sps = int(rate * BIT_DURATION)

    n_chunks = len(samples) // sps
    if n_chunks < 16:
        raise ValueError(
            f"WAV too short: only {n_chunks} chunks, need at least 16 for header"
        )

    # Decode all available bits up to the header + max payload
    bits = []
    for i in range(n_chunks):
        chunk  = samples[i * sps : (i + 1) * sps]
        if len(chunk) < sps:
            break
        # Recompute bins if sample rate differs
        if rate != SAMPLE_RATE:
            freqs  = rfftfreq(sps, 1.0 / rate)
            bin_0  = int(np.argmin(np.abs(freqs - FREQ_0)))
            bin_1  = int(np.argmin(np.abs(freqs - FREQ_1)))
        else:
            bin_0, bin_1 = _BIN_0, _BIN_1

        spectrum = np.abs(rfft(chunk))
        bits.append("1" if spectrum[bin_1] > spectrum[bin_0] else "0")

    # Read 16-bit length header
    if len(bits) < 16:
        raise ValueError("Not enough bits decoded to read length header")

    n_payload = int("".join(bits[:16]), 2)
    if len(bits) < 16 + n_payload:
        raise ValueError(
            f"Header says {n_payload} payload bits but only {len(bits) - 16} decoded"
        )

    payload_bits = "".join(bits[16 : 16 + n_payload])
    return _bits_to_text(payload_bits)


# ─── CLI smoke-test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    payload = " ".join(sys.argv[1:]) or "Hello from Spectral FSK modem!"
    print(f"[cli] Payload  : {payload}")

    result = encode_to_wav(payload, wav_out="/tmp/fsk_test.wav")
    print(f"[cli] Encoded  : {result['wav_path']}  ({result['duration_s']:.2f}s)")

    recovered = decode_from_wav(result["wav_path"])
    print(f"[cli] Decoded  : {recovered}")
    assert recovered == payload, f"ROUND-TRIP FAILED\n  got: {recovered!r}"
    print("[cli] Round-trip OK.")
