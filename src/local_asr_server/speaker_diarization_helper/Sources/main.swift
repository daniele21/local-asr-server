import Foundation
import FluidAudio

struct TrackInput {
    let id: String
    let path: String
}

struct OutputSegment: Codable {
    let speaker: String
    let start: Double
    let end: Double
}

struct TrackOutput: Codable {
    let segments: [OutputSegment]
}

struct HelperOutput: Codable {
    let engine: String
    let tracks: [String: TrackOutput]
}

func makeAccurateOfflineConfig() -> OfflineDiarizerConfig {
    var config = OfflineDiarizerConfig(
        segmentationStepRatio: 0.1,
        minSegmentDuration: 0.0
    )
    config.zeroVoteReembed = OfflineDiarizerConfig.ZeroVoteReembed(
        enabled: true,
        minDurationSeconds: 0.4
    )
    return config
}

enum ArgumentError: Error, CustomStringConvertible {
    case invalid(String)

    var description: String {
        switch self {
        case .invalid(let message): return message
        }
    }
}

func parseArguments(_ arguments: [String]) throws -> ([TrackInput], URL?) {
    guard arguments.first == "process" else {
        throw ArgumentError.invalid("usage: closedroom-speaker-diarizer process --input TRACK_ID=PATH [--input ...]")
    }
    var inputs: [TrackInput] = []
    var modelsDirectory: URL?
    var index = 1
    while index < arguments.count {
        guard index + 1 < arguments.count else {
            throw ArgumentError.invalid("unsupported argument: \(arguments[index])")
        }
        if arguments[index] == "--models-dir" {
            modelsDirectory = URL(fileURLWithPath: arguments[index + 1], isDirectory: true)
            index += 2
            continue
        }
        guard arguments[index] == "--input" else {
            throw ArgumentError.invalid("unsupported argument: \(arguments[index])")
        }
        let value = arguments[index + 1]
        guard let separator = value.firstIndex(of: "=") else {
            throw ArgumentError.invalid("input must use TRACK_ID=PATH")
        }
        let trackId = String(value[..<separator])
        let path = String(value[value.index(after: separator)...])
        guard !trackId.isEmpty, !path.isEmpty else {
            throw ArgumentError.invalid("track id and path are required")
        }
        inputs.append(TrackInput(id: trackId, path: path))
        index += 2
    }
    guard !inputs.isEmpty else {
        throw ArgumentError.invalid("at least one --input is required")
    }
    return (inputs, modelsDirectory)
}

@main
struct ClosedRoomSpeakerDiarizer {
    static func main() async {
        do {
            let (inputs, modelsDirectory) = try parseArguments(Array(CommandLine.arguments.dropFirst()))
            // Prefer recall and stable short turns over the faster Community-1 defaults.
            // FluidAudio documents this 0.1/0.0 profile for accuracy-critical offline use.
            let manager = OfflineDiarizerManager(config: makeAccurateOfflineConfig())
            try await manager.prepareModels(directory: modelsDirectory)
            var tracks: [String: TrackOutput] = [:]
            for input in inputs {
                let result = try await manager.process(URL(fileURLWithPath: input.path))
                let segments = result.segments.map {
                    OutputSegment(
                        speaker: String(describing: $0.speakerId),
                        start: Double($0.startTimeSeconds),
                        end: Double($0.endTimeSeconds)
                    )
                }
                tracks[input.id] = TrackOutput(segments: segments)
            }
            let payload = HelperOutput(engine: "fluidaudio-community-1", tracks: tracks)
            let data = try JSONEncoder().encode(payload)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("\(error)\n".utf8))
            Foundation.exit(1)
        }
    }
}
