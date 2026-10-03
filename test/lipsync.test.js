// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lipsync.js');

test('parses misaki phonemes with stress and diphthongs', () => {
  const segs = L.parsePhonemes('həlˈO');
  assert.deepEqual(segs.map((s) => s.sym), ['h', 'ə', 'l', 'O']);
  assert.equal(segs[3].stress, 2);
  assert.ok(segs[3].to, 'O glides');
  // h borrows the next vowel's shape
  assert.equal(segs[0].w, segs[1].w);
});

test('skips symbols it does not know', () => {
  assert.deepEqual(L.parsePhonemes('k?æ!t').map((s) => s.sym), ['k', 'æ', 't']);
});

test('real Kokoro output for tricky words parses into sounds', () => {
  for (const ph of ['fˈɔɹTitˌu', 'ʤˌipˌijˈu', 'ˌɑɹˌiˌAdˌiˌɛmˈi', 'kˈælsɪfəɹz', 'mˌWθʃˈAps']) {
    const segs = L.parsePhonemes(ph);
    assert.ok(segs.length >= 4, ph);
    assert.ok(segs.some((s) => s.vowel), ph);
  }
});

test('segments cover the whole word in order, stressed vowels longer', () => {
  const segs = L.wordSegments({ word: 'hello', phonemes: 'həlˈO', start: 0, end: 1 });
  assert.equal(segs[0].t0, 0);
  assert.ok(Math.abs(segs[segs.length - 1].t1 - 1) < 1e-9);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].t0, segs[i - 1].t1);
  const span = (s) => s.t1 - s.t0;
  assert.ok(span(segs[3]) > span(segs[1]), 'stressed diphthong outlasts the schwa');
});

test('lips press on m/b/p and open on vowels', () => {
  const w = { word: 'map', phonemes: 'mˈæp', start: 1, end: 1.6 };
  const atStart = L.mouthAt(w, 1.02);
  assert.equal(atStart.press, true);
  assert.equal(atStart.open, 0);
  const mid = L.mouthAt(w, 1.3);
  assert.equal(mid.sym, 'æ');
  assert.ok(mid.open > 0.6);
});

test('round vs wide vowels', () => {
  const oo = L.mouthAt({ word: 'two', phonemes: 'tˈu', start: 0, end: 1 }, 0.7);
  const ee = L.mouthAt({ word: 'tea', phonemes: 'tˈi', start: 0, end: 1 }, 0.7);
  assert.ok(oo.wide < 0.2 && ee.wide > 0.8);
});

test('diphthongs glide', () => {
  const w = { word: 'eye', phonemes: 'ˈI', start: 0, end: 1 };
  const a = L.mouthAt(w, 0.05), b = L.mouthAt(w, 0.9);
  assert.ok(a.open > b.open, 'aɪ starts open, ends near ɪ');
});

test('outside the word there is no shape', () => {
  const w = { word: 'x', phonemes: 'ˈɛks', start: 1, end: 2 };
  assert.equal(L.mouthAt(w, 0.5), null);
  assert.equal(L.mouthAt(w, 2), null);
});

test('falls back to spelling without phonemes', () => {
  const s = L.mouthAt({ word: 'moon', start: 0, end: 1 }, 0.05);
  assert.equal(s.press, true);
  const v = L.mouthAt({ word: 'moon', start: 0, end: 1 }, 0.7);
  assert.equal(v.sym, 'oo');
});

test('wordAt finds the word under the playhead and gaps', () => {
  const words = [{ word: 'a', start: 0, end: 0.3 }, { word: 'b', start: 0.5, end: 0.8 }];
  assert.equal(L.wordAt(words, 0.1).word, 'a');
  assert.equal(L.wordAt(words, 0.4), null);
  assert.equal(L.wordAt(words, 0.6).word, 'b');
  assert.equal(L.wordAt(words, 1), null);
});

test('every phoneme Kokoro emits for American English has a shape', () => {
  const kokoro = 'ɑæʌəᵊɛɪiʊuɔɜAIWYObdfhjklmnpstvwzɡŋɹʃʒðθʤʧTʔ';
  for (const ch of kokoro) assert.ok(L.PHONES[ch], ch);
});
