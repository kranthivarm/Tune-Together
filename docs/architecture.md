# TuneTogether — System Architecture

## Overview

TuneTogether is a synced multi-device audio room application. It separates concerns into two planes:

- **Control Plane**: REST API (Spring Boot) + WebSocket signaling (Go) for room management, playlist sync, and playback commands
- **Media Plane**: WebRTC audio streaming via LiveKit SFU for low-latency audio delivery

## System Architecture Diagram

```mermaid
graph TB
    subgraph Clients
        FL["Flutter Mobile App"]
        RW["React Web App"]
    end

    subgraph Control_Plane["Control Plane"]
        SB["Spring Boot API<br/>(REST + Business Logic)<br/>:8080"]
        GO["Go Signaling Server<br/>(WebSocket + Room State)<br/>:8081"]
    end

    subgraph Media_Plane["Media Plane"]
        LK["LiveKit SFU<br/>(WebRTC Audio Relay)<br/>:7880"]
    end

    subgraph Data_Stores["Data Stores"]
        PG["PostgreSQL 16<br/>:5432"]
        RD["Redis 7<br/>(LiveKit State)<br/>:6379"]
    end

    FL -->|REST API| SB
    RW -->|REST API| SB
    FL -->|WebSocket| GO
    RW -->|WebSocket| GO
    FL <-->|WebRTC Audio + Data| LK
    RW <-->|WebRTC Audio + Data| LK

    SB --> PG
    GO --> PG
    GO -->|server-sdk-go| LK
    LK --> RD
```

## Component Responsibilities

### Spring Boot REST API (`/api`)
- **Room lifecycle**: Create, join, close rooms
- **Auth**: Issue room-scoped JWTs (host/member tokens)
- **Playlist metadata**: CRUD for track metadata (title, artist, duration, order)
- **User management**: Lightweight user records (expandable to full accounts)
- **Data persistence**: All durable state in PostgreSQL via JPA + Flyway migrations

### Go Signaling Server (`/realtime`)
- **WebSocket connections**: Persistent connections with all room members
- **Playback commands**: Relay host commands (play, pause, seek, skip) to all members in real-time
- **Clock synchronization**: NTP-style time sync protocol between server and clients
- **Room state**: Track who's connected, current playback position, sync offsets
- **LiveKit integration**: Generate LiveKit access tokens, manage LiveKit rooms via `server-sdk-go`

### LiveKit SFU
- **Audio forwarding**: Receives audio track from host, selectively forwards to all subscribers
- **Data channels**: Reliable + lossy data tracks for sync signals alongside audio
- **Transport**: Handles WebRTC negotiation, ICE, DTLS, SRTP
- **Self-hosted**: Runs as Docker container with Redis for state

### PostgreSQL
- Durable storage for users, rooms, memberships, playlist tracks
- Schema managed by Flyway migrations in Spring Boot

### Redis
- LiveKit's internal state management (room presence, participant tracking)
- Not directly accessed by application code

## Traffic Flow Diagrams

### Feature 1: Local Playlist Sync

```mermaid
sequenceDiagram
    participant Host as Host Device
    participant API as Spring Boot API
    participant Go as Go Signaling
    participant LK as LiveKit SFU
    participant Members as Member Devices

    Note over Host: Host selects local audio files
    Host->>API: POST /rooms/{code}/playlist (metadata only)
    API->>API: Store track metadata in Postgres
    API-->>Host: 201 Created

    Go->>Members: WebSocket: playlist_updated event
    Members->>API: GET /rooms/{code} (fetch playlist)

    Note over Host: Host presses Play
    Host->>Go: WebSocket: play_command {trackId, timestamp}
    Go->>Members: WebSocket: play_command (broadcast)

    Note over Host: Host reads local file, encodes audio
    Host->>LK: WebRTC Audio Track (live stream)
    LK->>Members: WebRTC Audio Track (forwarded)

    Note over Go: Periodic sync pulses via data channel
    Go->>LK: Data Track: sync_pulse {serverTime}
    LK->>Members: Data Track: sync_pulse (forwarded)
```

### Feature 2: Live Device-Audio Mirroring (Android Only)

