import AVFoundation
import CoreMedia
import CoreGraphics
import Foundation
import ScreenCaptureKit

@available(macOS 13.0, *)
final class JsonEmitter {
  private let lock = NSLock()

  func emit(_ payload: [String: String]) {
    lock.lock()
    defer {
      lock.unlock()
    }

    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8),
          let output = (line + "\n").data(using: .utf8) else {
      return
    }
    FileHandle.standardOutput.write(output)
  }
}

@available(macOS 13.0, *)
final class AudioChunkWriter {
  private let chunkSeconds: Double
  private let emitter: JsonEmitter
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var outputURL: URL?
  private var startedAt: CMTime?

  init(chunkSeconds: Double, emitter: JsonEmitter) {
    self.chunkSeconds = max(1, chunkSeconds)
    self.emitter = emitter
  }

  func append(_ sampleBuffer: CMSampleBuffer) {
    if writer == nil {
      startWriter(with: sampleBuffer)
    }

    guard let input = input else { return }
    if input.isReadyForMoreMediaData {
      input.append(sampleBuffer)
    }

    guard let startedAt = startedAt else { return }
    let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    if CMTimeGetSeconds(timestamp - startedAt) >= chunkSeconds {
      finishCurrentWriter()
    }
  }

  func finishCurrentWriter() {
    guard let writer = writer,
          let input = input,
          let outputURL = outputURL else {
      return
    }

    self.writer = nil
    self.input = nil
    self.outputURL = nil
    self.startedAt = nil

    input.markAsFinished()
    writer.finishWriting { [emitter] in
      defer {
        try? FileManager.default.removeItem(at: outputURL)
      }

      guard writer.status == .completed,
            let data = try? Data(contentsOf: outputURL),
            !data.isEmpty else {
        if let error = writer.error {
          emitter.emit(["type": "error", "message": error.localizedDescription])
        }
        return
      }

      emitter.emit([
        "type": "chunk",
        "mimeType": "audio/mp4",
        "data": data.base64EncodedString()
      ])
    }
  }

  private func startWriter(with sampleBuffer: CMSampleBuffer) {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("sidekick-system-audio-\(UUID().uuidString).m4a")

    do {
      let writer = try AVAssetWriter(outputURL: url, fileType: .m4a)
      let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
      let basicDescription = formatDescription.flatMap {
        CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee
      }

      let sampleRate = basicDescription?.mSampleRate ?? 48_000
      let channels = max(1, Int(basicDescription?.mChannelsPerFrame ?? 2))
      let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVEncoderBitRateKey: 96_000
      ]

      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
      input.expectsMediaDataInRealTime = true

      guard writer.canAdd(input) else {
        emitter.emit(["type": "error", "message": "Could not attach audio writer input."])
        return
      }

      let startTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
      writer.add(input)
      writer.startWriting()
      writer.startSession(atSourceTime: startTime)

      self.writer = writer
      self.input = input
      self.outputURL = url
      self.startedAt = startTime
    } catch {
      emitter.emit(["type": "error", "message": error.localizedDescription])
    }
  }
}

@available(macOS 13.0, *)
final class SystemAudioCapture: NSObject, SCStreamDelegate, SCStreamOutput {
  private let emitter = JsonEmitter()
  private let outputQueue = DispatchQueue(label: "sidekick.audio.capture")
  private let writer: AudioChunkWriter
  private var stream: SCStream?

  init(chunkSeconds: Double) {
    self.writer = AudioChunkWriter(chunkSeconds: chunkSeconds, emitter: emitter)
  }

  func start() async {
    do {
      if !CGPreflightScreenCaptureAccess() {
        let granted = CGRequestScreenCaptureAccess()
        if !granted {
          emitter.emit([
            "type": "error",
            "message": "Screen Recording permission was not granted for system audio capture."
          ])
          exit(1)
        }
      }

      let content = try await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: true
      )
      guard let display = content.displays.first else {
        emitter.emit(["type": "error", "message": "No display is available for system audio capture."])
        exit(2)
      }

      let filter = SCContentFilter(display: display, excludingWindows: [])
      let configuration = SCStreamConfiguration()
      configuration.width = 2
      configuration.height = 2
      configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
      configuration.capturesAudio = true
      configuration.excludesCurrentProcessAudio = true
      configuration.sampleRate = 48_000
      configuration.channelCount = 2

      let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
      try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: outputQueue)
      self.stream = stream
      try await stream.startCapture()
      emitter.emit(["type": "ready"])
    } catch {
      emitter.emit(["type": "error", "message": error.localizedDescription])
      exit(1)
    }
  }

  func stop() {
    writer.finishCurrentWriter()
    if let stream = stream {
      Task {
        try? await stream.stopCapture()
        exit(0)
      }
    } else {
      exit(0)
    }
  }

  func stream(
    _ stream: SCStream,
    didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
    of type: SCStreamOutputType
  ) {
    guard type == .audio, sampleBuffer.isValid else { return }
    writer.append(sampleBuffer)
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    emitter.emit(["type": "error", "message": error.localizedDescription])
    exit(1)
  }
}

func chunkSecondsArgument() -> Double {
  guard let index = CommandLine.arguments.firstIndex(of: "--chunk-seconds"),
        CommandLine.arguments.indices.contains(index + 1),
        let value = Double(CommandLine.arguments[index + 1]) else {
    return 5
  }
  return value
}

if #available(macOS 13.0, *) {
  let capture = SystemAudioCapture(chunkSeconds: chunkSecondsArgument())
  DispatchQueue.global(qos: .utility).async {
    while let line = readLine() {
      if line.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" {
        capture.stop()
        break
      }
    }
  }
  signal(SIGTERM) { _ in
    exit(0)
  }
  signal(SIGINT) { _ in
    exit(0)
  }
  Task {
    await capture.start()
  }
  RunLoop.main.run()
} else {
  JsonEmitter().emit([
    "type": "error",
    "message": "macOS 13 or newer is required for native system audio capture."
  ])
  exit(1)
}
