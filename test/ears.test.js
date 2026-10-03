const test = require('node:test');
const assert = require('node:assert');

global.window = {};
global.performance ??= { now: () => 0 };
require('../ears.js');
const { findName, voiceCommand, skeleton } = window.EARS;

test('Whisper\'s mishearings of his name sound alike', () => {
  for (const s of ['Calcifer', 'Call Cypher', 'Call Cipher', 'Cal Sifer', 'Kels4', 'Kelsifer']) assert.strictEqual(skeleton(s), 'KLSFR', s);
});

test('his name at the start, after a greeting or not', () => {
  assert.deepStrictEqual(findName('Call Cypher. Are you there?'), { rest: 'Are you there?' });
  assert.deepStrictEqual(findName('Hey call Cipher'), { rest: '' });
  assert.deepStrictEqual(findName('Okay, Calcifer, run the tests'), { rest: 'run the tests' });
});

test('other speech is not his name', () => {
  for (const s of ['I think the cat is fine', 'Thank you.', 'The classifier is broken', 'Hey Claude', 'Tell Calcifer hi', 'Call the API', 'Cool, thanks']) assert.strictEqual(findName(s), null, s);
});

test('"Cal" for short, greeted or alone', () => {
  assert.deepStrictEqual(findName('Hey Cal, run the tests'), { rest: 'run the tests' });
  assert.deepStrictEqual(findName('Okay Kal'), { rest: '' });
  assert.deepStrictEqual(findName('Cal.'), { rest: '' });
});

test('voice commands', () => {
  assert.strictEqual(voiceCommand('stop listening.'), 'stop');
  assert.strictEqual(voiceCommand('go to sleep'), 'stop');
  assert.strictEqual(voiceCommand('hush'), 'mute');
  assert.strictEqual(voiceCommand('speak up!'), 'unmute');
  assert.strictEqual(voiceCommand('run the tests'), null);
});
