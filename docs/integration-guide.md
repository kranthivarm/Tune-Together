# TuneTogether Integration Guide

## Overview

This guide walks through integrating all TuneTogether services for end-to-end testing.

## Services Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Mobile App (Flutter)                 │
│  - Create/Join rooms                                     │
│  - Local file playlist                                   │
│  - Device audio mirroring (Android)                      │
└─────┬─────────────────────────────────────────┬─────────┘
      │                                         │
      │ REST API (8080)                        │ WebSocket (8081)
      │                                         │
┌─────▼──────────────┐              ┌──────────▼──────────┐
│   Spring Boot API  │              │  Go Signaling Server │
│  - Room CRUD       │◄─────────────┤  - Real-time commands│
│  - Auth (JWT)      │   Postgres   │  - Clock sync        │
│  - Playlist meta   │              │  - LiveKit tokens    │
└────────────────────┘              └──────────┬───────────┘
                                               │
                                               │ server-sdk-go
                                               │
                                    ┌──────────▼───────────┐
                                    │   LiveKit SFU        │
                                    │  - WebRTC relay      │
                                    │  - Audio forwarding  │
                                    └──────────────────────┘
```

## Prerequisites

- Docker & Docker Compose
- Flutter 3.x+
- Android Studio / Xcode
- Android device/emulator (for mirror mode testing)
- iOS device/simulator (for iOS testing)

## Step-by-Step Setup

### 1. Start Backend Services

```bash
cd infra
docker compose up -d
```

This starts:
- PostgreSQL (5432)
- Redis (6379)
- LiveKit (7880)
- Spring Boot API (8080)
- Go Signaling Server (8081)

Verify all services are healthy:
```bash
docker compose ps
```

### 2. Verify API Service

```bash
curl http://localhost:8080/actuator/health
# Expected: {"status":"UP"}
```

Test create room:
```bash
curl -X POST http://localhost:8080/api/v1/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Test Host",
    "roomName": "Test Room"
  }'

# Expected: {"roomCode":"TT-XXXXXX","token":"...","userId":"..."}
```

### 3. Verify Go Signaling Server

```bash
curl http://localhost:8081/health
# Expected: {"status":"ok"}
```

### 4. Verify LiveKit

```bash
curl http://localhost:7880/
# Expected: LiveKit server info page
```

### 5. Configure Mobile App

Update `mobile/lib/services/api_service.dart`:
```dart
ApiService({this.baseUrl = 'http://10.0.2.2:8080/api/v1'}); // Android emulator
// OR
ApiService({this.baseUrl = 'http://localhost:8080/api/v1'}); // iOS simulator
// OR
ApiService({this.baseUrl = 'http://192.168.x.x:8080/api/v1'}); // Physical device
```

Update `mobile/lib/services/websocket_service.dart`:
```dart
WebSocketService({this.baseUrl = 'ws://10.0.2.2:8081/ws'}); // Android emulator
// Similar changes for iOS/physical device
```

Update `mobile/lib/services/livekit_service.dart`:
```dart
// LiveKit URL will come from Go server token response
// For testing, use: ws://10.0.2.2:7880
```

### 6. Install Flutter Dependencies

```bash
cd mobile
flutter pub get
```

### 7. Run Mobile App

**Android:**
```bash
flutter run
```

**iOS:**
```bash
cd ios
pod install
cd ..
flutter run
```

## End-to-End Test Scenarios

### Test 1: Basic Room Flow

**Objective**: Verify room creation and joining

1. Launch app on Device A (Host)
2. Tap "Create Room"
3. Enter name "Host User"
4. Tap "Create Room"
5. Note the room code (e.g., TT-A3B7K2)
6. Launch app on Device B (Member)
7. Tap "Join Room"
8. Enter room code and name "Member User"
9. Tap "Join Room"

**Expected Result**:
- Both devices show the room screen
- Both see 2 members in the member list
- Device A shows host badge
- Room code is displayed on both

### Test 2: Local Playlist

**Objective**: Verify local file playlist feature

**Prerequisites**: Have some MP3 files on host device

1. Continue from Test 1 (Device A as host)
2. Tap "Add Tracks" FAB
3. Grant storage permission when prompted
4. Select 2-3 audio files
5. Files appear in playlist on Device A
6. Files appear in playlist on Device B

**Expected Result**:
- Files show title, artist from ID3 tags
- Playlist syncs to member device
- Duration displayed (if implemented)

### Test 3: Playback Controls

**Objective**: Verify playback command sync

⚠️ **Note**: Audio streaming requires custom AudioSource bridge (not yet implemented)

1. Continue from Test 2
2. On Device A (host), tap a track to play
3. Observe UI changes on both devices

**Expected Result**:
- Play button changes to pause on host
- "Now Playing" card appears on both devices
- Track title/artist displayed
- Member device shows playback state (no controls)

### Test 4: Android Mirror Mode

**Objective**: Verify device audio mirroring (Android only)

**Prerequisites**: 
- Device A must be Android
- Have Spotify, YouTube, or any music app

1. Continue from Test 1 (both devices in room)
2. On Device A (Android host), tap "Start Device Audio Mirroring"
3. Grant MediaProjection permission when prompted
4. Open Spotify/YouTube on Device A
5. Play a song
6. Observe Device B

**Expected Result**:
- Permission dialog explains screen capture is needed
- Orange "Device audio is being mirrored" banner appears
- ⚠️ Audio streaming to Device B requires AudioSource bridge

### Test 5: iOS Limitation Handling

**Objective**: Verify iOS properly disables mirror mode

1. Run app on iOS device as host
2. Navigate to room screen

**Expected Result**:
- "Start Device Audio Mirroring" button is NOT shown
- No errors or crashes
- (If implemented) Explanatory message about iOS limitation

### Test 6: Clock Sync

**Objective**: Measure clock synchronization accuracy

1. Enable debug logging in `websocket_service.dart`
2. Join room on 2 devices
3. Monitor console output for clock sync messages

**Expected Result**:
- `timeSyncRequest` received every 5-10 seconds
- `timeSyncResult` shows offset and RTT
- Offset should be consistent (±10ms)

### Test 7: Permission Denial

**Objective**: Verify graceful handling of denied permissions

**Storage Permission:**
1. Host taps "Add Tracks"
2. Deny storage permission
3. Verify error message shown

**MediaProjection Permission (Android):**
1. Host taps "Start Device Audio Mirroring"
2. Deny MediaProjection permission
3. Verify error message shown
4. No crash or broken state

### Test 8: Network Disruption

**Objective**: Verify reconnection handling

⚠️ **Note**: Reconnection logic not fully implemented yet

1. Both devices in room
2. Disable WiFi on one device
3. Wait 10 seconds
4. Re-enable WiFi

**Expected Result**:
- App shows "Disconnected" or similar indicator
- Upon reconnection, WebSocket/LiveKit reconnect
- Room state restored

### Test 9: Room Closure

**Objective**: Verify host can close room

1. Host device in room with members
2. Tap menu → "Close Room"
3. Confirm closure

**Expected Result**:
- Host returns to home screen
- Members see "Room closed by host" or similar
- All return to home screen

## Debugging Tips

### Cannot Connect to API

**Problem**: Mobile app shows connection errors

**Solutions**:
- Check backend services are running: `docker compose ps`
- Verify correct IP address for physical device (not localhost)
- Android emulator: use `10.0.2.2` instead of `localhost`
- iOS simulator: use `localhost`
- Check firewall rules allow incoming connections

### WebSocket Won't Connect

**Problem**: "WebSocket connection failed"

**Solutions**:
- Verify Go signaling server is running: `curl http://localhost:8081/health`
- Check JWT token is valid (not expired)
- Verify WebSocket URL uses `ws://` not `http://`
- Check CORS configuration in Go server

