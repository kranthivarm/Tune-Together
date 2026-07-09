# Phase 8: Hardening & Polish Implementation Plan

## Overview

Phase 8 focuses on production readiness through comprehensive error handling, security hardening, rate limiting, and documentation.

## 1. Error Handling Strategy

### Host Disconnect Strategy: **Pause Playback**

**Decision**: When host disconnects, pause playback and wait for reconnection (30 seconds).

**Rationale**:
- Simpler than host promotion (no state transfer complexity)
- Preserves room state and playlist
- Host typically reconnects quickly
- Can always manually close room if needed

**Implementation**:
```
Host Disconnects
    ↓
30-second grace period
    ↓
    ├─→ Host Reconnects → Resume playback
    └─→ Timeout → Close room, notify members
```

### Error Categories

| Error Type | Handling Strategy |
|---|---|
| **Room Not Found** | Return 404 with clear message |
| **Wrong Password** | Return 401, rate limit attempts |
| **Host Disconnect** | Pause playback, 30s grace period |
| **Network Drop** | Auto-reconnect with exponential backoff |
| **Invalid Token** | Return 403, require re-authentication |
| **Rate Limit Hit** | Return 429 with retry-after header |
| **SFU Publish Denied** | Block non-hosts, log attempt |

## 2. Security Hardening

### Authentication & Authorization

#### Room Password Security
```java
// Spring Boot - BCrypt with 10 rounds
@Service
public class RoomService {
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
    
    public void validatePassword(String password, String hash) {
        if (!encoder.matches(password, hash)) {
            // Rate limit this check
            throw new InvalidPasswordException();
        }
    }
}
```

#### JWT Token Scoping
```java
// Existing token includes role (HOST/MEMBER)
// LiveKit token must enforce this
@Service
public class LiveKitTokenService {
    public String generateToken(String roomCode, String userId, boolean isHost) {
        AccessToken token = new AccessToken(apiKey, apiSecret);
        
        VideoGrant grant = new VideoGrant();
        grant.setRoomJoin(true);
        grant.setRoom(roomCode);
        grant.setCanPublish(isHost);      // ✅ Only host can publish
        grant.setCanSubscribe(true);      // Everyone can subscribe
        
        token.addGrant(grant);
        token.setIdentity(userId);
        return token.toJwt();
    }
}
```

#### WebSocket Authentication
```go
// Go - Validate JWT before WebSocket upgrade
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    token := r.URL.Query().Get("token")
    
    claims, err := h.jwtService.ValidateToken(token)
    if err != nil {
        http.Error(w, "Unauthorized", 401)
        return
    }
    
    // Upgrade to WebSocket
    conn, err := h.upgrader.Upgrade(w, r, nil)
    // ... associate claims with connection
}
```

## 3. Rate Limiting

### REST API (Spring Boot)

Use Bucket4j library:

```java
@Component
public class RateLimitFilter implements Filter {
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) {
        String clientIP = getClientIP(request);
        Bucket bucket = buckets.computeIfAbsent(clientIP, this::createBucket);
        
        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            ((HttpServletResponse) response).setStatus(429);
            ((HttpServletResponse) response).getWriter()
                .write("{\"error\":\"Rate limit exceeded\"}");
        }
    }
    
    private Bucket createBucket(String key) {
        // 100 requests per minute
        Bandwidth limit = Bandwidth.simple(100, Duration.ofMinutes(1));
        return Bucket4j.builder().addLimit(limit).build();
    }
}
```

### WebSocket (Go)

```go
type RateLimiter struct {
    clients map[string]*rate.Limiter
    mu      sync.RWMutex
}

func (rl *RateLimiter) Allow(clientID string) bool {
    rl.mu.RLock()
    limiter, exists := rl.clients[clientID]
    rl.mu.RUnlock()
    
    if !exists {
        rl.mu.Lock()
        // 30 messages per second per client
        limiter = rate.NewLimiter(30, 60)
        rl.clients[clientID] = limiter
        rl.mu.Unlock()
    }
    
    return limiter.Allow()
}
```

## 4. Error Handling Implementation

### Spring Boot Error Handlers

Already implemented in `GlobalExceptionHandler.java`, but add:

