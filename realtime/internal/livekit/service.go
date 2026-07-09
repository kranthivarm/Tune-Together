package livekit

import (
	"context"
	"fmt"
	"log"
	"time"

	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
)

// Service manages LiveKit room lifecycle and token generation.
type Service struct {
	host      string
	apiKey    string
	apiSecret string
	roomClient *lksdk.RoomServiceClient
}

// NewService creates a new LiveKit service.
func NewService(host, apiKey, apiSecret string) *Service {
	roomClient := lksdk.NewRoomServiceClient(host, apiKey, apiSecret)

	return &Service{
		host:       host,
		apiKey:     apiKey,
		apiSecret:  apiSecret,
		roomClient: roomClient,
	}
}

// CreateRoom creates a LiveKit room for audio streaming.
// Called when a TuneTogether room becomes active.
func (s *Service) CreateRoom(ctx context.Context, roomCode string) (*livekit.Room, error) {
	room, err := s.roomClient.CreateRoom(ctx, &livekit.CreateRoomRequest{
		Name:         roomCode,
		EmptyTimeout: 300,    // 5 minutes
		MaxParticipants: 50,  // Room size limit
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create LiveKit room %s: %w", roomCode, err)
	}

	log.Printf("[LiveKit] Created room %s", roomCode)
	return room, nil
}

// DeleteRoom destroys a LiveKit room.
// Called when a TuneTogether room is closed.
func (s *Service) DeleteRoom(ctx context.Context, roomCode string) error {
	_, err := s.roomClient.DeleteRoom(ctx, &livekit.DeleteRoomRequest{
		Room: roomCode,
	})
	if err != nil {
		return fmt.Errorf("failed to delete LiveKit room %s: %w", roomCode, err)
	}

	log.Printf("[LiveKit] Deleted room %s", roomCode)
	return nil
}

// GenerateHostToken creates a LiveKit join token for the host.
// The host can PUBLISH audio tracks and use data channels.
func (s *Service) GenerateHostToken(roomCode, userID, displayName string) (string, error) {
	at := auth.NewAccessToken(s.apiKey, s.apiSecret)
	grant := &auth.VideoGrant{
		Room:     roomCode,
		RoomJoin: true,
		// Host can publish audio (not video) and subscribe
		CanPublish:     boolPtr(true),
		CanPublishData: boolPtr(true),
		CanSubscribe:   boolPtr(true),
		// Restrict to audio only
		CanPublishSources: []string{"microphone", "screen_share_audio"},
	}

	at.SetVideoGrant(grant).
		SetIdentity(userID).
		SetName(displayName).
		SetValidFor(24 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		return "", fmt.Errorf("failed to generate host LiveKit token: %w", err)
	}

	log.Printf("[LiveKit] Generated host token for %s in room %s", displayName, roomCode)
	return token, nil
}

// GenerateMemberToken creates a LiveKit join token for a member.
// Members can only SUBSCRIBE (receive audio), not publish.
func (s *Service) GenerateMemberToken(roomCode, userID, displayName string) (string, error) {
	at := auth.NewAccessToken(s.apiKey, s.apiSecret)
	grant := &auth.VideoGrant{
		Room:           roomCode,
		RoomJoin:       true,
		CanPublish:     boolPtr(false), // Members cannot publish
		CanPublishData: boolPtr(false),
		CanSubscribe:   boolPtr(true),  // Members can subscribe (receive audio)
	}

	at.SetVideoGrant(grant).
		SetIdentity(userID).
		SetName(displayName).
		SetValidFor(24 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		return "", fmt.Errorf("failed to generate member LiveKit token: %w", err)
	}

	log.Printf("[LiveKit] Generated member token for %s in room %s", displayName, roomCode)
	return token, nil
}

// GenerateToken creates an appropriate token based on role.
func (s *Service) GenerateToken(roomCode, userID, displayName, role string) (string, error) {
	if role == "HOST" {
		return s.GenerateHostToken(roomCode, userID, displayName)
	}
	return s.GenerateMemberToken(roomCode, userID, displayName)
}

// ListParticipants returns the current participants in a LiveKit room.
func (s *Service) ListParticipants(ctx context.Context, roomCode string) ([]*livekit.ParticipantInfo, error) {
	resp, err := s.roomClient.ListParticipants(ctx, &livekit.ListParticipantsRequest{
		Room: roomCode,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list participants in room %s: %w", roomCode, err)
	}
	return resp.Participants, nil
}

func boolPtr(b bool) *bool {
	return &b
}
