import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit
import Security

final class JSONEmitter {
    static let shared = JSONEmitter()
    private let queue = DispatchQueue(label: "closedroom.native.json-emitter")
    private let key = DispatchSpecificKey<Bool>()

    private init() {
        queue.setSpecific(key: key, value: true)
    }

    func emit(_ payload: [String: Any]) {
        queue.async {
            self.write(payload)
        }
    }

    func emitAndExit(_ payload: [String: Any], exitCode: Int32) -> Never {
        if DispatchQueue.getSpecific(key: key) == true {
            write(payload)
            exit(exitCode)
        } else {
            queue.sync {
                self.write(payload)
            }
            exit(exitCode)
        }
    }

    private func write(_ payload: [String: Any]) {
        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data([0x0A]))
        } catch {
            let fallback = #"{"type":"error","message":"json_serialization_failed"}"# + "\n"
            FileHandle.standardOutput.write(fallback.data(using: .utf8)!)
        }
    }
}

func calculateDB(from sampleBuffer: CMSampleBuffer) -> Float {
    guard CMSampleBufferDataIsReady(sampleBuffer) else { return -120.0 }
    
    let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
    guard let formatDescription = formatDescription else { return -120.0 }
    let absd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)
    guard let absd = absd else { return -120.0 }
    
    var bufferListSizeNeeded = 0
    var status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer,
        bufferListSizeNeededOut: &bufferListSizeNeeded,
        bufferListOut: nil,
        bufferListSize: 0,
        blockBufferAllocator: nil,
        blockBufferMemoryAllocator: nil,
        flags: 0,
        blockBufferOut: nil
    )
    guard status == noErr, bufferListSizeNeeded > 0 else { return -120.0 }
    
    let raw = UnsafeMutableRawPointer.allocate(
        byteCount: bufferListSizeNeeded,
        alignment: MemoryLayout<AudioBufferList>.alignment
    )
    defer { raw.deallocate() }
    
    let bufferListMemory = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
    
    var blockBuffer: CMBlockBuffer?
    status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer,
        bufferListSizeNeededOut: nil,
        bufferListOut: bufferListMemory,
        bufferListSize: bufferListSizeNeeded,
        blockBufferAllocator: nil,
        blockBufferMemoryAllocator: nil,
        flags: 0,
        blockBufferOut: &blockBuffer
    )
    guard status == noErr else { return -120.0 }
    
    let bufferList = UnsafeMutableAudioBufferListPointer(bufferListMemory)
    var sumSquares: Float = 0.0
    var sampleCount = 0
    
    let isFloat = (absd.pointee.mFormatFlags & kAudioFormatFlagIsFloat) != 0
    let bitDepth = absd.pointee.mBitsPerChannel
    
    for buffer in bufferList {
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

func micStatusString(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized:
        return "authorized"
    case .denied:
        return "denied"
    case .restricted:
        return "restricted"
    case .notDetermined:
        return "notDetermined"
    @unknown default:
        return "unknown"
    }
}

func capabilityPayload() -> [String: Any] {
    let processInfo = ProcessInfo.processInfo
    let isAtLeastMacOS13 = processInfo.isOperatingSystemAtLeast(
        OperatingSystemVersion(majorVersion: 13, minorVersion: 0, patchVersion: 0)
    )
    let screenCaptureAllowed = CGPreflightScreenCaptureAccess()
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    let available = isAtLeastMacOS13
    
    let reason: Any
    if !isAtLeastMacOS13 {
        reason = "macos_13_required"
    } else {
        reason = NSNull()
    }
    
    return [
        "available": available,
        "backend": "native",
        "reason": reason,
        "modes": available ? ["both", "mic_only", "pc_only"] : [],
        "minimum_macos": "13.0",
        "screen_recording_permission": screenCaptureAllowed ? "granted" : "required",
        "microphone_permission": micStatusString(micStatus),
    ]
}

func permissionsPayload() -> [String: Any] {
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    let screenCaptureAllowed = CGPreflightScreenCaptureAccess()
    let micOk = micStatus == .authorized
    let screenOk = screenCaptureAllowed
    return [
        "ok": micOk && screenOk,
        "microphone": micStatusString(micStatus),
        "screen_capture": screenCaptureAllowed ? "granted" : "required",
        "modes": [
            "mic_only": ["ok": micOk],
            "pc_only": ["ok": screenOk],
            "both": ["ok": micOk && screenOk]
        ]
    ]
}

