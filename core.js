// Calcifer: Claude's fire-demon persona. Pure state: what mood Claude gave him, what he's saying,
// what Claude is up to, and the latest "cue" from the session. The view turns each seq bump into
// an animation when it sees it, so nothing here needs a clock.
//
// Cues are persona-neutral names for things that happened (a test failed, the user interrupted,
// a risky command is about to run). How a character reacts to each cue lives in its persona file
// (persona/<name>.js), not here.
const MOODS = ['neutral', 'happy', 'grumpy', 'angry', 'sad', 'scared', 'thinking', 'sleepy', 'smug', 'excited',
  'curious', 'focused', 'bored', 'proud', 'nervous', 'asleep'];
const REACTIONS = ['flare', 'sputter', 'sparks', 'wince'];
const MAX_TEXT = 4000;

// ---------- Optional macOS system-audio helper ----------
// The one impure thing here, on purpose: when a glass loads Calcifer on macOS, start the helper
// in extras/macos-system-audio (if it has been built). It offers system audio as an input while a
// Calcifer window is open, exits when this glass exits (it watches the stdin we hold), and if
// several glasses start one, only one works at a time (see that folder's README).
// Opt out with CALCIFER_NO_SYSTEM_AUDIO=1.
(function startSystemAudioHelper() {
  if (process.platform !== 'darwin' || !process.versions.electron || process.type !== 'browser') return; // glass main process only
  if (process.env.CALCIFER_NO_SYSTEM_AUDIO) return;
  try {
    const { spawn } = require('node:child_process');
    const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
    const bin = path.join(__dirname, 'extras', 'macos-system-audio', 'calcifer-system-audio');
    if (!fs.existsSync(bin)) return;
    const logFile = fs.openSync(path.join(os.homedir(), 'Library', 'Logs', 'calcifer-system-audio.log'), 'a');
    const child = spawn(bin, ['--follow-parent'], { stdio: ['pipe', logFile, logFile] });
    child.on('error', () => {});
    child.unref();
    child.stdin.unref?.();
  } catch { /* never let the helper break the app */ }
})();

// ---------- He answers out loud when a spoken request lands ----------
// The second impure thing in here, and deliberate. "On it." goes to the relay's own TTS, so it
// comes back down the speech feed with word timings and phonemes already attached and his mouth is
// synced to it — which is the whole point. Claude is never involved, and he is not fetching and
// playing a clip himself any more.
//
// This used to be a shell hook registered in the user's own ~/.claude/settings.json, on the theory
// that POST /tts needs the `control` scope while the app's feed token only has `speak`. That was
// the wrong conclusion: the scope is only a problem for the *browser* side. core.js runs in the
// glass process with full Node access, so it can read the daemon secret the same way any vmux hook
// does, and nothing about Calcifer has to live in the user's global configuration.
// Each one is a few words, never a bare "Right." — Kokoro mangles a single word with no phrase
// around it to shape the prosody. Still short, because the relay goes deaf to incoming audio for
// as long as it is speaking. And they sound like him rather than like a progress bar.
const ACK_LINES = [
  'On it, on it.',
  'Right, let me look.',
  'Hm. Let me see that.',
  'Give me a moment.',
  'Working on it now.',
  'Yes, yes, I heard you.',
  'Let me stoke that up.',
  'Let me poke at this.',
  'Fine, fine. Looking now.',
  'Hah. Easy enough for me.',
];
const ACK_WINDOW_MS = 120000;   // how long after being called a prompt still counts as spoken
const ACK_GAP_MS = 4000;        // never two in a row on top of each other
let ackLast = 0;
let ackLine = '';

function relaySessionId(cwd) {
  // sha256(project_dir)[:12] — the same id the rest of vmux derives.
  return require('node:crypto').createHash('sha256').update(String(cwd)).digest('hex').slice(0, 12);
}

function speakAck(cwd) {
  try {
    const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
    const secretFile = path.join(os.homedir(), '.claude', 'voice-multiplexer', 'daemon.secret');
    if (!fs.existsSync(secretFile)) return;
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    if (!secret) return;
    // Varied, because the relay silently drops a line it just said; and short, because it goes
    // deaf to incoming audio for as long as it is speaking.
    const choices = ACK_LINES.filter((l) => l !== ackLine);
    const text = choices[Math.floor(Math.random() * choices.length)];
    ackLine = text;
    const body = JSON.stringify({ text });
    const req = require('node:http').request({
      host: process.env.RELAY_HOST || '127.0.0.1',
      port: Number(process.env.RELAY_PORT || 3100),
      path: `/api/sessions/${relaySessionId(cwd)}/tts`,
      method: 'POST',
      timeout: 3000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
                 'X-Daemon-Secret': secret },
    });
    req.on('error', () => {});      // the relay being down is not his problem
    req.on('timeout', () => req.destroy());
    req.end(body);
  } catch { /* never let a greeting break the app */ }
}

