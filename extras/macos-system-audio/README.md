# Calcifer system audio (optional, macOS)

Calcifer lip-syncs to any **audio input** you pick in his window. Browsers and Glass apps can't
listen to an *output* (your speakers), so on macOS this small helper offers what your Mac is
playing as an input named **Calcifer System Audio**: pick it in Calcifer's device picker.

- **Only with Calcifer.** When a glass loads the Calcifer app, its core starts the helper, and the
  helper exits when that glass exits. The device itself exists only while a Calcifer window is
  open (it asks each running glass over its local socket, every 3 seconds).
- **Several glasses, one device.** Each glass starts its own helper, but only one works at a time:
  it holds a lock and the others wait on it at no cost. When its glass closes, the lock frees
  and a waiting one takes over immediately, so it keeps working while any glass is open.
- **Nothing is rerouted.** You keep hearing your normal output; it reads an unmuted copy.
- **No driver, no admin.** Core Audio process taps (macOS 14.2+). macOS asks once for
  *System Audio Recording* permission.
- **Privacy:** while the device exists, any app you've given microphone access could choose it
  and hear your system audio, the same as any loopback device.

Other systems don't need this: on Linux, "Monitor of ..." inputs already appear in the picker.

```bash
./build.sh                       # build calcifer-system-audio here, then restart the glass
rm calcifer-system-audio         # turn it off (or set CALCIFER_NO_SYSTEM_AUDIO=1)
```

Log: `~/Library/Logs/calcifer-system-audio.log`
