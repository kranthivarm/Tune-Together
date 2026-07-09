package ws

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter provides per-client rate limiting for WebSocket messages
type RateLimiter struct {
	limiters map[string]*rate.Limiter
	mu       sync.RWMutex
	
	// Configuration
	messagesPerSecond rate.Limit
	burstSize         int
	
	// Cleanup
	cleanupInterval time.Duration
	lastAccess      map[string]time.Time
}

// NewRateLimiter creates a new rate limiter
// messagesPerSecond: maximum sustained rate
// burstSize: maximum burst allowance
func NewRateLimiter(messagesPerSecond float64, burstSize int) *RateLimiter {
	rl := &RateLimiter{
		limiters:          make(map[string]*rate.Limiter),
		lastAccess:        make(map[string]time.Time),
		messagesPerSecond: rate.Limit(messagesPerSecond),
		burstSize:         burstSize,
		cleanupInterval:   5 * time.Minute,
	}
	
	// Start cleanup goroutine
	go rl.cleanupLoop()
	
	return rl
}

// Allow checks if a message from clientID should be allowed
func (rl *RateLimiter) Allow(clientID string) bool {
	rl.mu.RLock()
	limiter, exists := rl.limiters[clientID]
	rl.mu.RUnlock()

	if !exists {
		rl.mu.Lock()
		// Double-check after acquiring write lock
		limiter, exists = rl.limiters[clientID]
		if !exists {
			limiter = rate.NewLimiter(rl.messagesPerSecond, rl.burstSize)
			rl.limiters[clientID] = limiter
		}
		rl.lastAccess[clientID] = time.Now()
		rl.mu.Unlock()
	} else {
		// Update last access time
		rl.mu.Lock()
		rl.lastAccess[clientID] = time.Now()
		rl.mu.Unlock()
	}

	return limiter.Allow()
}

// RemoveClient removes rate limiter for a disconnected client
func (rl *RateLimiter) RemoveClient(clientID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	delete(rl.limiters, clientID)
	delete(rl.lastAccess, clientID)
}

// cleanupLoop periodically removes stale limiters
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		rl.cleanup()
	}
}

// cleanup removes limiters for clients that haven't sent messages recently
func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	staleThreshold := 10 * time.Minute

	for clientID, lastTime := range rl.lastAccess {
		if now.Sub(lastTime) > staleThreshold {
			delete(rl.limiters, clientID)
			delete(rl.lastAccess, clientID)
		}
	}
}

// Stats returns current rate limiter statistics
func (rl *RateLimiter) Stats() map[string]interface{} {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	return map[string]interface{}{
		"active_limiters":     len(rl.limiters),
		"messages_per_second": float64(rl.messagesPerSecond),
		"burst_size":          rl.burstSize,
	}
}