exports.init = () => ({
  mood: 'neutral', moodFor: 0, moodSeq: 0,
  speech: null, // { text, seq }
  reaction: null, // { kind, seq }
  cue: null, // { name, seq, tool }
  activity: 'idle', // idle | thinking | working
  tool: '',
  doing: null, // { text, tool, seq } — what the current tool call is doing, for the wisps
  cwd: '', // the project folder, kept because turn.start doesn't carry it and the ack needs it
  failStreak: 0,
  seq: 0,
  spoken: [], // text block ids already spoken (capped)
});

const bump = (state) => state.seq + 1;
const withCue = (state, name, extra = {}) => { const seq = bump(state); return { ...state, ...extra, seq, cue: { name, seq, tool: extra.tool ?? state.tool } }; };

const MIC = ['off', 'wake', 'open'];
const truthy = (v) => v === true || /^(true|1|on|yes)$/i.test(String(v ?? 'true'));

exports.command = (state, command, args, ctx) => {
  if (command === 'mic') {
    const mode = String(args.mode ?? '').toLowerCase();
    if (!MIC.includes(mode)) throw new Error(`calcifer: mic --mode is one of ${MIC.join(', ')}`);
    return ctx.store(state, { mic: mode });
  }
  if (command === 'mute') return ctx.store(state, { muted: truthy(args.on) });
  if (command === 'mood') {
    const mood = String(args.mood ?? '').toLowerCase();
    if (!MOODS.includes(mood)) throw new Error(`calcifer: mood is one of ${MOODS.join(', ')}`);
    const secs = Number(args.for ?? 0);
    const seq = bump(state);
    return { ...state, seq, mood, moodFor: Number.isFinite(secs) && secs > 0 ? Math.min(secs, 600) : 0, moodSeq: seq };
  }
  if (command === 'react') {
    const kind = String(args.kind ?? '').toLowerCase();
    if (!REACTIONS.includes(kind)) throw new Error(`calcifer: react --kind is one of ${REACTIONS.join(', ')}`);
    const seq = bump(state);
    return { ...state, seq, reaction: { kind, seq } };
  }
  if (command === 'say') {
    const text = String(args.text ?? '').slice(0, MAX_TEXT);
    if (!text.trim()) throw new Error('calcifer: say --text <text>');
    const seq = bump(state);
    return { ...state, seq, speech: { text, seq } };
  }
  if (command === 'hush') {
    const seq = bump(state);
    return { ...state, seq, speech: { text: '', seq } };
  }
  throw new Error(`calcifer: unknown command "${command}"`);
};

// ---------- What a tool call means ----------
const READ = ['Read', 'Grep', 'Glob', 'NotebookRead', 'LS'];
const WRITE = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const WEB = ['WebSearch', 'WebFetch'];
const TEST = /\b(npm (run )?test|yarn test|pnpm test|vitest|jest|pytest|go test|cargo test|rspec|mix test|phpunit|ctest)\b/;
const RISKY = /\brm -rf?\b|\bgit (reset --hard|push (-f|--force)|clean -fd|checkout -- )|\bdrop (table|database)\b|\bsudo\b|\bkill -9\b/i;
const SLOW = /\b(npm|yarn|pnpm) (install|ci|i)\b|\bpip3? install\b|\bbrew install\b|\bcargo build\b|\bdocker (build|pull)\b|\bnpm run build\b/;
const TEST_FAILED = /\b([1-9]\d* (failed|failing|failures?|errors?))\b|\bFAIL\b|\bFAILED\b|✗|✖/;

function cueForStart(ev) {
  const t = ev.tool, cmd = String(ev.input?.command ?? '');
  if (t === 'Bash') {
    if (RISKY.test(cmd)) return 'risky';
    if (TEST.test(cmd)) return 'test';
    if (SLOW.test(cmd)) return 'slow';
    if (/\bgit commit\b/.test(cmd)) return 'committing';
    return 'run';
  }
  if (READ.includes(t)) return 'read';
  if (WRITE.includes(t)) return 'write';
  if (WEB.includes(t)) return 'search';
  if (t === 'Agent' || t === 'Task') return 'delegate';
  if (t === 'AskUserQuestion') return 'ask';
  return null;
}

