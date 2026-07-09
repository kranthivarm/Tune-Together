package room

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/tunetogether/realtime/internal/model"
)

// PlaybackState tracks the authoritative playback state of a room.
type PlaybackState struct {
	IsPlaying      bool    `json:"isPlaying"`
	CurrentTrackID string  `json:"currentTrackId"`
	TrackIndex     int     `json:"trackIndex"`
	PositionMs     float64 `json:"positionMs"`
	LastUpdateMs   int64   `json:"lastUpdateMs"`
}

// Room represents an active room with connected members and playback state.
type Room struct {
	Code         string
	mu           sync.RWMutex
	clients      map[string]*model.Client
	state        PlaybackState
	DriftMonitor *DriftMonitor

	hostID            string
	hostDisconnectedAt *time.Time
	hostGraceTimer     *time.Timer

	syncTicker *time.Ticker
	done       chan struct{}
}

// NewRoom creates a new room with the given code.
func NewRoom(code string) *Room {
	r := &Room{
		Code:    code,
		clients: make(map[string]*model.Client),
		state: PlaybackState{
			IsPlaying:  false,
			TrackIndex: -1,
		},
		DriftMonitor: NewDriftMonitor(code),
		done:         make(chan struct{}),
	}

	// Start periodic clock sync (every 7 seconds)
	r.syncTicker = time.NewTicker(7 * time.Second)
	go r.clockSyncLoop()

	// Start drift monitoring (every 3 seconds)
	r.DriftMonitor.StartMonitoring(3*time.Second, func(correction DriftCorrection) {
		r.sendDriftCorrection(correction)
	})

	return r
}

// ─── Client Lifecycle ───────────────────────────────────────────────────────

// AddClient registers a client in the room and broadcasts member_joined.
func (r *Room) AddClient(client *model.Client) {
	r.mu.Lock()
	r.clients[client.ID] = client
	memberCount := len(r.clients)
	
	// Track host ID
	if client.IsHost() {
		// If host reconnects during grace period, cancel timer
		if r.hostGraceTimer != nil {
			r.hostGraceTimer.Stop()
			r.hostGraceTimer = nil
			r.hostDisconnectedAt = nil
			log.Printf("[Room %s] Host reconnected, canceling grace period", r.Code)
		}
		r.hostID = client.ID
	}
	r.mu.Unlock()

	// Broadcast member_joined to all OTHER members
	payload := model.MemberJoinedPayload{
		UserID:      client.ID,
		DisplayName: client.DisplayName,
		Role:        client.Role,
		MemberCount: memberCount,
	}
	r.BroadcastExcept(model.MsgTypeMemberJoined, payload, client.ID)

	// If host reconnected, notify all members
	if client.IsHost() && r.hostDisconnectedAt != nil {
		r.Broadcast("host_reconnected", map[string]interface{}{
			"message": "Host has reconnected. Resuming playback...",
		})
	}

	// Send current room state to the new client
	r.sendRoomState(client)

	// Initiate clock sync immediately
	r.sendTimeSyncProbe(client)

	log.Printf("[Room %s] %s (%s) joined. Members: %d", r.Code, client.DisplayName, client.Role, memberCount)
}

// RemoveClient removes a client and broadcasts member_left.
func (r *Room) RemoveClient(clientID string) {
	r.mu.Lock()
	client, exists := r.clients[clientID]
	if !exists {
		r.mu.Unlock()
		return
	}
	
	isHost := client.IsHost()
	delete(r.clients, clientID)
	memberCount := len(r.clients)
	r.mu.Unlock()

	// Remove from drift monitor
	r.DriftMonitor.RemoveClient(clientID)

	client.Close()

	// Handle host disconnect with grace period
	if isHost {
		r.handleHostDisconnect()
	} else {
		// Regular member disconnect
		payload := model.MemberLeftPayload{
			UserID:      client.ID,
			DisplayName: client.DisplayName,
			MemberCount: memberCount,
		}
		r.Broadcast(model.MsgTypeMemberLeft, payload)
		log.Printf("[Room %s] %s left. Members: %d", r.Code, client.DisplayName, memberCount)
	}
}

// GetClient returns a client by userID.
func (r *Room) GetClient(userID string) (*model.Client, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.clients[userID]
	return c, ok
}

// MemberCount returns the number of connected members.
func (r *Room) MemberCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// IsEmpty returns true if no clients are connected.
func (r *Room) IsEmpty() bool {
	return r.MemberCount() == 0
}

// ─── Playback State ─────────────────────────────────────────────────────────

// GetState returns a copy of the current playback state.
func (r *Room) GetState() PlaybackState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.state
}

// ─── Message Handling ───────────────────────────────────────────────────────

