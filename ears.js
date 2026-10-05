// Calcifer's ears: the user's microphone, so the vmux pane isn't needed.
//
// Mic postures (the stored value `mic`):
//   off   nothing listens; the mic isn't even open
//   wake  he is in the room but silent in it, while his own spotter (wake/spotter.js) listens for
//         his name here: three small ONNX models in this window, nothing transcribed and nothing
//         sent anywhere. Hearing it opens the mic.
//   open  a conversation: the mic is published to the session's LiveKit room on the user's turn
//         and closed during Claude's (the SDK's VoiceTurn), exactly like the vmux pane
// His name plus more ("Calcifer, run the tests") sends the rest at once and stays in conversation.
// "Calcifer, stop listening", the relay's silence timeout, or a minute of nobody talking on the
// user's turn drops back to wake. "Calcifer, hush" / "speak up" mute and unmute his voice.
(function () {
// No transcription happens in this file. He used to have a wake word that cut his own clips and
// posted them to a Whisper server — a second transcription path beside the relay's, with its own
// resampler and its own prompt, transcribing three times as much audio as the real conversation
// only to throw nearly all of it away. That is gone for good. The spotter that replaced it never
// transcribes anything: it scores 80 ms of audio against his name and says yes or no, and the only
// words anyone transcribes are the ones LiveKit carries once his mic is actually open.
const NAME = 'KLSFR';               // "Calcifer", as consonants
const QUIET_MS = 120000;            // fallback: conversation ends after this long with nobody talking

// ---------- Hearing his name in a transcript the relay already made ----------
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
  // His name at the end of a short utterance calls him too ("You're so bad. Calcifer."): a close
  // match, nothing much after it, and not a real word that sounds like him (classifier, calls for).
  // That only wakes him; nothing is sent.
  if (words.length <= 8)
    for (let j = i + 1; j < words.length; j++)
      for (let n = 1; n <= 2 && j + n <= words.length && words.length - (j + n) <= 2; n++) {
        const w = words.slice(j, j + n).join('').toLowerCase();
        if (!/^(class|calls)/.test(w) && soundsLikeName(skeleton(w), n) === 'close') return { rest: '' };
      }
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

// ---------- Which mic LiveKit should capture from ----------
// No stream is held here. This only names a device, so the room can be told which one to use.
const ear = { choice: null, deviceId: '', label: '', note: '', err: '' };
// Which mic: the setting's name (or any part of it, "AirPods"), else the most reasonable one: the
// system default unless that's a loopback or virtual device (BlackHole, Loopback...), then the
// built-in mic, then any real one.
const VIRTUAL = /system audio|blackhole|loopback|aggregate|soundflower|virtual|background music|zoomaudio|teams audio/i;
navigator.mediaDevices?.addEventListener?.('devicechange', () => { ear.deviceId = ''; });
async function pickMic(want) {
  const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const inputs = all.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
  let err = '';
  if (want) {
    const hit = inputs.find((d) => d.label.toLowerCase().includes(want.toLowerCase()));
    if (hit) return { device: hit };
    err = `No microphone matches "${want}": using another mic`;
  }
  const defLabel = (all.find((d) => d.deviceId === 'default')?.label || '').replace(/^Default\s*-\s*/i, '');
  const real = inputs.filter((d) => !VIRTUAL.test(d.label));
  return { err, device: real.find((d) => d.label === defLabel) || real.find((d) => /built-in|macbook/i.test(d.label)) || real[0] || inputs[0] || null };
}
// Device labels are hidden until the mic has been allowed once, so this asks, reads the list, and
// lets go of the stream again — LiveKit opens the real one.
let resolving = null;
function resolveMic() {
  if (ear.deviceId || resolving) return;
  resolving = (async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { device, err } = await pickMic(ear.choice);
      probe.getTracks().forEach((t) => t.stop());
      Object.assign(ear, { deviceId: device?.deviceId || '', label: device?.label || 'default input', note: err || '', err: '' });
    } catch (e) { ear.err = `Mic: ${e?.message || e}`; }
    finally { resolving = null; }
  })();
}
// ---------- The conversation: the session's LiveKit room ----------
// He joins once and stays joined, reconnecting only if it drops; his mic is switched on and off
// inside that one connection rather than by joining and leaving. Rejoining per utterance meant a
// fresh participant and a fresh audio stream for the relay every time (144 in one session), and
// each one left a stream behind to be cleaned up.
const room = { client: null, voice: null, turn: null, unsub: null, unfollow: null, micWant: false,
  busy: false, err: '', live: false, retryAt: 0, loading: null };
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
  let voice = null;
  try {
    await loadVoiceLibrary(base);
    voice = new window.VmuxVoice.VoiceClient(client, { mode: 'full', playAgentAudio: false });
    voice.on('micEnabled', (on) => { room.live = on; });
    // Gone for its own reasons (sleep, a relay restart): forget it and let tick rejoin shortly
    voice.on('disconnected', () => { if (room.voice === voice) dropRoom(1500); });
    await voice.join();
    // The same mic his ear uses (the LiveKit room is the VoiceClient's own, not in its API)
    const lk = voice.room, deviceId = ear.deviceId;
    if (lk && deviceId) {
      lk.options.audioCaptureDefaults = { ...lk.options.audioCaptureDefaults, deviceId };
      await lk.switchActiveDevice('audioinput', deviceId).catch(() => {});
    }
    await voice.setMicEnabled(false);   // in the room, but silent until his posture opens the mic
    room.deviceId = deviceId;
    const turn = new window.VmuxClient.VoiceTurn('active');
    const follow = () => {
      const s = client.getState();
      const users = (s.transcripts[s.connectedSessionId ?? ''] || []).filter((e) => e.speaker === 'user').length;
      turn.update(s.agentStatus.state, users);
    };
    follow();
    Object.assign(room, { client, voice, turn, unsub: client.subscribe(follow), err: '', micWant: false });
  } catch (e) {
    // He may already have joined before this threw. Leave, or he sits in the room as a publisher
    // nothing is tracking and the next attempt puts another one in beside him.
    if (voice) { try { await voice.leave(); } catch {} }
    room.err = `Mic room: ${e?.message || e}`;
    room.retryAt = performance.now() + 5000;
  } finally { room.busy = false; }
}
// Forget a room that is already gone (nothing to leave), so tick rejoins after `wait` ms.
function dropRoom(wait) {
  const { unsub, unfollow } = room;
  Object.assign(room, { client: null, voice: null, turn: null, unsub: null, unfollow: null,
    live: false, micWant: false, retryAt: performance.now() + wait });
  unfollow?.(); unsub?.();
}
// Audio is pumped into the held connection only while he's listening: the turn drives the mic
// while he's open, and otherwise the mic goes off — never the connection.
async function setMicLive(on) {
  const { voice, turn } = room;
  if (!voice) return;
  room.micWant = on;
  try {
    if (on && turn) room.unfollow = voice.followTurn(turn);
    else { room.unfollow?.(); room.unfollow = null; await voice.setMicEnabled(false); }
  } catch (e) { room.err = `Mic: ${e?.message || e}`; }
}
async function leaveRoom() {
  const { voice, unsub, unfollow } = room;
  Object.assign(room, { client: null, voice: null, turn: null, unsub: null, unfollow: null, live: false, micWant: false });
  unfollow?.(); unsub?.();
  if (voice) { room.busy = true; try { await voice.leave(); } catch {} room.busy = false; }
}

