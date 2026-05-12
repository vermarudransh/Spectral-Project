

import base64
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes


# ─── Public API ───────────────────────────────────────────────────────────────

def encrypt(plaintext: str, key: bytes) -> str:
    if not plaintext:
        raise ValueError("plaintext must not be empty")

    cipher = AES.new(key, AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode("utf-8"))

    parts = [cipher.nonce, tag, ciphertext]
    return "|".join(base64.b64encode(p).decode() for p in parts)


def decrypt(payload: str, key: bytes) -> str:
    
    segments = payload.split("|")
    if len(segments) != 3:
        raise ValueError(f"Expected 3 segments, got {len(segments)}")

    nonce, tag, ciphertext = (base64.b64decode(s) for s in segments)

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    plaintext_bytes = cipher.decrypt_and_verify(ciphertext, tag)

    return plaintext_bytes.decode("utf-8")
# ─── CLI smoke-test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    message = " ".join(sys.argv[1:]) or "Spectral Steganography — crypto test"
    print(f"Plaintext : {message}")

    payload = encrypt(message, get_random_bytes(32))
    print(f"Payload   : {payload[:80]}{'...' if len(payload) > 80 else ''}")
    print(f"Segments  : {len(payload.split('|'))}  (key | nonce | tag | ciphertext)")

    recovered = decrypt(payload)
    print(f"Decrypted : {recovered}")
    assert recovered == message, "ROUND-TRIP FAILED"
    print("Round-trip OK.")
