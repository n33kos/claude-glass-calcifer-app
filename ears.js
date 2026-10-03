// Calcifer's ears: the user's microphone, so the vmux pane isn't needed.
//
// Mic postures (the stored value `mic`):
//   off   nothing listens; the mic isn't even open
//   wake  only his own wake listener runs: each short burst of speech goes to the local Whisper
//         (the one vmux already runs), and hearing his name starts a conversation
//   open  a conversation: the mic is published to the session's LiveKit room on the user's turn
//         and closed during Claude's (the SDK's VoiceTurn), exactly like the vmux pane
// His name plus more ("Calcifer, run the tests") sends the rest at once and stays in conversation.
// "Calcifer, stop listening", the relay's silence timeout, or a minute of nobody talking on the
// user's turn drops back to wake. "Calcifer, hush" / "speak up" mute and unmute his voice.
(function () {
const WHISPER_URL = 'http://localhost:8100/v1/audio/transcriptions';
const NAME = 'KLSFR';               // "Calcifer", as consonants
const QUIET_MS = 60000;             // conversation ends after this long with nobody talking
const COOLDOWN_MS = 1500;           // after Claude's turn: his own voice's tail can't wake him
const MAX_CLIP_MS = 7000;

// ---------- Hearing his name ----------
// Whisper almost never spells him right ("Call Cypher", "Cal Cipher", "Kels4"), so words are
// compared by how they sound: their consonant skeleton. Calcifer, Call Cypher, Kels4 -> KLSFR.
function skeleton(s) {
  return String(s).toLowerCase().replace(/4/g, 'for').replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f').replace(/c(?=[eiy])/g, 's').replace(/[cqgk]/g, 'k').replace(/[vbp]/g, 'f') // "C saber"
    .replace(/z/g, 's').replace(/x/g, 'ks').replace(/[aeiouyhw]/g, '')
    .replace(/(.)\1+/g, '$1').toUpperCase();
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Leaning permissive (the user would rather mute the mic than repeat his name): close matches over
// up to three words, and looser ones ("'cause first", two edits off) over at most two, so a
// sentence like "could you search for..." doesn't count.
// 'close' | 'loose' | false. A loose match wakes him but what follows isn't sent ("clean up the branch").
function soundsLikeName(sk, words) {
  if (sk[0] !== 'K' || sk.length < 4) return false;
  if (sk.startsWith(NAME) || (sk.length <= 6 && lev(sk, NAME) <= 1)) return 'close';
  if (words <= 2 && sk.slice(1).includes('F') && lev(sk.slice(0, NAME.length), NAME) <= 2) return 'loose'; // the "-cifer" F, so not "close the"
  return false;
}
// Addressed to him: his name first (after a greeting, if any). { rest } is what came after it.
// Only at the start, so "the classifier is broken" doesn't count.
const GREETING = /^(hey|hi|hello|ok|okay|oh|yo|um|uh|so|alright)$/;
function findName(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && i < 2 && GREETING.test(words[i].toLowerCase().replace(/[^a-z]/g, ''))) i++;
  const rest = (k, loose = false) => ({ rest: words.slice(k).join(' ').replace(/^[\s,.!?;:—–-]+/, '').trim(), ...(loose ? { loose } : {}) });
  for (let n = 1; n <= 3 && i + n <= words.length; n++) {
    const m = soundsLikeName(skeleton(words.slice(i, i + n).join('')), n);
    if (m) return rest(i + n, m === 'loose');
  }
  // "Cal" for short, but only greeted ("hey Cal") or on its own, so "call the API" isn't him
  if (skeleton(words[i] || '') === 'KL' && (i > 0 || words.length === 1)) return rest(i + 1);
  return null;
}
const STOP = /^(please )?(stop listening|stop|go (back )?to sleep|that'?s all|that will be all|good ?night|you can stop|never ?mind)$/;
const MUTE = /^(please )?(hush|mute|be quiet|quiet|shh+|shush|silence)$/;
const UNMUTE = /^(please )?(unmute|speak up|talk to me|you can talk|speak)$/;
// In a conversation his name is often misheard past recognizing ("'cause first stop listening"),
// so a short utterance ending in "stop listening" / "go to sleep" ends it without the name.
function endsConversation(text) {
  const words = String(text).toLowerCase().replace(/[^a-z' ]/g, ' ').trim().split(/\s+/);
  return words.length <= 5 && /(stop listening|go to sleep)$/.test(words.join(' ')) ? 'stop' : null;
}
function voiceCommand(rest) {
  const r = rest.toLowerCase().replace(/[.,!?'"]/g, '').replace(/\s+/g, ' ').trim();
  if (STOP.test(r)) return 'stop';
  if (MUTE.test(r)) return 'mute';
  if (UNMUTE.test(r)) return 'unmute';
  return null;
}

// ---------- The mic, for his wake listener and his ear-glow ----------
const ear = { want: false, stream: null, ctx: null, proc: null, level: 0, floor: 0.004, pre: [], rec: null,
  armed: false, transcribing: 0, heardAt: 0, err: '', opening: null };
async function openMic() {
  if (ear.stream || ear.opening) return;
  ear.opening = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!ear.want) { stream.getTracks().forEach((t) => t.stop()); return; }
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      const sink = ctx.createGain(); sink.gain.value = 0;        // runs the processor, plays nothing
      src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
      proc.onaudioprocess = (e) => onBlock(e.inputBuffer.getChannelData(0), ctx.sampleRate);
      for (const t of stream.getAudioTracks()) t.addEventListener('ended', () => { closeMic(); });
      ctx.resume?.();
      Object.assign(ear, { stream, ctx, proc, err: '' });
    } catch (e) { ear.err = `Mic: ${e?.message || e}`; }
    finally { ear.opening = null; }
  })();
}
function closeMic() {
  ear.stream?.getTracks().forEach((t) => t.stop());
  ear.proc && (ear.proc.onaudioprocess = null);
  ear.ctx?.close?.();
  Object.assign(ear, { stream: null, ctx: null, proc: null, rec: null, pre: [], level: 0 });
}
// Every ~40 ms of mic: track loudness, and cut bursts of speech into clips (with a little audio
// from just before, so the first consonant isn't lost).
function onBlock(x, rate) {
  let sum = 0; for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const rms = Math.sqrt(sum / x.length), ms = (x.length / rate) * 1000;
  ear.level = Math.max(rms * 8, ear.level * 0.82);
  if (!ear.rec) ear.floor = rms < ear.floor ? ear.floor * 0.9 + rms * 0.1 : ear.floor * 1.0008;
  const loud = rms > Math.max(0.012, ear.floor * 3);
  if (loud) ear.heardAt = performance.now();
  const block = new Float32Array(x);
  if (!ear.rec) {
    ear.pre.push(block); if (ear.pre.length > 8) ear.pre.shift();
    if (loud && ear.armed) { ear.rec = { blocks: [...ear.pre], ms: 0, loudMs: 0, quietMs: 0, rate, startedAt: performance.now() }; ear.pre = []; }
    return;
  }
  const r = ear.rec;
  r.blocks.push(block); r.ms += ms;
  if (loud) { r.loudMs += ms; r.quietMs = 0; } else r.quietMs += ms;
  if (r.quietMs > 550 || r.ms > MAX_CLIP_MS) {
    ear.rec = null;
    if (r.loudMs >= 220 && ear.armed) heard(r);
  }
}
// Clips are transcribed one at a time, in order, and he keeps recording meanwhile: a pause after
// his name ("Calcifer... run the tests") would otherwise lose what came next while the mic room
// is still opening. So after his name alone, the next few seconds of speech are sent as text.
const FOLLOW_MS = 5000;
let chain = Promise.resolve();
function heard(clip) {
  ear.transcribing++;
  chain = chain.then(async () => {
    try {
      const text = await transcribe(clip);
      if (!text) return;
      const m = findName(text);
      if (m) {
        const rest = m.loose && !voiceCommand(m.rest) ? '' : m.rest; // a loose match only wakes him
        if (!rest) conv.followUntil = performance.now() + FOLLOW_MS;
        ears.onName?.(rest, text);
      } else if (clip.startedAt < conv.followUntil && !/^\W*(thank you|thanks|you)\W*$/i.test(text)) {
        conv.followUntil = 0;
        ears.onFollow?.(text);
      }
    } catch (e) { ear.err = `Wake listener: ${e?.message || e}`; }
    finally { ear.transcribing--; }
  });
}
async function transcribe({ blocks, rate }) {
  let n = 0; for (const b of blocks) n += b.length;
  const pcm = new Float32Array(n); let o = 0; for (const b of blocks) { pcm.set(b, o); o += b.length; }
  const out = resample(pcm, rate, 16000);
  const fd = new FormData();
  fd.append('file', new Blob([wav(out, 16000)], { type: 'audio/wav' }), 'wake.wav');
  fd.append('model', 'whisper-1');
  fd.append('prompt', 'Calcifer, the fire demon.');
  fd.append('temperature', '0');
  fd.append('response_format', 'json');
  const res = await fetch(WHISPER_URL, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Whisper answered ${res.status}`);
  ear.err = '';
  return String((await res.json()).text || '').trim();
}
function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from), out = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) {           // average over each output sample's span (a cheap low-pass)
    const a = Math.floor(i * k), b = Math.min(x.length, Math.floor((i + 1) * k));
    let s = 0; for (let j = a; j < b; j++) s += x[j];
    out[i] = b > a ? s / (b - a) : x[a] || 0;
  }
  return out;
}
function wav(x, rate) {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return buf;
}

// ---------- The conversation: the session's LiveKit room ----------
const room = { client: null, voice: null, turn: null, unsub: null, busy: false, err: '', live: false, retryAt: 0, loading: null };
function loadVoiceLibrary(base) {
  if (window.VmuxVoice) return Promise.resolve();
  room.loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${base}/sdk/vmux-voice.js`;
    s.onload = () => (window.VmuxVoice ? resolve() : reject(new Error('mic library did not load')));
    s.onerror = () => { room.loading = null; reject(new Error(`can't load ${s.src}`)); };
    document.head.append(s);
  });
  return room.loading;
}
async function joinRoom(client, base) {
  room.busy = true;
  try {
    await loadVoiceLibrary(base);
    const voice = new window.VmuxVoice.VoiceClient(client, { mode: 'full', playAgentAudio: false });
    voice.on('micEnabled', (on) => { room.live = on; });
    await voice.join();
    const turn = new window.VmuxClient.VoiceTurn('active');
    const follow = () => {
      const s = client.getState();
      const users = (s.transcripts[s.connectedSessionId ?? ''] || []).filter((e) => e.speaker === 'user').length;
      turn.update(s.agentStatus.state, users);
    };
    follow();
    Object.assign(room, { client, voice, turn, unsub: client.subscribe(follow), err: '' });
    voice.followTurn(turn);
  } catch (e) {
    room.err = `Mic room: ${e?.message || e}`;
    room.retryAt = performance.now() + 5000;
  } finally { room.busy = false; }
}
async function leaveRoom() {
  const { voice, unsub } = room;
  Object.assign(room, { client: null, voice: null, turn: null, unsub: null, live: false });
  unsub?.();
  if (voice) { room.busy = true; try { await voice.leave(); } catch {} room.busy = false; }
}

// ---------- Each frame ----------
const conv = { silenceSeq: null, usersSeen: null, idleSince: 0, claudeTurnEnded: 0, followUntil: 0 };
const ears = {
  findName, skeleton, voiceCommand, endsConversation,
  onName: null,
  // ctx: { client, base, posture, sessionId }; returns what the scene shows.
  tick({ client, base, posture, sessionId }) {
    const now = performance.now();
    ear.want = posture !== 'off';
    if (ear.want) openMic(); else if (ear.stream) closeMic();
    const s = client?.getState();
    const agent = s?.agentStatus?.state || 'idle';
    const usersTurn = agent === 'idle';
    if (!usersTurn) conv.claudeTurnEnded = now;
    // His wake listener only listens on the user's turn, and not right after Claude spoke. Just
    // after his name it keeps listening (the follow-up), and the room's mic waits until it's done.
    const following = posture === 'open' && usersTurn && (now < conv.followUntil || ear.transcribing > 0);
    ear.armed = (posture === 'wake' && usersTurn && now - conv.claudeTurnEnded > COOLDOWN_MS) || following;
    if (!ear.armed) ear.rec = null;

    // Conversation: in the room while open, out of it otherwise
    const ready = client && s?.connectedSessionId === sessionId;
    if (posture === 'open' && ready && !following && !ear.rec && !room.voice && !room.busy && now > room.retryAt) joinRoom(client, base);
    if ((posture !== 'open' || (room.client && room.client !== client)) && room.voice && !room.busy) leaveRoom();

    // Ending a conversation: the relay's silence signal, or a long quiet on the user's turn
    if (s) {
      if (conv.silenceSeq === null) conv.silenceSeq = s.disableAutoListenSeq;
      if (s.disableAutoListenSeq !== conv.silenceSeq) {
        conv.silenceSeq = s.disableAutoListenSeq;
        if (posture === 'open') ears.onCommand?.('stop', 'silence');
      }
      if (posture === 'open' && usersTurn && room.voice) {
        conv.idleSince ||= now;
        if (now - Math.max(conv.idleSince, ear.heardAt, conv.claudeTurnEnded) > QUIET_MS) ears.onCommand?.('stop', 'quiet');
      } else conv.idleSince = 0;
      // Spoken commands during a conversation arrive in the transcript, already transcribed
      const users = (s.transcripts[sessionId] || []).filter((e) => e.speaker === 'user');
      if (conv.usersSeen === null) conv.usersSeen = users.length;
      for (const e of users.slice(conv.usersSeen)) {
        const m = findName(e.text || ''), cmd = m ? voiceCommand(m.rest) : endsConversation(e.text || '');
        if (cmd) ears.onCommand?.(cmd, 'transcript');
      }
      conv.usersSeen = users.length;
    }

    const phase = posture === 'off' ? 'off'
      : posture === 'wake' ? (ear.rec || ear.transcribing ? 'hearing' : ear.armed ? 'wake' : 'resting')
      : following ? 'listening'
      : !room.voice ? 'joining'
      : room.live ? 'listening' : 'waiting';
    return { phase, level: Math.min(1, ear.level), err: ear.err || room.err };
  },
  onCommand: null,
};
window.EARS = ears;
})();
