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
- **Lip sync.** From the reply text (default), from any audio input, or both: the audio for
  timing and loudness, the text for the vowel shapes.
- **Your voice channel.** With vmux running he plays Claude's voice and listens to you himself,
  no vmux pane needed: say "Calcifer" to talk, "Calcifer, stop listening" when you're done. The
  ash in front of his log glows while he listens. Click him to mute him.
- **The room.** A painted hearth he lights up (blue when he's sad); herbs that sway when a breeze
  drifts through and swing away when he flares up.
- **Persona.** Optionally, Claude speaks as Calcifer. Everything that makes him *him* (moods,
  colors, reactions, idle habits) lives in `persona/calcifer.js`, so other characters can follow.

## Install

Needs [Claude Glass](https://github.com/n33kos/claude-glass) 3.5 or newer.

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
| Lip sync from | `text` (the reply text), `input` (an audio input), `both`, `feed` (a speech feed, below) |
| Speech feed URL, session | for `feed`: where the feed is (default the local vmux relay) and which session (blank: this project) |
| Play Claude's voice himself | for `feed`: he plays the audio (exact sync; mute other players) or stays silent and follows them |
| Voice delay | for `feed` when another app plays the audio: how far behind his clock it is (vmux via LiveKit: ~90ms, measured) |
| Audio sensitivity | for `input` / `both` |
| Speech speed, delay | for `text`: tune to your text-to-speech |
| Subtitles, fireplace | show the spoken line; draw the hearth (off: just him) |

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
| wake | he listens for his name: each burst of speech goes to vmux's local Whisper, and only his name does anything |
| open | a conversation: your mic is live on your turn and closed during Claude's, as in the vmux pane |

- **"Calcifer"** (or "hey Cal") opens a conversation. Say more in the same breath ("Calcifer, run
  the tests") or right after, and it goes to Claude at once.
- **"Calcifer, stop listening"** (or "go to sleep", "that's all"), the relay's silence timeout, or a
  quiet minute goes back to wake. **"Calcifer, hush"** / **"speak up"** mute and unmute him.
- **The ash pile** in front of his log is his ear: cold when the mic is off, a few coals breathing
  while he waits for his name, the whole bed glowing (and sparking with your voice) in a
  conversation. Click it to start or end a conversation; right-click for mic off. Click **him** to
  mute his voice (he burns low and keeps mouthing the words).
- Claude can set them too: `claude-glass app calcifer mic --mode off|wake|open`,
  `claude-glass app calcifer mute --on true|false`.

Whisper rarely spells him right ("Call Cypher", "Kels4"), so his name is matched by its consonant
sounds (KLSFR), and only at the start of what you say: `ears.js`, tested by `node --test test/*.test.js`.
The wake path posts audio straight to Whisper on `localhost:8100`, the one call that doesn't go
through the relay. The mic library is the relay's `/sdk/vmux-voice.js` (vmux v5+).

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
Ghibli's film); this app isn't affiliated with or endorsed by either. The hearth painting was
generated for this app.

## License

MIT (the code)
