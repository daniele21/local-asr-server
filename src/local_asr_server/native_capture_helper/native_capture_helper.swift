import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit

func emitJSON(_ payload: [String: Any], exitCode: Int32? = nil) {
    let data = try! JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
    if let code = exitCode {
        exit(code)
    }
}

func calculateDB(from sampleBuffer: CMSampleBuffer) -> Float {
    guard CMSampleBufferDataIsReady(sampleBuffer) else { return -120.0 }
    
    let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
    guard let formatDescription = formatDescription else { return -120.0 }
    let absd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)
    guard let absd = absd else { return -120.0 }
    
    var blockBuffer: CMBlockBuffer?
    var audioBufferList = AudioBufferList()
    
    var bufferListSizeNeeded = 0
    let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer,
        bufferListSizeNeededOut: &bufferListSizeNeeded,
        bufferListOut: &audioBufferList,
        bufferListSize: MemoryLayout<AudioBufferList>.size,
        blockBufferAllocator: nil,
        blockBufferMemoryAllocator: nil,
        flags: 0,
        blockBufferOut: &blockBuffer
    )
    guard status == noErr else { return -120.0 }
    
    var sumSquares: Float = 0.0
    var sampleCount = 0
    
    let isFloat = (absd.pointee.mFormatFlags & kAudioFormatFlagIsFloat) != 0
    let bitDepth = absd.pointee.mBitsPerChannel
    
    let buffers = UnsafeBufferPointer(start: &audioBufferList.mBuffers, count: Int(audioBufferList.mNumberBuffers))
    for buffer in buffers {
        guard let data = buffer.mData else { continue }
        let dataSize = Int(buffer.mDataByteSize)
        
        if isFloat {
            let floatBuffer = data.assumingMemoryBound(to: Float32.self)
            let count = dataSize / MemoryLayout<Float32>.size
            for i in 0..<count {
                let floatSample = floatBuffer[i]
                sumSquares += floatSample * floatSample
            }
            sampleCount += count
        } else if bitDepth == 16 {
            let intBuffer = data.assumingMemoryBound(to: Int16.self)
            let count = dataSize / MemoryLayout<Int16>.size
            for i in 0..<count {
                let floatSample = Float(intBuffer[i]) / 32768.0
                sumSquares += floatSample * floatSample
            }
            sampleCount += count
        }
    }
    
    if sampleCount > 0 {
        let rms = sqrt(sumSquares / Float(sampleCount))
        if rms > 0 {
            let db = 20 * log10(rms)
            return max(-120.0, min(0.0, db))
        }
    }
    return -120.0
}

func requireArg(_ name: String, in args: [String]) -> String? {
    guard let index = args.firstIndex(of: name), index + 1 < args.count else {
        return nil
    }
    return args[index + 1]
}

func capabilityPayload() -> [String: Any] {
    let processInfo = ProcessInfo.processInfo
    let isAtLeastMacOS14 = processInfo.isOperatingSystemAtLeast(
        OperatingSystemVersion(majorVersion: 14, minorVersion: 0, patchVersion: 0)
    )
    var screenCaptureAllowed = CGPreflightScreenCaptureAccess()
    if !screenCaptureAllowed {
        _ = CGRequestScreenCaptureAccess()
        screenCaptureAllowed = CGPreflightScreenCaptureAccess()
    }
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    if micStatus == .notDetermined {
        AVCaptureDevice.requestAccess(for: .audio) { _ in }
    }
    let micAllowed = micStatus == .authorized
    let available = isAtLeastMacOS14 && screenCaptureAllowed && micAllowed
    let reason: Any
    if !isAtLeastMacOS14 {
        reason = "macos_14_required"
    } else if !screenCaptureAllowed {
        reason = "screen_recording_permission_required"
    } else if !micAllowed {
        reason = "microphone_permission_required"
    } else {
        reason = NSNull()
    }
    return [
        "available": available,
        "backend": "native",
        "reason": reason,
        "modes": available ? ["both", "mic_only", "pc_only"] : [],
        "minimum_macos": "14.0",
        "screen_recording_permission": screenCaptureAllowed ? "granted" : "required",
        "microphone_permission": "\(micStatus)",
    ]
}

func permissionsPayload() -> [String: Any] {
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    return [
        "ok": micStatus == .authorized,
        "microphone": "\(micStatus)",
        "screen_capture": "system_prompt_required",
    ]
}

final class SampleBufferWavSink {
    private let url: URL
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var started = false
    private var finished = false
    private let queue = DispatchQueue(label: "closedroom.native.wav-sink")

    init(url: URL) {
        self.url = url
        try? FileManager.default.removeItem(at: url)
    }

