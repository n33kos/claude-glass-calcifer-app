// Calcifer's sounds, from real recordings (CC0, OpenGameArt; see assets/sounds/CREDITS.md):
//   the hearth   a fireplace loop (crossfaded to loop seamlessly) that swells and brightens with
//                his flame (size and sway), crackles harder when he's hot, and goes muffled and
//                low while he sleeps
//   one-shots    flare (a catching-fire whoosh), sputter (the same, sucked back in), sparks (a
//                burst of crackling), wince (a snap), and crunches when he nibbles his log
// The view calls SOUNDS.tick() every frame and SOUNDS.play(kind) for a reaction or action.
(function () {
const FILES = { hearth: 'hearth.ogg', flare: 'flare.ogg', sputter: 'sputter.ogg', crackle: 'crackle.ogg' };
const S = { ctx: null, master: null, bed: null, tone: null, buf: {}, loading: false, hearth: null, level: 0.5, nextCrackle: 0, on: false, err: '' };

function ensure() {
  if (S.ctx) return S.ctx;
  try { S.ctx = new AudioContext(); } catch { S.err = 'no audio'; return null; }
  const ctx = S.ctx;
  S.master = ctx.createGain(); S.master.gain.value = 0;
  S.master.connect(ctx.destination);
  // The hearth runs through a low-pass (bright when he's big, muffled asleep) and its own gain.
  S.tone = ctx.createBiquadFilter(); S.tone.type = 'lowpass'; S.tone.frequency.value = 9000; S.tone.Q.value = 0.3;
  S.bed = ctx.createGain(); S.bed.gain.value = 0;
  S.tone.connect(S.bed).connect(S.master);
  load();
  return ctx;
}

// Decoded buffers, so the loop is sample-exact and one-shots can play slices. The clips come in
// assets/sounds/sounds-data.js (base64): the sandbox can't fetch the app's own files.
async function load() {
  if (S.loading) return; S.loading = true;
  const data = window.SOUND_DATA || {};
  await Promise.all(Object.keys(FILES).map(async (k) => {
    try {
      if (!data[k]) throw new Error('missing (run assets/sounds/pack.sh)');
      const bin = atob(data[k]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      S.buf[k] = await S.ctx.decodeAudioData(bytes.buffer);
    } catch (e) { S.err = `sound ${FILES[k]}: ${e?.message || e}`; }
  }));
  if (S.buf.hearth) {
    const src = S.ctx.createBufferSource(); src.buffer = S.buf.hearth; src.loop = true;
    src.connect(S.tone); src.start(0, Math.random() * S.buf.hearth.duration);
    S.hearth = src;
  }
}

// Play a clip (or a slice of one) with an optional filter, gain and speed.
function clip(name, { at = S.ctx.currentTime + 0.01, offset = 0, dur, gain = 1, rate = 1, filter, freq, fadeIn = 0.005, fadeOut = 0.04 } = {}) {
  const buf = S.buf[name]; if (!buf) return;
  const ctx = S.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.playbackRate.value = rate;
  const len = Math.min(dur ?? buf.duration, buf.duration - offset) / rate;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + fadeIn);
  g.gain.setValueAtTime(gain, Math.max(at + fadeIn, at + len - fadeOut)); g.gain.linearRampToValueAtTime(0, at + len);
  let head = src;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; src.connect(f); head = f; }
  head.connect(g).connect(S.master);
  src.start(at, offset, len * rate + 0.01);
}
// A random slice of the crackle recording: a real pop or snap, never the same twice.
function snap(at, { dur = 0.18 + Math.random() * 0.25, gain = 0.7, filter, freq } = {}) {
  const b = S.buf.crackle; if (!b) return;
  clip('crackle', { at, offset: Math.random() * (b.duration - dur), dur, gain, rate: 0.9 + Math.random() * 0.25, filter, freq, fadeIn: 0.004, fadeOut: 0.05 });
}
// The hearth swells (or dips) for a moment (tick applies it).
function swell(by, secs) { S.boost = by; S.boostUntil = S.ctx.currentTime + secs; }

const ONE_SHOTS = {
  flare(t) { clip('flare', { at: t, gain: 0.9 }); clip('flare', { at: t + 0.05, gain: 0.5, rate: 0.7, filter: 'lowpass', freq: 1200 }); swell(1.5, 0.9); snap(t + 0.25); snap(t + 0.45, { gain: 0.5 }); },
  sputter(t) { clip('sputter', { at: t, gain: 0.85 }); swell(0.45, 1.2); },
  sparks(t) { clip('crackle', { at: t, dur: 1.6, gain: 0.85, fadeOut: 0.4 }); snap(t + 0.1, { gain: 0.6, filter: 'highpass', freq: 2500 }); },
  wince(t) { snap(t, { dur: 0.16, gain: 0.8, filter: 'highpass', freq: 1800 }); },
  // Chewing the log: crunches while his mouth is on it (the nibble action's middle).
  nibble(t) { for (let k = 0; k < 4; k++) snap(t + 0.95 + k * 0.32 + Math.random() * 0.05, { dur: 0.12, gain: 0.75, filter: 'lowpass', freq: 2200 }); },
};

window.SOUNDS = {
  get err() { return S.err; },
  // Every frame: whether sound is on, the volume (0..1), and how big his flame is right now.
  tick({ on, ambience, volume, size, sway, asleep }) {
    if (!on) { if (S.ctx && S.on) { S.master.gain.setTargetAtTime(0, S.ctx.currentTime, 0.15); setTimeout(() => S.on || S.ctx.suspend(), 800); } S.on = false; return; }
    const ctx = ensure(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    S.on = true;
    const now = ctx.currentTime;
    S.master.gain.setTargetAtTime(volume, now, 0.2);
    // Heat 0..1 from his size and flicker speed; asleep, the hearth smolders.
    const heat = Math.max(0, Math.min(1, (size - 0.55) / 0.9 * 0.8 + (sway - 1) * 0.2));
    S.level += ((asleep ? 0.1 : heat) - S.level) * 0.03;
    const boosted = now < (S.boostUntil ?? 0);
    S.bed.gain.setTargetAtTime(ambience ? (0.45 + 0.55 * S.level) * (boosted ? S.boost : 1) : 0, now, boosted ? 0.08 : 0.4);
    S.tone.frequency.setTargetAtTime(asleep ? 900 : 2500 + 14000 * S.level * S.level, now, 0.5);
    // Hot (angry, excited), the fire spits extra crackles on top of the loop.
    if (ambience && S.level > 0.55 && now >= S.nextCrackle) {
      S.nextCrackle = now + (0.4 + Math.random() * 2.2) / (S.level - 0.4);
      snap(now + 0.05, { gain: 0.3 + 0.4 * Math.random() });
    }
  },
  play(kind) {
    if (!S.on || !S.ctx || !ONE_SHOTS[kind]) return;
    try { ONE_SHOTS[kind](S.ctx.currentTime + 0.02); } catch {}
  },
};
})();
