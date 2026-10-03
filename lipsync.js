// Lip sync: from sounds to Calcifer's mouth.
//
// The mouth takes three numbers (see drawMouth in view.html):
//   open  0 = closed .. 1 = jaw dropped
//   wide  0 = round "oo" .. 1 = flat "ee"
//   press lips pressed together (m, b, p)
//
// Two sources of sounds:
//   - phonemes, when a speech feed sends them per word (Kokoro / misaki notation:
//     IPA plus single letters for diphthongs, A=eɪ I=aɪ W=aʊ Y=ɔɪ O=oʊ, T = flap)
//   - the word's spelling, as a fallback (vowel sounds only, the old text mode)
// Either way a word becomes a run of segments spread over the word's spoken time,
// weighted by how long each sound usually lasts, and mouthAt() reads the shape at
// any moment, easing into the next sound the way real lips anticipate it.
(function (root) {
  // Vowel sound -> [how open, how wide (0 = round "oo" .. 1 = flat "ee")]  (text mode)
  const SOUND = { ah: [1, 0.7], eh: [0.6, 0.9], ee: [0.38, 1], oh: [0.75, 0.2], oo: [0.45, 0], uh: [0.6, 0.6], ow: [0.85, 0.3] };
  // English spelling -> vowel sound, longest match first (rough, but far better than one letter)
  const SPELL = [['eau', 'oh'], ['ee', 'ee'], ['ea', 'ee'], ['ie', 'ee'], ['ei', 'eh'], ['ey', 'eh'], ['ai', 'eh'], ['ay', 'eh'],
    ['oo', 'oo'], ['ew', 'oo'], ['ue', 'oo'], ['ui', 'oo'], ['ou', 'ow'], ['ow', 'oh'], ['oa', 'oh'], ['oe', 'oh'], ['oi', 'oh'], ['oy', 'oh'],
    ['au', 'ah'], ['aw', 'ah'], ['a', 'ah'], ['e', 'eh'], ['i', 'ee'], ['o', 'oh'], ['u', 'uh'], ['y', 'ee']];
  function vowelSounds(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length > 3 && /[^aeiouy]e$/.test(w)) w = w.slice(0, -1);    // silent final e: "make", "fire"
    const groups = w.match(/[aeiouy]+/g) || (w ? ['a'] : []);
    return groups.map((g) => (SPELL.find(([s]) => g.startsWith(s)) || ['', 'uh'])[1]);
  }

  // Phoneme -> mouth.  o: open, w: wide, p: lips pressed, d: relative duration.
  // Diphthongs glide from their first shape to `to`.
  const V = (o, w, d = 1, to) => ({ o, w, d, vowel: true, to });
  const C = (o, w, d, p = false) => ({ o, w, d, p });
  const PHONES = {
    // vowels
    'ɑ': V(1.0, 0.6), 'æ': V(0.85, 0.85), 'ʌ': V(0.7, 0.6), 'ə': V(0.45, 0.55, 0.7), 'ᵊ': V(0.35, 0.55, 0.45),
    'ɛ': V(0.6, 0.85), 'ɪ': V(0.4, 0.9, 0.8), 'i': V(0.3, 1.0), 'ʊ': V(0.4, 0.2, 0.8), 'u': V(0.35, 0.0),
    'ɔ': V(0.75, 0.25), 'ɜ': V(0.5, 0.45), 'ɐ': V(0.6, 0.6),
    'A': V(0.6, 0.85, 1.3, [0.4, 0.95]), 'I': V(1.0, 0.65, 1.35, [0.4, 0.9]), 'W': V(1.0, 0.6, 1.35, [0.4, 0.15]),
    'Y': V(0.75, 0.25, 1.35, [0.4, 0.9]), 'O': V(0.7, 0.25, 1.25, [0.4, 0.05]),
    // lips closed / lip-teeth / tongue-teeth
    'p': C(0, 0.55, 0.55, true), 'b': C(0, 0.55, 0.55, true), 'm': C(0, 0.55, 0.65, true),
    'f': C(0.1, 0.75, 0.75), 'v': C(0.1, 0.75, 0.65), 'θ': C(0.2, 0.7, 0.75), 'ð': C(0.2, 0.7, 0.55),
    // hiss and hush: teeth together, lips forward on sh/zh/ch/j
    's': C(0.15, 0.85, 0.8), 'z': C(0.15, 0.85, 0.65), 'ʃ': C(0.25, 0.2, 0.8), 'ʒ': C(0.25, 0.2, 0.7),
    'ʧ': C(0.25, 0.2, 0.75), 'ʤ': C(0.25, 0.2, 0.7),
    // tongue tip, back of tongue
    't': C(0.25, 0.7, 0.5), 'd': C(0.25, 0.7, 0.5), 'n': C(0.25, 0.7, 0.6), 'l': C(0.3, 0.65, 0.55), 'T': C(0.3, 0.65, 0.35),
    'k': C(0.35, 0.6, 0.55), 'ɡ': C(0.35, 0.6, 0.5), 'g': C(0.35, 0.6, 0.5), 'ŋ': C(0.3, 0.6, 0.6),
    // glides and r
    'ɹ': C(0.3, 0.25, 0.55), 'r': C(0.3, 0.25, 0.55), 'w': C(0.2, 0.0, 0.5), 'j': C(0.3, 0.9, 0.45),
    'h': C(0.45, 0.6, 0.4), 'ʔ': C(0.0, 0.55, 0.3), 'ɾ': C(0.3, 0.65, 0.35),
  };
  const STRESS = { 'ˈ': 2, 'ˌ': 1 };

  /** "həlˈO" -> [{sym:'h',...shape}, {sym:'ə'}, {sym:'l'}, {sym:'O', stress:2}] (unknown symbols skipped). */
  function parsePhonemes(str) {
    const out = [];
    let stress = 0;
    for (const ch of String(str || '')) {
      if (STRESS[ch]) { stress = STRESS[ch]; continue; }
      if (ch === 'ː') { if (out.length) out[out.length - 1].d *= 1.4; continue; }
      const ph = PHONES[ch];
      if (!ph) continue;
      const seg = { sym: ch, ...ph };
      if (ph.vowel) { seg.stress = stress; if (stress === 2) seg.d *= 1.3; else if (stress === 1) seg.d *= 1.1; stress = 0; }
      out.push(seg);
    }
    // h takes the shape of the vowel it leads into
    for (let i = 0; i < out.length; i++) {
      if (out[i].sym !== 'h') continue;
      const v = out.slice(i + 1).find((s) => s.vowel);
      if (v) Object.assign(out[i], { o: v.o * 0.7, w: v.w });
    }
    return out;
  }

  /** Spelling fallback: vowel sounds (and a lip press for m/b/p starts) as segments. */
  function spellingSegments(word) {
    const sounds = vowelSounds(word);
    const segs = sounds.map((s) => { const [o, w] = SOUND[s]; return { sym: s, o, w, d: 1, vowel: true }; });
    if (segs.length && /^[mbp]/i.test(word.replace(/[^a-z]/gi, ''))) segs.unshift({ sym: 'm', o: 0, w: 0.55, d: 0.5, p: true });
    return segs;
  }

  const cache = new Map();
  /** A word's segments with times from 0..1 of the word (cached per word+phonemes). */
  function wordSegments(word) {
    const key = (word.phonemes || '') + '|' + word.word;
    let segs = cache.get(key);
    if (!segs) {
      const raw = word.phonemes ? parsePhonemes(word.phonemes) : [];
      const base = raw.length ? raw : spellingSegments(word.word || '');
      const total = base.reduce((a, s) => a + s.d, 0) || 1;
      let t = 0;
      segs = base.map((s) => { const seg = { ...s, t0: t / total, t1: (t + s.d) / total }; t += s.d; return seg; });
      if (cache.size > 2000) cache.clear();
      cache.set(key, segs);
    }
    return segs;
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);

  /**
   * Mouth shape for `word` ({word, start, end, phonemes?}) at time t (seconds, same clock as
   * start/end), or null outside the word.  Returns {open, wide, press, sym}.
   */
  function mouthAt(word, t) {
    if (!word || t < word.start || t >= word.end) return null;
    const segs = wordSegments(word);
    if (!segs.length) return null;
    const x = (t - word.start) / Math.max(1e-6, word.end - word.start);
    let i = segs.findIndex((s) => x < s.t1);
    if (i < 0) i = segs.length - 1;
    const s = segs[i], next = segs[i + 1];
    const ph = Math.min(1, Math.max(0, (x - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
    let open = s.o, wide = s.w;
    if (s.to) { const k = smooth(Math.min(1, ph / 0.85)); open = lerp(s.o, s.to[0], k); wide = lerp(s.w, s.to[1], k); }
    // Anticipation: the last third of a sound leans toward the next one.
    if (next && ph > 0.66) {
      const k = smooth((ph - 0.66) / 0.34) * 0.5;
      open = lerp(open, next.o, k); wide = lerp(wide, next.w, k);
    }
    // Vowels swell and fade inside their span; consonants hold.
    if (s.vowel && !s.to) open *= 0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, ph * 1.15));
    const press = !!s.p && ph < 0.8;
    return { open: press ? 0 : open, wide, press, sym: s.sym };
  }

  /** The word playing at time t in a word list (sorted by start), or null in a gap. */
  function wordAt(words, t) {
    for (const w of words || []) { if (t < w.start) return null; if (t < w.end) return w; }
    return null;
  }

  const api = { SOUND, SPELL, vowelSounds, PHONES, parsePhonemes, spellingSegments, wordSegments, mouthAt, wordAt };
  root.LIPSYNC = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
