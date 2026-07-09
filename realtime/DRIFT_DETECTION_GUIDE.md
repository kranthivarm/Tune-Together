# Drift Detection Implementation Guide (Go Server)

## Overview

This guide provides the implementation plan for server-side drift detection in the Go signaling server. This completes Phase 7 of the TuneTogether project.

## Objective

Implement an algorithm that:
1. Collects position reports from all clients in a room
2. Detects clients whose playback has drifted > 30ms from the average
3. Sends correction commands with smooth playback rate adjustments
4. Logs metrics for monitoring sync quality

## Architecture

```
┌─────────────────────────────────────────────┐
│          Go Signaling Server                │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  WebSocket Handler                   │  │
│  │  - Receives playbackPositionReport   │  │
│  │  - Sends driftCorrection             │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│  ┌────────────▼─────────────────────────┐  │
│  │  Room Manager                        │  │
│  │  - Maintains active rooms            │  │
│  │  - Associates clients with rooms     │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│  ┌────────────▼─────────────────────────┐  │
│  │  Drift Monitor (NEW)                 │  │
│  │  - Stores client positions           │  │
│  │  - Calculates average position       │  │
│  │  - Detects drift > threshold         │  │
│  │  - Calculates adjustment rates       │  │
│  │  - Triggers correction messages      │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Define Data Structures

Create `internal/room/drift_monitor.go`:

```go
package room

import (
    "math"
    "sync"
    "time"
)

// ClientPosition represents a client's reported playback position
type ClientPosition struct {
    ClientID    string
    Position    int64  // Position in milliseconds
    Timestamp   int64  // Unix timestamp in milliseconds
    ReceivedAt  int64  // Server received timestamp
}

// DriftMonitor tracks playback positions and detects drift
type DriftMonitor struct {
    mu             sync.RWMutex
    roomID         string
    positions      map[string]*ClientPosition
    driftThreshold int64 // Default: 30ms
    minClients     int   // Minimum clients needed for comparison
    lastCheck      time.Time
}

// DriftCorrection represents a correction command to send to a client
type DriftCorrection struct {
    ClientID         string
    TargetPositionMs int64
    AdjustmentRate   float64
    DriftMs          int64
}

// NewDriftMonitor creates a new drift monitor for a room
func NewDriftMonitor(roomID string) *DriftMonitor {
    return &DriftMonitor{
        roomID:         roomID,
        positions:      make(map[string]*ClientPosition),
        driftThreshold: 30, // 30ms threshold
        minClients:     2,  // Need at least 2 clients to compare
        lastCheck:      time.Now(),
    }
}
```

### Step 2: Add Position Report Handler

```go
// ProcessPositionReport processes a position report from a client
func (dm *DriftMonitor) ProcessPositionReport(clientID string, position int64, timestamp int64) {
    dm.mu.Lock()
    defer dm.mu.Unlock()

    dm.positions[clientID] = &ClientPosition{
        ClientID:   clientID,
        Position:   position,
        Timestamp:  timestamp,
        ReceivedAt: time.Now().UnixMilli(),
    }
}

// RemoveClient removes a client from drift monitoring
func (dm *DriftMonitor) RemoveClient(clientID string) {
    dm.mu.Lock()
    defer dm.mu.Unlock()
    delete(dm.positions, clientID)
}
```

### Step 3: Implement Drift Detection Algorithm

```go
// CheckDrift analyzes all client positions and returns necessary corrections
func (dm *DriftMonitor) CheckDrift() []DriftCorrection {
    dm.mu.RLock()
    defer dm.mu.RUnlock()

    // Need at least minClients to compare
    if len(dm.positions) < dm.minClients {
        return nil
    }

    // 1. Calculate average position with network delay compensation
    avgPosition := dm.calculateAveragePosition()

    // 2. Detect clients with drift > threshold
    corrections := []DriftCorrection{}
    for clientID, pos := range dm.positions {
        drift := pos.Position - avgPosition
        driftAbs := int64(math.Abs(float64(drift)))

        if driftAbs > dm.driftThreshold {
            // 3. Calculate adjustment rate
            // Proportional correction: more drift = stronger adjustment
            // Formula: rate = 1.0 + (avgPosition - clientPosition) / 10000
            // This gives ~1% adjustment per 100ms of drift
            adjustmentRate := 1.0 + float64(avgPosition-pos.Position)/10000.0

            // 4. Clamp to ±2% (0.98 to 1.02)
            adjustmentRate = math.Max(0.98, math.Min(1.02, adjustmentRate))

            corrections = append(corrections, DriftCorrection{
                ClientID:         clientID,
                TargetPositionMs: avgPosition,
                AdjustmentRate:   adjustmentRate,
                DriftMs:          driftAbs,
            })
        }
    }

    return corrections
}

