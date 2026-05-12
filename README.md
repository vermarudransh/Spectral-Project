# Spectral-Project
Spectral Steganography is a covert messaging tool that encrypts text with AES-256-GCM, encodes the ciphertext, then embeds the pixel map and/or the ciphertext into audio frequency bands which produces a WAV file that looks like ordinary audio but carries a hidden, encrypted message.

## How It Works

```
plaintext message
      │
      ▼  Stage 1 — crypto.py
AES-256-GCM encryption
key | nonce | tag | ciphertext  (Base64)
      │
      ▼  Stage 2 — steganography.py
QR Code synthesis  (200 × 100 px, Error Correction H)
boolean pixel matrix  [black = 1, white = 0]
      │
      ▼  Stage 3 — steganography.py
Spectral audio embedding
stego.wav  (44 100 Hz · 16-bit PCM · 4.0 s)
```

### Frequency Mapping

Each row of the QR image maps to a unique audio frequency:

```
row 0   (top)    →  8 000 Hz
row 99  (bottom) →  1 000 Hz

f(row) = 8000 − (row / 99) × 7000  Hz
```

### Time Mapping

Each column of the QR image maps to a 20 ms time window:

```
column c  →  [c × 20 ms,  (c+1) × 20 ms)
samples per column  =  882   (at 44 100 Hz)
total duration      =  200 columns × 20 ms  =  4.0 s
WAV file size       ≈  353 KB
```

Black pixels generate a sine tone at their mapped frequency and time. White pixels are silent. Multiple frequencies active in the same column are superposed additively.

---

## Project Structure

```
spectral-steganography/
│
├── backend/
│   ├── __pycache__/
│   ├── crypto.py            # AES-256-GCM encryption & decryption
│   ├── steganography.py     # QR synthesis + spectral audio embedding
│   ├── server.py            # Flask REST API
│   └── requirements.txt
│
├── frontend/
│   ├── node_modules/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── SpectralChat.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   ├── eslint.config.js
│   ├── index.html
│   ├── .gitignore
│   └── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Encryption | AES-256-GCM — `pycryptodome` |
| QR Code | `qrcode[pil]`, Error Correction H |
| Audio synthesis | `numpy`, `scipy.io.wavfile` |
| Image processing | `Pillow` |
| API server | Flask + flask-cors |
| Frontend | React 18 + Vite |
| Client-side PKI | Web Crypto API — RSA-OAEP 2048-bit |
| Audio visualisation | Web Audio API — `AudioContext.decodeAudioData` |

---

## Setup

### 1. Backend

**Requirements:** Python 3.11+

```bash
cd backend
pip install -r requirements.txt
python server.py
# Flask running on http://localhost:5050
```

`requirements.txt`:
```
pycryptodome>=3.20.0
qrcode[pil]>=7.4.2
numpy>=1.26.0
scipy>=1.12.0
Pillow>=10.2.0
flask>=3.0.0
flask-cors>=4.0.0
```

### 2. Frontend

**Requirements:** Node 18+

```bash
npm install
npm run dev
# Vite dev server on http://localhost:5173
```

The Vite dev server proxies all `/api/*` requests to `localhost:5050` automatically — no manual CORS configuration needed in development.

---

## API Reference

### `POST /api/encode`

Encrypts a message and returns a steganographic WAV file.

**Request body**
```json
{ "message": "your secret text here" }
```

**Response**
```
Content-Type: audio/wav
X-Duration-Ms     — total pipeline time in milliseconds
X-Wav-Bytes       — WAV file size in bytes
X-Payload-Bytes   — Base64 payload size in bytes
```

### `GET /api/health`

```json
{ "status": "ok", "version": "0.1" }
```

---

## Running the Python Modules Standalone

**Encryption only (`crypto.py`):**
```bash
python crypto.py "my secret message"
# Plaintext : my secret message
# Payload   : <base64 key>|<base64 nonce>|<base64 tag>|<base64 ct>
# Decrypted : my secret message
# Round-trip OK.
```

**Full steganography pipeline (`steganography.py`):**
```bash
python steganography.py "dGVzdHBheWxvYWQ="
# [stego] QR matrix      (100, 200)  active pixels: 7,765
# [stego] Audio          176,400 samples  4.00s
# [stego] WAV            352,844 bytes
# [stego] Pipeline time  194.5 ms
```

---

## Cryptographic Design

### AES-256-GCM (`crypto.py`)

- A fresh **32-byte key** and **16-byte nonce** are generated per message using a CSPRNG (`Crypto.Random.get_random_bytes`).
- GCM mode provides both **confidentiality** (CTR-mode stream cipher) and **authenticity** (GHASH tag) in one pass.
- The 16-byte authentication tag detects any tampering with the ciphertext. Decryption raises `ValueError` immediately on tag mismatch.
- All four components (key, nonce, tag, ciphertext) are Base64-encoded and joined with `|` so no length metadata is needed at decode time.

### RSA-OAEP 2048-bit (browser, `crypto.js`)

- Key pairs are generated client-side via `window.crypto.subtle` — no key material leaves the browser.
- Public keys are shared as SPKI-encoded Base64 strings.
- A short fingerprint (3 × 8 hex chars) is derived from the public key for visual verification.

---

## Audio Steganography Design

### Synthesis (`steganography.py → synthesise()`)

Rather than looping over every pixel individually (up to 20 000 iterations), the algorithm **groups pixels by row**. All pixels in the same row share the same target frequency, so a single `numpy` broadcast handles the entire row:

```python
# active_t shape: (n_active_cols, samples_per_col)
active_t   = col_t[active_cols]
sine_waves = STEGO_AMP * np.sin(2π × freq × active_t)
```

A pre-allocated `float64` buffer receives all sine fragments via scatter-add (`+=`), then is peak-normalised and cast to `float32` before writing.

### Amplitude

Sine tones are embedded at **1.5% of full-scale** (`STEGO_AMP = 0.015`). This is below the just-noticeable difference threshold for broadband audio, making the embedded signal acoustically imperceptible.

---

## UI Features

- **Boot screen** — animated loading sequence on first visit
- **Identity** — auto-generated codename (e.g. `SILENT-FALCON-4821`) or custom; RSA-2048 key pair generated in-browser
- **Peer connection** — connect by codename; simulates PKI handshake and DH key exchange
- **Compose** — type a message or drag-and-drop a `.txt` file (up to 4 000 chars)
- **Waveform display** — after encoding, the WAV is decoded by `AudioContext` and drawn as a time-domain waveform in the message bubble
- **Play / Download** — listen to the stego WAV or save it

---

## Limitations & Future Work

| Area | Current state | Planned |
|---|---|---|
| Peer signalling | In-memory (single browser tab) | WebSocket signalling server |
| WAV → message decoding | QR PNG only | Full spectral audio decoder |
| Carrier audio | Silent host signal | Blend into real audio track |
| Key exchange | Simulated | Real ECDH over signalling channel |
| Multi-user | None | Persistent user accounts |

---

## Authors

Spectral Steganography — college project, First Evaluation.
