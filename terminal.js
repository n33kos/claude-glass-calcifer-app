// His insides: the live tmux pane Claude runs in, burning in his core.
//
// The same pipe the vmux web app's terminal uses, so the same lessons apply. The relay polls
// `tmux capture-pane -e` every 150ms and sends each snapshot as `terminal_data`; keys go back as
// `terminal_input` (tmux send-keys), and a refit sends `terminal_resize` (tmux resize-window).
// What vmux learned the hard way, kept here (and one thing it never fixed, see paint()):
//   - never clear the screen in a write of its own: that flashed the canvas blank on every poll
//     (paint() clears and draws in one write)
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
// touching tmux. Everything burns: grays follow a ramp from coal through red and orange to
// yellow-white heat by their lightness, and every hue is folded onto the fire's own (red stays
// red, green turns gold, blue and cyan turn orange, magenta crimson), so a diff still reads as two
// different colors without anything leaving the flame.
const RAMP = [[0, [44, 6, 0]], [0.3, [160, 28, 6]], [0.5, [238, 86, 18]], [0.7, [255, 152, 36]], [0.86, [255, 212, 92]], [1, [255, 246, 206]]];
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
// A hue (degrees) folded onto the fire's: red 0 → 2, yellow 60 → 46, green 120 → 52 (gold),
// cyan 180 → 34, blue 240 → 22 (orange), magenta 300 → 348 (crimson).
function fireHue(h) {
  const STOPS = [[0, 2], [60, 46], [120, 52], [180, 34], [240, 22], [300, -12], [360, 2]];
  for (let i = 1; i < STOPS.length; i++) {
    const [b, fb] = STOPS[i], [a, fa] = STOPS[i - 1];
    if (h <= b) return (fa + (fb - fa) * (h - a) / (b - a) + 360) % 360;
  }
  return 2;
}
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
}
function warm(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b, sat = max - min;
  // Text sits on a dark core, so nothing sinks below a readable glow.
  if (sat < 0.12) return ramp(0.26 + lum * 0.74);
  const h = max === r ? 60 * (((g - b) / sat + 6) % 6) : max === g ? 60 * ((b - r) / sat + 2) : 60 * ((r - g) / sat + 4);
  // Lightness kept roughly as it was: dark slots are diff and box backgrounds, and must stay dark.
  return hsl(fireHue(h), 0.95, Math.min(0.68, 0.06 + (max + min) / 2 * 0.85));
}
const PALETTE = Array.from({ length: 256 }, (_, i) => hex(warm(xterm256(i))));
// Hand-picked for the slots Claude Code leans on: its accent salmon, the input box's fill, its
// diff greens and reds, and the dim grays of hints and tool output.
Object.assign(PALETTE, { 174: '#ff6a24', 237: '#3c0e04', 236: '#300a03', 114: '#ffe04a', 210: '#ff4a36', 246: '#f08a34', 244: '#d0682a', 231: '#fff2c4' });
const THEME = {
  background: 'rgba(0,0,0,0)', foreground: '#ffcf6a', cursor: '#ffe04a', cursorAccent: '#2c0600',
  selectionBackground: 'rgba(255, 120, 30, 0.35)',
  scrollbarSliderBackground: 'rgba(255, 120, 40, 0.4)', scrollbarSliderHoverBackground: 'rgba(255, 150, 60, 0.6)',
  scrollbarSliderActiveBackground: 'rgba(255, 180, 70, 0.7)',
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

const T = { term: null, fit: null, client: null, el: null, err: '', key: '' };

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

// One snapshot, drawn as the whole buffer. A snapshot is the pane plus its recent history, so
// it is taller than the screen: written from cursor-home (vmux's way) it scrolled, and every 150ms
// pushed another copy of those lines into xterm's own scrollback. At the bottom that hid itself;
// scrolled up even a line, you watched the copies stream past each other. So each snapshot now
// replaces everything — scrollback (3J), screen (2J), home — in the same write as its text, which
// xterm parses in one go, so no blank frame is ever drawn (the flicker vmux removed came from
// clearing on its own). Your place is kept as a distance from the bottom, so reading back through
// the history holds still while the pane below it changes.
function paint(term, data) {
  const buf = term.buffer.active;
  const fromBottom = buf.baseY - buf.viewportY;   // 0 when following the bottom
  term.write('\x1b[3J\x1b[H\x1b[2J' + data.replace(/\n+$/, ''), () => {
    if (fromBottom > 0) term.scrollToLine(Math.max(0, term.buffer.active.baseY - fromBottom));
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
  client.on('terminalData', (data) => paint(term, data));
  client.on('message', (m) => {
    if (m?.type === 'error' && /terminal|scope/i.test(m.message || '')) T.err = m.message;
    // The relay streams only for a client that has joined a session, and forgets the stream on a
    // reconnect, so it is (re)started each time the join lands, not when the socket opens.
    if (m?.type === 'session_connected') client.startTerminalStream();
    if (m?.type === 'session_not_found') T.err = 'The relay has no session for this folder';
  });
  client.on('close', ({ code } = {}) => {
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
  Object.assign(T, { term: null, fit: null, client: null, el: null, key: '' });
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
  open, close, refit, fitLocal,
  key: (name) => { T.client?.sendTerminalSpecialKey(name); T.term?.focus(); },
  literal: (text) => { T.client?.sendTerminalKeys(text); T.term?.focus(); },
  get err() { return T.err; },
};
})();
