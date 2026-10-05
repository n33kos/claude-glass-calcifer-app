// His insides: the live tmux pane Claude runs in, burning in his core.
//
// The same pipe the vmux web app's terminal uses, so the same lessons apply. The relay polls
// `tmux capture-pane -e` every 150ms and sends each snapshot as `terminal_data`; keys go back as
// `terminal_input` (tmux send-keys), and a refit sends `terminal_resize` (tmux resize-window).
// What vmux learned the hard way, kept here:
//   - each snapshot is written after cursor-home, never after a clear: clearing flashed the
//     canvas blank on every poll. (A clear-to-end AFTER it is fine: it only wipes what the
//     previous, longer snapshot left below.)
//   - keys tmux has names for go by name (the relay only accepts those); text goes literally
//   - the pane is only resized when the user asks (refit): resizing on every layout change fought
//     the real terminal attached to the same tmux session
//   - xterm opens only once its container is laid out, or it measures zero and stays blank
//   - the stream is stopped on close, or the relay keeps polling tmux for nobody
//
// It needs a relay token with the `control` scope (his voice token is only `speak`): typing into
// the pane is operating the machine. window.HEARTH_TERM.open(el, { base, token, sessionId }).
(function () {
// Keys the relay forwards by name (its allow-list); everything else is sent as literal text.
const NAMED = {
  '\r': 'Enter', '\x03': 'C-c', '\x1b': 'Escape', '\t': 'Tab', '\x7f': 'BSpace',
  '\x1b[A': 'Up', '\x1b[B': 'Down', '\x1b[C': 'Right', '\x1b[D': 'Left',
  '\x04': 'C-d', '\x1a': 'C-z', '\x01': 'C-a', '\x05': 'C-e', '\x0c': 'C-l',
};

// ---------- The ember palette ----------
// Claude Code paints with the default colors and the 256-color palette (no truecolor reaches the
// pane), so every color it uses is a palette slot, and all 256 can be repainted here without
// touching tmux. Each standard color keeps some of its hue (a diff still reads red and green) but
// is pulled toward a ramp from deep coal to white heat by its lightness.
const RAMP = [[0, [26, 10, 4]], [0.35, [122, 58, 24]], [0.6, [217, 130, 74]], [0.8, [247, 196, 138]], [1, [255, 244, 224]]];
function ramp(l) {
  for (let i = 1; i < RAMP.length; i++) {
    const [b, cb] = RAMP[i], [a, ca] = RAMP[i - 1];
    if (l <= b) { const k = (l - a) / (b - a); return ca.map((v, j) => v + (cb[j] - v) * k); }
  }
  return RAMP[RAMP.length - 1][1];
}
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function xterm256(i) {
  const BASE16 = [[0,0,0],[205,49,49],[13,188,121],[229,229,16],[36,114,200],[188,63,188],[17,168,205],[229,229,229],
    [102,102,102],[241,76,76],[35,209,139],[245,245,67],[59,142,234],[214,112,214],[41,184,219],[255,255,255]];
  if (i < 16) return BASE16[i];
  if (i < 232) { const n = i - 16, v = (k) => (k ? 55 + k * 40 : 0); return [v(Math.floor(n / 36)), v(Math.floor(n / 6) % 6), v(n % 6)]; }
  const g = 8 + (i - 232) * 10; return [g, g, g];
}
function warm(rgb) {
  const [r, g, b] = rgb, l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  // Grays become pure ember; colors keep up to half their own hue, more the more saturated.
  const keep = Math.min(0.55, sat * 0.8);
  // Text sits on a dark core, so nothing is allowed to sink below a readable glow.
  const e = ramp(0.28 + l * 0.72);
  return e.map((v, j) => v * (1 - keep) + rgb[j] * keep);
}
const PALETTE = Array.from({ length: 256 }, (_, i) => hex(warm(xterm256(i))));
// Hand-picked for the slots Claude Code leans on: its accent salmon, the input box's fill, its
// diff greens and reds, and the dim grays of hints and tool output.
Object.assign(PALETTE, { 174: '#ff9a52', 237: '#3a1a0c', 236: '#2e1408', 114: '#b8d870', 210: '#ff7a5a', 246: '#c79a6e', 244: '#a97f58', 231: '#fff1d6' });
const THEME = {
  background: 'rgba(0,0,0,0)', foreground: '#ffdcae', cursor: '#ffb347', cursorAccent: '#1a0a04',
  selectionBackground: 'rgba(255, 170, 80, 0.32)',
  scrollbarSliderBackground: 'rgba(255, 140, 60, 0.22)', scrollbarSliderHoverBackground: 'rgba(255, 140, 60, 0.38)',
  scrollbarSliderActiveBackground: 'rgba(255, 160, 80, 0.5)',
  black: PALETTE[0], red: PALETTE[1], green: PALETTE[2], yellow: PALETTE[3], blue: PALETTE[4], magenta: PALETTE[5], cyan: PALETTE[6], white: PALETTE[7],
  brightBlack: PALETTE[8], brightRed: PALETTE[9], brightGreen: PALETTE[10], brightYellow: PALETTE[11], brightBlue: PALETTE[12], brightMagenta: PALETTE[13], brightCyan: PALETTE[14], brightWhite: PALETTE[15],
  extendedAnsi: PALETTE.slice(16),
};

// ---------- Loading xterm (vendored, only the first time he opens up) ----------
let loading = null;
function loadXterm() {
  if (window.Terminal && window.FitAddon) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/xterm/xterm.css';
    document.head.append(css);
    const add = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(`can't load ${src}`)); document.head.append(s); });
    add('vendor/xterm/xterm.js').then(() => add('vendor/xterm/addon-fit.js')).then(resolve, (e) => { loading = null; reject(e); });
  });
  return loading;
}