```java
@ExceptionHandler(RateLimitExceededException.class)
public ResponseEntity<ErrorResponse> handleRateLimit(RateLimitExceededException ex) {
    return ResponseEntity
        .status(429)
        .header("Retry-After", "60")
        .body(new ErrorResponse("Rate limit exceeded. Try again in 60 seconds."));
}

@ExceptionHandler(HostDisconnectedException.class)
public ResponseEntity<ErrorResponse> handleHostDisconnect(HostDisconnectedException ex) {
    return ResponseEntity
        .status(503)
        .body(new ErrorResponse("Host is temporarily disconnected. Waiting for reconnection..."));
}
```

### Go WebSocket Error Handling

```go
func (h *Handler) handleClientDisconnect(client *Client) {
    room := h.roomManager.GetRoom(client.RoomID)
    if room == nil {
        return
    }
    
    if client.IsHost {
        // Host disconnected - pause playback
        h.broadcastToRoom(client.RoomID, Message{
            Type: "hostDisconnected",
            Payload: map[string]interface{}{
                "message": "Host disconnected. Pausing playback...",
                "waitTime": 30,
            },
        })
        
        // Start 30-second grace period
        time.AfterFunc(30*time.Second, func() {
            if !h.isClientReconnected(client.ID) {
                h.closeRoom(client.RoomID)
                h.broadcastToRoom(client.RoomID, Message{
                    Type: "roomClosed",
                    Payload: map[string]interface{}{
                        "reason": "Host did not reconnect",
                    },
                })
            }
        })
    } else {
        // Member disconnected - just notify
        h.broadcastToRoom(client.RoomID, Message{
            Type: "memberLeft",
            Payload: map[string]interface{}{
                "userId": client.UserID,
                "displayName": client.DisplayName,
            },
        })
    }
}
```

### Mobile/Web Reconnection Logic

Already implemented with exponential backoff in:
- `mobile/lib/services/websocket_service.dart`
- `web/src/services/websocketService.js`

Add UI feedback:

```dart
// Flutter
void _showReconnectingSnackbar() {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          CircularProgressIndicator(),
          SizedBox(width: 16),
          Text('Reconnecting...'),
        ],
      ),
      duration: Duration(seconds: 30),
    ),
  );
}
```

## 5. Security Checklist

- [x] Room passwords hashed with BCrypt
- [x] JWT tokens scoped per room
- [ ] LiveKit tokens enforce publish permissions
- [ ] Rate limiting on password attempts
- [ ] Rate limiting on room creation
- [ ] Rate limiting on WebSocket messages
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (JPA parameterized queries)
- [ ] XSS prevention (React auto-escapes)
- [ ] CORS configured properly
- [ ] HTTPS in production (deployment concern)

## 6. Known Limitations Documentation

### Create LIMITATIONS.md