// ---------- How loud the user is, right now ----------
// Nothing in the vmux SDK reports this: SpeechPlayer.level() is *his* voice coming out, and the
// LiveKit room's own speaker levels are server-side and too coarse and too late. So an analyser
// hangs off the local mic track — connected to nothing else, so it reads the audio without a
// single sample reaching the speakers.
//
// Two things depend on it. The coals pulse with it, so it is visibly his hearing rather than a
// lamp that is on. And it is evidence that someone is talking *now*, which transcripts cannot be:
// a transcript only lands once an utterance has finished and been sent away, several seconds late.
// The follow-up window was closing mid-sentence for exactly that reason.
const meter = { ctx: null, src: null, node: null, buf: null, level: 0, track: null };
const SPEAKING = 0.012;        // raw RMS above this and someone is saying something

function attachMeter(lk) {
  try {
    const lp = lk?.localParticipant;
    const pubs = lp?.audioTrackPublications ?? lp?.audioTracks ?? lp?.trackPublications;
    const list = pubs ? (typeof pubs.values === 'function' ? [...pubs.values()] : [...pubs]) : [];
    const track = list.map((p) => p?.track?.mediaStreamTrack)
      .find((t) => t && t.kind === 'audio' && t.readyState === 'live');
    if (!track || track === meter.track) return;
    detachMeter();
    meter.ctx ??= new AudioContext();
    meter.track = track;
    meter.src = meter.ctx.createMediaStreamSource(new MediaStream([track]));
    meter.node = meter.ctx.createAnalyser();
    meter.node.fftSize = 512;
    meter.buf = new Float32Array(meter.node.fftSize);
    meter.src.connect(meter.node);         // and no further: an analyser is a dead end
    meter.ctx.resume?.();
  } catch { /* a level meter is a nicety; never let it take the mic down with it */ }
}