### LiveKit Connection Fails

**Problem**: "Failed to connect to LiveKit room"

**Solutions**:
- Verify LiveKit is running: `curl http://localhost:7880/`
- Check LiveKit token generation in Go server
- Verify token includes correct room name
- Check LiveKit API key/secret configuration

### MediaProjection Permission Dialog Doesn't Appear

**Problem**: No permission dialog on Android

**Solutions**:
- Verify Android API level ≥ 29 (Android 10+)
- Check `AndroidManifest.xml` has required permissions
- Verify `MainActivity.kt` is properly configured
- Check Logcat for errors: `adb logcat | grep MediaProjection`

### No Audio on Member Device

**Problem**: Member doesn't hear host audio

**Root Cause**: Custom AudioSource bridge not yet implemented

**Temporary Workaround**: 
- Microphone placeholder is published instead
- Host can speak into mic to test audio forwarding

**Permanent Solution**:
- Implement native bridge to pipe:
  - Local file playback → LiveKit track
  - MediaProjection PCM → LiveKit track

## Log Locations

### Mobile App (Flutter)
```bash
# Android
adb logcat | grep flutter

# iOS
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "Runner"'
```

### Spring Boot API
```bash
docker logs tunetogether-api -f
```

### Go Signaling Server
```bash
docker logs tunetogether-realtime -f
```

### LiveKit
```bash
docker logs tunetogether-livekit -f
```

## Performance Benchmarks

### Target Metrics
- **Clock Sync Accuracy**: <30ms drift
- **WebSocket Latency**: <50ms (same network)
- **API Response Time**: <200ms
- **Room Join Time**: <2s
- **Audio Latency**: <100ms (LiveKit)

### Measuring Clock Sync

Add logging in `websocket_service.dart`:
```dart
_wsService.clockSync.listen((sync) {
  print('SYNC: offset=${sync.offsetMs}ms, rtt=${sync.rttMs}ms');
});
```

Run on multiple devices and verify offset stability.

## Common Issues

### "Room not found"
- Check room code is correct (case-sensitive)
- Verify room hasn't been closed
- Check API logs for errors

### "Permission denied: Only host can..."
- Verify JWT token has correct role
- Check token hasn't expired (24h default)
- Re-join room if needed

### "Failed to add track metadata"
- Check track metadata size (title, artist length)
- Verify host token is valid
- Check API logs for validation errors

### App crashes on track selection
- Verify storage permission granted
- Check file is valid audio format
- Update `audiotagger` package if ID3 parsing fails

## Next Steps

Once integration tests pass, implement:

1. **Custom AudioSource Bridge** (Critical)
   - Native code to pipe audio PCM into LiveKit
   - Both local file playback and MediaProjection

2. **LiveKit Token Integration**
   - Go server endpoint to issue LiveKit tokens
   - Mobile app fetches token before connecting

3. **Buffered Playback**
   - 100ms audio buffer on member devices
   - Scheduled playback start for sync

4. **Reconnection Logic**
   - Auto-reconnect on network loss
   - State restoration after reconnect

5. **Background Mode**
   - Keep audio playing when app backgrounded
   - Media notification controls

## Support

For issues or questions:
- Check [Phase 4 & 5 Completion Report](phase-4-5-completion.md)
- Review [Architecture Documentation](architecture.md)
- Check API logs: `docker logs tunetogether-api -f`
- Check Signaling logs: `docker logs tunetogether-realtime -f`