```markdown
# Known Limitations

## Platform Limitations

### iOS Device Audio Mirroring
**Status**: Not Supported  
**Reason**: iOS does not provide system-level audio capture APIs to third-party apps  
**Workaround**: Use Android device as host for mirror mode  
**Future**: No ETA (depends on Apple policy changes)

### Web Client Hosting
**Status**: Not Supported in v1  
**Reason**: Browser security sandbox prevents system audio capture and arbitrary file access  
**Workaround**: Use mobile app to host, web to listen  
**Future**: May add limited web hosting with user-selected files

## Performance Limitations

### Maximum Tested Room Size
**Current**: 50 concurrent members  
**Limit**: Network bandwidth and server CPU  
**Symptoms**: Increased latency, drift correction frequency  
**Recommendation**: Keep rooms under 30 members for best experience

### Audio Sync Accuracy
**Target**: <30ms drift  
**Typical**: 10-20ms on same WiFi network  
**Degraded**: 30-100ms on poor networks (3G, congested WiFi)  
**Factors**: Network latency, device performance, distance from server

### Storage Requirements
**Mobile**: ~50MB app size, no audio storage (streaming only)  
**Web**: ~500KB initial load  
**Server**: ~100KB per room (metadata only)

## Feature Limitations

### Playlist Management
**Host Only**: Add, reorder, remove tracks  
**Members**: View-only  
**Reason**: Prevent playlist chaos  
**Future**: May add collaborative playlists with voting

### Audio Formats
**Supported**: MP3, M4A, AAC, FLAC, WAV  
**Unsupported**: DRM-protected files, streaming URLs  
**Reason**: Local file playback only  
**Workaround**: Convert files or download first

### Offline Mode
**Status**: Not Available  
**Reason**: Requires real-time sync  
**Workaround**: None (design limitation)

## Security Limitations

### Room Persistence
**Duration**: Rooms close when host leaves or 24 hours  
**No History**: Rooms are ephemeral, no playback history stored  
**Reason**: Privacy by design

### Password Strength
**Minimum**: No enforced minimum (UX choice)  
**Recommendation**: Use 6+ character passwords  
**Implementation**: BCrypt hashing with 10 rounds

### User Accounts
**v1**: No persistent user accounts  
**Limitation**: Cannot remember preferences, favorites  
**Future**: Optional account system planned

## Network Limitations

### Firewall Compatibility
**Requires**: UDP ports for WebRTC  
**May Fail**: Corporate networks, restrictive firewalls  
**Workaround**: Use TURN server (increases latency)

### Bandwidth Requirements
**Audio Streaming**: ~100 KB/s per listener  
**Signaling**: <1 KB/s per client  
**Recommendation**: WiFi or 4G/5G, avoid 3G

## Deployment Limitations

### Self-Hosting Requirements
**Backend**: Docker, 2GB RAM, 2 CPU cores  
**LiveKit**: Additional 1GB RAM, 1 CPU core  
**Database**: PostgreSQL 16+, Redis 7+  
**Complexity**: Moderate (for developers)

### Cloud Hosting
**Recommended**: AWS, GCP, Azure with managed services  
**Cost**: ~$50-200/month for 100 concurrent users  
**Scaling**: Horizontal scaling requires load balancer
```

## 7. Testing Checklist

### Error Handling Tests

- [ ] Room not found (404)
- [ ] Wrong password (401)
- [ ] Invalid token (403)
- [ ] Rate limit exceeded (429)
- [ ] Host disconnects mid-session
- [ ] Member disconnects
- [ ] Network drop and reconnect
- [ ] Server restart during session
- [ ] Database connection loss
- [ ] LiveKit server unavailable

### Security Tests

- [ ] Non-host cannot publish audio
- [ ] Expired JWT rejected
- [ ] Wrong room code rejected
- [ ] Password brute-force rate limited
- [ ] SQL injection attempts fail
- [ ] XSS attempts sanitized
- [ ] CORS blocks unauthorized origins

### Load Tests

- [ ] 50 users in one room
- [ ] 10 concurrent rooms
- [ ] 1000 position reports per second
- [ ] 100 room creations per minute

## 8. Documentation Requirements

### Per-Service READMEs

Each service needs:
1. **Purpose**: What it does
2. **Technology**: Stack and dependencies
3. **Setup**: How to run locally
4. **Configuration**: Environment variables
5. **API/Endpoints**: Available operations
6. **Testing**: How to test
7. **Deployment**: Production considerations

### Root README

Must include:
1. **Project Overview**: What is TuneTogether
2. **Architecture Diagram**: System components
3. **Quick Start**: Get running in 5 minutes
4. **Features**: What works
5. **Limitations**: What doesn't work
6. **Documentation Links**: Where to learn more
7. **Contributing**: How to help
8. **License**: Legal stuff

## Implementation Priority

| Priority | Task | Effort |
|---|---|---|
| **P0** | Host disconnect handling | 1 day |
| **P0** | LiveKit publish permissions | 0.5 days |
| **P0** | Security review & fixes | 1 day |
| **P1** | Rate limiting (REST + WS) | 1 day |
| **P1** | Error handling polish | 1 day |
| **P1** | Documentation (all READMEs) | 2 days |
| **P2** | Limitations.md | 0.5 days |
| **P2** | Testing & validation | 2 days |

**Total Estimated Effort**: 8-10 days

## Success Criteria

✅ Host disconnect handled gracefully  
✅ Security audit passes (no critical findings)  
✅ Rate limiting prevents abuse  
✅ All error states have clear user feedback  
✅ Every service has README  
✅ Root README is comprehensive  
✅ Known limitations documented  
✅ Production deployment guide exists

---

**Next Steps**: Implement in priority order, test each component, then integration test the complete system.
