package model

import (
	"encoding/json"
	"sync"
)

// ─── Message Types ──────────────────────────────────────────────────────────

// Client → Server message types
const (
	MsgTypePlay         = "play"
	MsgTypePause        = "pause"
	MsgTypeSeek         = "seek"
	MsgTypeSkip         = "skip"
	MsgTypeTrackChanged = "track_changed"

	MsgTypeTimeSyncRequest  = "time_sync_request"
	MsgTypeTimeSyncResponse = "time_sync_response"

	MsgTypePlaybackPositionReport = "playback_position_report"

	MsgTypePing = "ping"
)

// Server → Client message types
const (
	MsgTypePlayBroadcast         = "play"
	MsgTypePauseBroadcast        = "pause"
	MsgTypeSeekBroadcast         = "seek"
	MsgTypeSkipBroadcast         = "skip"
	MsgTypeTrackChangedBroadcast = "track_changed"

	MsgTypeMemberJoined = "member_joined"
	MsgTypeMemberLeft   = "member_left"

	MsgTypeRoomState = "room_state"

	MsgTypeTimeSyncServerResponse = "time_sync_response"
	MsgTypeTimeSyncResult         = "time_sync_result"

	MsgTypeDriftCorrection = "drift_correction"

	MsgTypePong  = "pong"
	MsgTypeError = "error"
)

// ─── Base Message ───────────────────────────────────────────────────────────

// Message is the envelope for all WebSocket messages.
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// ─── Payloads ───────────────────────────────────────────────────────────────

type PlayPayload struct {
	TrackID       string  `json:"trackId"`
	PositionMs    float64 `json:"positionMs"`
	HostTimestamp int64   `json:"hostTimestamp"`
}

type PausePayload struct {
	PositionMs    float64 `json:"positionMs"`
	HostTimestamp int64   `json:"hostTimestamp"`
}

type SeekPayload struct {
	PositionMs    float64 `json:"positionMs"`
	HostTimestamp int64   `json:"hostTimestamp"`
}

type SkipPayload struct {
	Direction string `json:"direction"`
}

type TrackChangedPayload struct {
	TrackID    string  `json:"trackId"`
	TrackIndex int     `json:"trackIndex"`
	Title      string  `json:"title"`
	Artist     string  `json:"artist"`
	DurationMs float64 `json:"durationMs"`
}

type TimeSyncRequestPayload struct {
	T0 int64 `json:"t0"`
}

type TimeSyncResponsePayload struct {
	T0 int64 `json:"t0"`
	T1 int64 `json:"t1"`
	T2 int64 `json:"t2"`
}

type MemberJoinedPayload struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	MemberCount int    `json:"memberCount"`
}

type MemberLeftPayload struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	MemberCount int    `json:"memberCount"`
}

type RoomStatePayload struct {
	RoomCode       string       `json:"roomCode"`
	IsPlaying      bool         `json:"isPlaying"`
	CurrentTrackID string       `json:"currentTrackId,omitempty"`
	TrackIndex     int          `json:"trackIndex"`
	PositionMs     float64      `json:"positionMs"`
	LastUpdateMs   int64        `json:"lastUpdateMs"`
	Members        []MemberInfo `json:"members"`
	LiveKitToken   string       `json:"livekitToken,omitempty"`
}

type MemberInfo struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	IsOnline    bool   `json:"isOnline"`
}

type TimeSyncServerPayload struct {
	T0 int64 `json:"t0"`
}

type TimeSyncResultPayload struct {
	OffsetMs float64 `json:"offsetMs"`
	RTTMs    float64 `json:"rttMs"`
}

type PlaybackPositionReportPayload struct {
	PositionMs float64 `json:"positionMs"`
	Timestamp  int64   `json:"timestamp"`
}

type DriftCorrectionPayload struct {
	TargetPositionMs int64   `json:"targetPositionMs"`
	AdjustmentRate   float64 `json:"adjustmentRate"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ─── Message Helpers ────────────────────────────────────────────────────────

func NewMessage(msgType string, payload interface{}) (*Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &Message{
		Type:    msgType,
		Payload: json.RawMessage(data),
	}, nil
}

func MustMessage(msgType string, payload interface{}) *Message {
	msg, err := NewMessage(msgType, payload)
	if err != nil {
		panic(err)
	}
	return msg
}

// ─── Client Interface ───────────────────────────────────────────────────────
// Defined here to break the import cycle between ws and room packages.

// Client represents a connected WebSocket client for the room to interact with.
type Client struct {
	ID           string
	DisplayName  string
	Role         string // HOST or MEMBER
	RoomCode     string
	LiveKitToken string

	// Outbound message channel
	Send chan []byte

	// Clock sync state
	ClockOffset  float64
	ClockRTT     float64
	SyncSamples  []ClockSample
	Mu           sync.RWMutex

	// Close tracking
	Closed  bool
	CloseMu sync.Mutex
}

type ClockSample struct {
	Offset float64
	RTT    float64
}

// IsHost returns true if this client is the room host.
func (c *Client) IsHost() bool {
	return c.Role == "HOST"
}

// SendMessage sends a typed message to this client.
func (c *Client) SendMessage(msg *Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.CloseMu.Lock()
	defer c.CloseMu.Unlock()
	if c.Closed {
		return nil
	}
	select {
	case c.Send <- data:
		return nil
	default:
		return nil
	}
}

// Close marks the client as closed and closes the send channel.
func (c *Client) Close() {
	c.CloseMu.Lock()
	defer c.CloseMu.Unlock()
	if !c.Closed {
		c.Closed = true
		close(c.Send)
	}
}

// AddClockSample adds a clock sync measurement and computes median offset.
func (c *Client) AddClockSample(offset, rtt float64) {
	c.Mu.Lock()
	defer c.Mu.Unlock()

	c.SyncSamples = append(c.SyncSamples, ClockSample{Offset: offset, RTT: rtt})

	if len(c.SyncSamples) > 10 {
		c.SyncSamples = c.SyncSamples[len(c.SyncSamples)-10:]
	}

	c.ClockOffset = medianOffset(c.SyncSamples)
	c.ClockRTT = rtt
}

// GetClockOffset returns the current smoothed clock offset.
func (c *Client) GetClockOffset() float64 {
	c.Mu.RLock()
	defer c.Mu.RUnlock()
	return c.ClockOffset
}

// medianOffset computes the median from clock samples.
func medianOffset(samples []ClockSample) float64 {
	if len(samples) == 0 {
		return 0
	}
	offsets := make([]float64, len(samples))
	for i, s := range samples {
		offsets[i] = s.Offset
	}
	// Insertion sort (small N)
	for i := 1; i < len(offsets); i++ {
		key := offsets[i]
		j := i - 1
		for j >= 0 && offsets[j] > key {
			offsets[j+1] = offsets[j]
			j--
		}
		offsets[j+1] = key
	}
	mid := len(offsets) / 2
	if len(offsets)%2 == 0 {
		return (offsets[mid-1] + offsets[mid]) / 2
	}
	return offsets[mid]
}