    func append(_ sampleBuffer: CMSampleBuffer) {
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }
        queue.async {
            if self.finished { return }
            do {
                if self.writer == nil {
                    let writer = try AVAssetWriter(outputURL: self.url, fileType: .wav)
                    
                    var sampleRate = 48000.0
                    var channels: UInt32 = 2
                    if let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer) {
                        let absd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
                        if let absd = absd {
                            sampleRate = absd.pointee.mSampleRate
                            channels = absd.pointee.mChannelsPerFrame
                        }
                    }
                    if channels > 2 {
                        channels = 2
                    }
                    
                    let audioSettings: [String: Any] = [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVSampleRateKey: sampleRate,
                        AVNumberOfChannelsKey: channels,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsNonInterleaved: false,
                        AVLinearPCMIsFloatKey: false,
                        AVLinearPCMIsBigEndianKey: false
                    ]
                    
                    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
                    input.expectsMediaDataInRealTime = true
                    guard writer.canAdd(input) else {
                        emitJSON([
                            "type": "error",
                            "message": "Cannot add WAV audio input",
                            "file": self.url.path,
                        ])
                        return
                    }
                    writer.add(input)
                    self.writer = writer
                    self.input = input
                }

                guard let writer = self.writer, let input = self.input else { return }
                if !self.started {
                    writer.startWriting()
                    writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
                    self.started = true
                }
                if input.isReadyForMoreMediaData {
                    input.append(sampleBuffer)
                }
            } catch {
                emitJSON([
                    "type": "error",
                    "message": "Failed to initialize WAV writer",
                    "file": self.url.path,
                    "error": String(describing: error),
                ])
            }
        }
    }

    func finish(_ done: @escaping () -> Void) {
        queue.async {
            if self.finished {
                done()
                return
            }
            self.finished = true
            guard let writer = self.writer, let input = self.input, self.started else {
                FileManager.default.createFile(atPath: self.url.path, contents: Data())
                done()
                return
            }
            input.markAsFinished()
            writer.finishWriting {
                if writer.status == .failed {
                    emitJSON([
                        "type": "error",
                        "message": "Failed to finish WAV writer",
                        "file": self.url.path,
                        "error": writer.error?.localizedDescription ?? "unknown",
                    ])
                }
                done()
            }
        }
    }
}

@available(macOS 14.0, *)
final class SystemAudioCapture: NSObject, SCStreamOutput {
    private let sink: SampleBufferWavSink
    private let mirrorSink: SampleBufferWavSink?
    private var stream: SCStream?
    private let queue = DispatchQueue(label: "closedroom.native.system-audio")
    private var lastEmitTime: Double = 0
    private let emitInterval: Double = 0.1

    init(sink: SampleBufferWavSink, mirrorSink: SampleBufferWavSink?) {
        self.sink = sink
        self.mirrorSink = mirrorSink
    }

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "ClosedRoomNativeCapture", code: 10, userInfo: [
                NSLocalizedDescriptionKey: "No display available for ScreenCaptureKit audio capture"
            ])
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = false
        configuration.sampleRate = 48_000
        configuration.channelCount = 2

        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try await stream.startCapture()
        self.stream = stream
    }

    func stop() async {
        if let stream {
            try? await stream.stopCapture()
        }
        stream = nil
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        sink.append(sampleBuffer)
        mirrorSink?.append(sampleBuffer)

        let now = Date().timeIntervalSince1970
        if now - lastEmitTime >= emitInterval {
            lastEmitTime = now
            let db = calculateDB(from: sampleBuffer)
            emitJSON([
                "type": "volume",
                "source": "system",
                "db": db
            ])
        }
    }
}

final class MicrophoneCapture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let sink: SampleBufferWavSink
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "closedroom.native.microphone")
    private var lastEmitTime: Double = 0
    private let emitInterval: Double = 0.1

    init(sink: SampleBufferWavSink) {
        self.sink = sink
    }

    func start() throws {
        session.beginConfiguration()
        session.sessionPreset = .high

        guard let device = AVCaptureDevice.default(for: .audio) else {
            throw NSError(domain: "ClosedRoomNativeCapture", code: 20, userInfo: [
                NSLocalizedDescriptionKey: "No default microphone is available"
            ])
        }
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else {
            throw NSError(domain: "ClosedRoomNativeCapture", code: 21, userInfo: [
                NSLocalizedDescriptionKey: "Cannot add microphone input"
            ])
        }
        session.addInput(input)

        let output = AVCaptureAudioDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else {
            throw NSError(domain: "ClosedRoomNativeCapture", code: 22, userInfo: [
                NSLocalizedDescriptionKey: "Cannot add microphone output"
            ])
        }
        session.addOutput(output)
        session.commitConfiguration()
        session.startRunning()
    }

    func stop() {
        session.stopRunning()
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        sink.append(sampleBuffer)

        let now = Date().timeIntervalSince1970
        if now - lastEmitTime >= emitInterval {
            lastEmitTime = now
            let db = calculateDB(from: sampleBuffer)
            emitJSON([
                "type": "volume",
                "source": "mic",
                "db": db
            ])
        }
    }
}

