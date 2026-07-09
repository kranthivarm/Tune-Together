package room

import (
	"log"
	"math"
	"sync"
	"time"
)

// ClientPosition represents a client's reported playback position
type ClientPosition struct {
	ClientID   string
	Position   int64 // Position in milliseconds
	Timestamp  int64 // Unix timestamp in milliseconds
	ReceivedAt int64 // Server received timestamp
}

// DriftCorrection represents a correction command to send to a client
type DriftCorrection struct {
	ClientID         string
	TargetPositionMs int64
	AdjustmentRate   float64
	DriftMs          int64
}

// DriftMetrics tracks drift statistics for monitoring
type DriftMetrics struct {
	TotalCorrections   int64
	AvgDriftMs         float64
	MaxDriftMs         int64
	ClientsDrifting    int
	LastCorrectionTime time.Time
}

// DriftMonitor tracks playback positions and detects drift
type DriftMonitor struct {
	mu             sync.RWMutex
	roomID         string
	positions      map[string]*ClientPosition
	driftThreshold int64 // Default: 30ms
	minClients     int   // Minimum clients needed for comparison
	lastCheck      time.Time
	metrics        DriftMetrics
	ticker         *time.Ticker
	done           chan struct{}
	correctionFunc func(DriftCorrection)
}

// NewDriftMonitor creates a new drift monitor for a room
func NewDriftMonitor(roomID string) *DriftMonitor {
	return &DriftMonitor{
		roomID:         roomID,
		positions:      make(map[string]*ClientPosition),
		driftThreshold: 30,  // 30ms threshold
		minClients:     2,   // Need at least 2 clients to compare
		lastCheck:      time.Now(),
		done:           make(chan struct{}),
	}
}

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
	totalDrift := int64(0)
	maxDrift := int64(0)

	for clientID, pos := range dm.positions {
		drift := pos.Position - avgPosition
		driftAbs := int64(math.Abs(float64(drift)))

		totalDrift += driftAbs
		if driftAbs > maxDrift {
			maxDrift = driftAbs
		}

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

	// Update metrics
	if len(corrections) > 0 {
		dm.metrics.TotalCorrections += int64(len(corrections))
		dm.metrics.ClientsDrifting = len(corrections)
		dm.metrics.MaxDriftMs = maxDrift
		if len(dm.positions) > 0 {
			dm.metrics.AvgDriftMs = float64(totalDrift) / float64(len(dm.positions))
		}
		dm.metrics.LastCorrectionTime = time.Now()
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

		// Add time since received (for late processing)
		timeSinceReceived := now - pos.ReceivedAt
		if timeSinceReceived > 0 {
			estimatedPosition += timeSinceReceived
		}

		sum += estimatedPosition
		count++
	}

	return sum / count
}

// StartMonitoring starts continuous drift monitoring for the room
func (dm *DriftMonitor) StartMonitoring(interval time.Duration, callback func(DriftCorrection)) {
	dm.mu.Lock()
	dm.correctionFunc = callback
	dm.ticker = time.NewTicker(interval)
	dm.mu.Unlock()

	go func() {
		for {
			select {
			case <-dm.ticker.C:
				corrections := dm.CheckDrift()
				for _, correction := range corrections {
					if callback != nil {
						callback(correction)
					}
					log.Printf("[DriftMonitor %s] Client %s drift %dms, rate %.4f",
						dm.roomID,
						correction.ClientID,
						correction.DriftMs,
						correction.AdjustmentRate,
					)
				}
			case <-dm.done:
				return
			}
		}
	}()
}

// StopMonitoring stops the drift monitoring loop
func (dm *DriftMonitor) StopMonitoring() {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.ticker != nil {
		dm.ticker.Stop()
	}
	close(dm.done)
}

// GetMetrics returns current drift statistics
func (dm *DriftMonitor) GetMetrics() DriftMetrics {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return dm.metrics
}

// LogMetrics logs current drift metrics for monitoring
func (dm *DriftMonitor) LogMetrics() {
	dm.mu.RLock()
	defer dm.mu.RUnlock()

	log.Printf("[DriftMonitor %s] Metrics: avg=%.1fms, max=%dms, corrections=%d, clients_drifting=%d",
		dm.roomID,
		dm.metrics.AvgDriftMs,
		dm.metrics.MaxDriftMs,
		dm.metrics.TotalCorrections,
		dm.metrics.ClientsDrifting,
	)
}