// calculateAveragePosition calculates the average position across all clients
// with network delay compensation
func (dm *DriftMonitor) calculateAveragePosition() int64 {
    if len(dm.positions) == 0 {
        return 0
    }

    var sum int64
    var count int64

    now := time.Now().UnixMilli()

    for _, pos := range dm.positions {
        // Compensate for network delay
        // Estimate current position based on report timestamp and receive time
        networkDelay := pos.ReceivedAt - pos.Timestamp
        estimatedPosition := pos.Position + networkDelay

        // Optional: Add time since received (for very late processing)
        timeSinceReceived := now - pos.ReceivedAt
        if timeSinceReceived > 0 {
            estimatedPosition += timeSinceReceived
        }

        sum += estimatedPosition
        count++
    }

    return sum / count
}
```

### Step 4: Add Continuous Monitoring

```go
// StartMonitoring starts continuous drift monitoring for the room
func (dm *DriftMonitor) StartMonitoring(interval time.Duration, callback func([]DriftCorrection)) {
    ticker := time.NewTicker(interval)
    go func() {
        for range ticker.C {
            corrections := dm.CheckDrift()
            if len(corrections) > 0 {
                callback(corrections)
            }
        }
    }()
}
```

### Step 5: Integrate with WebSocket Handler

Update `internal/ws/handler.go`:

```go
// Add to client message handler
func (h *Handler) handleMessage(client *Client, message []byte) {
    var msg Message
    if err := json.Unmarshal(message, &msg); err != nil {
        log.Printf("Error unmarshaling message: %v", err)
        return
    }

    switch msg.Type {
    case "playbackPositionReport":
        h.handlePositionReport(client, msg)
    // ... other cases
    }
}

// handlePositionReport processes a position report from a client
func (h *Handler) handlePositionReport(client *Client, msg Message) {
    positionMs, ok := msg.Payload["positionMs"].(float64)
    if !ok {
        return
    }

    timestamp, ok := msg.Payload["timestamp"].(float64)
    if !ok {
        timestamp = float64(time.Now().UnixMilli())
    }

    // Get room's drift monitor
    room := h.roomManager.GetRoom(client.RoomID)
    if room == nil {
        return
    }

    // Process position report
    room.DriftMonitor.ProcessPositionReport(
        client.ID,
        int64(positionMs),
        int64(timestamp),
    )
}

