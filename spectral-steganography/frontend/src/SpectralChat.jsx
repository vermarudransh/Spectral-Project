import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE  = "http://localhost:5000";
const SOCKET_URL = "http://localhost:5000";

// ─── Utilities ───────────────────────────────────────────────────────────────
const ADJECTIVES = ["SILENT","GHOST","PHANTOM","CIPHER","HOLLOW","ROGUE","STATIC","VOID","BINARY","NEON"];
const NOUNS      = ["FALCON","WOLF","COBRA","RAVEN","SPECTER","SIGNAL","PRISM","NODE","VECTOR","ECHO"];
const genCodename = () =>
  `${ADJECTIVES[Math.floor(Math.random()*ADJECTIVES.length)]}-${NOUNS[Math.floor(Math.random()*NOUNS.length)]}-${Math.floor(1000+Math.random()*8999)}`;

async function generateKeyPair() {
  const kp = await window.crypto.subtle.generateKey(
    { name:"RSA-OAEP", modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256" },
    true, ["encrypt","decrypt"]
  );
  const pub = await window.crypto.subtle.exportKey("spki", kp.publicKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pub)));
  const fingerprint = b64.slice(0,16).toUpperCase().replace(/(.{4})/g,"$1:").slice(0,-1);
  return { keyPair:kp, publicKeyB64:b64, fingerprint };
}

function uid() { return Math.random().toString(36).slice(2,10); }

// ─── Boot Screen ─────────────────────────────────────────────────────────────
function BootScreen({ onDone }) {
  const [progress, setProgress] = useState(0);
  const lines = [
    "INITIALIZING SPECTRAL FSK MODEM...",
    "LOADING BELL 202 PROTOCOL (1200/2400 Hz)...",
    "BOOTSTRAPPING AES-256-GCM ENGINE...",
    "GENERATING EPHEMERAL RSA-2048 KEY PAIR...",
    "SPECTRAL CHAT READY.",
  ];
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + 2;
        if (next >= 100) { clearInterval(interval); setTimeout(onDone, 400); }
        return Math.min(next, 100);
      });
    }, 30);
    return () => clearInterval(interval);
  }, [onDone]);

  useEffect(() => {
    setLineIdx(Math.floor((progress / 100) * (lines.length - 1)));
  }, [progress]);

  return (
    <div style={styles.boot}>
      <div style={styles.bootInner}>
        <pre style={styles.bootLogo}>{`
  ███████╗██████╗ ███████╗ ██████╗████████╗██████╗  █████╗ ██╗
  ██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║
  ███████╗██████╔╝█████╗  ██║        ██║   ██████╔╝███████║██║
  ╚════██║██╔═══╝ ██╔══╝  ██║        ██║   ██╔══██╗██╔══██║██║
  ███████║██║     ███████╗╚██████╗   ██║   ██║  ██║██║  ██║███████╗
  ╚══════╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝`}
        </pre>
        <div style={styles.bootSubtitle}>FSK AUDIO COVERT CHANNEL  ·  v2.0</div>
        <div style={styles.bootBar}>
          <div style={{ ...styles.bootFill, width:`${progress}%` }} />
        </div>
        <div style={styles.bootLine}>{lines[lineIdx]}</div>
        <div style={styles.bootPct}>{progress}%</div>
      </div>
    </div>
  );
}

// ─── Identity Screen ─────────────────────────────────────────────────────────
function IdentityScreen({ onReady }) {
  const [codename, setCodename]   = useState(genCodename);
  const [loading, setLoading]     = useState(false);

  async function handleEnter() {
    setLoading(true);
    const { keyPair, publicKeyB64, fingerprint } = await generateKeyPair();
    onReady({ codename: codename.toUpperCase(), keyPair, publicKeyB64, fingerprint });
  }

  return (
    <div style={styles.identity}>
      <div style={styles.identityCard}>
        <div style={styles.sectionLabel}>ESTABLISH IDENTITY</div>
        <div style={styles.identityHint}>Your codename is your only identifier on the network.</div>
        <div style={styles.row}>
          <input
            style={styles.input}
            value={codename}
            onChange={e => setCodename(e.target.value.toUpperCase())}
            spellCheck={false}
            maxLength={32}
          />
          <button style={styles.ghostBtn} onClick={() => setCodename(genCodename())}>⟳</button>
        </div>
        <button style={styles.primaryBtn} onClick={handleEnter} disabled={loading}>
          {loading ? "GENERATING KEYS..." : "ENTER NETWORK ▶"}
        </button>
      </div>
    </div>
  );
}

