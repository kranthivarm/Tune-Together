# TuneTogether Quick Start Guide

Get TuneTogether running in 5 minutes.

## Prerequisites

- **Docker & Docker Compose** - For backend services
- **Flutter 3.x+** - For mobile app development
- **Android Studio or Xcode** - For mobile development

## Step 1: Clone & Start Backend (2 minutes)

```bash
# Clone repository
git clone <repo-url>
cd TuneTogether

# Start all backend services
cd infra
docker compose up -d

# Verify services are running
docker compose ps

# Should show: postgres, redis, livekit, api, realtime
```

Wait for all services to be healthy (~30 seconds).

## Step 2: Test Backend API (30 seconds)

```bash
# Health check
curl http://localhost:8080/actuator/health

# Create a test room
curl -X POST http://localhost:8080/api/v1/rooms \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test User","roomName":"Test Room"}'

# You should get back a room code like "TT-A3B7K2"
```

## Step 3: Run Mobile App (2 minutes)

### Android Emulator

```bash
cd ../mobile

# Install dependencies
flutter pub get

# Launch emulator from Android Studio, then:
flutter run
```

### iOS Simulator

```bash
cd ../mobile

# Install dependencies
flutter pub get

# Install iOS dependencies
cd ios
pod install
cd ..

# Launch simulator from Xcode, then:
flutter run
```

### Physical Device

Update API URLs first:

**For Android device on same WiFi:**
```dart
// mobile/lib/services/api_service.dart
ApiService({this.baseUrl = 'http://192.168.x.x:8080/api/v1'});

// mobile/lib/services/websocket_service.dart
WebSocketService({this.baseUrl = 'ws://192.168.x.x:8081/ws'});
```

Replace `192.168.x.x` with your computer's local IP address.

Then:
```bash
flutter run
```

## Step 4: Test the App (30 seconds)

### On First Device:
1. Tap "Create Room"
2. Enter your name
3. Tap "Create Room"
4. Note the room code

### On Second Device:
1. Tap "Join Room"
2. Enter the room code
3. Enter your name
4. Tap "Join Room"

✅ You should see both users in the room!

## Next: Try Core Features

### Add Local Audio Files (Host only)

1. On host device, tap **"Add Tracks"** button
2. Grant storage permission
3. Select some MP3/M4A files
4. Tracks appear in playlist on both devices

### Test Android Mirror Mode (Android host only)

1. On Android host, tap **"Start Device Audio Mirroring"**
2. Grant MediaProjection permission
3. Open Spotify/YouTube
4. Play audio
5. ⚠️ Full audio streaming requires custom AudioSource bridge (coming soon)

## What's Working vs. What's Not

### ✅ Working
- Create/join rooms
- Real-time member list sync
- Add tracks from local storage
- Playlist metadata sync
- WebSocket signaling
- Clock synchronization
- Platform-specific feature detection (Android/iOS)
- MediaProjection permission flow (Android)

### ⚠️ In Progress
- **Audio streaming** - Requires custom AudioSource bridge
- **LiveKit token generation** - Needs integration with Go server
- **Accurate duration** - Needs `just_audio` integration
- **Background playback** - Not yet implemented

## Troubleshooting

### Cannot connect to API

**Problem**: App shows connection errors

**Fix**: Update API URL to your computer's IP address (not localhost) for physical devices.

```bash
# Find your IP
# Mac/Linux:
ifconfig | grep inet

# Windows:
ipconfig
```

### Backend services won't start

**Problem**: `docker compose up` fails

**Fix**:
```bash
# Check for port conflicts
docker compose down
docker compose up -d

# View logs
docker compose logs
```

### Flutter dependencies fail

**Problem**: `flutter pub get` shows errors

**Fix**:
```bash
# Clear cache
flutter clean
flutter pub get

# Update Flutter
flutter upgrade
```

## Directory Structure

```
TuneTogether/
├── api/               # Spring Boot REST API (Java)
├── realtime/          # Go signaling server (WebSocket)
├── mobile/            # Flutter mobile app
├── web/               # React web app (future)
├── infra/             # Docker Compose setup
└── docs/              # Architecture & guides
```

## Useful Commands

```bash
# Backend
cd infra
docker compose up -d          # Start all services
docker compose down           # Stop all services
docker compose logs -f api    # View API logs
docker compose logs -f realtime  # View signaling logs
docker compose ps             # Check service status

# Mobile
cd mobile
flutter run                   # Run on connected device
flutter test                  # Run unit tests
flutter clean                 # Clean build artifacts
flutter doctor                # Check Flutter setup

# Database
docker exec -it tunetogether-postgres psql -U tunetogether
\dt                           # List tables
SELECT * FROM rooms;          # View rooms
```

## Learn More

- **Architecture**: [docs/architecture.md](docs/architecture.md)
- **Integration Guide**: [docs/integration-guide.md](docs/integration-guide.md)
- **Phase 4 & 5 Report**: [docs/phase-4-5-completion.md](docs/phase-4-5-completion.md)
- **Mobile App Details**: [mobile/README.md](mobile/README.md)
- **ADR: SFU Selection**: [docs/adr/001-sfu-livekit.md](docs/adr/001-sfu-livekit.md)

## Getting Help

1. Check the logs: `docker compose logs -f`
2. Review documentation in `docs/`
3. Verify all prerequisites are installed
4. Check backend health: `curl http://localhost:8080/actuator/health`

## What to Build Next

The core infrastructure is complete. Priority items:

1. **Custom AudioSource Bridge** - Native code to pipe audio into LiveKit
2. **LiveKit Token Integration** - Connect Go server to LiveKit token generation
3. **End-to-End Audio Test** - Verify audio plays on member devices
4. **Buffered Playback** - Implement sync buffer for <30ms accuracy

See [docs/phase-4-5-completion.md](docs/phase-4-5-completion.md) for detailed TODO list.

---

**You're ready to go!** 🎉

Open the app, create a room, and start building the synchronized speaker experience.
