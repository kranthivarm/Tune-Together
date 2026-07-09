package room

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/tunetogether/realtime/internal/model"
)

func newTestClient(id, displayName, role, roomCode string) *model.Client {
	return &model.Client{
		ID:          id,
		DisplayName: displayName,
		Role:        role,
		RoomCode:    roomCode,
		Send:        make(chan []byte, 64),
		SyncSamples: make([]model.ClockSample, 0, 20),
	}
}

func drainSend(c *model.Client) [][]byte {
	var msgs [][]byte
	for {
		select {
		case data := <-c.Send:
			msgs = append(msgs, data)
		default:
			return msgs
		}
	}
}

func TestNewRoom(t *testing.T) {
	r := NewRoom("TT-TEST01")
	defer r.Close()

	if r.Code != "TT-TEST01" {
		t.Errorf("expected code TT-TEST01, got %s", r.Code)
	}
	if r.MemberCount() != 0 {
		t.Errorf("expected 0 members, got %d", r.MemberCount())
	}
	if !r.IsEmpty() {
		t.Error("expected room to be empty")
	}
}

func TestAddRemoveClient(t *testing.T) {
	r := NewRoom("TT-TEST02")
	defer r.Close()

	host := newTestClient("host-1", "Host", "HOST", "TT-TEST02")
	member := newTestClient("member-1", "Member", "MEMBER", "TT-TEST02")

	r.AddClient(host)
	if r.MemberCount() != 1 {
		t.Errorf("expected 1 member, got %d", r.MemberCount())
	}

	r.AddClient(member)
	if r.MemberCount() != 2 {
		t.Errorf("expected 2 members, got %d", r.MemberCount())
	}

	r.RemoveClient("member-1")
	if r.MemberCount() != 1 {
		t.Errorf("expected 1 member after remove, got %d", r.MemberCount())
	}

	r.RemoveClient("host-1")
	if !r.IsEmpty() {
		t.Error("expected room to be empty after removing all")
	}
}

func TestPlaybackState(t *testing.T) {
	r := NewRoom("TT-TEST03")
	defer r.Close()

	state := r.GetState()
	if state.IsPlaying {
		t.Error("expected initial state to not be playing")
	}
	if state.TrackIndex != -1 {
		t.Errorf("expected initial track index -1, got %d", state.TrackIndex)
	}
}

func TestHostOnlyAuthorization(t *testing.T) {
	r := NewRoom("TT-TEST04")
	defer r.Close()

	host := newTestClient("host-1", "Host", "HOST", "TT-TEST04")
	member := newTestClient("member-1", "Member", "MEMBER", "TT-TEST04")

	r.AddClient(host)
	r.AddClient(member)

	// Drain initial messages (room_state, time_sync, member_joined)
	time.Sleep(10 * time.Millisecond)
	drainSend(host)
	drainSend(member)

	// Member tries to play → should get error
	playMsg := model.MustMessage(model.MsgTypePlay, model.PlayPayload{
		TrackID: "track-1", PositionMs: 0, HostTimestamp: time.Now().UnixMilli(),
	})
	r.HandleMessage(member, playMsg)

	time.Sleep(10 * time.Millisecond)
	memberMsgs := drainSend(member)
	foundError := false
	for _, data := range memberMsgs {
		var msg model.Message
		if err := json.Unmarshal(data, &msg); err == nil {
			if msg.Type == model.MsgTypeError {
				foundError = true
				break
			}
		}
	}
	if !foundError {
		t.Error("expected member to receive error when trying to play")
	}

	// Host plays → should succeed and update state
	r.HandleMessage(host, playMsg)
	time.Sleep(10 * time.Millisecond)

	state := r.GetState()
	if !state.IsPlaying {
		t.Error("expected state to be playing after host play")
	}
	if state.CurrentTrackID != "track-1" {
		t.Errorf("expected track-1, got %s", state.CurrentTrackID)
	}
}

