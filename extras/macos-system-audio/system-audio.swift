// calcifer-system-audio: an optional macOS helper for the Calcifer glass app.
//
// While a Calcifer window is open in any running Claude Glass, it offers "everything this Mac is
// playing" as an ordinary audio input named "Calcifer System Audio", so Calcifer's device picker
// can lip-sync to system audio without BlackHole or rerouting your output. When no Calcifer
// window is open, the device doesn't exist.
//
// How: Core Audio process taps (macOS 14.2+). A read-only, unmuted stereo tap of all processes,
// wrapped in an aggregate device. No driver, no admin rights; macOS asks once for System Audio
// Recording permission. Every few seconds it asks each running glass (its socket in
// /tmp/claude-glass-<uid>/) which windows are open.
//
// Build: swiftc -O system-audio.swift -o calcifer-system-audio   (install.sh does this)

import CoreAudio
import Foundation

let deviceName = "Calcifer System Audio"
let deviceUID = "calcifer.system-audio"
let appType = "calcifer"
let pollSeconds = 3.0

func log(_ s: String) {
  let ts = ISO8601DateFormatter().string(from: Date())
  print("\(ts) \(s)")
  fflush(stdout)
}

// ---------- Is a Calcifer window open in any running glass? ----------
let runtimeDir = ProcessInfo.processInfo.environment["CLAUDE_GLASS_RUNTIME"]
  ?? "/tmp/claude-glass-\(getuid())"

// Ask a glass what's on screen, over its socket (the same `view` request the CLI sends: one JSON
// line in, one JSON reply, then the glass closes the connection). A stale socket from a crashed
// glass just fails to connect.
func askView(_ path: String) -> [String: Any]? {
  let fd = socket(AF_UNIX, SOCK_STREAM, 0)
  if fd < 0 { return nil }
  defer { close(fd) }
  var tv = timeval(tv_sec: 1, tv_usec: 0)
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
  var addr = sockaddr_un()
  addr.sun_family = sa_family_t(AF_UNIX)
  let bytes = Array(path.utf8.prefix(103))
  withUnsafeMutableBytes(of: &addr.sun_path) { buf in
    for (i, b) in bytes.enumerated() { buf[i] = b }
    buf[bytes.count] = 0
  }
  let len = socklen_t(MemoryLayout<sockaddr_un>.size)
  let ok = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, len) == 0 } }
  if !ok { return nil }
  let request = Array("{\"op\":\"view\"}\n".utf8)
  if write(fd, request, request.count) != request.count { return nil }
  var reply = Data()
  var chunk = [UInt8](repeating: 0, count: 16384)
  while true {
    let n = read(fd, &chunk, chunk.count)
    if n <= 0 { break }
    reply.append(chunk, count: n)
  }
  guard let json = try? JSONSerialization.jsonObject(with: reply) as? [String: Any] else { return nil }
  return json["result"] as? [String: Any]
}

// Open means on a desktop or docked at an edge (not in the closed list).
func calciferOpen(_ view: [String: Any]) -> Bool {
  var windows: [[String: Any]] = []
  for desktop in (view["desktops"] as? [[String: Any]]) ?? [] { windows += (desktop["windows"] as? [[String: Any]]) ?? [] }
  for edge in ((view["tucked"] as? [String: [[String: Any]]]) ?? [:]).values { windows += edge }
  return windows.contains { $0["type"] as? String == appType }
}

func wanted() -> Bool {
  guard let names = try? FileManager.default.contentsOfDirectory(atPath: runtimeDir) else { return false }
  for name in names where name.hasSuffix(".sock") {
    if let view = askView("\(runtimeDir)/\(name)"), calciferOpen(view) { return true }
  }
  return false
}

// ---------- The tap and its device ----------
let timer = DispatchSource.makeTimerSource(queue: .main)
var parentWatch: DispatchSourceRead?
var tapID = AudioObjectID(kAudioObjectUnknown)
var aggregateID = AudioObjectID(kAudioObjectUnknown)
var active: Bool { aggregateID != kAudioObjectUnknown }

func start() {
  let tap = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
  tap.uuid = UUID()
  tap.name = "Calcifer system audio tap"
  tap.isPrivate = false
  tap.muteBehavior = .unmuted
  var status = AudioHardwareCreateProcessTap(tap, &tapID)
  guard status == noErr else { log("could not create the tap (\(status))"); tapID = kAudioObjectUnknown; return }
  let description: [String: Any] = [
    kAudioAggregateDeviceNameKey: deviceName,
    kAudioAggregateDeviceUIDKey: deviceUID,
    kAudioAggregateDeviceIsPrivateKey: false,
    kAudioAggregateDeviceIsStackedKey: false,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: tap.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
  ]
  status = AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggregateID)
  guard status == noErr else {
    log("could not create the device (\(status))")
    AudioHardwareDestroyProcessTap(tapID); tapID = kAudioObjectUnknown; aggregateID = kAudioObjectUnknown
    return
  }
  log("Calcifer is open: \"\(deviceName)\" is available")
}

func stop() {
  if aggregateID != kAudioObjectUnknown { AudioHardwareDestroyAggregateDevice(aggregateID) }
  if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
  if active || tapID != kAudioObjectUnknown { log("Calcifer is closed: \"\(deviceName)\" removed") }
  aggregateID = kAudioObjectUnknown
  tapID = kAudioObjectUnknown
}

// ---------- Run ----------
// Every glass that loads Calcifer starts one of these (with --follow-parent: it exits when that
// glass does, because the glass holds its stdin open). Only one at a time does the work: it
// holds an exclusive lock, and the others wait on it at no cost. The lock is released when its
// holder exits, however it exits, so a waiting one takes over at once.
var signalSources: [DispatchSourceSignal] = []
for sig in [SIGINT, SIGTERM, SIGHUP] {
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { stop(); exit(0) }
  source.resume()
  signalSources.append(source)
}

if CommandLine.arguments.contains("--follow-parent") {
  let stdinSource = DispatchSource.makeReadSource(fileDescriptor: STDIN_FILENO, queue: .main)
  stdinSource.setEventHandler {
    var byte: UInt8 = 0
    if read(STDIN_FILENO, &byte, 1) <= 0 { stop(); exit(0) } // our glass is gone
  }
  stdinSource.resume()
  parentWatch = stdinSource // keep it alive for the life of the process
}

func run() {
  log("watching for Calcifer windows (every \(Int(pollSeconds)) s)")
  timer.schedule(deadline: .now(), repeating: pollSeconds)
  timer.setEventHandler {
    let want = wanted()
    if want && !active { start() }
    if !want && active { stop() }
  }
  timer.resume()
}

let lockPath = "/tmp/calcifer-system-audio-\(getuid()).lock"
let lockFD = open(lockPath, O_CREAT | O_RDWR, 0o600)
if lockFD < 0 { log("can't open \(lockPath)"); exit(1) }
if flock(lockFD, LOCK_EX | LOCK_NB) == 0 {
  run()
} else {
  // Another one is working; wait for its lock in the background, then take over.
  Thread.detachNewThread {
    if flock(lockFD, LOCK_EX) == 0 { DispatchQueue.main.async { log("taking over"); run() } }
  }
}
dispatchMain()
