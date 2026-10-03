const test = require('node:test');
const assert = require('node:assert');

global.window = {};
global.performance ??= { now: () => 0 };
require('../ears.js');
const { findName, voiceCommand, skeleton, endsConversation } = window.EARS;

test('"stop listening" ends a conversation even when his name is misheard', () => {
  assert.strictEqual(endsConversation("'cause first stop listening."), 'stop');
  assert.strictEqual(endsConversation('go to sleep'), 'stop');
  assert.strictEqual(endsConversation('the server should stop listening on port 80 after the tests'), null);
});

test('Whisper\'s mishearings of his name sound alike', () => {
  for (const s of ['Calcifer', 'Call Cypher', 'Call Cipher', 'Cal Sifer', 'Kels4', 'Kelsifer']) assert.strictEqual(skeleton(s), 'KLSFR', s);
});

test('what Whisper heard when the user said his name over and over', () => {
  for (const s of ['Calcifer', 'C saber', 'Calcer flew', 'C hobbies for you', 'Cal saber']) assert.ok(findName(s), s);
});

test('his name at the start, after a greeting or not', () => {
  assert.deepStrictEqual(findName('Call Cypher. Are you there?'), { rest: 'Are you there?' });
  assert.deepStrictEqual(findName('Hey call Cipher'), { rest: '' });
  assert.deepStrictEqual(findName('Okay, Calcifer, run the tests'), { rest: 'run the tests' });
});

test('other speech is not his name', () => {
  for (const s of ['I think the cat is fine', 'Thank you.', 'The classifier is broken', 'Hey Claude', 'Tell Calcifer hi', 'Call the API', 'Cool, thanks',
    'Could you search for the file', 'Close the window', 'Clear the screen', 'Check the logs', 'Copy that file']) assert.strictEqual(findName(s), null, s);
});

test('permissive: rougher mishearings wake him, but only close ones carry a request', () => {
  for (const s of ['Kelsey for', 'Calc for', 'Cal sifa', 'Kelso fur', 'Cassifer', 'Cal Cifra']) assert.ok(findName(s), s);
  assert.deepStrictEqual(findName("'cause first stop listening"), { rest: 'stop listening', loose: true });
  assert.strictEqual(findName('Clean up the branch').loose, true);
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
