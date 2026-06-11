// audio_helper.swift — Core Audio helper for Local ASR Server
//
// Creates and destroys stacked aggregate (Multi-Output) devices
// programmatically via the Core Audio HAL API.
//
// All output is JSON for easy parsing by the Python backend.
//
// Commands:
//   list-devices                                  List all audio devices
//   current-output                                Current default output device
//   create-aggregate --name N --uid U --main M --secondary S
//   set-output <device-uid>                       Set default + system output
//   destroy <device-uid>                          Destroy an aggregate device

import CoreAudio
import AudioToolbox
import Foundation


// MARK: - JSON Output Helpers

/// Print a JSON dictionary to stdout and exit.
func printJSON(_ dict: [String: Any], exitCode: Int32 = 0) -> Never {
    let data = try! JSONSerialization.data(
        withJSONObject: dict,
        options: [.prettyPrinted, .sortedKeys]
    )
    print(String(data: data, encoding: .utf8)!)
    exit(exitCode)
}

/// Print an error message as JSON and exit with code 1.
func printError(_ message: String) -> Never {
    printJSON(["error": message], exitCode: 1)
}


// MARK: - Core Audio Property Helpers

/// Get a property value from an AudioObject.
func getProperty<T>(
    objectID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
    element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain
) -> T? {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: scope,
        mElement: element
    )
    var size = UInt32(MemoryLayout<T>.size)
    let value = UnsafeMutablePointer<T>.allocate(capacity: 1)
    defer { value.deallocate() }

    let status = AudioObjectGetPropertyData(
        objectID, &address, 0, nil, &size, value
    )
    guard status == noErr else { return nil }
    return value.pointee
}

/// Get a string property from an AudioObject.
func getStringProperty(
    objectID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal
) -> String? {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: scope,
        mElement: kAudioObjectPropertyElementMain
    )
    // Use Unmanaged<CFString> to avoid pointer-to-reference warnings
    var unmanagedStr: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)

    let status = AudioObjectGetPropertyData(
        objectID, &address, 0, nil, &size, &unmanagedStr
    )
    guard status == noErr, let cfStr = unmanagedStr?.takeUnretainedValue() else {
        return nil
    }
    return cfStr as String
}

/// Get an array of AudioObjectIDs from a property.
func getIDArrayProperty(
    objectID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal
) -> [AudioObjectID] {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: scope,
        mElement: kAudioObjectPropertyElementMain
    )

    var size: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
        objectID, &address, 0, nil, &size
    )
    guard status == noErr, size > 0 else { return [] }

    let count = Int(size) / MemoryLayout<AudioObjectID>.size
    var ids = [AudioObjectID](repeating: 0, count: count)
    status = AudioObjectGetPropertyData(
        objectID, &address, 0, nil, &size, &ids
    )
    guard status == noErr else { return [] }
    return ids
}


// MARK: - Device Info

struct DeviceInfo {
    let id: AudioObjectID
    let uid: String
    let name: String
    let isInput: Bool
    let isOutput: Bool

    func toDict() -> [String: Any] {
        return [
            "id": Int(id),
            "uid": uid,
            "name": name,
            "is_input": isInput,
            "is_output": isOutput,
        ]
    }
}

/// Check if a device has streams in the given scope.
func deviceHasStreams(
    deviceID: AudioObjectID,
    scope: AudioObjectPropertyScope
) -> Bool {
    let streams = getIDArrayProperty(
        objectID: deviceID,
        selector: kAudioDevicePropertyStreams,
        scope: scope
    )
    return !streams.isEmpty
}

/// Get information about all audio devices.
func getAllDevices() -> [DeviceInfo] {
    let deviceIDs = getIDArrayProperty(
        objectID: AudioObjectID(kAudioObjectSystemObject),
        selector: kAudioHardwarePropertyDevices
    )

    return deviceIDs.compactMap { deviceID in
        guard let uid = getStringProperty(
            objectID: deviceID,
            selector: kAudioDevicePropertyDeviceUID
        ) else { return nil }

        let name = getStringProperty(
            objectID: deviceID,
            selector: kAudioObjectPropertyName
        ) ?? "Unknown"

        let isInput = deviceHasStreams(
            deviceID: deviceID,
            scope: kAudioDevicePropertyScopeInput
        )
        let isOutput = deviceHasStreams(
            deviceID: deviceID,
            scope: kAudioDevicePropertyScopeOutput
        )

        return DeviceInfo(
            id: deviceID,
            uid: uid,
            name: name,
            isInput: isInput,
            isOutput: isOutput
        )
    }
}