// ─── Waveform Bubble ─────────────────────────────────────────────────────────
function WaveformBubble({ wavBlob, wavFilename, msgId, sessionId, socket, decodedText }) {
  const canvasRef  = useRef(null);
  const audioRef   = useRef(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [revealed,  setRevealed]  = useState(false);

  useEffect(() => {
    if (!wavBlob) return;
    const url = URL.createObjectURL(wavBlob);
    audioRef.current = new Audio(url);

    (async () => {
      const ctx = new OfflineAudioContext(1, 44100*4, 44100);
      const ab  = await wavBlob.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      const raw = buf.getChannelData(0);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2 = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx2.clearRect(0, 0, W, H);

      const step     = Math.ceil(raw.length / W);
      const midY     = H / 2;
      ctx2.strokeStyle = "#00ff88";
      ctx2.lineWidth   = 1;
      ctx2.shadowColor = "#00ff88";
      ctx2.shadowBlur  = 6;
      ctx2.beginPath();
      for (let x = 0; x < W; x++) {
        const amp = raw[x * step] || 0;
        const y   = midY + amp * midY * 0.9;
        x === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y);
      }
      ctx2.stroke();
    })();
  }, [wavBlob]);

  useEffect(() => {
    if (decodedText) setRevealed(true);
  }, [decodedText]);

  function handlePlay() { audioRef.current?.play(); }

  function handleDownload() {
    if (!wavBlob) return;
    const a  = document.createElement("a");
    a.href   = URL.createObjectURL(wavBlob);
    a.download = wavFilename || "signal.wav";
    a.click();
  }

  function handleAnalyze() {
    if (!socket || !wavFilename) return;
    setAnalyzing(true);
    socket.emit("analyze_audio", { session_id: sessionId, wav_filename: wavFilename, msg_id: msgId });
  }

  return (
    <div style={styles.waveformBubble}>
      <canvas ref={canvasRef} width={320} height={64} style={styles.waveCanvas} />
      <div style={styles.bubbleActions}>
        <button style={styles.iconBtn} onClick={handlePlay} title="Play signal">▶ PLAY</button>
        <button style={styles.iconBtn} onClick={handleDownload} title="Download WAV">⬇ WAV</button>
        <button
          style={{ ...styles.iconBtn, ...styles.analyzeBtn, ...(analyzing && !decodedText ? styles.analyzing : {}) }}
          onClick={handleAnalyze}
          disabled={analyzing}
          title="Demodulate & decrypt"
        >
          {analyzing && !decodedText ? "⟳ ANALYZING..." : "⚡ ANALYZE"}
        </button>
      </div>
      {revealed && decodedText && (
        <div style={styles.decodedReveal}>
          <span style={styles.decodedLabel}>DECRYPTED SIGNAL</span>
          <div style={styles.decodedText}>{decodedText}</div>
        </div>
      )}
    </div>
  );
}