```mermaid
sequenceDiagram
    participant Host as Host (Android)
    participant OS as Android OS
    participant LK as LiveKit SFU
    participant Go as Go Signaling
    participant Members as Member Devices

    Host->>OS: Request MediaProjection permission
    OS-->>Host: Permission granted + audio capture

    Host->>Go: WebSocket: start_mirror_mode
    Go->>Members: WebSocket: mirror_mode_started

    Note over Host: Continuous system audio capture
    OS->>Host: System audio frames (MediaProjection)
    Host->>LK: WebRTC Audio Track (system audio)
    LK->>Members: WebRTC Audio Track (forwarded)

    Note over Host: Host stops mirroring
    Host->>Go: WebSocket: stop_mirror_mode
    Go->>Members: WebSocket: mirror_mode_stopped
```

### Feature 3: Room + Sync Engine

```mermaid
sequenceDiagram
    participant Host as Host Device
    participant API as Spring Boot API
    participant Go as Go Signaling
    participant LK as LiveKit SFU
    participant M1 as Member 1
    participant M2 as Member 2

    Note over Host: Create Room
    Host->>API: POST /rooms
    API-->>Host: {roomCode: "TT-A3B7K2", token: "..."}

    Host->>Go: WebSocket: connect (host token)
    Host->>LK: Join LiveKit room (LK token)

    Note over M1,M2: Members Join
    M1->>API: POST /rooms/TT-A3B7K2/join
    API-->>M1: {token: "...", role: "MEMBER"}
    M1->>Go: WebSocket: connect (member token)
    M1->>LK: Join LiveKit room (LK token)

    Note over Go: Clock Synchronization Phase
    Go->>M1: time_sync_request {t1: serverTime}
    M1-->>Go: time_sync_response {t1, t2: clientTime, t3: clientTime}
    Go->>M1: time_sync_result {offset: +12ms, rtt: 8ms}

    Note over Go: Repeat for each member, periodically

    Note over Host: Host presses Play
    Host->>Go: play {trackId, hostTime}
    Go->>Go: Calculate per-member play-at times
    Go->>M1: play_at {trackId, playAtTime: adjusted}
    Go->>M2: play_at {trackId, playAtTime: adjusted}

    Note over M1,M2: Buffer audio, start at scheduled time
    Host->>LK: Audio track (live)
    LK->>M1: Audio track
    LK->>M2: Audio track
```

## Sync Engine Design

### Goal
All devices play audio within <30ms of each other.

### Strategy: "Make everyone equally late"

1. **Clock Sync**: NTP-style protocol over WebSocket
   - Server sends `t1` (server timestamp)
   - Client responds with `t2` (client receive time) and `t3` (client send time)
   - Server calculates: `offset = ((t2 - t1) + (t3 - t4)) / 2`, `rtt = (t4 - t1) - (t3 - t2)`
   - Repeated periodically (every 5s), using moving median for stability

2. **Buffered Playback**: Instead of playing audio immediately on receipt:
   - All clients buffer incoming audio for a fixed window (e.g., 100ms)
   - Play commands include an absolute "play-at" time adjusted for each client's clock offset
   - Clients schedule playback using high-resolution audio APIs (Web Audio API / Android AudioTrack)

3. **Drift Correction**: Periodic sync pulses via LiveKit data tracks
   - Server broadcasts heartbeat with current playback position
   - Clients compare and micro-adjust playback rate (±0.1%) to converge

### Why Not "Just Send and Hope"?
- Network jitter: 5–50ms variation per packet
- Device processing: 10–100ms variation per device
- Clock drift: 20–100 ppm between devices
- Without sync, devices will audibly diverge within seconds

## Security Model

### Room-Scoped JWT (v1)
```
Authorization: Bearer <JWT>
```

JWT Claims:
- `sub`: user UUID
- `roomId`: room UUID
- `roomCode`: room code string
- `role`: HOST | MEMBER
- `displayName`: user's chosen display name
- `exp`: 24h expiry

### Endpoint Authorization
| Role | Can Do |
|---|---|
| **No auth** | Create room, join room |
| **MEMBER** | View room state, receive audio |
| **HOST** | All member actions + manage playlist, playback controls, close room |

## Legal Guardrail

**Hard boundary enforced at architecture level:**
- No URL/stream fetching endpoints exist in any service
- Audio enters the system ONLY from the host device (local file read or MediaProjection capture)
- Server never stores, caches, or processes audio bytes — LiveKit SFU forwards opaque RTP packets
- Playlist tracks table stores metadata only (title, artist, duration) — no file paths, no URLs, no binary data
