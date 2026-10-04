// His name, heard locally, with no transcription anywhere.
//
// Three ONNX models run in his own window through ONNX Runtime Web (wasm): openWakeWord's
// melspectrogram and speech-embedding frontend, then a head trained here on 46 Kokoro voices
// saying "Calcifer" against the words that sound like it. Nothing leaves the machine, nothing asks
// a server, and there is no second transcription path beside the relay's.
//
// The framing is a port of openWakeWord's own `_streaming_features`, not an approximation of it:
// 80 ms of audio at a time (1280 samples at 16 kHz), melspectrogram taken over those samples plus
// 480 of context — exactly 1760, which the model turns into exactly 8 new mel frames — then one
// 96-dim embedding per 76-frame mel window, and the head reads the last 16 embeddings (about two
// seconds). Deviating anywhere here produces numbers the trained head has never seen.
(function () {
const RATE = 16000;
const CHUNK = 1280;        // 80 ms: the step openWakeWord's embeddings are spaced by
const MEL_CONTEXT = 480;   // 160 * 3, the look-back its streaming melspectrogram uses
const MEL_WINDOW = 76;     // mel frames per embedding
const FRAMES = 16;         // embeddings the head reads
const DIM = 96;
const MEL_KEEP = MEL_WINDOW + 16;
const COOLDOWN_MS = 1200;  // one wake per utterance, not one per 80 ms
const MAX_BACKLOG = 6;     // chunks; past this he is listening to the past, so skip forward
const LIVE_FLOOR = 0;      // trust the trained threshold; it is now measured live-style (see load())
const CONSEC = 2;          // consecutive steps required: his name spans many, a glitch spans one
const MIN_RMS = 0.006;     // quieter than this over the window and nothing was said at all

const S = {
  mic: null, ctx: null, proc: null, want: false, opening: null,
  sessions: null, loading: null, threshold: 0.5,
  hold: new Int16Array(0), ctxTail: new Int16Array(MEL_CONTEXT), mel: [], feat: [],
  score: 0, peak: 0, lastWake: 0, pumping: false, infMs: 0, dropped: 0, run: 0, trained: null,
  loud: [], rms: 0, sens: 50,
  err: '', ready: false, frames: 0,
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Sensitivity is a dial over the trained threshold, not a replacement for it. 50 means exactly what
// training measured — one false wake per eleven hours over 10.7 hours of real-world audio — and the
// two halves stretch from there to "almost anything" and "only a dead-certain match". It is a knob
// because whether a near-miss like "Kelsifer" should count is a matter of taste, not of evidence,
// and that is the user's call rather than this file's.
const LOOSEST = 0.02;
const STRICTEST = 0.995;
function applySens(sens) {
  S.sens = Math.max(0, Math.min(100, Number(sens) ?? 50));
  const t = S.trained ?? 0.5;
  const k = S.sens <= 50
    ? t + (STRICTEST - t) * (50 - S.sens) / 50     // stricter half
    : t - (t - LOOSEST) * (S.sens - 50) / 50;      // looser half
  S.threshold = Math.max(LIVE_FLOOR, Math.min(STRICTEST, k));
}

async function load() {
  if (S.sessions) return S.sessions;
  S.loading ??= (async () => {
    const ort = window.ort;
    if (!ort) throw new Error('ONNX Runtime Web did not load');
    // One thread, and the wasm fetched from the app's own directory. wasmPaths must be an absolute
    // URL: the loader import()s its glue as a module, and a bare relative path cannot be resolved.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
    ort.env.logLevel = 'error';
    const at = (f) => new URL(`wake/models/${f}`, location.href).href;
    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    const [mel, emb, head, meta] = await Promise.all([
      ort.InferenceSession.create(at('melspectrogram.onnx'), opts),
      ort.InferenceSession.create(at('embedding_model.onnx'), opts),
      ort.InferenceSession.create(at('calcifer.onnx'), opts),
      fetch(at('calcifer.json')).then((r) => r.json()).catch(() => ({})),
    ]);
    // The floor used to be 0.9, because train.py chose its threshold per CLIP and the head had
    // never been shown anything but speech, so its confidence off that manifold meant nothing: an
    // empty room scored over threshold on 586 of 1101 steps. That is fixed at the source now —
    // the head trains against 400k windows of real-world audio, and the threshold is chosen by
    // counting false wakes per hour over a 10.7-hour stream, with the same run length and cooldown
    // this file fires on. Overriding a number measured that way would only throw away recall.
    S.trained = typeof meta.threshold === 'number' ? meta.threshold : 0.5;
    S.threshold = Math.max(LIVE_FLOOR, S.trained);
    applySens(S.sens);
    S.sessions = { ort, mel, emb, head };
    S.ready = true;
    return S.sessions;
  })();
  return S.loading;
}

// 1760 int16 samples -> 8 mel frames of 32. The /10 + 2 is openWakeWord's own transform, which
// brings this ONNX melspectrogram in line with Google's original TensorFlow one.
async function melOf(samples) {
  const { ort, mel } = S.sessions;
  const f = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) f[i] = samples[i];
  const out = await mel.run({ input: new ort.Tensor('float32', f, [1, samples.length]) });
  const d = out[mel.outputNames[0]].data;
  const rows = [];
  for (let i = 0; i + 32 <= d.length; i += 32) {
    const row = new Float32Array(32);
    for (let j = 0; j < 32; j++) row[j] = d[i + j] / 10 + 2;
    rows.push(row);
  }
  return rows;
}

async function embedLast() {
  const { ort, emb } = S.sessions;
  if (S.mel.length < MEL_WINDOW) return null;
  const win = S.mel.slice(S.mel.length - MEL_WINDOW);
  const f = new Float32Array(MEL_WINDOW * 32);
  for (let i = 0; i < MEL_WINDOW; i++) f.set(win[i], i * 32);
  const out = await emb.run({ input_1: new ort.Tensor('float32', f, [1, MEL_WINDOW, 32, 1]) });
  return Float32Array.from(out[emb.outputNames[0]].data);   // (1,1,1,96) flattened
}

async function headScore() {
  const { ort, head } = S.sessions;
  if (S.feat.length < FRAMES) return null;
  const f = new Float32Array(FRAMES * DIM);
  for (let i = 0; i < FRAMES; i++) f.set(S.feat[S.feat.length - FRAMES + i], i * DIM);
  const out = await head.run({ x: new ort.Tensor('float32', f, [1, FRAMES, DIM]) });
  return sigmoid(out[head.outputNames[0]].data[0]);         // the head emits a logit
}

// One 80 ms step: the mel of exactly these 1280 samples plus the 480 that came immediately before
// them, which is the window openWakeWord's streaming path uses and the one train.py extracted
// features through. `win` must be built by the caller so the steps stay contiguous — taking "the
// last 1760 samples of whatever has arrived" instead would advance by however much audio the
// browser happened to deliver, and the 8 mel frames each step appends would then overlap or skip.
// That is the same train/serve drift that already cost a model once.
async function stepOn(win) {
  const t0 = performance.now();
  try {
    // Loudness of this chunk, kept over the same span the head reads. Every negative the head was
    // trained on is a spoken word — "classifier", "California", "run the tests" — and not one is
    // silence or an empty room. So it has no idea what nothing sounds like, and near-silence is
    // free to drift anywhere, which is exactly where the misfires came from. Until there are
    // room-noise negatives in the training set, this refuses to wake him on a room that is simply
    // quiet, which is a fact about the audio and not a guess about the model.
    let sum = 0;
    for (let i = MEL_CONTEXT; i < win.length; i++) { const v = win[i] / 32768; sum += v * v; }
    S.loud.push(Math.sqrt(sum / CHUNK));
    if (S.loud.length > FRAMES) S.loud.splice(0, S.loud.length - FRAMES);
    const rms = Math.max(...S.loud);

    const rows = await melOf(win);
    S.mel.push(...rows);
    if (S.mel.length > MEL_KEEP) S.mel.splice(0, S.mel.length - MEL_KEEP);
    const e = await embedLast();
    if (!e) return;
    S.feat.push(e);
    if (S.feat.length > FRAMES) S.feat.splice(0, S.feat.length - FRAMES);
    S.frames++;
    const sc = await headScore();
    if (sc === null) return;
    S.score = sc;
    S.peak = Math.max(S.peak * 0.97, sc);
    // His name occupies a couple of seconds, so it clears the threshold on several steps in a row.
    // A single step over it on its own is far more likely to be a door, a cough, or a syllable
    // that happened to land right — so one step is not enough to interrupt him.
    S.run = sc >= S.threshold && rms >= MIN_RMS ? S.run + 1 : 0;
    S.rms = +rms.toFixed(4);
    const now = performance.now();
    if (S.run >= CONSEC && now - S.lastWake > COOLDOWN_MS) {
      S.lastWake = now;
      S.run = 0;
      S.feat.length = 0;            // don't let the same two seconds fire twice
      try { window.SPOTTER.onWake?.(sc); } catch {}
    }
  } catch (e) {
    S.err = `Spotter: ${e?.message || e}`;
  } finally {
    S.infMs = Math.round((performance.now() - t0) * 10) / 10;
  }
}

// The 480 samples before the current chunk. Seeded with silence, which is what training's padding
// gave the first chunk of a clip too.
function resetStream() {
  S.hold = new Int16Array(0);
  S.ctxTail = new Int16Array(MEL_CONTEXT);
  S.mel = [];
  S.feat = [];
  S.run = 0;
  S.loud = [];
}

// Pull whole chunks off the queue in order, one at a time. Serialised, because two mel calls in
// flight would append their rows in whichever order resolved first.
async function pump() {
  if (S.pumping) return;
  S.pumping = true;
  try {
    while (S.hold.length >= CHUNK) {
      // Falling behind: skip to the newest audio rather than answer to a name heard seconds ago,
      // and drop the partial window with it so nothing is scored across the gap.
      if (S.hold.length > CHUNK * MAX_BACKLOG) {
        S.hold = S.hold.slice(S.hold.length - CHUNK);
        S.ctxTail = new Int16Array(MEL_CONTEXT);
        S.mel = []; S.feat = [];
        S.dropped++;
      }
      const win = new Int16Array(MEL_CONTEXT + CHUNK);
      win.set(S.ctxTail, 0);
      win.set(S.hold.subarray(0, CHUNK), MEL_CONTEXT);
      S.hold = S.hold.slice(CHUNK);
      S.ctxTail = win.slice(win.length - MEL_CONTEXT);   // the tail of this chunk precedes the next
      await stepOn(win);
    }
  } finally {
    S.pumping = false;
  }
}

function feed(float32) {
  // The context runs at 16 kHz, so this is already the rate the models want — no resampling, and
  // none of the aliasing a hand-rolled resampler used to add.
  const add = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const v = Math.max(-1, Math.min(1, float32[i]));
    add[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const merged = new Int16Array(S.hold.length + add.length);
  merged.set(S.hold, 0);
  merged.set(add, S.hold.length);
  S.hold = merged;
  pump();
}

window.SPOTTER = {
  onWake: null,
  // The sensitivity slider, applied live: no reload to try a different setting.
  tune(sens) { if (Number(sens) !== S.sens) applySens(sens); },
  // Sleeping the machine suspends this AudioContext, and a suspended context delivers no audio
  // callbacks — so the spotter cannot notice its own death from the inside, and he would simply
  // stop answering to his name with nothing in any log to say why. Called from the frame loop,
  // which keeps running.
  poke() {
    if (!S.mic || !S.ctx || S.ctx.state === 'running') return false;
    const was = S.ctx.state;
    S.ctx.resume?.().catch(() => {});
    resetStream();        // whatever it half-heard across the gap is not a contiguous window
    S.err = '';
    return was;
  },
  get state() {
    return { ready: S.ready, listening: !!S.mic, audio: S.ctx?.state ?? 'none', score: +S.score.toFixed(3),
             peak: +S.peak.toFixed(3), threshold: +S.threshold.toFixed(3), trained: S.trained, sensitivity: S.sens,
             consec: CONSEC, rms: S.rms, minRms: MIN_RMS, frames: S.frames,
             infMs: S.infMs, dropped: S.dropped, err: S.err };
  },
  async start(deviceId) {
    if (S.mic || S.opening) return;
    S.want = true;
    S.opening = (async () => {
      try {
        await load();
        const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (deviceId) audio.deviceId = { exact: deviceId };
        const mic = await navigator.mediaDevices.getUserMedia({ audio });
        if (!S.want) { mic.getTracks().forEach((t) => t.stop()); return; }
        // Ask for 16 kHz outright and let the browser resample on the way in: its resampler is a
        // proper one, and the models want exactly this rate.
        const ctx = new AudioContext({ sampleRate: RATE });
        const src = ctx.createMediaStreamSource(mic);
        const proc = ctx.createScriptProcessor(1024, 1, 1);
        const sink = ctx.createGain(); sink.gain.value = 0;   // runs the node, plays nothing
        src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
        proc.onaudioprocess = (ev) => { if (S.mic) feed(ev.inputBuffer.getChannelData(0)); };
        await ctx.resume?.();
        if (ctx.sampleRate !== RATE) throw new Error(`audio context opened at ${ctx.sampleRate} Hz, not ${RATE}`);
        resetStream();
        Object.assign(S, { mic, ctx, proc, err: '' });
      } catch (e) { S.err = `Spotter mic: ${e?.message || e}`; }
      finally { S.opening = null; }
    })();
  },
  stop() {
    S.want = false;
    S.mic?.getTracks().forEach((t) => t.stop());
    if (S.proc) S.proc.onaudioprocess = null;
    S.ctx?.close?.();
    Object.assign(S, { mic: null, ctx: null, proc: null, score: 0, peak: 0 });
    resetStream();
  },
  // For checking the JS pipeline against the Python one: the best score over a clip of int16 at
  // 16 kHz. It runs the clip through the very same pump, so if this agrees with train.py then the
  // live path does too — there is only one framing in here to disagree with.
  async scoreSamples(int16) {
    await load();
    const keepWake = window.SPOTTER.onWake;
    window.SPOTTER.onWake = null;         // scoring a clip must not open his mic
    const was = S.threshold;
    S.threshold = 2;                      // and must not trip the cooldown either
    resetStream();
    let best = 0;
    try {
      for (let at = 0; at + CHUNK <= int16.length; at += CHUNK) {
        const win = new Int16Array(MEL_CONTEXT + CHUNK);
        win.set(S.ctxTail, 0);
        win.set(int16.subarray(at, at + CHUNK), MEL_CONTEXT);
        S.ctxTail = win.slice(win.length - MEL_CONTEXT);
        await stepOn(win);
        if (S.feat.length >= FRAMES) best = Math.max(best, S.score);
      }
    } finally {
      S.threshold = was;
      window.SPOTTER.onWake = keepWake;
      resetStream();
    }
    return best;
  },
};
})();
