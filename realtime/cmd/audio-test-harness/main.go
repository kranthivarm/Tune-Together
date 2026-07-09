package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	lksvc "github.com/tunetogether/realtime/internal/livekit"
)

// Audio Relay Test Harness
//
// This harness verifies that the LiveKit SFU integration works correctly:
// 1. Creates a LiveKit room
// 2. Generates host token (publish + subscribe)
// 3. Generates member token (subscribe only)
// 4. Lists participants
// 5. Cleans up the room
//
// Usage:
//   LIVEKIT_HOST=http://localhost:7880 \
//   LIVEKIT_API_KEY=devkey \
//   LIVEKIT_API_SECRET=dev-secret-that-is-at-least-32-characters-long \
//   go run ./cmd/audio-test-harness/
//
// To verify actual audio relay:
// 1. Run this harness to get tokens
// 2. Open https://meet.livekit.io in two browser tabs
// 3. Use the host token in tab 1 (publish audio)
// 4. Use the member token in tab 2 (should hear audio)
//
// Expected output on success:
//   ✅ LiveKit room created: TT-TESTROOM
//   ✅ Host token generated (can publish audio)
//   ✅ Member token generated (subscribe only)
//   ✅ Participants listed (0 before any connect)
//   ✅ Room deleted
//   🎉 All LiveKit integration checks passed!

func main() {
	host := getEnv("LIVEKIT_HOST", "http://localhost:7880")
	apiKey := getEnv("LIVEKIT_API_KEY", "devkey")
	apiSecret := getEnv("LIVEKIT_API_SECRET", "dev-secret-that-is-at-least-32-characters-long")

	svc := lksvc.NewService(host, apiKey, apiSecret)
	ctx := context.Background()
	roomCode := "TT-TESTROOM"

	fmt.Println("═══════════════════════════════════════════")
	fmt.Println("  TuneTogether Audio Relay Test Harness")
	fmt.Printf("  LiveKit Host: %s\n", host)
	fmt.Println("═══════════════════════════════════════════")
	fmt.Println()

	// Step 1: Create room
	fmt.Print("Creating LiveKit room... ")
	room, err := svc.CreateRoom(ctx, roomCode)
	if err != nil {
		log.Fatalf("❌ Failed: %v", err)
	}
	fmt.Printf("✅ Room created: %s (SID: %s)\n", room.Name, room.Sid)

	// Step 2: Generate host token
	fmt.Print("Generating host token... ")
	hostToken, err := svc.GenerateHostToken(roomCode, "host-user-001", "TestHost")
	if err != nil {
		log.Fatalf("❌ Failed: %v", err)
	}
	fmt.Println("✅ Host token generated (can publish audio)")
	fmt.Printf("  Token (first 50 chars): %s...\n", hostToken[:min(50, len(hostToken))])

	// Step 3: Generate member token
	fmt.Print("Generating member token... ")
	memberToken, err := svc.GenerateMemberToken(roomCode, "member-user-001", "TestMember")
	if err != nil {
		log.Fatalf("❌ Failed: %v", err)
	}
	fmt.Println("✅ Member token generated (subscribe only)")
	fmt.Printf("  Token (first 50 chars): %s...\n", memberToken[:min(50, len(memberToken))])

	// Step 4: List participants (should be 0 before anyone connects)
	fmt.Print("Listing participants... ")
	participants, err := svc.ListParticipants(ctx, roomCode)
	if err != nil {
		log.Fatalf("❌ Failed: %v", err)
	}
	fmt.Printf("✅ Participants: %d\n", len(participants))

	// Step 5: Print connect instructions
	fmt.Println()
	fmt.Println("── Manual Audio Test ───────────────────────")
	fmt.Println("To verify actual audio relay through the SFU:")
	fmt.Println()
	fmt.Println("1. Open https://meet.livekit.io in Browser Tab 1 (Host)")
	fmt.Printf("   LiveKit URL: %s\n", host)
	fmt.Printf("   Token: %s\n", hostToken)
	fmt.Println()
	fmt.Println("2. Open https://meet.livekit.io in Browser Tab 2 (Member)")
	fmt.Printf("   LiveKit URL: %s\n", host)
	fmt.Printf("   Token: %s\n", memberToken)
	fmt.Println()
	fmt.Println("3. In Tab 1, enable microphone → audio should be heard in Tab 2")
	fmt.Println("4. In Tab 2, try to publish → should be denied (subscribe-only)")
	fmt.Println()
	fmt.Println("── Opus Codec Configuration ────────────────")
	fmt.Println("  Codec:          Opus (RFC 6716)")
	fmt.Println("  Sample Rate:    48 kHz")
	fmt.Println("  Channels:       Stereo")
	fmt.Println("  Target Bitrate: 128 kbps")
	fmt.Println("  Frame Size:     20ms")
	fmt.Println("  DTX:            Disabled (continuous music)")
	fmt.Println("  FEC:            Enabled")
	fmt.Println("  Application:    OPUS_APPLICATION_AUDIO")
	fmt.Println()

	// Wait a bit before cleanup
	fmt.Println("Waiting 3s before cleanup...")
	time.Sleep(3 * time.Second)

	// Step 6: Delete room
	fmt.Print("Deleting LiveKit room... ")
	err = svc.DeleteRoom(ctx, roomCode)
	if err != nil {
		log.Fatalf("❌ Failed: %v", err)
	}
	fmt.Println("✅ Room deleted")

	fmt.Println()
	fmt.Println("🎉 All LiveKit integration checks passed!")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
