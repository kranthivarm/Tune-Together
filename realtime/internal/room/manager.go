package room

import (
	"log"
	"sync"
)

// Manager tracks all active rooms in memory.
type Manager struct {
	mu    sync.RWMutex
	rooms map[string]*Room // roomCode → Room
}

// NewManager creates a new room manager.
func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

// GetOrCreate returns an existing room or creates a new one.
func (m *Manager) GetOrCreate(code string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[code]; ok {
		return r
	}

	r := NewRoom(code)
	m.rooms[code] = r
	log.Printf("[Manager] Created room %s. Total rooms: %d", code, len(m.rooms))
	return r
}

// Get returns an existing room or nil.
func (m *Manager) Get(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[code]
}

// Remove closes and removes a room.
func (m *Manager) Remove(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[code]; ok {
		r.Close()
		delete(m.rooms, code)
		log.Printf("[Manager] Removed room %s. Total rooms: %d", code, len(m.rooms))
	}
}

// CleanupEmpty removes all rooms with no connected clients.
func (m *Manager) CleanupEmpty() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for code, r := range m.rooms {
		if r.IsEmpty() {
			r.Close()
			delete(m.rooms, code)
			log.Printf("[Manager] Cleaned up empty room %s", code)
		}
	}
}

// RoomCount returns the number of active rooms.
func (m *Manager) RoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

// Stats returns room and connection statistics.
func (m *Manager) Stats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	totalMembers := 0
	roomStats := make([]map[string]interface{}, 0, len(m.rooms))
	for code, r := range m.rooms {
		mc := r.MemberCount()
		totalMembers += mc
		roomStats = append(roomStats, map[string]interface{}{
			"code":    code,
			"members": mc,
		})
	}

	return map[string]interface{}{
		"totalRooms":      len(m.rooms),
		"totalConnections": totalMembers,
		"rooms":           roomStats,
	}
}