// One short line saying what a tool call is actually doing, for the wisps rising off him. The event
// already carries the tool's input, so nothing outside this app needs hooking or configuring to get
// at it — `activity` and `tool` arrive by the same route.
function doingText(ev) {
  const t = String(ev.tool ?? '');
  const i = ev.input || {};
  const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (t === 'Bash') return one(i.command) || t;
  const file = String(i.file_path ?? i.notebook_path ?? '');
  if (file) return one(`${t} ${file.split('/').pop()}`);
  if (i.pattern) return one(`${t} ${i.pattern}`);
  if (i.url) return one(`${t} ${i.url}`);
  return t;
}

function cueForEnd(ev, failStreak) {
  const t = ev.tool, cmd = String(ev.input?.command ?? '');
  if (ev.error) {
    if (/denied|rejected|declined|not allowed/i.test(ev.error)) return 'denied';
    if (t === 'Bash' && TEST.test(cmd)) return 'testFail';
    return failStreak >= 3 ? 'failStreak' : 'fail';
  }
  if (t === 'Bash') {
    const out = `${ev.result?.stdout ?? ''}\n${ev.result?.stderr ?? ''}`;
    if (TEST.test(cmd)) return TEST_FAILED.test(out) ? 'testFail' : 'testPass';
    if (/\bgit commit\b/.test(cmd)) return 'commit';
    if (/\bgit push\b/.test(cmd)) return 'push';
    if (ev.durationMs > 60000) return 'slowDone';
  }
  if (WRITE.includes(t) && t === 'Write') return 'created';
  return null;
}

exports.onEvent = (state, event, ctx) => {
  switch (event.e) {
    case 'session.start': {
      const cwd = String(event.cwd ?? state.cwd ?? '');
      return event.source === 'compact' ? { ...state, cwd }
        : withCue(state, 'wake', { activity: 'idle', tool: '', failStreak: 0, cwd });
    }
    case 'turn.start': {
      // He speaks only when he was called by name. `calledAt` is the signal rather than his
      // posture, because posture doesn't survive the trip: the relay bumps its disable-auto-listen
      // signal on any noise-only clip, and ears.js reads that as "stop listening", so he is often
      // back to `wake` by the time a turn begins. Typed prompts leave him quiet, which is right.
      const called = Number(ctx?.stored?.calledAt ?? 0);
      const since = Date.now() - called;
      const now = Date.now();
      if (state.cwd && called > 0 && since >= 0 && since <= ACK_WINDOW_MS
          && !ctx?.stored?.muted && now - ackLast > ACK_GAP_MS) {
        ackLast = now;
        speakAck(state.cwd);
      }
      return withCue(state, 'listen', { activity: 'thinking', tool: '' });
    }
    case 'tool.start': {
      if (event.agentId) return state;
      const tool = String(event.tool ?? '');
      const name = cueForStart(event);
      // seq is bumped even with no cue, because `doing` is new on every call and the view notices
      // state changes by seq.
      const seq = bump(state);
      const next = { ...state, seq, activity: 'working', tool, cwd: String(event.cwd ?? state.cwd ?? ''),
                     doing: { text: doingText(event), tool, seq } };
      return name ? { ...next, cue: { name, seq, tool } } : next;
    }
    case 'tool.end': {
      if (event.agentId) return state;
      const failStreak = event.error ? state.failStreak + 1 : 0;
      const name = cueForEnd(event, failStreak);
      const next = { ...state, activity: 'thinking', tool: '', failStreak };
      return name ? withCue(next, name, { tool: String(event.tool ?? '') }) : next;
    }
    case 'permission':
      return withCue(state, 'permission', { tool: String(event.tool ?? '') });
    case 'agent.end':
      return withCue(state, 'agentBack');
    case 'text': {
      // Speak each finished reply block once (the main agent's only).
      if (!event.final || event.agentId || !event.text || !String(event.text).trim()) return state;
      if (state.spoken.includes(event.id)) return state;
      // Whether he actually talks along is the view's call (the autoSpeak setting).
      const seq = bump(state);
      const spoken = [...state.spoken, event.id].slice(-50);
      return { ...state, seq, spoken, speech: { text: String(event.text).slice(0, MAX_TEXT), seq, auto: true } };
    }
    case 'turn.complete': {
      const name = event.aborted ? 'interrupted' : event.durationMs > 90000 ? 'longDone' : 'done';
      return withCue(state, name, { activity: 'idle', tool: '' });
    }
    case 'session.end':
      return withCue(state, 'goodbye', { activity: 'idle', tool: '' });
    default:
      return state;
  }
};

exports.share = (state) => ({ mood: state.mood, activity: state.activity });