/// Find a device by UID.
func findDeviceByUID(_ targetUID: String) -> DeviceInfo? {
    return getAllDevices().first { $0.uid == targetUID }
}

/// Get the device ID for a given UID.
func deviceIDForUID(_ uid: String) -> AudioObjectID? {
    var cfUID = uid as CFString
    var deviceID: AudioObjectID = kAudioObjectUnknown
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDeviceForUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )

    let result: OSStatus = withUnsafeMutablePointer(to: &cfUID) { uidPtr in
        withUnsafeMutablePointer(to: &deviceID) { idPtr in
            var translation = AudioValueTranslation(
                mInputData: uidPtr,
                mInputDataSize: UInt32(MemoryLayout<CFString>.size),
                mOutputData: idPtr,
                mOutputDataSize: UInt32(MemoryLayout<AudioObjectID>.size)
            )
            var size = UInt32(MemoryLayout<AudioValueTranslation>.size)
            return AudioObjectGetPropertyData(
                AudioObjectID(kAudioObjectSystemObject),
                &address, 0, nil, &size, &translation
            )
        }
    }
    guard result == noErr, deviceID != kAudioObjectUnknown else {
        return nil
    }
    return deviceID
}


// MARK: - Default Output

/// Get the default output device ID.
func getDefaultOutputID() -> AudioObjectID? {
    return getProperty(
        objectID: AudioObjectID(kAudioObjectSystemObject),
        selector: kAudioHardwarePropertyDefaultOutputDevice
    )
}

/// Set the default output device by AudioObjectID.
func setDefaultOutput(deviceID: AudioObjectID) -> OSStatus {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var mutableID = deviceID
    return AudioObjectSetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address, 0, nil,
        UInt32(MemoryLayout<AudioObjectID>.size),
        &mutableID
    )
}

/// Set the system output device by AudioObjectID.
func setSystemOutput(deviceID: AudioObjectID) -> OSStatus {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultSystemOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var mutableID = deviceID
    return AudioObjectSetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address, 0, nil,
        UInt32(MemoryLayout<AudioObjectID>.size),
        &mutableID
    )
}


// MARK: - Aggregate Device Management

/// Create a stacked aggregate device (Multi-Output equivalent).
///
/// - Parameters:
///   - name: Human-readable name shown in system audio lists.
///   - uid: Unique identifier (e.g. "com.local-asr.temporary-output.xxx").
///   - mainUID: UID of the primary device (clock source).
///   - secondaryUID: UID of the secondary device (drift-corrected).
/// - Returns: The AudioObjectID of the newly created device.
func createStackedAggregate(
    name: String,
    uid: String,
    mainUID: String,
    secondaryUID: String
) -> AudioObjectID? {
    // Build the sub-device list with drift correction on the secondary
    let subDevices: [[String: Any]] = [
        [
            kAudioSubDeviceUIDKey as String: mainUID,
            kAudioSubDeviceDriftCompensationKey as String: 0,
        ],
        [
            kAudioSubDeviceUIDKey as String: secondaryUID,
            kAudioSubDeviceDriftCompensationKey as String: 1,
        ],
    ]

    // Aggregate device description dictionary
    let description: [String: Any] = [
        kAudioAggregateDeviceNameKey as String: name,
        kAudioAggregateDeviceUIDKey as String: uid,
        kAudioAggregateDeviceSubDeviceListKey as String: subDevices,
        kAudioAggregateDeviceMasterSubDeviceKey as String: mainUID,
        kAudioAggregateDeviceIsStackedKey as String: 1,  // Multi-Output mode
        kAudioAggregateDeviceIsPrivateKey as String: 0,  // Visible in system
    ]

    let cfDescription = description as CFDictionary
    var aggregateID: AudioObjectID = kAudioObjectUnknown

    let status = AudioHardwareCreateAggregateDevice(
        cfDescription,
        &aggregateID
    )

    guard status == noErr else {
        return nil
    }
    return aggregateID
}

/// Destroy an aggregate device by its UID.
func destroyAggregateByUID(_ uid: String) -> OSStatus {
    guard let deviceID = deviceIDForUID(uid) else {
        return kAudioHardwareUnknownPropertyError
    }
    return AudioHardwareDestroyAggregateDevice(deviceID)
}


// MARK: - Command Handlers

