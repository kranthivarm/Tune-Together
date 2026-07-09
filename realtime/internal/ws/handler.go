package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/tunetogether/realtime/internal/auth"
	lksvc "github.com/tunetogether/realtime/internal/livekit"
	"github.com/tunetogether/realtime/internal/model"
	"github.com/tunetogether/realtime/internal/room"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in dev
	},
}

// Handler handles WebSocket upgrade requests and manages the read loop.
type Handler struct {
	validator   *auth.JWTValidator
	roomManager *room.Manager
	lkService   *lksvc.Service
	rateLimiter *RateLimiter
}

// NewHandler creates a new WebSocket handler.
func NewHandler(validator *auth.JWTValidator, roomManager *room.Manager, lkService *lksvc.Service) *Handler {
	return &Handler{
		validator:   validator,
		roomManager: roomManager,
		lkService:   lkService,
		rateLimiter: NewRateLimiter(30.0, 60), // 30 messages/sec, burst 60
	}
}

// ServeHTTP handles the WebSocket upgrade and connection lifecycle.
//
// Connection flow:
//  1. Client connects to ws://host:8081/ws?token=<JWT>
//  2. JWT is validated (same secret as Spring Boot)
//  3. Client is registered in the room (or reconnected)
//  4. Room state + LiveKit token are sent immediately
//  5. Clock sync probe is sent immediately
//  6. Read loop processes messages until disconnect
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Extract token from query parameter
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"Missing token parameter"}`, http.StatusUnauthorized)
		return
	}

	// Validate JWT
	claims, err := h.validator.Validate(tokenStr)
	if err != nil {
		log.Printf("[WS] Auth failed: %v", err)
		http.Error(w, `{"error":"UNAUTHORIZED","message":"Invalid or expired token"}`, http.StatusUnauthorized)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade failed: %v", err)
		return
	}

	// Create client
	client := &model.Client{
		ID:          claims.UserID(),
		DisplayName: claims.DisplayName,
		Role:        claims.Role,
		RoomCode:    claims.RoomCode,
		Send:        make(chan []byte, 64),
		SyncSamples: make([]model.ClockSample, 0, 20),
	}

	// Generate LiveKit token for this client
	if h.lkService != nil {
		lkToken, err := h.lkService.GenerateToken(
			claims.RoomCode, claims.UserID(), claims.DisplayName, claims.Role)
		if err != nil {
			log.Printf("[WS] LiveKit token generation failed: %v", err)
		} else {
			client.LiveKitToken = lkToken
		}

		// Ensure LiveKit room exists
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.lkService.CreateRoom(ctx, claims.RoomCode)
	}

	// Get or create room and add client
	rm := h.roomManager.GetOrCreate(claims.RoomCode)
	rm.AddClient(client)

	// Start write pump
	go writePump(conn, client)

	// Run read loop (blocks until disconnect)
	readLoop(conn, client, rm, h)

	// Cleanup on disconnect
	rm.RemoveClient(client.ID)
	
	// Remove from rate limiter
	if h.rateLimiter != nil {
		h.rateLimiter.RemoveClient(client.ID)
	}

	// If room is empty, clean up
	if rm.IsEmpty() {
		h.roomManager.Remove(rm.Code)

		// Clean up LiveKit room
		if h.lkService != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			h.lkService.DeleteRoom(ctx, rm.Code)
		}
	}
}

// writePump pumps messages from the Send channel to the WebSocket connection.
func writePump(conn *websocket.Conn, client *model.Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case data, ok := <-client.Send:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("[Client %s] write error: %v", client.ID, err)
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readLoop reads messages from the WebSocket and dispatches to the room.
func readLoop(conn *websocket.Conn, client *model.Client, rm *room.Room, handler *Handler) {
	defer conn.Close()

	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseNormalClosure,
				websocket.CloseNoStatusReceived) {
				log.Printf("[WS] %s read error: %v", client.ID, err)
			}
			return
		}

		// Rate limiting check
		if handler.rateLimiter != nil && !handler.rateLimiter.Allow(client.ID) {
			log.Printf("[WS] %s rate limit exceeded", client.ID)
			// Send rate limit error
			errMsg := model.ErrorPayload{
				Code:    "RATE_LIMIT_EXCEEDED",
				Message: "Too many messages. Please slow down.",
			}
			msg, _ := model.NewMessage(model.MsgTypeError, errMsg)
			client.SendMessage(msg)
			continue
		}

		var msg model.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("[WS] %s invalid message: %v", client.ID, err)
			continue
		}

		rm.HandleMessage(client, &msg)
	}
}
