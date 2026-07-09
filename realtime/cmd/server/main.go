package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/tunetogether/realtime/internal/auth"
	"github.com/tunetogether/realtime/internal/config"
	lksvc "github.com/tunetogether/realtime/internal/livekit"
	"github.com/tunetogether/realtime/internal/room"
	"github.com/tunetogether/realtime/internal/ws"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize components
	jwtValidator := auth.NewJWTValidator(cfg.JWTSecret)
	roomManager := room.NewManager()
	lkService := lksvc.NewService(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitSecret)
	wsHandler := ws.NewHandler(jwtValidator, roomManager, lkService)

	// Set up routes
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.Handle("GET /ws", wsHandler)

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ok",
			"service": "tunetogether-realtime",
			"rooms":   roomManager.RoomCount(),
		})
	})

	// Room stats endpoint (for monitoring/debugging)
	mux.HandleFunc("GET /stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(roomManager.Stats())
	})

	// Periodic cleanup of empty rooms (every 60 seconds)
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			roomManager.CleanupEmpty()
		}
	}()

	// Start server
	addr := ":" + cfg.Port
	log.Printf("TuneTogether Realtime Server starting on %s", addr)
	log.Printf("  LiveKit: %s", cfg.LiveKitHost)
	log.Printf("  WebSocket: ws://localhost%s/ws?token=<JWT>", addr)
	log.Printf("  Health: http://localhost%s/health", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