// ─── Chat Screen ─────────────────────────────────────────────────────────────
function ChatScreen({ identity, sessionId, socket }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [status,    setStatus]    = useState("CONNECTED");
  const [peerName,  setPeerName]  = useState(null);
  const [peerInput, setPeerInput] = useState("");
  const [dragging,  setDragging]  = useState(false);
  const bottomRef = useRef(null);

  // Patch a decoded plaintext into an existing message
  const patchDecoded = useCallback((msgId, plaintext) => {
    setMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, decodedText: plaintext } : m));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("receive_message", ({ wav_filename, msg_id }) => {
      fetch(`${API_BASE}/wav/${wav_filename}`)
        .then(r => r.blob())
        .then(blob => {
          setMessages(prev => [...prev, {
            id:          msg_id || uid(),
            type:        "incoming",
            wavBlob:     blob,
            wavFilename: wav_filename,
            ts:          Date.now(),
            decodedText: null,
          }]);
        });
    });

    socket.on("signal_decoded", ({ plaintext, msg_id }) => {
      patchDecoded(msg_id, plaintext);
    });

    socket.on("error", ({ detail }) => {
      setStatus(`ERR: ${detail}`);
    });

    return () => { socket.off("receive_message"); socket.off("signal_decoded"); socket.off("error"); };
  }, [socket, patchDecoded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  function sendMessage() {
    const text = input.trim();
    if (!text || !sessionId) return;

    const msgId = uid();
    setInput("");

    socket?.emit("send_message", {
      session_id: sessionId,
      message: text,
      msg_id: msgId
    });

    setMessages(prev => [...prev, {
      id: msgId,
      type: "outgoing",
      text,
      ts: Date.now(),
      decodedText: null
    }]);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith(".txt")) return;
    const reader = new FileReader();
    reader.onload = ev => setInput(ev.target.result);
    reader.readAsText(file);
  }

  function connectPeer() {
    setStatus("WAITING FOR PEER...");
  }
  

  return (
    <div style={styles.chatRoot}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>SPECTRAL</div>
        <div style={styles.sectionLabel}>PEER CONNECT</div>
        <input style={styles.input} placeholder="PEER CODENAME" value={peerInput}
          onChange={e => setPeerInput(e.target.value.toUpperCase())} />
        <button style={styles.primaryBtn} onClick={connectPeer}>HANDSHAKE</button>
        {peerName && <div style={styles.peerTag}>⬡ {peerName}</div>}

        <div style={{ ...styles.sectionLabel, marginTop:28 }}>PROTOCOL</div>
        <div style={styles.legend}>
          <LegendRow color="#00ff88" label="1 bit → 2400 Hz (mark)" />
          <LegendRow color="#ff6b35" label="0 bit → 1200 Hz (space)" />
          <LegendRow color="#a78bfa" label="AES-256-GCM encrypt" />
          <LegendRow color="#38bdf8" label="16-bit FSK length header" />
        </div>

        <div style={{ ...styles.sectionLabel, marginTop:28 }}>IDENTITY</div>
        <div style={styles.keyInfo}>
          <div style={styles.keyName}>{identity.codename}</div>
          <div style={styles.keyFp}>KEY: {identity.fingerprint}</div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={styles.main}>
        <div style={styles.topBar}>
          <span style={styles.sessionId}>SESSION: {sessionId?.slice(0,8).toUpperCase() || "—"}</span>
          <span style={{ ...styles.statusDot, color: status.startsWith("ERR") ? "#f87171" : "#00ff88" }}>
            ● {status}
          </span>
        </div>

        <div
          style={{ ...styles.msgList, ...(dragging ? styles.dragOver : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {messages.length === 0 && (
            <div style={styles.emptyState}>
              NO SIGNALS DETECTED<br/>
              <span style={styles.emptyHint}>Drop a .txt file or type to transmit</span>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ ...styles.msgRow, justifyContent: msg.type==="outgoing" ? "flex-end":"flex-start" }}>
              <div style={{ ...styles.bubble, ...(msg.type==="outgoing" ? styles.bubbleOut : styles.bubbleIn) }}>
                {msg.type === "outgoing" && msg.text && (
                  <div style={styles.originalText}>{msg.text}</div>
                )}
                {msg.wavBlob && (
                  <WaveformBubble
                    wavBlob={msg.wavBlob}
                    wavFilename={msg.wavFilename}
                    msgId={msg.id}
                    sessionId={sessionId}
                    socket={socket}
                    decodedText={msg.decodedText}
                  />
                )}
                <div style={styles.ts}>{new Date(msg.ts).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            placeholder="TYPE PLAINTEXT TO TRANSMIT  ·  DROP .txt FILE"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button style={styles.sendBtn} onClick={sendMessage}>TRANSMIT ▶</button>
        </div>
      </main>
    </div>
  );
}
function LegendRow({ color, label }) {
  return (
    <div style={styles.legendRow}>
      <span style={{ ...styles.legendDot, background: color }} />
      <span style={styles.legendLabel}>{label}</span>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [phase,     setPhase]     = useState("boot");   // boot | identity | session | chat
  const [identity,  setIdentity]  = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [socket,    setSocket]    = useState(null);

  async function handleIdentityReady(id) {
    setIdentity(id);

    // Create session on server
    const res  = await fetch(`${API_BASE}/api/session/create`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ codename: id.codename, public_key: id.publicKeyB64 }),
    });
    const data = await res.json();
    const sid  = data.session_id;
    setSessionId(sid);

    // Connect socket
    const sock = io(SOCKET_URL, { transports:["websocket"] });
    sock.on("connect", () => { sock.emit("join", { session_id: sid }); });
    setSocket(sock);
    setPhase("chat");
  }

  if (phase === "boot")     return <BootScreen onDone={() => setPhase("identity")} />;
  if (phase === "identity") return <IdentityScreen onReady={handleIdentityReady} />;
  if (phase === "chat")     return <ChatScreen identity={identity} sessionId={sessionId} socket={socket} />;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const FONT = "'Courier New', 'Lucida Console', monospace";
const C    = { bg:"#080c0f", panel:"#0d1117", border:"#1a2332", green:"#00ff88", orange:"#ff6b35", dim:"#3d5166", text:"#c9d6e3", faint:"#4a6580" };

const styles = {
  // Boot
  boot:         { display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, fontFamily:FONT },
  bootInner:    { textAlign:"center", maxWidth:680 },
  bootLogo:     { color:C.green, fontSize:10, lineHeight:"12px", margin:"0 0 24px", letterSpacing:1, textShadow:`0 0 20px ${C.green}55` },
  bootSubtitle: { color:C.faint, fontSize:11, letterSpacing:4, marginBottom:32 },
  bootBar:      { height:3, background:C.border, borderRadius:2, overflow:"hidden", margin:"0 0 16px" },
  bootFill:     { height:"100%", background:C.green, transition:"width .06s linear", boxShadow:`0 0 12px ${C.green}` },
  bootLine:     { color:C.text, fontSize:11, letterSpacing:2, minHeight:16 },
  bootPct:      { color:C.faint, fontSize:11, marginTop:8 },

  // Identity
  identity:     { display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, fontFamily:FONT },
  identityCard: { background:C.panel, border:`1px solid ${C.border}`, padding:"40px 48px", minWidth:420 },
  identityHint: { color:C.faint, fontSize:11, letterSpacing:1, marginBottom:20 },

  // Chat layout
  chatRoot:     { display:"flex", height:"100vh", background:C.bg, fontFamily:FONT, color:C.text, overflow:"hidden" },
  sidebar:      { width:220, background:C.panel, borderRight:`1px solid ${C.border}`, padding:"24px 16px", display:"flex", flexDirection:"column", gap:8, overflowY:"auto", flexShrink:0 },
  logo:         { color:C.green, fontSize:18, fontWeight:700, letterSpacing:6, marginBottom:16, textShadow:`0 0 16px ${C.green}88` },
  main:         { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topBar:       { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", borderBottom:`1px solid ${C.border}`, fontSize:11, letterSpacing:2 },
  sessionId:    { color:C.faint },
  statusDot:    { fontSize:11, letterSpacing:2 },
  msgList:      { flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 },
  dragOver:     { outline:`2px dashed ${C.green}`, outlineOffset:-2 },
  emptyState:   { color:C.dim, textAlign:"center", margin:"auto", fontSize:13, letterSpacing:2, lineHeight:2 },
  emptyHint:    { fontSize:10, color:C.faint },
  msgRow:       { display:"flex" },
  bubble:       { maxWidth:"72%", padding:"12px 14px", border:`1px solid ${C.border}` },
  bubbleOut:    { background:"#0a1520", borderColor:"#1e3a52" },
  bubbleIn:     { background:"#0c1209", borderColor:"#1a3020" },
  originalText: { color:C.text, fontSize:13, marginBottom:8, lineHeight:1.5 },
  ts:           { color:C.dim, fontSize:9, letterSpacing:1, marginTop:6, textAlign:"right" },
  inputRow:     { display:"flex", gap:0, borderTop:`1px solid ${C.border}`, padding:12, gap:8 },
  textarea:     { flex:1, background:C.panel, border:`1px solid ${C.border}`, color:C.text, fontFamily:FONT, fontSize:12, padding:"10px 12px", resize:"none", outline:"none" },
  sendBtn:      { background:"none", border:`1px solid ${C.green}`, color:C.green, fontFamily:FONT, fontSize:11, letterSpacing:3, padding:"0 20px", cursor:"pointer", whiteSpace:"nowrap" },

  // Waveform
  waveformBubble: { display:"flex", flexDirection:"column", gap:6 },
  waveCanvas:   { display:"block", background:"#040810", width:"100%", border:`1px solid ${C.border}` },
  bubbleActions:{ display:"flex", gap:6 },
  iconBtn:      { background:"none", border:`1px solid ${C.border}`, color:C.faint, fontFamily:FONT, fontSize:9, letterSpacing:2, padding:"4px 8px", cursor:"pointer" },
  analyzeBtn:   { borderColor:C.orange, color:C.orange },
  analyzing:    { opacity:.6 },

  // Decoded reveal
  decodedReveal:{ background:"#0a1a0d", border:`1px solid #1a3a22`, padding:"10px 12px", marginTop:4 },
  decodedLabel: { color:"#4ade80", fontSize:9, letterSpacing:3, display:"block", marginBottom:6 },
  decodedText:  { color:"#86efac", fontSize:13, fontFamily:FONT, wordBreak:"break-all", lineHeight:1.6 },

  // Sidebar
  sectionLabel: { color:C.faint, fontSize:9, letterSpacing:3, marginTop:4, marginBottom:4, borderBottom:`1px solid ${C.border}`, paddingBottom:4 },
  legend:       { display:"flex", flexDirection:"column", gap:6 },
  legendRow:    { display:"flex", alignItems:"center", gap:8 },
  legendDot:    { width:6, height:6, borderRadius:"50%", flexShrink:0 },
  legendLabel:  { color:C.faint, fontSize:9, letterSpacing:1 },
  keyInfo:      { background:"#0a1117", border:`1px solid ${C.border}`, padding:"8px 10px" },
  keyName:      { color:C.green, fontSize:12, letterSpacing:2, marginBottom:4 },
  keyFp:        { color:C.dim, fontSize:9, letterSpacing:1, wordBreak:"break-all" },
  peerTag:      { color:"#a78bfa", fontSize:10, letterSpacing:2, padding:"6px 0" },

  // Shared
  input:        { background:C.panel, border:`1px solid ${C.border}`, color:C.text, fontFamily:FONT, fontSize:11, padding:"8px 10px", outline:"none", width:"100%", boxSizing:"border-box" },
  primaryBtn:   { background:"none", border:`1px solid ${C.green}`, color:C.green, fontFamily:FONT, fontSize:10, letterSpacing:3, padding:"8px 0", cursor:"pointer", width:"100%", marginTop:4 },
  ghostBtn:     { background:"none", border:`1px solid ${C.border}`, color:C.text, fontFamily:FONT, fontSize:14, padding:"8px 14px", cursor:"pointer", flexShrink:0 },
  row:          { display:"flex", gap:6, marginBottom:12 },
};
