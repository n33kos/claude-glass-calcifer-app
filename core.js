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

exports.init = () => ({
  mood: 'neutral', moodFor: 0, moodSeq: 0,
  speech: null, // { text, seq }
  reaction: null, // { kind, seq }
  cue: null, // { name, seq, tool }
  activity: 'idle', // idle | thinking | working
  tool: '',
  failStreak: 0,
  seq: 0,
  spoken: [], // text block ids already spoken (capped)
});

const bump = (state) => state.seq + 1;
const withCue = (state, name, extra = {}) => { const seq = bump(state); return { ...state, ...extra, seq, cue: { name, seq, tool: extra.tool ?? state.tool } }; };

exports.command = (state, command, args) => {
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

exports.onEvent = (state, event) => {
  switch (event.e) {
    case 'session.start':
      return event.source === 'compact' ? state : withCue(state, 'wake', { activity: 'idle', tool: '', failStreak: 0 });
    case 'turn.start':
      return withCue(state, 'listen', { activity: 'thinking', tool: '' });
    case 'tool.start': {
      if (event.agentId) return state;
      const tool = String(event.tool ?? '');
      const name = cueForStart(event);
      const next = { ...state, activity: 'working', tool };
      return name ? withCue(next, name, { tool }) : next;
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
