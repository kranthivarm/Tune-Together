# TuneTogether Real-Time Signaling Server (Go)

## Purpose

WebSocket server providing:
- Real-time command signaling (play, pause, seek, skip)
- Clock synchronization (NTP-style)
- Room state management (connected clients, playback state)
- Drift monitoring and correction (Phase 7)
- LiveKit token generation

**Does NOT handle**:
- Audio streaming (handled by LiveKit)
- Data persistence (handled by Spring Boot API)
- Room creation/authentication (handled by Spring Boot API)

## Technology Stack

- **Language**: Go 1.22+
- **WebSocket**: gorilla/websocket
- **LiveKit Integration**: livekit/server-sdk-go
- **Database**: PostgreSQL 16 (read-only access to rooms table)
- **Authentication**: JWT validation (tokens issued by Spring Boot)

## Architecture

```
┌─────────────────────────────────────┐
│       WebSocket Handler             │
│  - Connection lifecycle             │
│  - Message routing                  │
│  - Authentication                   │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│        Room Manager                 │
│  - Active room tracking             │
│  - Client-to-room mapping           │
│  - Message broadcasting             │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│       Drift Monitor (Phase 7)       │
│  - Position tracking                │
│  - Drift detection                  │
│  - Correction commands              │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│      LiveKit Token Service          │
│  - Token generation                 │
│  - Permission scoping               │
└─────────────────────────────────────┘
```

## Setup

### Prerequisites

- Go 1.22+
- PostgreSQL 16 (shared with Spring Boot API)
- LiveKit server running

### Local Development

```bash
# Install dependencies
cd realtime
go mod download

# Set environment variables
export DATABASE_URL="postgres://tunetogether:tunetogether@localhost:5432/tunetogether"
export LIVEKIT_API_KEY="devkey"
export LIVEKIT_API_SECRET="secret"
export LIVEKIT_URL="ws://localhost:7880"
export JWT_SECRET="your-jwt-secret"  # Same as Spring Boot

# Run server
go run cmd/server/main.go

# Or with hot reload (install air first: go install github.com/cosmtrek/air@latest)
air
```

### Build

```bash
# Build binary
go build -o bin/tunetogether-realtime cmd/server/main.go

# Run binary
./bin/tunetogether-realtime

# Cross-compile for Linux
GOOS=linux GOARCH=amd64 go build -o bin/tunetogether-realtime-linux cmd/server/main.go
```

### Run Tests

```bash
# All tests
go test ./...

# With coverage
go test -cover ./...

# Verbose
go test -v ./...

# Specific package
go test ./internal/room

# Race detection
go test -race ./...
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8081` | WebSocket server port |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit server URL |
| `LIVEKIT_API_KEY` | (required) | LiveKit API key |
| `LIVEKIT_API_SECRET` | (required) | LiveKit API secret |
| `JWT_SECRET` | (required) | JWT signing secret (same as API) |
| `DRIFT_THRESHOLD_MS` | `30` | Drift detection threshold |
| `DRIFT_CHECK_INTERVAL` | `3s` | How often to check drift |
| `HOST_DISCONNECT_GRACE` | `30s` | Grace period before closing room |

### Configuration File (Optional)

`config.yaml`:
```yaml
server:
  port: 8081
  readTimeout: 10s
  writeTimeout: 10s

database:
  url: "postgres://localhost:5432/tunetogether"
  maxConnections: 10

livekit:
  url: "ws://localhost:7880"
  apiKey: "devkey"
  apiSecret: "secret"

sync:
  driftThreshold: 30  # milliseconds
  checkInterval: 3    # seconds
  hostGracePeriod: 30 # seconds
```

## WebSocket Protocol

### Connection

```
ws://localhost:8081/ws?token=<jwt-token>

// JWT token must include:
{
  "userId": "uuid",
  "roomCode": "TT-A3B7K2",
  "roomId": "uuid",
  "role": "HOST" | "MEMBER",
  "displayName": "John Doe"
}
```

### Message Format

```json
{
  "type": "messageType",
  "payload": { /* type-specific data */ }
}
```

### Client → Server Messages

