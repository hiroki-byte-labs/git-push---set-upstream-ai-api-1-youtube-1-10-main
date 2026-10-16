import AVFoundation
import CoreMedia
import Foundation

struct PlaybackReport: Encodable {
  let file: String
  let status: String
  let durationSeconds: Double?
  let observedProgressSamples: Int
  let firstProgressSeconds: Double?
  let lastProgressSeconds: Double?
  let playbackRate: Double
  let muted: Bool
  let ended: Bool
  let elapsedSeconds: Double
}

func fail(_ message: String) -> Never {
  fputs("\(message)\n", stderr)
  exit(2)
}

guard CommandLine.arguments.count >= 2 && CommandLine.arguments.count <= 4 else {
  fail("Usage: swift scripts/verify-avplayer-playback.swift <mp4> [rate=8] [timeout-seconds=180]")
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let rate = CommandLine.arguments.count >= 3 ? (Double(CommandLine.arguments[2]) ?? 8) : 8
let timeout = CommandLine.arguments.count >= 4 ? (Double(CommandLine.arguments[3]) ?? 180) : 180
guard rate >= 0.05 && rate <= 16 else { fail("rate must be between 0.05 and 16") }
guard timeout >= 1 && timeout <= 900 else { fail("timeout must be between 1 and 900 seconds") }
guard FileManager.default.fileExists(atPath: url.path) else { fail("MP4 does not exist") }

let item = AVPlayerItem(url: url)
let player = AVPlayer(playerItem: item)
player.isMuted = true
let start = Date()
let ended = DispatchSemaphore(value: 0)
let observer = NotificationCenter.default.addObserver(
  forName: .AVPlayerItemDidPlayToEndTime,
  object: item,
  queue: .main
) { _ in ended.signal() }

player.playImmediately(atRate: Float(rate))
let deadline = Date().addingTimeInterval(timeout)
var progress: [Double] = []
var status = "unknown"
var didEnd = false

while Date() < deadline {
  if ended.wait(timeout: .now()) == .success {
    didEnd = true
    break
  }
  switch item.status {
  case .readyToPlay:
    status = "readyToPlay"
  case .failed:
    status = "failed: \(item.error?.localizedDescription ?? "unknown")"
  case .unknown:
    status = "unknown"
  @unknown default:
    status = "other"
  }
  let seconds = CMTimeGetSeconds(player.currentTime())
  if seconds.isFinite && (progress.isEmpty || seconds > progress[progress.count - 1] + 0.02) {
    progress.append(seconds)
  }
  RunLoop.current.run(until: Date().addingTimeInterval(0.05))
}

let duration = CMTimeGetSeconds(item.duration)
let finalTime = CMTimeGetSeconds(player.currentTime())
if duration.isFinite && finalTime >= duration - 0.1 { didEnd = true }
player.pause()
NotificationCenter.default.removeObserver(observer)

let report = PlaybackReport(
  file: url.lastPathComponent,
  status: status,
  durationSeconds: duration.isFinite ? duration : nil,
  observedProgressSamples: progress.count,
  firstProgressSeconds: progress.first,
  lastProgressSeconds: progress.last,
  playbackRate: rate,
  muted: player.isMuted,
  ended: didEnd,
  elapsedSeconds: Date().timeIntervalSince(start)
)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
if let json = try? encoder.encode(report), let output = String(data: json, encoding: .utf8) {
  print(output)
}
if status != "readyToPlay" || progress.count < 3 || !didEnd { exit(1) }