const T = { term: null, fit: null, client: null, el: null, err: '', live: false, key: '' };

function send(keys) {
  const c = T.client; if (!c) return;
  if (NAMED[keys]) return void c.sendTerminalSpecialKey(NAMED[keys]);
  // A paste (or anything multi-line) arrives in one piece: its text literally, each line's end as
  // a named Enter, so tmux doesn't take a raw CR in a literal string as anything else.
  const parts = keys.split('\r');
  parts.forEach((p, i) => {
    if (p) c.sendTerminalKeys(p);   // includes sequences tmux has no name for (Shift-Tab, Delete...): literal
    if (i < parts.length - 1) c.sendTerminalSpecialKey('Enter');
  });
}

async function open(el, { base, token, sessionId, fontFamily }) {
  const key = [base, token, sessionId].join('|');
  if (T.term && T.key === key) { T.term.focus(); return; }
  close();
  T.el = el; T.key = key; T.err = '';
  if (!token) { T.err = 'no-token'; return; }
  if (!sessionId) { T.err = 'No session to show yet'; return; }
  try { await Promise.all([loadXterm(), window.VmuxClient ? null : Promise.reject(new Error('relay client not loaded yet'))]); }
  catch (e) { T.err = String(e?.message || e); return; }
  if (T.el !== el) return;                                   // closed while loading
  // The font has to be ready before xterm measures a cell, or the grid is sized for a fallback.
  try { await document.fonts.load(`13px ${fontFamily}`); } catch {}
  const term = new window.Terminal({
    cursorBlink: false, cursorStyle: 'underline', fontSize: 13, lineHeight: 1.1, fontFamily,
    theme: THEME, allowTransparency: true, scrollback: 1000, convertEol: true, allowProposedApi: true,
  });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(el);
  requestAnimationFrame(() => { try { fit.fit(); } catch {} });
  term.onData(send);
  const client = new window.VmuxClient.RelayClient({ url: base, token, lockSessionId: sessionId, subscribeAudio: false });
  client.on('terminalData', (data) => term.write('\x1b[H' + data + '\x1b[J'));
  client.on('message', (m) => {
    if (m?.type === 'error' && /terminal|scope/i.test(m.message || '')) T.err = m.message;
    // The relay streams only for a client that has joined a session, and forgets the stream on a
    // reconnect, so it is (re)started each time the join lands, not when the socket opens.
    if (m?.type === 'session_connected') client.startTerminalStream();
    if (m?.type === 'session_not_found') T.err = 'The relay has no session for this folder';
  });
  client.on('open', () => { T.live = true; });
  client.on('close', ({ code } = {}) => {
    T.live = false;
    if (code === 4001) T.err = 'The relay rejected the terminal token (revoked or expired?)';
  });
  client.start();
  Object.assign(T, { term, fit, client });
  term.writeln('\x1b[38;5;174m● reaching into the fire…\x1b[0m');
  term.focus();
}

function close() {
  try { T.client?.stopTerminalStream(); } catch {}
  try { T.client?.stop(); } catch {}
  try { T.term?.dispose(); } catch {}
  Object.assign(T, { term: null, fit: null, client: null, el: null, live: false, key: '' });
}

// Fit to the core, then ask tmux for the same size, a frame later once the layout has settled.
function refit() {
  if (!T.term) return;
  try { T.fit.fit(); } catch {}
  requestAnimationFrame(() => {
    const { cols, rows } = T.term || {};
    if (cols > 0 && rows > 0) T.client?.resizeTerminal(cols, rows);
    T.term?.focus();
  });
}
// Only the local grid: follows the window without touching the real pane.
function fitLocal() { try { T.fit?.fit(); } catch {} }

window.HEARTH_TERM = {
  open, close, refit, fitLocal, theme: THEME,
  key: (name) => { T.client?.sendTerminalSpecialKey(name); T.term?.focus(); },
  literal: (text) => { T.client?.sendTerminalKeys(text); T.term?.focus(); },
  get err() { return T.err; }, get live() { return T.live; }, get isOpen() { return !!T.el; },
};
})();