#### Play Command (Host Only)
```json
{
  "type": "play",
  "trackId": "uuid",
  "positionMs": 0,
  "hostTime": 1703001234567
}
```

#### Pause Command (Host Only)
```json
{
  "type": "pause",
  "positionMs": 45230
}
```

#### Seek Command (Host Only)
```json
{
  "type": "seek",
  "positionMs": 60000
}
```

#### Skip Command (Host Only)
```json
{
  "type": "skip",
  "trackId": "uuid"
}
```

#### Position Report (Phase 7)
```json
{
  "type": "playbackPositionReport",
  "positionMs": 45230,
  "trackId": "uuid",
  "timestamp": 1703001234567
}
```

#### Time Sync Response
```json
{
  "type": "timeSyncResponse",
  "t1": 1703001234567,
  "t2": 1703001234570,
  "t3": 1703001234571
}
```

### Server → Client Messages

#### Play Command Broadcast
```json
{
  "type": "playCommand",
  "trackId": "uuid",
  "positionMs": 0,
  "playAtTime": 1703001235000
}
```

#### Pause Command Broadcast
```json
{
  "type": "pauseCommand",
  "positionMs": 45230
}
```

#### Member Joined
```json
{
  "type": "memberJoined",
  "userId": "uuid",
  "displayName": "Jane Smith",
  "role": "MEMBER"
}
```

#### Member Left
```json
{
  "type": "memberLeft",
  "userId": "uuid",
  "displayName": "Jane Smith"
}
```

#### Playlist Updated
```json
{
  "type": "playlistUpdated",
  "message": "Playlist has been updated"
}
```

#### Time Sync Request
```json
{
  "type": "timeSyncRequest",
  "t1": 1703001234567
}
```

#### Time Sync Result
```json
{
  "type": "timeSyncResult",
  "offsetMs": 12,
  "rttMs": 8
}
```

#### Drift Correction (Phase 7)
```json
{
  "type": "driftCorrection",
  "targetPositionMs": 45280,
  "adjustmentRate": 1.015
}
```

#### Host Disconnected
```json
{
  "type": "hostDisconnected",
  "message": "Host disconnected. Waiting for reconnection...",
  "waitTime": 30
}
```

#### Room Closed
```json
{
  "type": "roomClosed",
  "reason": "Host closed the room"
}
```

## LiveKit Integration

### Token Generation

```go
func (s *LiveKitService) GenerateToken(roomCode, userId string, isHost bool) (string, error) {
    at := livekit.NewAccessToken(s.apiKey, s.apiSecret)
    
    grant := &livekit.VideoGrant{
        RoomJoin:     true,
        Room:         roomCode,
        CanPublish:   isHost,      // Only host can publish
        CanSubscribe: true,         // Everyone can subscribe
    }
    
    at.AddGrant(grant).SetIdentity(userId)
    return at.ToJWT()
}
```

### Endpoint

```http
GET /livekit/token?roomCode=TT-A3B7K2
Authorization: Bearer <jwt-token>

Response (200):
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "ws://localhost:7880"
}
```

## Phase 7: Drift Detection

See [DRIFT_DETECTION_GUIDE.md](DRIFT_DETECTION_GUIDE.md) for detailed implementation.

### Algorithm Overview

```
1. Collect position reports from all clients (every 2s)
2. Calculate average position (compensate for network delay)
3. Detect clients with drift > 30ms
4. Calculate proportional adjustment rate
5. Send driftCorrection message to drifting clients
```

### Monitoring

```go
// Log drift metrics
log.Printf("Room %s: Client %s drift %dms, rate %.4f",
    roomID, clientID, driftMs, adjustmentRate)
```

## Host Disconnect Handling (Phase 8)

### Strategy: Pause and Wait

```go
func (h *Handler) handleHostDisconnect(client *Client) {
    // 1. Notify all members
    h.broadcastToRoom(client.RoomID, Message{
        Type: "hostDisconnected",
        Payload: map[string]interface{}{
            "message": "Host disconnected. Pausing playback...",
            "waitTime": 30,
        },
    })
    
    // 2. Start 30-second grace period
    time.AfterFunc(30*time.Second, func() {
        if !h.isClientReconnected(client.ID) {
            // 3. Close room if host doesn't reconnect
            h.closeRoom(client.RoomID)
            h.broadcastToRoom(client.RoomID, Message{
                Type: "roomClosed",
                Payload: map[string]interface{}{
                    "reason": "Host did not reconnect",
                },
            })
        }
    })
}
```