func cmdListDevices() -> Never {
    let devices = getAllDevices()
    let list = devices.map { $0.toDict() }
    printJSON(["devices": list])
}

func cmdCurrentOutput() -> Never {
    guard let deviceID = getDefaultOutputID() else {
        printError("Could not determine the default output device.")
    }

    let uid = getStringProperty(
        objectID: deviceID,
        selector: kAudioDevicePropertyDeviceUID
    ) ?? ""
    let name = getStringProperty(
        objectID: deviceID,
        selector: kAudioObjectPropertyName
    ) ?? "Unknown"

    printJSON([
        "id": Int(deviceID),
        "uid": uid,
        "name": name,
    ])
}

func cmdCreateAggregate(args: [String]) -> Never {
    // Parse arguments: --name N --uid U --main M --secondary S
    var name: String?
    var uid: String?
    var mainUID: String?
    var secondaryUID: String?

    var i = 0
    while i < args.count {
        switch args[i] {
        case "--name":
            i += 1; if i < args.count { name = args[i] }
        case "--uid":
            i += 1; if i < args.count { uid = args[i] }
        case "--main":
            i += 1; if i < args.count { mainUID = args[i] }
        case "--secondary":
            i += 1; if i < args.count { secondaryUID = args[i] }
        default:
            break
        }
        i += 1
    }

    guard let name = name, let uid = uid,
          let mainUID = mainUID, let secondaryUID = secondaryUID else {
        printError(
            "Usage: create-aggregate --name <name> --uid <uid> "
            + "--main <main-uid> --secondary <secondary-uid>"
        )
    }

    // Verify both sub-devices exist
    guard deviceIDForUID(mainUID) != nil else {
        printError("Main device not found: \(mainUID)")
    }
    guard deviceIDForUID(secondaryUID) != nil else {
        printError("Secondary device not found: \(secondaryUID)")
    }

    guard let aggregateID = createStackedAggregate(
        name: name, uid: uid,
        mainUID: mainUID, secondaryUID: secondaryUID
    ) else {
        printError("Failed to create stacked aggregate device.")
    }

    // Retrieve the actual UID assigned by Core Audio (should match)
    let actualUID = getStringProperty(
        objectID: aggregateID,
        selector: kAudioDevicePropertyDeviceUID
    ) ?? uid

    printJSON([
        "device_id": Int(aggregateID),
        "uid": actualUID,
        "name": name,
        "success": true,
    ])
}

func cmdSetOutput(args: [String]) -> Never {
    guard let targetUID = args.first else {
        printError("Usage: set-output <device-uid>")
    }

    guard let deviceID = deviceIDForUID(targetUID) else {
        printError("Device not found for UID: \(targetUID)")
    }

    // Set both default and system output
    let statusDefault = setDefaultOutput(deviceID: deviceID)
    let statusSystem = setSystemOutput(deviceID: deviceID)

    if statusDefault != noErr {
        printError(
            "Failed to set default output (error \(statusDefault))."
        )
    }

    // System output may fail on some configurations; log but don't fail
    let systemOK = statusSystem == noErr

    let name = getStringProperty(
        objectID: deviceID,
        selector: kAudioObjectPropertyName
    ) ?? "Unknown"

    printJSON([
        "success": true,
        "device_id": Int(deviceID),
        "uid": targetUID,
        "name": name,
        "default_output_set": true,
        "system_output_set": systemOK,
    ])
}

func cmdDestroy(args: [String]) -> Never {
    guard let targetUID = args.first else {
        printError("Usage: destroy <device-uid>")
    }

    let status = destroyAggregateByUID(targetUID)
    if status != noErr {
        printError(
            "Failed to destroy aggregate device '\(targetUID)' "
            + "(error \(status))."
        )
    }

    printJSON([
        "success": true,
        "destroyed_uid": targetUID,
    ])
}


// MARK: - Main Entry Point

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    printError(
        "Usage: audio-helper <command> [args...]\n"
        + "Commands: list-devices, current-output, create-aggregate, "
        + "set-output, destroy"
    )
}

let command = arguments[1]
let commandArgs = Array(arguments.dropFirst(2))

switch command {
case "list-devices":
    cmdListDevices()
case "current-output":
    cmdCurrentOutput()
case "create-aggregate":
    cmdCreateAggregate(args: commandArgs)
case "set-output":
    cmdSetOutput(args: commandArgs)
case "destroy":
    cmdDestroy(args: commandArgs)
default:
    printError("Unknown command: \(command)")
}