function detachMeter() {
  try { meter.src?.disconnect(); meter.node?.disconnect(); } catch {}
  Object.assign(meter, { src: null, node: null, buf: null, track: null, level: 0 });
}

function readLevel() {
  // Same hazard as everywhere else audio lives: a sleeping machine suspends the context, and a
  // suspended analyser reads a flat zero forever — which would look exactly like a silent room and
  // would quietly take the coals and the speech timer with it.
  if (meter.ctx && meter.ctx.state !== 'running') meter.ctx.resume?.().catch(() => {});
  if (!meter.node || !meter.buf) return 0;
  meter.node.getFloatTimeDomainData(meter.buf);
  let sum = 0;
  for (let i = 0; i < meter.buf.length; i++) sum += meter.buf[i] * meter.buf[i];
  const rms = Math.sqrt(sum / meter.buf.length);
  // Fast attack, slow release: the coals catch each syllable but don't strobe between them.
  meter.level = rms > meter.level ? rms * 0.6 + meter.level * 0.4 : rms * 0.12 + meter.level * 0.88;
  return meter.level;
}

// ---------- Each frame ----------
const conv = { silenceSeq: null, usersSeen: null, idleSince: 0, claudeTurnEnded: 0, statusAt: 0,
               spokeAt: 0, wasClaudesTurn: false, followUntil: 0 };
