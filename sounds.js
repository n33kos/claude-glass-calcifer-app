// Calcifer's sounds, all made on the spot with Web Audio (no recordings):
//   the hearth   a low roar and a soft hiss, with crackles and the odd pop, that swell and settle
//                with his flame (size and sway) and smolder down while he sleeps
//   one-shots    flare (a whoosh), sputter (a fizzle), sparks (a scatter of pops), wince (a hiss),
//                and the crunch of him nibbling his log
// The view calls SOUNDS.tick() every frame and SOUNDS.play(kind) for a reaction or action.
(function () {
const LOOKAHEAD = 0.25;   // crackles are scheduled this far ahead (s)
const S = { ctx: null, master: null, roar: null, hiss: null, white: null, brown: null, until: 0, level: 0.5, on: false, err: '' };

function noiseBuffer(ctx, seconds, brown) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } else d[i] = w;
  }
  return buf;
}

function ensure() {
  if (S.ctx) return S.ctx;
  try { S.ctx = new AudioContext(); } catch (e) { S.err = 'no audio'; return null; }
  const ctx = S.ctx;
  S.white = noiseBuffer(ctx, 2, false);
  S.brown = noiseBuffer(ctx, 4, true);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  S.master = ctx.createGain(); S.master.gain.value = 0;
  S.master.connect(comp).connect(ctx.destination);
  // The roar: brown noise, low-passed. The hiss: white noise, a soft band up top.
  const loop = (buffer) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.loopStart = Math.random(); s.start(); return s; };
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  S.roar = ctx.createGain(); S.roar.gain.value = 0;
  loop(S.brown).connect(lp).connect(S.roar).connect(S.master);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
  S.hiss = ctx.createGain(); S.hiss.gain.value = 0;
  loop(S.white).connect(bp).connect(S.hiss).connect(S.master);
  return ctx;
}

// A burst of noise through a band: the building block of every crackle, pop, crunch and fizzle.
function burst(at, { freq, q = 1.5, dur, gain, type = 'bandpass', attack = 0.001, out = S.master }) {
  const ctx = S.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = S.white; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 1.5, attack + dur + 0.05);
  return { src, f, g };
}
// Crackles are mostly tiny ticks with the occasional loud snap (a long-tailed loudness).
function crackle(at, heat) {
  const loud = Math.min(1, 0.08 / Math.pow(Math.random() + 0.04, 1.4));
  burst(at, { freq: 1400 + Math.random() * 5200, q: 1 + Math.random() * 3, dur: 0.004 + Math.random() * 0.022 * (0.5 + loud), gain: 0.5 * loud * (0.6 + 0.4 * heat) });
}
function pop(at, gain = 0.55) {
  burst(at, { freq: 450 + Math.random() * 500, q: 2, dur: 0.05, gain });
  const o = S.ctx.createOscillator(), g = S.ctx.createGain();
  o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.06);
  g.gain.setValueAtTime(gain * 0.5, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  o.connect(g).connect(S.master); o.start(at); o.stop(at + 0.08);
}

// A sweep of filtered noise (whoosh, fizzle, hiss).
function sweep(at, { dur, from, peak, to, gain, q = 0.8, type = 'bandpass', rise = 0.25, flutter = 0 }) {
  const b = burst(at, { freq: from, q, dur, gain: 0.0001, type });
  const f = b.f.frequency, g = b.g.gain;
  f.setValueAtTime(from, at); f.exponentialRampToValueAtTime(peak, at + dur * rise); f.exponentialRampToValueAtTime(to, at + dur);
  g.cancelScheduledValues(at); g.setValueAtTime(0.0001, at); g.exponentialRampToValueAtTime(gain, at + dur * rise);
  if (flutter) for (let x = at + dur * rise; x < at + dur; x += 0.03 + Math.random() * 0.05) g.setValueAtTime(gain * (1 - flutter * Math.random()) * (1 - (x - at) / dur), x);
  g.exponentialRampToValueAtTime(0.0001, at + dur);
}