// HandleMessage processes an incoming WebSocket message from a client.
func (r *Room) HandleMessage(client *model.Client, msg *model.Message) {
	switch msg.Type {
	case model.MsgTypePlay:
		r.handlePlay(client, msg.Payload)
	case model.MsgTypePause:
		r.handlePause(client, msg.Payload)
	case model.MsgTypeSeek:
		r.handleSeek(client, msg.Payload)
	case model.MsgTypeSkip:
		r.handleSkip(client, msg.Payload)
	case model.MsgTypeTrackChanged:
		r.handleTrackChanged(client, msg.Payload)
	case model.MsgTypeTimeSyncResponse:
		r.handleTimeSyncResponse(client, msg.Payload)
	case model.MsgTypePlaybackPositionReport:
		r.handlePositionReport(client, msg.Payload)
	case model.MsgTypePing:
		r.handlePing(client)
	default:
		r.sendError(client, "UNKNOWN_MESSAGE", "Unknown message type: "+msg.Type)
	}
}

// ─── Host-only control handlers ─────────────────────────────────────────────

func (r *Room) handlePlay(client *model.Client, payload json.RawMessage) {
	if !client.IsHost() {
		r.sendError(client, "FORBIDDEN", "Only the host can control playback")
		return
	}

	var p model.PlayPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		r.sendError(client, "INVALID_PAYLOAD", "Invalid play payload")
		return
	}

	now := nowMs()
	r.mu.Lock()
	r.state.IsPlaying = true
	r.state.CurrentTrackID = p.TrackID
	r.state.PositionMs = p.PositionMs
	r.state.LastUpdateMs = now
	r.mu.Unlock()

	r.Broadcast(model.MsgTypePlayBroadcast, p)
}

func (r *Room) handlePause(client *model.Client, payload json.RawMessage) {
	if !client.IsHost() {
		r.sendError(client, "FORBIDDEN", "Only the host can control playback")
		return
	}

	var p model.PausePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		r.sendError(client, "INVALID_PAYLOAD", "Invalid pause payload")
		return
	}

	now := nowMs()
	r.mu.Lock()
	r.state.IsPlaying = false
	r.state.PositionMs = p.PositionMs
	r.state.LastUpdateMs = now
	r.mu.Unlock()

	r.Broadcast(model.MsgTypePauseBroadcast, p)
}

func (r *Room) handleSeek(client *model.Client, payload json.RawMessage) {
	if !client.IsHost() {
		r.sendError(client, "FORBIDDEN", "Only the host can control playback")
		return
	}

	var p model.SeekPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		r.sendError(client, "INVALID_PAYLOAD", "Invalid seek payload")
		return
	}

	now := nowMs()
	r.mu.Lock()
	r.state.PositionMs = p.PositionMs
	r.state.LastUpdateMs = now
	r.mu.Unlock()

	r.Broadcast(model.MsgTypeSeekBroadcast, p)
}

func (r *Room) handleSkip(client *model.Client, payload json.RawMessage) {
	if !client.IsHost() {
		r.sendError(client, "FORBIDDEN", "Only the host can control playback")
		return
	}

	var p model.SkipPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		r.sendError(client, "INVALID_PAYLOAD", "Invalid skip payload")
		return
	}

	r.Broadcast(model.MsgTypeSkipBroadcast, p)
}

func (r *Room) handleTrackChanged(client *model.Client, payload json.RawMessage) {
	if !client.IsHost() {
		r.sendError(client, "FORBIDDEN", "Only the host can change tracks")
		return
	}

	var p model.TrackChangedPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		r.sendError(client, "INVALID_PAYLOAD", "Invalid track_changed payload")
		return
	}

	now := nowMs()
	r.mu.Lock()
	r.state.CurrentTrackID = p.TrackID
	r.state.TrackIndex = p.TrackIndex
	r.state.PositionMs = 0
	r.state.LastUpdateMs = now
	r.mu.Unlock()

	r.Broadcast(model.MsgTypeTrackChangedBroadcast, p)
}

// ─── Clock Sync (NTP-style) ────────────────────────────────────────────────

func (r *Room) handleTimeSyncResponse(client *model.Client, payload json.RawMessage) {
	var p model.TimeSyncResponsePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}

	t3 := nowMs()
	t0 := p.T0 // server send time
	t1 := p.T1 // client receive time
	t2 := p.T2 // client send time

	// NTP offset: ((t1 - t0) + (t2 - t3)) / 2
	offset := float64((t1-t0)+(t2-t3)) / 2.0
	// Round-trip time: (t3 - t0) - (t2 - t1)
	rtt := float64((t3 - t0) - (t2 - t1))

	client.AddClockSample(offset, rtt)

	// Send result back to client
	result := model.TimeSyncResultPayload{
		OffsetMs: client.GetClockOffset(),
		RTTMs:    rtt,
	}
	msg, _ := model.NewMessage(model.MsgTypeTimeSyncResult, result)
	client.SendMessage(msg)
}

func (r *Room) sendTimeSyncProbe(client *model.Client) {
	probe := model.TimeSyncServerPayload{
		T0: nowMs(),
	}
	msg, _ := model.NewMessage(model.MsgTypeTimeSyncServerResponse, probe)
	client.SendMessage(msg)
}

func (r *Room) clockSyncLoop() {
	for {
		select {
		case <-r.syncTicker.C:
			r.mu.RLock()
			for _, client := range r.clients {
				r.sendTimeSyncProbe(client)
			}
			r.mu.RUnlock()
		case <-r.done:
			return
		}
	}
}

