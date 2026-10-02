// Calcifer's persona: everything that makes him *him*, as data. The engine in view.html is
// character-neutral; another persona would be another file like this one (plus its art).
//
//   palettes  flame colors per heat: [tips/edge, body, core]
//   base      the resting rig pose
//   moods     poses, as partial rig parameter sets (see the rig notes in view.html)
//   cues      how he reacts to things that happen in the session (core.js names them).
//             Each cue lists options; one is picked by weight. An option can set:
//               mood + for (seconds)   a short-lived expression
//               react                  flare | sputter | sparks | wince
//               action                 yawn | sigh | hop | shiver | hum | nibble | stretch | snore
//               gaze + for             viewer | scan | down | up | around | away
//               strong: true           wins over a mood Claude just set (for real events)
//             `null` means "let it pass": not every little thing needs a reaction.
//   activity  his default look while Claude thinks or works (when nothing else is going on)
//   idle      how he passes the time: stages by how long it has been quiet, and little bits.
window.PERSONA = {
  name: 'Calcifer',

  palettes: {
    normal:  [[0.92, 0.18, 0.07], [1.00, 0.42, 0.09], [1.00, 0.78, 0.22]],
    happy:   [[0.95, 0.24, 0.08], [1.00, 0.50, 0.12], [1.00, 0.84, 0.32]],
    angry:   [[0.78, 0.06, 0.04], [0.96, 0.20, 0.06], [1.00, 0.52, 0.14]],
    sad:     [[0.12, 0.22, 0.78], [0.30, 0.52, 0.96], [0.72, 0.86, 1.00]],
    sleepy:  [[0.62, 0.12, 0.05], [0.86, 0.30, 0.08], [0.96, 0.58, 0.20]],
    excited: [[1.00, 0.30, 0.08], [1.00, 0.62, 0.16], [1.00, 0.92, 0.50]],
  },

  // All mood sizes are multiplied by this: at rest he sits inside the hearth, and only working
  // (focused), excitement or anger make him tower.
  scale: 0.86,
  base: { size: 1, lean: 0, sway: 1, heat: 'normal', eye: 1, tall: 1, lid: 0, tilt: 0, smileEyes: 0, pupil: 1,
    px: 0, py: 0, open: 0, wide: 0.8, curve: 0.25, teeth: 0, embers: 0.3, tremble: 0, hug: 0.5 },

  // After the film: his eyes stay round cream ovals almost always. Expression comes from the
  // mouth band (bend, how open), pupil size and gaze, eye size, and only a hint of eye shape.
  moods: {
    neutral:  {},
    happy:    { size: 1.08, heat: 'happy', smileEyes: 0.25, curve: 0.9, open: 0.18, wide: 0.95, embers: 0.5, hug: 0.75 },
    grumpy:   { size: 0.94, lid: 0.18, tilt: 0.35, pupil: 0.85, py: 0.1, curve: -0.35, open: 0, wide: 0.9, lean: -0.05, hug: 0.3 },
    angry:    { size: 1.34, heat: 'angry', eye: 1.08, pupil: 0.7, lid: 0.1, tilt: 0.45, curve: -0.6, open: 0.5, wide: 1, embers: 1.2, tremble: 0.5, sway: 1.6, hug: 0.15 },
    sad:      { size: 0.72, heat: 'sad', lid: 0.14, tilt: -0.45, py: 0.4, curve: -0.6, open: 0, wide: 0.6, embers: 0, sway: 0.55, hug: 1 },
    scared:   { size: 0.78, eye: 1.2, tall: 1.3, pupil: 0.6, curve: -0.2, open: 0.4, wide: 0.3, tremble: 1, embers: 0.1, hug: 1 },
    thinking: { size: 1.08, lid: 0.08, px: 0.6, py: -0.65, curve: -0.15, open: 0, wide: 0.5, lean: 0.06 },
    sleepy:   { size: 0.74, heat: 'sleepy', lid: 0.55, py: 0.3, curve: 0.05, open: 0.06, wide: 0.45, embers: 0.05, sway: 0.4, hug: 0.85 },
    smug:     { size: 1.04, lid: 0.28, tilt: -0.15, px: 0.6, curve: 0.65, open: 0, wide: 0.85, lean: 0.08 },
    excited:  { size: 1.24, heat: 'excited', eye: 1.12, tall: 1.15, pupil: 0.9, curve: 0.8, open: 0.55, wide: 0.75, embers: 1.2, sway: 1.4, hug: 0.6 },
    curious:  { eye: 1.08, tall: 1.12, pupil: 0.9, py: -0.15, curve: 0.1, open: 0.1, wide: 0.25, lean: 0.04 },
    focused:  { size: 1.2, lid: 0.2, tilt: 0.15, pupil: 0.8, py: 0.4, curve: -0.05, open: 0, wide: 0.6, sway: 1.15 },
    bored:    { size: 0.9, lid: 0.36, py: 0.25, px: -0.3, curve: -0.2, open: 0, wide: 0.7, sway: 0.7, lean: -0.04 },
    proud:    { size: 1.15, heat: 'happy', lid: 0.2, tilt: -0.1, py: -0.25, curve: 0.7, open: 0, wide: 0.9, embers: 0.8, lean: 0.03 },
    nervous:  { size: 0.9, eye: 1.05, tall: 1.12, pupil: 0.65, curve: -0.25, open: 0.04, wide: 0.9, tremble: 0.35, hug: 0.95 },
    asleep:   { size: 0.66, heat: 'sleepy', lid: 1, curve: 0.1, open: 0.03, wide: 0.5, embers: 0, sway: 0.3, hug: 0.9 },
  },

  // Grumbly, proud, a show-off when things go well, a coward when they get risky.
  cues: {
    wake:        [{ action: 'yawn', mood: 'sleepy', for: 2.5 }, { mood: 'grumpy', for: 3, gaze: 'viewer' }],
    listen:      [{ mood: 'curious', for: 2.5, gaze: 'viewer' }, { gaze: 'viewer', for: 2 }],
    read:        [{ mood: 'focused', for: 4, gaze: 'scan', weight: 3 }, { mood: 'thinking', for: 3, gaze: 'scan' }, null],
    search:      [{ mood: 'curious', for: 3, gaze: 'up' }, { mood: 'thinking', for: 3, gaze: 'around' }],
    write:       [{ mood: 'focused', for: 4, gaze: 'down', weight: 3 }, { mood: 'proud', for: 2.5 }, null],
    run:         [{ mood: 'focused', for: 3, gaze: 'down' }, null, null],
    test:        [{ mood: 'nervous', for: 8, gaze: 'down', weight: 2 }, { mood: 'nervous', for: 8, action: 'shiver' }],
    testPass:    [{ mood: 'proud', for: 4, react: 'sparks', strong: true }, { mood: 'excited', for: 3, react: 'sparks', action: 'hop', strong: true }],
    testFail:    [{ mood: 'grumpy', for: 4, react: 'sputter', strong: true }, { mood: 'sad', for: 3, react: 'sputter', action: 'sigh', strong: true }],
    risky:       [{ mood: 'scared', for: 3, action: 'shiver', strong: true }, { mood: 'nervous', for: 4, gaze: 'viewer', strong: true }],
    slow:        [{ mood: 'bored', for: 7, action: 'sigh' }, { mood: 'sleepy', for: 6, action: 'yawn' }, { mood: 'bored', for: 6, action: 'nibble' }],
    slowDone:    [{ mood: 'happy', for: 2.5, react: 'flare' }],
    committing:  [{ mood: 'focused', for: 2 }],
    commit:      [{ mood: 'proud', for: 3.5, react: 'flare', strong: true }, { mood: 'smug', for: 3.5, strong: true }],
    push:        [{ mood: 'excited', for: 3, react: 'sparks', action: 'hop', strong: true }],
    created:     [{ mood: 'proud', for: 2.5 }, null],
    fail:        [{ mood: 'grumpy', for: 2.5, react: 'wince', strong: true }, { mood: 'nervous', for: 2, react: 'wince', strong: true }, { react: 'sputter', mood: 'sad', for: 2, strong: true }],
    failStreak:  [{ mood: 'angry', for: 4, react: 'flare', action: 'shiver', strong: true }, { mood: 'grumpy', for: 5, action: 'sigh', strong: true }],
    denied:      [{ mood: 'sad', for: 3, action: 'sigh', strong: true }, { mood: 'grumpy', for: 3, gaze: 'away', strong: true }],
    delegate:    [{ mood: 'smug', for: 3, gaze: 'around' }],
    agentBack:   [{ mood: 'curious', for: 2, gaze: 'viewer' }],
    ask:         [{ mood: 'curious', for: 8, gaze: 'viewer', strong: true }],
    permission:  [{ mood: 'curious', for: 8, gaze: 'viewer', strong: true }, { mood: 'nervous', for: 8, gaze: 'viewer', strong: true }],
    done:        [{ mood: 'happy', for: 3 }, { mood: 'smug', for: 3 }, { action: 'sigh', for: 2 }, { action: 'stretch' }],
    longDone:    [{ mood: 'excited', for: 3, react: 'sparks', strong: true }, { mood: 'sleepy', for: 3, action: 'yawn', strong: true }],
    interrupted: [{ mood: 'scared', for: 1.5, react: 'wince', strong: true }, { mood: 'grumpy', for: 3, gaze: 'away', strong: true }],
    goodbye:     [{ mood: 'sleepy', for: 4, action: 'yawn' }],
  },

  // While Claude thinks or works and nothing else is happening
  activity: { thinking: 'thinking', working: 'focused' },

  idle: {
    // Quiet for this many seconds -> this resting mood (the last one that applies wins)
    stages: [[0, 'neutral'], [180, 'bored'], [480, 'sleepy'], [720, 'asleep']],
    // Every so often (seconds, random in range) he does a little something
    every: [6, 16],
    bits: {
      neutral: [{ gaze: 'around', for: 2.5, weight: 3 }, { gaze: 'viewer', mood: 'smug', for: 2 }, { action: 'hum', weight: 2 },
        { action: 'nibble' }, { react: 'flare', mood: 'proud', for: 1.6 }, { mood: 'curious', gaze: 'up', for: 2 }, { action: 'stretch' }, { action: 'hop' }],
      bored:   [{ action: 'sigh', weight: 3 }, { action: 'yawn', weight: 2 }, { gaze: 'away', for: 3 }, { action: 'nibble' }, { react: 'sputter' }],
      sleepy:  [{ action: 'yawn', weight: 3 }, { action: 'sigh' }, null],
      asleep:  [{ action: 'snore', weight: 3 }, null],
    },
    // Being woken up from a doze
    woken: [{ mood: 'scared', for: 1.2, react: 'flare', strong: true }],
  },
};