func TestBroadcast(t *testing.T) {
	r := NewRoom("TT-TEST05")
	defer r.Close()

	c1 := newTestClient("user-1", "User1", "HOST", "TT-TEST05")
	c2 := newTestClient("user-2", "User2", "MEMBER", "TT-TEST05")
	c3 := newTestClient("user-3", "User3", "MEMBER", "TT-TEST05")

	r.AddClient(c1)
	r.AddClient(c2)
	r.AddClient(c3)

	time.Sleep(10 * time.Millisecond)
	drainSend(c1)
	drainSend(c2)
	drainSend(c3)

	r.Broadcast("test_broadcast", map[string]string{"data": "hello"})
	time.Sleep(10 * time.Millisecond)

	for _, c := range []*model.Client{c1, c2, c3} {
		msgs := drainSend(c)
		if len(msgs) == 0 {
			t.Errorf("expected %s to receive broadcast", c.ID)
		}
	}
}

func TestBroadcastExcept(t *testing.T) {
	r := NewRoom("TT-TEST06")
	defer r.Close()

	c1 := newTestClient("user-1", "User1", "HOST", "TT-TEST06")
	c2 := newTestClient("user-2", "User2", "MEMBER", "TT-TEST06")

	r.AddClient(c1)
	r.AddClient(c2)

	time.Sleep(10 * time.Millisecond)
	drainSend(c1)
	drainSend(c2)

	r.BroadcastExcept("test_msg", map[string]string{"x": "y"}, "user-1")
	time.Sleep(10 * time.Millisecond)

	msgs1 := drainSend(c1)
	msgs2 := drainSend(c2)

	if len(msgs1) != 0 {
		t.Error("user-1 should not have received the broadcast")
	}
	if len(msgs2) == 0 {
		t.Error("user-2 should have received the broadcast")
	}
}

func TestClockSync(t *testing.T) {
	r := NewRoom("TT-TEST07")
	defer r.Close()

	c := newTestClient("user-1", "User1", "MEMBER", "TT-TEST07")
	r.AddClient(c)

	time.Sleep(10 * time.Millisecond)
	drainSend(c)

	now := time.Now().UnixMilli()
	syncResp := model.MustMessage(model.MsgTypeTimeSyncResponse, model.TimeSyncResponsePayload{
		T0: now - 50,
		T1: now - 45,
		T2: now - 40,
	})
	r.HandleMessage(c, syncResp)

	time.Sleep(10 * time.Millisecond)

	offset := c.GetClockOffset()
	t.Logf("Clock offset: %.2fms", offset)

	msgs := drainSend(c)
	foundResult := false
	for _, data := range msgs {
		var msg model.Message
		if err := json.Unmarshal(data, &msg); err == nil {
			if msg.Type == model.MsgTypeTimeSyncResult {
				foundResult = true
			}
		}
	}
	if !foundResult {
		t.Error("expected to receive time_sync_result")
	}
}

func TestRoomManager(t *testing.T) {
	m := NewManager()

	r1 := m.GetOrCreate("TT-ROOM01")
	if r1 == nil {
		t.Fatal("expected room to be created")
	}
	if m.RoomCount() != 1 {
		t.Errorf("expected 1 room, got %d", m.RoomCount())
	}

	// GetOrCreate same code returns same room
	r2 := m.GetOrCreate("TT-ROOM01")
	if r1 != r2 {
		t.Error("expected same room instance")
	}
	if m.RoomCount() != 1 {
		t.Errorf("expected still 1 room, got %d", m.RoomCount())
	}

	// Get existing
	r3 := m.Get("TT-ROOM01")
	if r3 == nil {
		t.Error("expected to find room")
	}

	// Get non-existing
	r4 := m.Get("TT-NOPE")
	if r4 != nil {
		t.Error("expected nil for non-existing room")
	}

	// Remove
	m.Remove("TT-ROOM01")
	if m.RoomCount() != 0 {
		t.Errorf("expected 0 rooms after remove, got %d", m.RoomCount())
	}
}