func requestPermissions() {
    _ = CGRequestScreenCaptureAccess()
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    if micStatus == .notDetermined {
        let semaphore = DispatchSemaphore(value: 0)
        AVCaptureDevice.requestAccess(for: .audio) { _ in
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 5.0)
    }
    JSONEmitter.shared.emitAndExit(permissionsPayload(), exitCode: 0)
}

func getCodeSignatureInfo() -> [String: Any] {
    var info: [String: Any] = [
        "signature": "unsigned",
        "team_id": "",
        "identifier": ""
    ]
    var selfCode: SecCode?
    let status = SecCodeCopySelf(SecCSFlags(), &selfCode)
    guard status == errSecSuccess, let code = selfCode else {
        info["error"] = "SecCodeCopySelf failed with status \(status)"
        return info
    }
    var staticCode: SecStaticCode?
    let staticStatus = SecCodeCopyStaticCode(code, SecCSFlags(), &staticCode)
    guard staticStatus == errSecSuccess, let sCode = staticCode else {
        info["error"] = "SecCodeCopyStaticCode failed with status \(staticStatus)"
        return info
    }
    let validityStatus = SecStaticCodeCheckValidity(sCode, SecCSFlags(), nil)
    if validityStatus == errSecSuccess {
        info["signature"] = "signed"
    } else {
        info["validation_error"] = "SecStaticCodeCheckValidity failed with status \(validityStatus)"
    }
    var infoDict: CFDictionary?
    let infoStatus = SecCodeCopySigningInformation(sCode, SecCSFlags(rawValue: kSecCSSigningInformation), &infoDict)
    guard infoStatus == errSecSuccess, let dict = infoDict as? [String: Any] else {
        info["error"] = "SecCodeCopySigningInformation failed with status \(infoStatus)"
        return info
    }
    
    if dict["teamid"] != nil {
        info["team_id"] = dict["teamid"] as? String ?? ""
    }
    info["identifier"] = dict["identifier"] as? String ?? ""
    return info
}

func diagnosticsPayload() -> [String: Any] {
    let processInfo = ProcessInfo.processInfo
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    let screenCaptureAllowed = CGPreflightScreenCaptureAccess()
    let sigInfo = getCodeSignatureInfo()
    
    return [
        "process_name": processInfo.processName,
        "executable_path": Bundle.main.executablePath ?? CommandLine.arguments.first ?? "",
        "bundle_identifier": Bundle.main.bundleIdentifier ?? "",
        "bundle_path": Bundle.main.bundlePath,
        "screen_capture": screenCaptureAllowed ? "granted" : "required",
        "microphone": micStatusString(micStatus),
        "code_signature": sigInfo["signature"] ?? "unsigned",
        "team_id": sigInfo["team_id"] ?? "",
        "identifier": sigInfo["identifier"] ?? "",
        "macos_version": processInfo.operatingSystemVersionString
    ]
}

final class SampleBufferWavSink {
    let url: URL
    let sourceName: String
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var started = false
    private var finished = false
    private let queue = DispatchQueue(label: "closedroom.native.wav-sink")
    
    private var droppedBuffers = 0
    private var lastEmitDroppedCount = 0
    private var lastEmitDroppedTime: Double = 0

    init(url: URL, sourceName: String) {
        self.url = url
        self.sourceName = sourceName
        try? FileManager.default.removeItem(at: url)
    }

