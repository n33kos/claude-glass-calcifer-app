# Calcifer for Claude Glass

A [Claude Glass](https://github.com/n33kos/claude-glass) app that gives Claude a face: Calcifer, a
grumbly, proud, secretly soft-hearted fire demon hugging a log in his hearth. He reacts to what
Claude is doing, shows the feeling behind what Claude says, and moves his mouth while Claude's
replies are spoken.

![Calcifer in his hearth](media/hero.jpg)

| Talking | Moods |
|---|---|
| ![Lip sync](media/talking.gif) | ![Moods](media/moods.gif) |

| Flaring up | A gust of wind |
|---|---|
| ![Flare](media/flare.gif) | ![Wind](media/wind.gif) |

| This week's allowance | This session's |
|---|---|
| ![Firewood](media/firewood.gif) | ![Kindling](media/kindling.gif) |

## What he does

- **Moods.** Sixteen expressions (happy, grumpy, angry, sad, scared, smug, excited, curious,
  focused, proud, nervous, sleepy, bored, asleep...). Claude sets them as it talks:
  `claude-glass app calcifer mood --mood smug [--for <seconds>]`, and punctuates moments with
  `claude-glass app calcifer react --kind flare|sputter|sparks|wince`.
- **Reactions on his own.** He watches the session: perks up when you speak, scans while Claude
  reads, gets nervous while tests run, throws sparks when they pass and sputters when they fail,
  shivers at `rm -rf`, puffs up after a commit, startles when interrupted.
- **Idle life.** When it's quiet he glances around, hums, nibbles his log, shows off. Left alone
  long enough he gets bored, sleepy, and falls asleep (and startles awake).
- **Lip sync.** From the speech feed's own audio, word timings and phonemes, so his mouth makes
  each sound as it is heard rather than guessing from the text.
- **Your voice channel.** With vmux running he plays Claude's voice and listens to you himself, no
  vmux pane needed. He hears his own name **locally** — three small ONNX models in his window, no
  transcription, nothing sent anywhere. Say "Calcifer" to talk, and say it again (or click him)
  **while he is replying** to cut him off and take your turn. The ash in front of his log pulses
  with your voice while he listens.
- **What he's working on.** The command Claude is running rises off him as wisps of flame, drawn
  glyph by glyph so the line wavers like heat and comes apart as it climbs. Tells "working" from
  "sitting there" at a glance.
- **Your allowance, in the hearth.** A woodpile for the week and a pot of kindling for the
  five-hour window, both painted in the scene's own hand and emptying as you spend.
- **The room.** A painted hearth he lights up (blue when he's sad); herbs that sway when a breeze
  drifts through and swing away when he flares up.
- **Persona.** Optionally, Claude speaks as Calcifer. Everything that makes him *him* (moods,
  colors, reactions, idle habits) lives in `persona/calcifer.js`, so other characters can follow.

## Install

Needs [Claude Glass](https://github.com/n33kos/claude-glass) 3.7 or newer (3.7 lets him load his sounds).

```sh
git clone https://github.com/n33kos/claude-glass-calcifer-app ~/.claude/claude-glass/apps/calcifer
```

(or clone it anywhere and symlink the folder to `~/.claude/claude-glass/apps/calcifer`), then
restart the glass: `claude-glass close && claude-glass open`, and open him from the dock.

## Settings

Settings → Apps → Calcifer:

| Setting | |
|---|---|
| Claude speaks as Calcifer | the persona in Claude's instructions (on by default) |
| Your microphone | the mic he listens to, picked from your inputs; Automatic: the system default, skipping loopback and virtual devices (then the built-in mic). Hover the ash to see which one |
| Relay URL, auth token, session | where the speech feed is (default the local vmux relay), its token, and which session (blank: this project) |
| Wake sensitivity | 50 is what training measured — one false wake per eleven hours. Higher catches near-misses like "Kelsifer"; lower demands a dead-certain match. Takes effect live |
| Say his name to cut him off | a spoken interrupt mid-reply (clicking him always works) |
| Conversation timeout, follow-up window | how long a silence ends a conversation, and how long his mic stays open after he finishes so you can answer without calling him again |
| What he's working on | the command wisps, and their size |
| Animate on twos | poses per second — 12 for the hand-drawn look, 0 for fully smooth |
| Subtitles, fireplace | show the spoken line; draw the hearth (off: just him) |
| Sound effects, crackling hearth, sound volume | his reactions' sounds (whoosh, fizzle, sparks, crunching his log) and the fire's ambient crackle, which swells with his flame and smolders while he sleeps. Real CC0 recordings ([credits](assets/sounds/CREDITS.md)) |

In `input` or `both` mode, hover his window to pick the audio input from a list.

### Speech feed: real timing, real phonemes

In `feed` mode he gets what's being said straight from the source: the audio itself, when every
word starts and ends, and each word's phonemes. His mouth makes each sound (lips pressed for
m/b/p, rounded for "oo", wide for "ee", gliding through diphthongs) at the moment it's heard,
scaled by how loud the voice actually is.

**With [vmux](https://github.com/n33kos/claude-voice-multiplexer)** (v5+), the relay is a feed:

```sh
vmux token Calcifer --scope speak        # speak: he can use your mic (listen: lip sync only)
claude-glass stored calcifer set feedToken '"<token>"'
claude-glass settings set app.calcifer.audioSource feed
```

He follows this project's session. If the vmux pane plays the voice, leave *Play Claude's voice
himself* off (his clock waits *Voice delay* to match it); for him alone (say, full screen), turn
it on and he plays it himself in exact sync.

### Talking to him (no vmux pane)

With a `speak` token he's the whole voice channel. The mic has three states, kept per project:

| | |
|---|---|
| off | nothing listens (the mic isn't open) |
| wake | he is in the room but silent in it, while his own spotter listens here for his name. Nothing is transcribed and nothing leaves the machine |
| open | a conversation: your mic is live on your turn and closed during Claude's, as in the vmux pane |

- **"Calcifer"** (or "hey Cal") opens a conversation. Say more in the same breath ("Calcifer, run
  the tests") or right after, and it goes to Claude at once.
- **"Calcifer, stop listening"** (or "go to sleep", "that's all"), the relay's silence timeout, or a
  quiet minute goes back to wake. **"Calcifer, hush"** / **"speak up"** mute and unmute him.
- **Interrupting him.** While he is speaking or Claude is working, **say his name** or **click
  him** and he stops: the reply is cut, the speech already queued at the relay is cancelled, and
  your mic goes live during what is still Claude's turn.
- **The ash pile** in front of his log is his ear: cold when the mic is off, a few coals breathing
  while he waits for his name, and in a conversation the whole bed rises and falls **with how
  loudly you are speaking**, sparking as you go. Left-click moves between off and listening (it
  never opens a conversation by accident); right-click talks to him right away. Click **him** to
  mute his voice (he burns low and keeps mouthing the words).
- Claude can set them too: `claude-glass app calcifer mic --mode off|wake|open`,
  `claude-glass app calcifer mute --on true|false`.

#### Hearing his name, locally

`wake/` holds the spotter: openWakeWord's melspectrogram and speech-embedding frontend, plus a head
trained here, run in his own window by ONNX Runtime Web (vendored, wasm, no CDN). It scores 80 ms of
audio at a time — about 5 ms of work — and answers yes or no. It never transcribes, so **no audio
leaves the machine** and there is no second transcription path beside the relay's.

The head is trained on his name in many voices **and on 400,000 windows of real-world audio** from
openWakeWord's ACAV100M features. That second part is the whole trick: trained only against other
*words*, a classifier has no idea what "not speech" is and answers confidently anyway — an earlier
version fired on 586 of 1101 steps of an empty room. Its threshold is chosen by counting false
wakes per hour over a 10.7-hour stream, with the same run-length and cooldown the spotter uses:
**0.09 per hour**, with 82% recall on held-out voices.

Once his mic is open the words are the relay's to transcribe, and Whisper rarely spells him right
("Call Cypher", "Kels4") — so spoken commands are matched by consonant sounds (KLSFR) rather than
spelling: `ears.js`, tested by `node --test test/*.test.js`. The mic library is the relay's
`/sdk/vmux-voice.js` (vmux v5+).

**Any other source** can drive him by speaking the same small protocol over a WebSocket at
`<feed URL>/ws/client` (add the URL's origins to `permissions.network` in `glass-app.json`):

| Message | |
|---|---|
| `{"type":"speech_start","session_id","utterance_id","message_id","text","sample_rate"}` | an utterance begins |
| `{"type":"speech_chunk","session_id","utterance_id","seq","offset_s","duration_s","words":[{"word","start","end","phonemes"?}]}` | word timings, seconds from the utterance start; `phonemes` optional (misaki/IPA, e.g. `həlˈO`) |
| `{"type":"speech_end","session_id","utterance_id","cancelled","duration_s"}` | done (or cut off: stop now) |
| binary: `"VMXA"`, u8 version 1, u32 BE header length, JSON `{session_id, utterance_id, seq, offset_samples, sample_rate, channels, format:"s16le"}`, then 16-bit mono PCM | the audio, placed by `offset_samples` |

He loads the client library from `<feed URL>/sdk/vmux-client.js` and, on connecting, sends
`{"type":"connect_session","session_id"}` and `{"type":"audio_subscribe","enabled":true}`
(authenticating with a `vmux-token.<token>` WebSocket subprotocol); a feed that doesn't need
them can ignore both. Words without `phonemes` fall back to vowel shapes from the spelling.
The lip-sync rules (phoneme → mouth, timing within a word) are in `lipsync.js`; `node --test`
runs their tests.

### Your allowance, in his hearth

| This week | This session |
|---|---|
| ![Firewood](media/firewood.gif) | ![Kindling](media/kindling.gif) |

The woodpile beside him is the **seven-day** window and the pot of kindling is the **five-hour**
one. Both show what is *left* and empty as you spend, stepping once per turn, when Claude Code
reports usage.

The windows are matched by the names Claude Code gives them (`five_hour`, `seven_day`), never
inferred from which resets soonest — a guess like that is one scheduling change away from showing
the week's figure as the hour's. `core.js` catches the event; a view's `session` prop does not
carry usage.

Why they look like they belong: each prop was painted **into this very picture** — the bare hearth
handed to the model as a reference, with only the addition described — and then cut back out. Props
generated on their own came back with the wrong perspective, palette and scale, and looked exactly
as composited as they were. The depleted states are hand-painted, because no model would do it:
asked to redraw the pile with one log gone, a painter repaints the whole stack; an eraser with no
prompt smears background into the hole; and a masked inpainter told three different ways that the
stack should be *shorter* put wood back every time. Inside a mask, the surrounding context beats
the instruction.

The kindling has eleven states in tens and the firewood six in twenties — the five-hour window is
the one you watch move during a sitting, so it earns the finer steps. They live in
`assets/props/`, declared in `assets/sway.js` as `window.PROPS` with a `levels` map; the nearest
loaded level is drawn, so a partial set works.

### What he's working on

The command Claude is running lifts off him as wisps of flame and thins out as it climbs. They are
drawn character by character, each glyph on its own sine, so the line wavers like heat rather than
sliding as a block, and comes apart higher up — legible near him, gone by the top.

No hook and no configuration: `core.js` already receives every tool call with its input, which is
the same route `activity` and `tool` arrive by. Bash shows the command, Read and Edit the file,
Grep the pattern.

### Listening to system audio (optional, macOS)

Web pages can only listen to inputs, not your speakers. On macOS 14.2+, a small optional helper
offers what the Mac is playing as an input named *Calcifer System Audio*, only while a Calcifer
window is open: see [`extras/macos-system-audio`](extras/macos-system-audio). Elsewhere, any
loopback input works (on Linux, the "Monitor of ..." inputs).

## His scroll (optional)

[`scroll/`](scroll) is a second app: a painted parchment that unrolls whatever Claude presents
(markdown, tables, code, mermaid diagrams), in a bare window with no glass panel around it
(Claude Glass 3.6+). It's a separate app, so link it in too:

```sh
ln -s ~/.claude/claude-glass/apps/calcifer/scroll ~/.claude/claude-glass/apps/scroll
```

## Credits

A fan project. Calcifer is from *Howl's Moving Castle* (Diana Wynne Jones's novel and Studio
Ghibli's film); this app isn't affiliated with or endorsed by either. The hearth painting and its
props were generated for this app, and the props' depleted states painted by hand.

The wake word runs on [openWakeWord](https://github.com/dscripka/openWakeWord)'s melspectrogram and
speech-embedding frontend, and is trained against its published real-world negative features
(ACAV100M), via [ONNX Runtime Web](https://onnxruntime.ai/) (vendored, wasm only).

## License

MIT (the code)