## Rate Limiting

### WebSocket Messages

```go
// 30 messages per second per client
rateLimiter := rate.NewLimiter(30, 60)

func (h *Handler) handleMessage(client *Client, message []byte) {
    if !h.rateLimiter.Allow(client.ID) {
        client.Send([]byte(`{"error":"Rate limit exceeded"}`))
        return
    }
    // ... process message
}
```

## Security

### Authentication

- JWT token required for WebSocket connection
- Token validated on connection upgrade
- Invalid token = connection rejected (401)

### Authorization

- Host role required for playback commands
- Members can only send position reports
- Unauthorized commands logged and ignored

### Input Validation

- All incoming messages validated
- Unknown message types ignored
- Malformed JSON logged and rejected

## Deployment

### Docker

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN go build -o /tunetogether-realtime cmd/server/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /tunetogether-realtime .
EXPOSE 8081
CMD ["./tunetogether-realtime"]
```

```bash
docker build -t tunetogether-realtime .
docker run -p 8081:8081 \
  -e DATABASE_URL=postgres://db:5432/tunetogether \
  -e LIVEKIT_API_KEY=key \
  -e LIVEKIT_API_SECRET=secret \
  tunetogether-realtime
```

### Production Checklist

- [ ] Set production environment variables
- [ ] Configure database connection pooling
- [ ] Enable HTTPS for WebSocket (wss://)
- [ ] Configure CORS origins
- [ ] Set up connection limits
- [ ] Configure rate limiting
- [ ] Enable structured logging (JSON)
- [ ] Set up monitoring (Prometheus metrics)
- [ ] Configure health check endpoint
- [ ] Test failover scenarios

### Health Check

```http
GET /health

Response:
{
  "status": "healthy",
  "uptime": "2h15m30s",
  "connections": 42,
  "rooms": 8
}
```

## Monitoring

### Metrics

- Active WebSocket connections
- Rooms active
- Messages per second
- Drift corrections per room
- Average drift per room
- Host disconnects
- Rate limit violations

### Logging

```go
// Structured logging with levels
log.Info("Client connected",
    "clientId", client.ID,
    "roomCode", client.RoomCode,
    "role", client.Role,
)

log.Warn("Drift correction needed",
    "roomCode", roomCode,
    "clientId", clientID,
    "driftMs", driftMs,
)

log.Error("Failed to broadcast message",
    "roomCode", roomCode,
    "error", err,
)
```

## Troubleshooting

### WebSocket Connection Fails

```
Error: WebSocket: bad handshake
Solution: Check JWT token is valid
Verify: curl with Authorization header
```

### Clients Not Syncing

```
Error: Clock offsets vary wildly
Solution: Check network latency (ping)
Debug: Enable clock sync logging
```

### High CPU Usage

```
Error: CPU usage > 80%
Solution: Check number of active connections
Action: Scale horizontally or optimize drift checking
```

### Memory Leak

```
Error: Memory usage growing over time
Solution: Check client cleanup on disconnect
Debug: Enable GC logging, profile with pprof
```

## Development Tips

### Hot Reload

```bash
# Install air
go install github.com/cosmtrek/air@latest

# Run with hot reload
air
```

### WebSocket Testing

```bash
# Install websocat
cargo install websocat

# Connect to WebSocket
websocat ws://localhost:8081/ws?token=<jwt>

# Send message
{"type":"play","trackId":"uuid","positionMs":0}
```

### Load Testing

```bash
# Install hey
go install github.com/rakyll/hey@latest

# Load test health endpoint
hey -n 10000 -c 100 http://localhost:8081/health
```

## Contributing

1. Follow Go code style (gofmt, golint)
2. Write tests for new features
3. Update protocol documentation if messages change
4. Run tests before committing: `go test ./...`
5. Check for race conditions: `go test -race ./...`

## License

Part of TuneTogether project. See root LICENSE file.