    func append(_ sampleBuffer: CMSampleBuffer) {
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }
        queue.async {
            if self.finished { return }
            do {
                if self.writer == nil {
                    let writer = try AVAssetWriter(outputURL: self.url, fileType: .wav)
                    
                    let audioSettings: [String: Any] = [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVSampleRateKey: 16000.0,
                        AVNumberOfChannelsKey: 1,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsNonInterleaved: false,
                        AVLinearPCMIsFloatKey: false,
                        AVLinearPCMIsBigEndianKey: false
                    ]
                    
                    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
                    input.expectsMediaDataInRealTime = true
                    guard writer.canAdd(input) else {
                        JSONEmitter.shared.emit([
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
                    let ok = input.append(sampleBuffer)
                    if !ok {
                        JSONEmitter.shared.emit([
                            "type": "error",
                            "source": self.sourceName,
                            "message": "AVAssetWriterInput append failed",
                            "writer_status": "\(writer.status)",
                            "error": writer.error?.localizedDescription ?? "unknown"
                        ])
                    }
                } else {
                    self.droppedBuffers += 1
                    let now = Date().timeIntervalSince1970
                    if self.droppedBuffers - self.lastEmitDroppedCount >= 10 || (now - self.lastEmitDroppedTime >= 2.0 && self.droppedBuffers > self.lastEmitDroppedCount) {
                        self.lastEmitDroppedCount = self.droppedBuffers
                        self.lastEmitDroppedTime = now
                        JSONEmitter.shared.emit([
                            "type": "health",
                            "source": self.sourceName,
                            "dropped_buffers": self.droppedBuffers
                        ])
                    }
                }
            } catch {
                JSONEmitter.shared.emit([
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
                    JSONEmitter.shared.emit([
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

@available(macOS 13.0, *)
final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    var onSample: ((CMSampleBuffer) -> Void)?
    var onFatalError: ((String) -> Void)?
    private var stream: SCStream?
    private let queue = DispatchQueue(label: "closedroom.native.system-audio")

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
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 16000
        configuration.channelCount = 1

        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try await stream.startCapture()
        self.stream = stream
    }

    func stop() async {
        if let stream = stream {
            try? await stream.stopCapture()
        }
        stream = nil
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let msg = "ScreenCaptureKit session error: \(error.localizedDescription)"
        JSONEmitter.shared.emit([
            "type": "error",
            "source": "system",
            "message": msg
        ])
        onFatalError?(msg)
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        onSample?(sampleBuffer)
    }
}

final class MicrophoneCapture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    var onSample: ((CMSampleBuffer) -> Void)?
    var onFatalError: ((String) -> Void)?
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "closedroom.native.microphone")

    override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRuntimeError),
            name: .AVCaptureSessionRuntimeError,
            object: session
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleRuntimeError(notification: Notification) {
        if let error = notification.userInfo?[AVCaptureSessionErrorKey] as? Error {
            let msg = "Microphone session runtime error: \(error.localizedDescription)"
            JSONEmitter.shared.emit([
                "type": "error",
                "source": "mic",
                "message": msg
            ])
            onFatalError?(msg)
        }
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
        if session.isRunning {
            session.stopRunning()
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        onSample?(sampleBuffer)
    }
}

final class NativeCaptureRun {
    private let recordingID: String
    private let outputDir: URL
    private let mode: String
    private var systemCapture: AnyObject?
    private var microphoneCapture: MicrophoneCapture?
    private var sinks: [SampleBufferWavSink] = []
    
    private let lock = NSLock()
    private var isReady = false
    private var micStarted = false
    private var systemStarted = false
    private var micWritten = false
    private var systemWritten = false
    private var stopped = false

    private var micSink: SampleBufferWavSink?
    private var systemSink: SampleBufferWavSink?
    
    private var lastMicEmitTime: Double = 0
    private var lastSystemEmitTime: Double = 0
    private let emitInterval: Double = 0.1

    init(recordingID: String, outputDir: String, mode: String) {
        self.recordingID = recordingID
        self.outputDir = URL(fileURLWithPath: outputDir, isDirectory: true)
        self.mode = mode
    }

    func start() async throws {
        try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

        let needsMic = mode != "pc_only"
        let needsSystem = mode != "mic_only"

        if needsMic {
            let sink = SampleBufferWavSink(url: outputDir.appendingPathComponent("mic.wav"), sourceName: "mic")
            sinks.append(sink)
            micSink = sink

            let capture = MicrophoneCapture()
            capture.onSample = { [weak self] sampleBuffer in
                self?.handleSample(sampleBuffer, source: .mic)
            }
            capture.onFatalError = { [weak self] errMsg in
                self?.stopAndExit(cancelled: true, errorMsg: errMsg)
            }
            microphoneCapture = capture
        }

        if needsSystem {
            let sink = SampleBufferWavSink(url: outputDir.appendingPathComponent("system.wav"), sourceName: "system")
            sinks.append(sink)
            systemSink = sink

            guard #available(macOS 13.0, *) else {
                throw NSError(domain: "ClosedRoomNativeCapture", code: 30, userInfo: [
                    NSLocalizedDescriptionKey: "ScreenCaptureKit audio capture requires macOS 13.0 or later"
                ])
            }
            let capture = SystemAudioCapture()
            capture.onSample = { [weak self] sampleBuffer in
                self?.handleSample(sampleBuffer, source: .system)
            }
            capture.onFatalError = { [weak self] errMsg in
                self?.stopAndExit(cancelled: true, errorMsg: errMsg)
            }
            systemCapture = capture
        }

        // Start ScreenCaptureKit first (async)
        if #available(macOS 13.0, *), let capture = systemCapture as? SystemAudioCapture {
            do {
                try await capture.start()
            } catch {
                throw error
            }
        }

        // Start AVFoundation Microphone second (immediate)
        if let microphoneCapture = microphoneCapture {
            do {
                try microphoneCapture.start()
            } catch {
                if #available(macOS 13.0, *), let capture = systemCapture as? SystemAudioCapture {
                    Task { await capture.stop() }
                }
                throw error
            }
        }

        lock.lock()
        isReady = true
        lock.unlock()

        let now = Date().timeIntervalSince1970
        let uptime = ProcessInfo.processInfo.systemUptime
        JSONEmitter.shared.emit([
            "type": "ready",
            "recording_id": recordingID,
            "recording_ready_at": now,
            "recording_ready_uptime": uptime,
            "output_dir": outputDir.path,
            "mode": mode,
            "sample_rate": 16000,
            "channels": 1,
        ])
    }

    enum AudioSource {
        case mic
        case system
    }

    private func handleSample(_ sampleBuffer: CMSampleBuffer, source: AudioSource) {
        let now = Date().timeIntervalSince1970
        let uptime = ProcessInfo.processInfo.systemUptime
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        var shouldWrite = false
        var emitFirstSample = false
        var emitFirstWritten = false

        lock.lock()
        if source == .mic {
            if !micStarted {
                micStarted = true
                emitFirstSample = true
            }
            if isReady && !micWritten {
                micWritten = true
                emitFirstWritten = true
            }
        } else {
            if !systemStarted {
                systemStarted = true
                emitFirstSample = true
            }
            if isReady && !systemWritten {
                systemWritten = true
                emitFirstWritten = true
            }
        }
        shouldWrite = isReady
        lock.unlock()

        if emitFirstSample {
            JSONEmitter.shared.emit([
                "type": "track_first_sample",
                "source": source == .mic ? "mic" : "system",
                "observed_wall_time": now,
                "observed_uptime": uptime,
                "pts": pts.seconds
            ])
        }

        if emitFirstWritten {
            JSONEmitter.shared.emit([
                "type": "track_first_written_sample",
                "source": source == .mic ? "mic" : "system",
                "written_wall_time": now,
                "written_uptime": uptime,
                "pts": pts.seconds
            ])
        }

        if shouldWrite {
            if source == .mic {
                micSink?.append(sampleBuffer)

                lock.lock()
                let emit = now - lastMicEmitTime >= emitInterval
                if emit {
                    lastMicEmitTime = now
                }
                lock.unlock()

                if emit {
                    let db = calculateDB(from: sampleBuffer)
                    JSONEmitter.shared.emit([
                        "type": "volume",
                        "source": "mic",
                        "db": db
                    ])
                }
            } else {
                systemSink?.append(sampleBuffer)

                lock.lock()
                let emit = now - lastSystemEmitTime >= emitInterval
                if emit {
                    lastSystemEmitTime = now
                }
                lock.unlock()

                if emit {
                    let db = calculateDB(from: sampleBuffer)
                    JSONEmitter.shared.emit([
                        "type": "volume",
                        "source": "system",
                        "db": db
                    ])
                }
            }
        }
    }

    func stopAndExit(cancelled: Bool = false, errorMsg: String? = nil) {
        lock.lock()
        if stopped {
            lock.unlock()
            return
        }
        stopped = true
        lock.unlock()

        microphoneCapture?.stop()
        if #available(macOS 13.0, *), let capture = systemCapture as? SystemAudioCapture {
            Task {
                await capture.stop()
                finishSinks(cancelled: cancelled, errorMsg: errorMsg)
            }
        } else {
            finishSinks(cancelled: cancelled, errorMsg: errorMsg)
        }
    }

    private func finishSinks(cancelled: Bool, errorMsg: String?) {
        let group = DispatchGroup()
        for sink in sinks {
            group.enter()
            sink.finish {
                group.leave()
            }
        }
        group.notify(queue: .main) {
            if let errorMsg = errorMsg {
                for sink in self.sinks {
                    try? FileManager.default.removeItem(at: sink.url)
                }
                JSONEmitter.shared.emitAndExit([
                    "type": "error",
                    "recording_id": self.recordingID,
                    "message": errorMsg,
                ], exitCode: 4)
            } else {
                JSONEmitter.shared.emitAndExit([
                    "type": "stopped",
                    "recording_id": self.recordingID,
                    "cancelled": cancelled,
                ], exitCode: 0)
            }
        }
    }
}

func runStart(recordingID: String, outputDir: String, mode: String) {
    guard ["both", "mic_only", "pc_only"].contains(mode) else {
        JSONEmitter.shared.emitAndExit(["type": "error", "message": "Invalid capture mode: \(mode)"], exitCode: 2)
    }

    let capabilities = capabilityPayload()
    guard capabilities["available"] as? Bool == true else {
        JSONEmitter.shared.emitAndExit([
            "type": "error",
            "recording_id": recordingID,
            "output_dir": outputDir,
            "mode": mode,
            "message": "Native capture is not available on this macOS version (macOS 13.0+ required).",
            "reason": capabilities["reason"] ?? "native_unavailable",
        ], exitCode: 3)
    }

    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    let micAllowed = micStatus == .authorized
    let screenCaptureAllowed = CGPreflightScreenCaptureAccess()

    var missing: [String] = []
    if mode == "both" || mode == "mic_only" {
        if !micAllowed {
            missing.append("microphone")
        }
    }
    if mode == "both" || mode == "pc_only" {
        if !screenCaptureAllowed {
            missing.append("screen_capture")
        }
    }

    if !missing.isEmpty {
        let sigInfo = getCodeSignatureInfo()
        JSONEmitter.shared.emitAndExit([
            "type": "error",
            "recording_id": recordingID,
            "reason": "permissions_missing",
            "missing_permissions": missing,
            "microphone": micStatusString(micStatus),
            "screen_capture": screenCaptureAllowed ? "granted" : "required",
            "executable_path": Bundle.main.executablePath ?? CommandLine.arguments.first ?? "",
            "bundle_identifier": Bundle.main.bundleIdentifier ?? "",
            "code_signature": sigInfo["signature"] ?? "unsigned",
            "team_id": sigInfo["team_id"] ?? "",
            "identifier": sigInfo["identifier"] ?? "",
            "message": "Required permissions are missing: \(missing.joined(separator: ", "))"
        ], exitCode: 3)
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
            run.stopAndExit(cancelled: true, errorMsg: error.localizedDescription)
        }
    }
    RunLoop.main.run()
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    JSONEmitter.shared.emitAndExit(["type": "error", "message": "Missing command"], exitCode: 1)
}

switch command {
case "capabilities":
    JSONEmitter.shared.emitAndExit(capabilityPayload(), exitCode: 0)
case "permissions":
    JSONEmitter.shared.emitAndExit(permissionsPayload(), exitCode: 0)
case "request-permissions":
    requestPermissions()
case "diagnostics":
    JSONEmitter.shared.emitAndExit(diagnosticsPayload(), exitCode: 0)
case "start":
    guard let recordingID = requireArg("--recording-id", in: args),
          let outputDir = requireArg("--output-dir", in: args),
          let mode = requireArg("--mode", in: args) else {
        JSONEmitter.shared.emitAndExit(["type": "error", "message": "Missing required start arguments"], exitCode: 2)
    }
    runStart(recordingID: recordingID, outputDir: outputDir, mode: mode)
default:
    JSONEmitter.shared.emitAndExit(["type": "error", "message": "Unknown command: \(command)"], exitCode: 1)
}