const ears = {
  findName, skeleton, voiceCommand, endsConversation,
  // ---------- Butting in ----------
  // Three separate things have to happen to interrupt him, and the SDK already has all three:
  // stop Claude generating (`interrupt`), stop the speech that is already queued at the relay
  // (`cancelTts` — otherwise he keeps talking through the reply that has been abandoned), and
  // put the mic live *during* what is still Claude's turn, which `VoiceTurn.beginTalkOver` exists
  // for. Without the last one the mic stays shut until the turn ends and the interruption is
  // silent.
  barge(sessionId) {
    const { client, turn } = room;
    if (!client) return false;
    try { client.interrupt(); } catch {}
    try { if (sessionId) client.cancelTts(sessionId); } catch {}
    try { turn?.beginTalkOver(); } catch {}
    conv.spokeAt = performance.now();   // treat it as the start of their turn, not a dead moment
    conv.followUntil = 0;
    return true;
  },
  // ctx: { client, base, posture, sessionId }; returns what the scene shows.
  tick({ client, base, posture, sessionId, micDevice = '', quietMs = QUIET_MS, followMs = 0 }) {
    const now = performance.now();
    if (ear.choice !== micDevice) { ear.choice = micDevice; ear.deviceId = ''; }   // a different mic chosen
    if (posture !== 'off') resolveMic();
    if (room.voice && !room.busy && ear.deviceId && room.deviceId !== ear.deviceId) leaveRoom(); // rejoin on it
    const s = client?.getState();
    const agent = s?.agentStatus?.state || 'idle';
    const usersTurn = agent === 'idle';
    if (!usersTurn) conv.claudeTurnEnded = now;

    // Conversation: he joins while his ear is on at all and holds that connection. Posture decides
    // whether his mic is live in it, not whether he's in the room.
    const ready = client && s?.connectedSessionId === sessionId;
    const wantRoom = posture !== 'off' && ready;
    if (wantRoom && !room.voice && !room.busy && now > room.retryAt) joinRoom(client, base);
    if ((!wantRoom || (room.client && room.client !== client)) && room.voice && !room.busy) leaveRoom();
    // Open means his mic is live in the room. Nothing else listens: no local stream, no clips.
    const micLive = posture === 'open';
    if (room.voice && !room.busy && room.micWant !== micLive) setMicLive(micLive);

    // Is someone talking into it this instant?
    if (room.live && room.voice?.room) attachMeter(room.voice.room);
    else if (!room.live && meter.track) detachMeter();
    const level = room.live ? readLevel() : 0;
    if (level > SPEAKING) {
      // Proof of speech, and the only timely proof there is. It resets the quiet countdown and
      // cancels the follow-up window, so starting to talk inside that window keeps the mic open
      // for as long as the user keeps going — the same behaviour as being called by name, because
      // it is now literally the same timer.
      conv.spokeAt = now;
      conv.followUntil = 0;
    }

    // Ending a conversation: the relay's silence signal, or a long quiet on the user's turn
    if (s) {
      if (conv.silenceSeq === null) conv.silenceSeq = s.disableAutoListenSeq;
      if (s.disableAutoListenSeq !== conv.silenceSeq) {
        conv.silenceSeq = s.disableAutoListenSeq;
        if (posture === 'open') ears.onCommand?.('stop', 'silence');
      }
      // Spoken commands during a conversation arrive in the transcript, already transcribed. Read
      // before the quiet timer, because every utterance that lands is proof he should keep waiting.
      const users = (s.transcripts[sessionId] || []).filter((e) => e.speaker === 'user');
      if (conv.usersSeen === null) conv.usersSeen = users.length;
      for (const e of users.slice(conv.usersSeen)) {
        conv.spokeAt = now;
        conv.followUntil = 0;        // he answered the opening, so this is a conversation again
        const m = findName(e.text || ''), cmd = m ? voiceCommand(m.rest) : endsConversation(e.text || '');
        if (cmd) ears.onCommand?.(cmd, 'transcript');
      }
      conv.usersSeen = users.length;

      if (posture === 'open' && usersTurn && room.voice) {
        conv.idleSince ||= now;
        // The clock runs from the last thing that happened, the user's last utterance included.
        // It used to run from whenever the turn began, so talking for longer than the timeout
        // dropped him mid-sentence — the opposite of letting someone speak as long as they like.
        const last = Math.max(conv.idleSince, conv.claudeTurnEnded, conv.spokeAt);
        if (now - last > quietMs) ears.onCommand?.('stop', 'quiet');
        // The follow-up window: opened for a few seconds after Claude finishes so a reply needs no
        // second calling. Nothing said in that window and he goes back to listening for his name.
        if (conv.followUntil && now > conv.followUntil) {
          conv.followUntil = 0;
          ears.onCommand?.('stop', 'no follow-up');
        }
      } else conv.idleSince = 0;

      // Claude just stopped talking. If they were mid-conversation, open his mic again rather than
      // make them say his name to answer the thing he just said.
      if (usersTurn && conv.wasClaudesTurn && followMs > 0 && posture === 'wake'
          && conv.spokeAt && now - conv.spokeAt < 180000) {
        conv.followUntil = now + followMs;
        ears.onCommand?.('follow', 'turn ended');
      }
      conv.wasClaudesTurn = !usersTurn;
    }

    const phase = posture === 'off' ? 'off'
      : !room.voice ? 'joining'
      : posture === 'wake' ? 'waking'
      : room.live ? 'listening' : 'waiting';
    // Why he is or isn't listening, for `claude-glass stored calcifer` (earStatus), every few seconds
    if (now - conv.statusAt > 3000) {
      conv.statusAt = now;
      ears.onStatus?.({ at: new Date().toISOString(), posture, phase, agent, mic: ear.label,
        room: room.voice ? (room.live ? 'mic live' : 'joined') : room.busy ? 'joining' : 'none',
        relay: s ? (s.connectedSessionId === sessionId ? 'connected' : `session ${s.connectedSessionId}`) : 'no client', note: ear.note || '', err: ear.err || room.err || '' });
    }
    // deviceId goes out so the spotter opens the very same input he would publish from — picking
    // its own would make the thing that hears his name and the thing that carries the sentence
    // after it two different microphones.
    return { phase, level: Math.min(1, level * 5), deviceId: ear.deviceId, agent,
             err: ear.err || room.err,
             mic: ear.note ? `${ear.label} (${ear.note})` : ear.label };
  },
  onCommand: null,
};
window.EARS = ears;
})();