final class NativeCaptureRun {
    private let recordingID: String
    private let outputDir: URL
    private let mode: String
    private var systemCapture: AnyObject?
    private var microphoneCapture: MicrophoneCapture?
    private var sinks: [SampleBufferWavSink] = []
    private var stopped = false

    init(recordingID: String, outputDir: String, mode: String) {
        self.recordingID = recordingID
        self.outputDir = URL(fileURLWithPath: outputDir, isDirectory: true)
        self.mode = mode
    }

    func start() async throws {
        try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

        let needsMic = mode != "pc_only"
        let needsSystem = mode != "mic_only"
        let micSink = needsMic ? SampleBufferWavSink(url: outputDir.appendingPathComponent("mic.wav")) : nil
        let systemSink = needsSystem ? SampleBufferWavSink(url: outputDir.appendingPathComponent("system.wav")) : nil
        let mixedSink = mode == "both" ? SampleBufferWavSink(url: outputDir.appendingPathComponent("recording.wav")) : nil
        sinks = [micSink, systemSink, mixedSink].compactMap { $0 }

        if let micSink {
            let capture = MicrophoneCapture(sink: micSink)
            try capture.start()
            microphoneCapture = capture
        }

        if let systemSink {
            guard #available(macOS 14.0, *) else {
                throw NSError(domain: "ClosedRoomNativeCapture", code: 30, userInfo: [
                    NSLocalizedDescriptionKey: "ScreenCaptureKit audio capture requires macOS 14.0 or later"
                ])
            }
            let capture = SystemAudioCapture(sink: systemSink, mirrorSink: mixedSink)
            try await capture.start()
            systemCapture = capture
        }

        emitJSON([
            "type": "ready",
            "recording_id": recordingID,
            "output_dir": outputDir.path,
            "mode": mode,
            "sample_rate": 48_000,
            "channels": 2,
        ])
    }

    func stopAndExit(cancelled: Bool = false) {
        if stopped { return }
        stopped = true
        microphoneCapture?.stop()
        if #available(macOS 14.0, *), let capture = systemCapture as? SystemAudioCapture {
            Task {
                await capture.stop()
                finishSinks(cancelled: cancelled)
            }
        } else {
            finishSinks(cancelled: cancelled)
        }
    }

    private func finishSinks(cancelled: Bool) {
        let group = DispatchGroup()
        for sink in sinks {
            group.enter()
            sink.finish {
                group.leave()
            }
        }
        group.notify(queue: .main) {
            emitJSON([
                "type": "stopped",
                "recording_id": self.recordingID,
                "cancelled": cancelled,
            ])
            exit(0)
        }
    }
}

func runStart(recordingID: String, outputDir: String, mode: String) {
    guard ["both", "mic_only", "pc_only"].contains(mode) else {
        emitJSON(["type": "error", "message": "Invalid capture mode: \(mode)"], exitCode: 2)
        return
    }

    let capabilities = capabilityPayload()
    guard capabilities["available"] as? Bool == true else {
        emitJSON([
            "type": "error",
            "recording_id": recordingID,
            "output_dir": outputDir,
            "mode": mode,
            "message": "Native capture is not available on this macOS version.",
            "reason": capabilities["reason"] ?? "native_unavailable",
        ], exitCode: 3)
        return
    }

    let run = NativeCaptureRun(recordingID: recordingID, outputDir: outputDir, mode: mode)
    signal(SIGTERM, SIG_IGN)
    signal(SIGINT, SIG_IGN)
    let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    termSource.setEventHandler { run.stopAndExit() }
    intSource.setEventHandler { run.stopAndExit(cancelled: true) }
    termSource.resume()
    intSource.resume()

    Task {
        do {
            try await run.start()
        } catch {
            emitJSON([
                "type": "error",
                "recording_id": recordingID,
                "message": error.localizedDescription,
            ], exitCode: 4)
        }
    }
    RunLoop.main.run()
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    emitJSON(["type": "error", "message": "Missing command"], exitCode: 1)
    exit(1)
}

switch command {
case "capabilities":
    emitJSON(capabilityPayload(), exitCode: 0)
case "permissions":
    emitJSON(permissionsPayload(), exitCode: 0)
case "start":
    guard let recordingID = requireArg("--recording-id", in: args),
          let outputDir = requireArg("--output-dir", in: args),
          let mode = requireArg("--mode", in: args) else {
        emitJSON(["type": "error", "message": "Missing required start arguments"], exitCode: 2)
        exit(2)
    }
    runStart(recordingID: recordingID, outputDir: outputDir, mode: mode)
case "stop":
    emitJSON(["type": "stopped"], exitCode: 0)
case "cancel":
    emitJSON(["type": "stopped", "cancelled": true], exitCode: 0)
default:
    emitJSON(["type": "error", "message": "Unknown command: \(command)"], exitCode: 1)
}
