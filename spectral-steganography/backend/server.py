from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from uuid import uuid4
from crypto import encrypt, decrypt
from steganography import encode_to_wav, decode_from_wav
from Crypto.Random import get_random_bytes
from flask_socketio import SocketIO, join_room, emit
import os

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

sessions = {}

# Directory for temporary WAV files
WAV_DIR = "/tmp/spectral_wavs"
os.makedirs(WAV_DIR, exist_ok=True)


# ─── HTTP routes ──────────────────────────────────────────────────────────────

@app.route("/wav/<path:filename>")
def serve_wav(filename):
    """Serve a previously-encoded WAV file by name."""
    safe_path = os.path.join(WAV_DIR, os.path.basename(filename))
    return send_file(safe_path, mimetype="audio/wav")


@app.route("/api/session/create", methods=["POST"])
def create_session():
    data = request.json
    session_id = str(uuid4())

    sessions[session_id] = {
        "userA": {
            "codename":  data["codename"],
            "pub_key":   data["public_key"],
        },
        "userB":      None,
        "shared_key": get_random_bytes(32),
    }

    return jsonify({"session_id": session_id})


@app.route("/api/session/join", methods=["POST"])
def join_session():
    data    = request.json
    session = sessions.get(data["session_id"])

    if not session:
        return jsonify({"error": "Invalid session"}), 404

    session["userB"] = {
        "codename": data["codename"],
        "pub_key":  data["public_key"],
    }
    session["shared_key"] = get_random_bytes(32)

    return jsonify({"status": "connected"})


@app.route("/api/encode", methods=["POST"])
def encode():

    data    = request.json
    session = sessions.get(data["session_id"])

    if not session or not session["shared_key"]:
        return jsonify({"error": "Session not ready"}), 400

    encrypted = encrypt(data["message"], session["shared_key"])

    wav_name = f"{uuid4()}.wav"
    wav_path = os.path.join(WAV_DIR, wav_name)

    encode_to_wav(encrypted, wav_out=wav_path)

    return send_file(wav_path, mimetype="audio/wav",
                     download_name=wav_name, as_attachment=False)


# ─── Socket.IO events ─────────────────────────────────────────────────────────

@socketio.on("join")
def handle_join(data):
    session_id = data["session_id"]
    join_room(session_id)
    print(f"[socket] joined room {session_id}")


@socketio.on("send_message")
def handle_message(data):

    session_id = data["session_id"]
    session = sessions.get(session_id)

    if not session or not session["shared_key"]:
        emit("error", {"detail": "Session not ready"})
        return

    encrypted = encrypt(data["message"], session["shared_key"])

    wav_name = f"{uuid4()}.wav"
    wav_path = os.path.join(WAV_DIR, wav_name)

    encode_to_wav(encrypted, wav_out=wav_path)

    emit("receive_message", {
        "wav_filename": wav_name,
        "msg_id":       data.get("msg_id"),
    }, room=session_id)


@socketio.on("analyze_audio")
def handle_analyze(data):

    session_id   = data["session_id"]
    wav_filename = data["wav_filename"]
    msg_id       = data.get("msg_id")

    session = sessions.get(session_id)
    if not session or not session["shared_key"]:
        emit("error", {"detail": "Session not ready"})
        return

    wav_path = os.path.join(WAV_DIR, os.path.basename(wav_filename))
    if not os.path.isfile(wav_path):
        emit("error", {"detail": f"WAV file not found: {wav_filename}"})
        return

    try:
        fsk_payload = decode_from_wav(wav_path)
        plaintext   = decrypt(fsk_payload, session["shared_key"])
        emit("signal_decoded", {
            "plaintext": plaintext,
            "msg_id":    msg_id,
        }, room=session_id)
        print(f"[socket] decoded msg_id={msg_id}  text={plaintext[:40]!r}...")
    except Exception as exc:
        emit("error", {"detail": f"Decode failed: {exc}"})
        print(f"[socket] decode error: {exc}")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5000, debug=False)
