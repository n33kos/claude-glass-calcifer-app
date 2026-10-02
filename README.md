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
- **The room.** A painted hearth he lights up (blue when he's sad); herbs that sway when a breeze
  drifts through and swing away when he flares up.
- **Persona.** Optionally, Claude speaks as Calcifer. Everything that makes him *him* (moods,
  colors, reactions, idle habits) lives in `persona/calcifer.js`, so other characters can follow.

## Install

Needs [Claude Glass](https://github.com/n33kos/claude-glass).

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
| Lip sync from | `text` (the reply text), `input` (an audio input), `both` |
| Audio sensitivity | for `input` / `both` |
| Speech speed, delay | for `text`: tune to your text-to-speech |
| Subtitles, fireplace | show the spoken line; draw the hearth (off: just him) |

In `input` or `both` mode, hover his window to pick the audio input from a list.

### Listening to system audio (optional, macOS)

Web pages can only listen to inputs, not your speakers. On macOS 14.2+, a small optional helper
offers what the Mac is playing as an input named *Calcifer System Audio*, only while a Calcifer
window is open: see [`extras/macos-system-audio`](extras/macos-system-audio). Elsewhere, any
loopback input works (on Linux, the "Monitor of ..." inputs).

## Credits

A fan project. Calcifer is from *Howl's Moving Castle* (Diana Wynne Jones's novel and Studio
Ghibli's film); this app isn't affiliated with or endorsed by either. The hearth painting was
generated for this app.

## License

MIT (the code)