const ONE_SHOTS = {
  flare(t) {
    sweep(t, { dur: 1.1, from: 260, peak: 2400, to: 700, gain: 0.9, rise: 0.22 });
    sweep(t, { dur: 1.2, from: 90, peak: 220, to: 70, gain: 0.8, type: 'lowpass', q: 0.5, rise: 0.2 });
    for (let i = 0; i < 12; i++) crackle(t + 0.1 + Math.random() * 0.8, 1);
    pop(t + 0.15, 0.7);
  },
  sputter(t) {
    sweep(t, { dur: 0.9, from: 5200, peak: 4200, to: 1800, gain: 0.45, type: 'highpass', q: 0.4, rise: 0.08, flutter: 0.85 });
    for (let i = 0; i < 6; i++) crackle(t + Math.random() * 0.6, 0.3);
  },
  sparks(t) {
    for (let i = 0; i < 26; i++) burst(t + Math.pow(Math.random(), 1.6) * 0.75, { freq: 3500 + Math.random() * 5000, q: 3, dur: 0.004 + Math.random() * 0.01, gain: 0.25 + Math.random() * 0.45 });
    pop(t + 0.03, 0.5);
  },
  wince(t) { sweep(t, { dur: 0.32, from: 6000, peak: 5000, to: 3500, gain: 0.35, type: 'highpass', q: 0.4, rise: 0.15 }); },
  // Chewing the log: a few crunches while his mouth is on it (the nibble action's middle).
  nibble(t) {
    for (let k = 0; k < 4; k++) {
      const at = t + 0.95 + k * 0.32 + Math.random() * 0.05;
      burst(at, { freq: 900, q: 0.9, dur: 0.07, gain: 0.5 });
      for (let i = 0; i < 7; i++) burst(at + Math.random() * 0.09, { freq: 1200 + Math.random() * 1800, q: 2, dur: 0.008 + Math.random() * 0.02, gain: 0.35 * Math.random() + 0.1, type: 'bandpass' });
    }
  },
};

window.SOUNDS = {
  // Every frame: whether sound is on, the volume (0..1), and how big his flame is right now.
  tick({ on, ambience, volume, size, sway, asleep }) {
    if (!on) { if (S.ctx && S.on) { S.master.gain.setTargetAtTime(0, S.ctx.currentTime, 0.15); setTimeout(() => S.on || S.ctx.suspend(), 600); } S.on = false; return; }
    const ctx = ensure(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    S.on = true;
    const now = ctx.currentTime;
    S.master.gain.setTargetAtTime(volume, now, 0.2);
    // Heat 0..1 from his size and flicker speed; asleep, the hearth smolders.
    const heat = Math.max(0, Math.min(1, (size - 0.55) / 0.9 * 0.8 + (sway - 1) * 0.2)) * (asleep ? 0.35 : 1);
    S.level += (heat - S.level) * 0.05;
    const bed = ambience ? 1 : 0, wobble = 0.85 + 0.3 * Math.random();
    S.roar.gain.setTargetAtTime(bed * (0.18 + 0.32 * S.level) * wobble, now, 0.12);
    S.hiss.gain.setTargetAtTime(bed * (0.02 + 0.05 * S.level), now, 0.2);
    if (!ambience) { S.until = now; return; }
    // Crackles as a Poisson process, rate rising with the heat; now and then a pop.
    if (S.until < now) S.until = now;
    const rate = 2 + 16 * S.level;
    while (S.until < now + LOOKAHEAD) {
      S.until += -Math.log(1 - Math.random()) / rate;
      if (Math.random() < 0.025 + 0.03 * S.level) pop(S.until, 0.25 + 0.3 * Math.random()); else crackle(S.until, S.level);
    }
  },
  play(kind) {
    if (!S.on || !S.ctx || !ONE_SHOTS[kind]) return;
    try { ONE_SHOTS[kind](S.ctx.currentTime + 0.02); } catch {}
  },
};
})();
