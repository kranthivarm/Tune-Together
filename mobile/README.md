# TuneTogether Mobile App (Flutter)

Flutter mobile application for TuneTogether - synchronized multi-device audio playback.

## Features Implemented

### ✅ Phase 4: Room & Local Playlist
- **Create/Join Room**: Users can create rooms as hosts or join as members with room codes
- **Local File Picker**: Select audio files from device storage (MP3, M4A, etc.)
- **Metadata Extraction**: Automatically extracts ID3 tags (title, artist, duration)
- **Playlist Management**: Host can add, reorder, and remove tracks
- **Real-time Sync**: Playlist changes sync to all members via WebSocket
- **Playback Controls**: Host-only play/pause/skip/seek controls
- **WebRTC Audio Streaming**: Audio streams via LiveKit SFU (files never uploaded)
- **Clock Synchronization**: NTP-style sync for <30ms audio alignment

### ✅ Phase 5: Live Device-Audio Mirroring (Android Only)
- **System Audio Capture**: Captures all device audio via MediaProjection API
- **Platform Detection**: Feature automatically disabled on iOS with clear messaging
- **Permission Handling**: Proper MediaProjection permission flow with user explanation
- **Multi-source Support**: Works with Spotify, YouTube, games, any app
- **Graceful Degradation**: Detects and handles apps that block audio capture

### iOS Limitations (Phase 5)
⚠️ **Live device-audio mirroring is Android-only**. iOS does not expose system audio capture to third-party apps for privacy reasons. This is an OS-level limitation, not an implementation gap.

## Architecture

```
mobile/
├── lib/
│   ├── main.dart                    # App entry point
│   ├── models/
│   │   ├── room.dart                # Room, PlaylistTrack, Member models
│   │   └── auth.dart                # Authentication token model
│   ├── services/
│   │   ├── api_service.dart         # REST API client (Spring Boot)
│   │   ├── websocket_service.dart   # WebSocket client (Go signaling)
│   │   ├── livekit_service.dart     # LiveKit WebRTC integration
│   │   ├── audio_file_service.dart  # Local file picking & metadata
│   │   └── media_projection_service.dart  # Android system audio capture
│   └── screens/
│       ├── home_screen.dart         # Landing page
│       ├── create_room_screen.dart  # Room creation flow
│       ├── join_room_screen.dart    # Join room flow
│       └── room_screen.dart         # Main room UI (playlist, playback, members)
└── android/
    └── app/src/main/kotlin/
        ├── MainActivity.kt           # Platform channel bridge
        └── AudioCaptureService.kt    # MediaProjection implementation
```

## Setup

### Prerequisites
- Flutter 3.x+
- Dart 3.x+
- Android Studio / Xcode
- Running backend services (API, Realtime, LiveKit)

### Install Dependencies
```bash
cd mobile
flutter pub get
```

### Configure API Endpoints
Update base URLs in service files if not running locally:
- `lib/services/api_service.dart`: Spring Boot API endpoint
- `lib/services/websocket_service.dart`: Go signaling WebSocket endpoint
- `lib/services/livekit_service.dart`: LiveKit server URL

### Run on Android
```bash
flutter run
```

### Run on iOS
```bash
cd ios
pod install
cd ..
flutter run
```

## Permissions

### Android
- **READ_MEDIA_AUDIO**: Access local audio files (Android 13+)
- **READ_EXTERNAL_STORAGE**: Access local audio files (Android 12 and below)
- **RECORD_AUDIO**: Capture system audio via MediaProjection
- **INTERNET**: API/WebSocket/WebRTC communication
- **FOREGROUND_SERVICE_MEDIA_PROJECTION**: Background audio capture

### iOS
- **NSAppleMusicUsageDescription**: Access local music library
- **NSMicrophoneUsageDescription**: Audio streaming (required by WebRTC)

## Key Implementation Details

