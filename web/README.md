# TuneTogether Web App

React web application for TuneTogether - synchronized multi-device audio playback.

## Features (Phase 6)

✅ **Room Management**
- Create rooms as host (Note: Web clients cannot publish audio in v1)
- Join rooms as member with room code
- Real-time member list synchronization

✅ **Subscribe-Only Audio**
- Web clients can **listen** to audio streams from mobile hosts
- WebRTC audio via LiveKit SFU
- No local file playback or system audio capture from browser (by design)

✅ **Real-time Synchronization**
- WebSocket signaling for playback commands
- Clock synchronization (NTP-style)
- Now playing display
- Playlist view (read-only for web clients)

✅ **Phase 7: Drift Monitoring & Correction**
- Continuous drift monitoring
- Automatic playback rate adjustments (0.98x - 1.02x)
- Visual sync quality indicator
- Position reporting every 2 seconds
- Server-side drift detection and correction commands

## Setup

### Prerequisites
- Node.js 20+
- npm or yarn
- Running backend services (API, Realtime, LiveKit)

### Install Dependencies
```bash
npm install
```

### Configure Environment
```bash
cp .env.example .env
# Edit .env with your backend URLs
```

### Run Development Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Phase 7: Drift Correction

The web app includes intelligent drift correction:

1. **Position Reporting**: Every 2 seconds while playing
2. **Drift Detection**: Server compares all clients' positions
3. **Smooth Correction**: Playback rate adjustment (0.98x-1.02x, not hard jumps)
4. **Visual Feedback**: Sync quality indicator (excellent/good/fair/poor)
5. **Auto-Reset**: Playback rate returns to 1.0x after correction

## Known Limitations

- ❌ Cannot publish audio (host)
- ❌ Cannot play local files
- ❌ Cannot capture system audio
- ✅ Can subscribe to audio from mobile hosts
- ✅ Full sync and drift correction support

See full documentation in [web/README.md](README.md)