// ─── Host Disconnect Handling ───────────────────────────────────────────────

// handleHostDisconnect handles host disconnection with 30-second grace period
func (r *Room) handleHostDisconnect() {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	r.hostDisconnectedAt = &now

	log.Printf("[Room %s] Host disconnected. Starting 30-second grace period", r.Code)

	// Notify all members
	r.Broadcast("host_disconnected", map[string]interface{}{
		"message":  "Host disconnected. Waiting for reconnection...",
		"waitTime": 30,
	})

	// Start 30-second grace period
	r.hostGraceTimer = time.AfterFunc(30*time.Second, func() {
		r.mu.Lock()
		// Check if host has reconnected
		_, hostReconnected := r.clients[r.hostID]
		if !hostReconnected && len(r.clients) > 0 {
			log.Printf("[Room %s] Host did not reconnect. Closing room", r.Code)
			r.mu.Unlock()
			
			// Notify all members
			r.Broadcast("room_closed", map[string]interface{}{
				"reason": "Host did not reconnect",
			})
			
			// Close the room
			r.Close()
		} else {
			r.mu.Unlock()
		}
	})
}

// ─── Drift Correction ───────────────────────────────────────────────────────

func (r *Room) handlePositionReport(client *model.Client, payload json.RawMessage) {
	var p model.PlaybackPositionReportPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}

	timestamp := p.Timestamp
	if timestamp == 0 {
		timestamp = nowMs()
	}

	// Process position report in drift monitor
	r.DriftMonitor.ProcessPositionReport(
		client.ID,
		int64(p.PositionMs),
		timestamp,
	)
}

func (r *Room) sendDriftCorrection(correction DriftCorrection) {
	client, ok := r.GetClient(correction.ClientID)
	if !ok {
		return
	}

	payload := model.DriftCorrectionPayload{
		TargetPositionMs: correction.TargetPositionMs,
		AdjustmentRate:   correction.AdjustmentRate,
	}

	msg, _ := model.NewMessage(model.MsgTypeDriftCorrection, payload)
	client.SendMessage(msg)
}

// ─── Ping/Pong ──────────────────────────────────────────────────────────────

func (r *Room) handlePing(client *model.Client) {
	msg, _ := model.NewMessage(model.MsgTypePong, nil)
	client.SendMessage(msg)
}

// ─── Broadcasting ───────────────────────────────────────────────────────────

// Broadcast sends a message to all connected clients.
func (r *Room) Broadcast(msgType string, payload interface{}) {
	msg, err := model.NewMessage(msgType, payload)
	if err != nil {
		log.Printf("[Room %s] broadcast marshal error: %v", r.Code, err)
		return
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, client := range r.clients {
		client.SendMessage(msg)
	}
}

// BroadcastExcept sends a message to all clients except the specified one.
func (r *Room) BroadcastExcept(msgType string, payload interface{}, excludeID string) {
	msg, err := model.NewMessage(msgType, payload)
	if err != nil {
		log.Printf("[Room %s] broadcast marshal error: %v", r.Code, err)
		return
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, client := range r.clients {
		if id != excludeID {
			client.SendMessage(msg)
		}
	}
}

// ─── Room State Sync ────────────────────────────────────────────────────────

func (r *Room) sendRoomState(client *model.Client) {
	r.mu.RLock()
	state := r.state
	members := make([]model.MemberInfo, 0, len(r.clients))
	for _, c := range r.clients {
		members = append(members, model.MemberInfo{
			UserID:      c.ID,
			DisplayName: c.DisplayName,
			Role:        c.Role,
			IsOnline:    true,
		})
	}
	r.mu.RUnlock()

	payload := model.RoomStatePayload{
		RoomCode:       r.Code,
		IsPlaying:      state.IsPlaying,
		CurrentTrackID: state.CurrentTrackID,
		TrackIndex:     state.TrackIndex,
		PositionMs:     state.PositionMs,
		LastUpdateMs:   state.LastUpdateMs,
		Members:        members,
		LiveKitToken:   client.LiveKitToken,
	}

	msg, _ := model.NewMessage(model.MsgTypeRoomState, payload)
	client.SendMessage(msg)
}

// ─── Error Helpers ──────────────────────────────────────────────────────────

func (r *Room) sendError(client *model.Client, code, message string) {
	payload := model.ErrorPayload{Code: code, Message: message}
	msg, _ := model.NewMessage(model.MsgTypeError, payload)
	client.SendMessage(msg)
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

// Close shuts down the room.
func (r *Room) Close() {
	r.mu.Lock()
	if r.hostGraceTimer != nil {
		r.hostGraceTimer.Stop()
	}
	r.mu.Unlock()

	r.syncTicker.Stop()
	r.DriftMonitor.StopMonitoring()
	close(r.done)

	r.mu.Lock()
	for id, client := range r.clients {
		client.Close()
		delete(r.clients, id)
	}
	r.mu.Unlock()

	log.Printf("[Room %s] closed", r.Code)
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}
