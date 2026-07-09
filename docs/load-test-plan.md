# WebSocket Load Test Report & Targets

## Target Scale

| Metric | Target | Notes |
|---|---|---|
| Max members per room | 50 | Physical space constraint |
| Max concurrent rooms | 200 | Per single Go instance |
| Max total connections | 10,000 | 200 rooms × 50 members |
| Message latency (p99) | < 15ms | For control messages (play/pause/seek) |
| Clock sync accuracy | ±5ms | After median filtering stabilizes |
| Reconnection time | < 2s | State sync + clock resync |

## Architecture Constraints

The Go signaling server is **CPU-light and I/O-heavy**:
- Each WebSocket connection is a goroutine pair (read + write)
- Message processing is pure JSON marshal/unmarshal + map lookups
- No database I/O on the hot path (in-memory room state)
- Clock sync probes every 7s per client (small periodic load)

### Memory Estimate

Per connection:
- gorilla/websocket buffers: ~4 KB (1 KB read + 1 KB write + overhead)
- Send channel buffer: 64 × 4 KB = 256 KB (worst case)
- Clock sync samples: ~200 B (10 samples × 16 B + overhead)
- Client struct: ~500 B
- **~5 KB per connection (typical)**
- 10,000 connections ≈ **50 MB** of application memory

### CPU Estimate

Per message (JSON unmarshal + broadcast to N clients):
- 50-member room: ~50 JSON marshals per broadcast
- At peak (e.g., seek spam): 10 messages/sec × 50 broadcasts = 500 marshals/sec
- 200 rooms simultaneously: 100,000 marshals/sec
- Modern CPU can do ~2M small JSON marshals/sec → **~5% CPU**

## Load Test Procedure

### Prerequisites
```bash
# Install websocket load testing tool
go install github.com/vi/websocat@latest
# Or use k6 with websocket extension
```

### Test 1: Single Room, Ramp to 50 Members
```bash
# Create room via API
curl -X POST http://localhost:8080/api/v1/rooms \
  -H 'Content-Type: application/json' \
  -d '{"hostDisplayName": "LoadTestHost"}'

# Connect 50 WebSocket clients with their tokens
# Measure: all clients receive room_state on join
# Measure: play message broadcast latency to all 50
```

### Test 2: Multi-Room, 200 Concurrent Rooms × 10 Members Each
```bash
# Script creates 200 rooms, joins 10 members each
# Total: 2,000 concurrent WebSocket connections
# Measure: memory, CPU, message latency p50/p95/p99
```

### Test 3: Burst Control Messages
```bash
# In a 50-member room, host sends:
# - 10 play/pause toggles per second for 30 seconds
# Measure: broadcast delivery latency to last member
# Verify: no message drops, all clients receive all messages
```

### Test 4: Clock Sync Under Load
```bash
# 50 members, periodic sync every 7 seconds
# Measure: offset stability after 30 seconds
# Verify: median offset converges within ±5ms
```

### Test 5: Reconnection Storm
```bash
# 50 members connected, disconnect 25 simultaneously
# Reconnect all 25 within 5 seconds
# Verify: all receive current room_state
# Measure: time from connect to first room_state message
```

## Monitoring Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Service health + room count |
| `/stats` | GET | Detailed room/connection stats |

## Scaling Strategy

For production beyond 10K connections:
1. **Horizontal scaling**: Run multiple Go instances behind a load balancer, shard rooms by room code hash
2. **Redis pub/sub**: Share control messages across instances for rooms that span multiple nodes
3. **Connection draining**: Graceful shutdown sends reconnect signals to all clients