// sendDriftCorrection sends a drift correction command to a client
func (h *Handler) sendDriftCorrection(clientID string, correction room.DriftCorrection) {
    client := h.getClient(clientID)
    if client == nil {
        return
    }

    message := Message{
        Type: "driftCorrection",
        Payload: map[string]interface{}{
            "targetPositionMs": correction.TargetPositionMs,
            "adjustmentRate":   correction.AdjustmentRate,
        },
    }

    data, err := json.Marshal(message)
    if err != nil {
        log.Printf("Error marshaling drift correction: %v", err)
        return
    }

    client.Send(data)
}
```

### Step 6: Start Monitoring on Room Creation

Update `internal/room/manager.go`:

```go
// CreateRoom creates a new room with drift monitoring
func (rm *RoomManager) CreateRoom(roomID string) *Room {
    room := &Room{
        ID:           roomID,
        Clients:      make(map[string]*Client),
        DriftMonitor: NewDriftMonitor(roomID),
    }

    // Start drift monitoring every 3 seconds
    room.DriftMonitor.StartMonitoring(3*time.Second, func(corrections []DriftCorrection) {
        for _, correction := range corrections {
            rm.handler.sendDriftCorrection(correction.ClientID, correction)
            
            // Log for monitoring
            log.Printf("Room %s: Client %s drift %dms, rate %.4f",
                roomID,
                correction.ClientID,
                correction.DriftMs,
                correction.AdjustmentRate,
            )
        }
    })

    return room
}
```

## Configuration Parameters

| Parameter | Default | Rationale |
|---|---|---|
| `driftThreshold` | 30ms | Target sync accuracy from requirements |
| `checkInterval` | 3 seconds | Balance between responsiveness and CPU usage |
| `minClients` | 2 | Need comparison baseline |
| `maxAdjustmentRate` | 1.02 (±2%) | Inaudible to humans |

## Tuning Guide

### If Drift Remains High
- **Decrease checkInterval**: From 3s to 2s for faster detection
- **Increase adjustment strength**: Change `/10000` to `/8000` in rate formula
- **Lower threshold**: From 30ms to 20ms for tighter sync

### If Too Aggressive
- **Increase checkInterval**: From 3s to 5s to reduce corrections
- **Decrease adjustment strength**: Change `/10000` to `/12000`
- **Higher threshold**: From 30ms to 40ms

### If Network Latency High
- **Improve delay compensation**: Use moving average of network delays
- **Add outlier detection**: Ignore clients with RTT > 500ms
- **Increase threshold**: From 30ms to 50ms for unstable networks

## Logging and Metrics

Add instrumentation for monitoring:

```go
// Metrics to track
type DriftMetrics struct {
    TotalCorrections   int64
    AvgDriftMs         float64
    MaxDriftMs         int64
    ClientsDrifting    int
    LastCorrectionTime time.Time
}

// Log metrics periodically
func (dm *DriftMonitor) LogMetrics() {
    log.Printf("Room %s Drift Metrics: avg=%.1fms, max=%dms, corrections=%d",
        dm.roomID,
        dm.metrics.AvgDriftMs,
        dm.metrics.MaxDriftMs,
        dm.metrics.TotalCorrections,
    )
}
```

## Testing Checklist

- [ ] Unit test: `calculateAveragePosition()` with 3 clients
- [ ] Unit test: `CheckDrift()` detects client 50ms behind
- [ ] Unit test: Adjustment rate calculation (30ms drift = 1.003x rate)
- [ ] Unit test: Rate clamping (200ms drift still clamps to 1.02x)
- [ ] Integration test: WebSocket receives position reports
- [ ] Integration test: WebSocket sends drift corrections
- [ ] Manual test: 3 devices playing, verify drift < 30ms over 5 minutes
- [ ] Load test: 50 clients in one room, check CPU usage

## Performance Considerations

### CPU Usage
- Check every 3 seconds per room
- O(n) algorithm where n = number of clients
- Expected: <1% CPU for 10 rooms with 10 clients each

### Memory Usage
- Store position per client: ~100 bytes
- Expected: <10KB per room with 50 clients

### Network Usage
- Correction message: ~100 bytes
- Frequency: Only when drift > threshold
- Expected: <10 messages/minute in stable conditions

## Troubleshooting

### Corrections Not Sent
- Check WebSocket connection is active
- Verify position reports are received
- Check `len(positions) >= minClients`
- Add debug logging in `CheckDrift()`

### Drift Not Converging
- Check client is actually applying corrections
- Verify adjustment rate is correct sign
- Increase adjustment strength
- Check for network instability (high jitter)

### False Positives
- Check network delay compensation is working
- Add moving average filter
- Increase drift threshold temporarily

## References

- Web client implementation: `web/src/services/livekitService.js`
- WebSocket protocol: `docs/phase-6-7-completion.md`
- Phase 7 requirements: Build prompt Phase 7

## Next Steps

1. Implement `drift_monitor.go` based on this guide
2. Add WebSocket message handlers
3. Update room manager to start monitoring
4. Add logging and metrics
5. Test with 3+ real devices
6. Tune parameters based on results
7. Document achieved sync accuracy

---

**Estimated Effort**: 2-3 days  
**Priority**: P1 (completes Phase 7)  
**Dependencies**: None (all client-side code complete)