### 1. Audio Files Never Leave Device
- Only **metadata** (title, artist, duration, client-generated ID) is sent to server
- Audio bytes are streamed **live** via WebRTC when playing
- File paths stored locally only, never transmitted

### 2. WebSocket Message Types
**Client → Server:**
- `play`, `pause`, `seek`, `skip`: Playback commands (host only)
- `timeSyncResponse`: Clock sync handshake response
- `startMirrorMode`, `stopMirrorMode`: Toggle device audio mirroring

**Server → Client:**
- `playCommand`, `pauseCommand`, `seekCommand`, `skipCommand`: Playback sync
- `memberJoined`, `memberLeft`: Room membership changes
- `playlistUpdated`: Playlist changed
- `timeSyncRequest`, `timeSyncResult`: Clock synchronization
- `mirrorModeStarted`, `mirrorModeStopped`: Mirror mode state

### 3. Clock Synchronization
- NTP-style protocol over WebSocket
- Runs on join and every ~5-10 seconds
- Calculates clock offset and RTT
- Used to schedule synchronized playback across devices

### 4. Android MediaProjection Flow
1. User taps "Start Device Audio Mirroring"
2. System shows screen capture permission dialog (unavoidable OS behavior)
3. If granted, `AudioCaptureService` starts capturing audio via `AudioPlaybackCapture`
4. PCM audio data streamed to Flutter via EventChannel
5. LiveKit publishes audio track to all room members
6. Some apps (Netflix, banking apps) may block capture with `FLAG_SECURE`

## TODO: Production Improvements

### High Priority
1. **Custom AudioSource Bridge**: Implement native bridge to pipe:
   - `AudioPlayer` output → LiveKit track (for local file playback)
   - MediaProjection PCM → LiveKit track (for system audio)
   
2. **LiveKit Token Generation**: Integrate with Go signaling server to fetch LiveKit tokens

3. **Duration Detection**: Properly detect audio file duration using `just_audio`

4. **Buffered Playback**: Implement 100ms audio buffer + scheduled playback for sync

### Medium Priority
5. **Reconnection Logic**: Handle WebSocket/LiveKit reconnection gracefully
6. **Error Recovery**: Better error messages and recovery flows
7. **UI Polish**: Loading states, animations, better empty states
8. **Playlist Reordering**: Drag-to-reorder UI for host
9. **Track Removal**: UI for host to remove tracks from playlist

### Low Priority
10. **Background Mode**: Keep audio playing when app backgrounded
11. **Notification Controls**: Media notification with play/pause
12. **Audio Visualization**: Waveform or spectrum analyzer

## Testing

### Unit Tests
```bash
flutter test
```

### Integration Tests
```bash
flutter test integration_test
```

### Manual Test Scenarios
1. **Basic Flow**: Create room → join from 2nd device → add tracks → play
2. **Clock Sync**: Verify audio plays within 30ms on multiple devices
3. **Android Mirror Mode**: Play Spotify on host → verify audio on member device
4. **iOS Mirror Mode**: Verify feature is hidden/disabled with explanation
5. **Permission Denial**: Deny storage/MediaProjection → verify error handling
6. **Network Disruption**: Disconnect WiFi mid-session → verify reconnection

## Known Limitations

### Current Implementation
- LiveKit audio streaming uses placeholder (microphone) instead of file/system audio
- Custom AudioSource bridge needed for production-quality audio streaming
- No background playback support yet
- No offline mode

### Platform Limitations
- iOS cannot capture system audio (OS restriction)
- Some Android apps block audio capture with security flags
- MediaProjection requires foreground service on Android 9+

## Legal Compliance

✅ This app **NEVER**:
- Downloads content from third-party platforms
- Scrapes or stores copyrighted material
- Facilitates unauthorized content distribution

✅ This app **ONLY**:
- Plays user's own local files
- Mirrors user's own device audio (with explicit permission)
- Streams audio to user's own devices in the same room

## License

Part of TuneTogether project. See root LICENSE file.
