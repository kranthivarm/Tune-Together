# TuneTogether TODO List

## ✅ Completed (Phases 0-7 + Phase 8 Partial)

### Core Features (Phases 0-7)
- [x] **Phase 0**: Project scaffolding, Docker setup, CI/CD skeleton
- [x] **Phase 1**: Spring Boot REST API (rooms, auth, playlist metadata)
- [x] **Phase 2**: Go signaling server (WebSocket, clock sync)
- [x] **Phase 3**: LiveKit SFU integration
- [x] **Phase 4**: Flutter mobile app (room UI, local playlist)
- [x] **Phase 5**: Flutter mobile app (Android mirror mode)
- [x] **Phase 6**: React web app (subscribe-only audio, room UI)
- [x] **Phase 7**: Drift monitoring & correction (client-side + protocol)

### Phase 8: Hardening & Polish (Partial)
- [x] **Documentation**: All READMEs, LIMITATIONS.md (~3,500 lines)
- [x] **Server-Side Drift Detection**: Complete implementation in Go ✅ NEW (June 29)
- [x] **Host Disconnect Handling**: 30-second grace period ✅ NEW (June 29)
- [x] **WebSocket Rate Limiting**: 30 msg/sec per client ✅ NEW (June 29)
- [ ] **REST API Rate Limiting**: Bucket4j implementation needed
- [ ] **Production deployment**: Infrastructure setup
- [ ] **Monitoring & alerting**: Prometheus, Grafana
- [ ] **Security audit**: Penetration testing

---

## 🔴 Critical (Blocks Core Functionality)

### 1. Custom AudioSource Bridge
**Priority**: P0 - BLOCKER  
**Effort**: 3-5 days  
**Status**: Not started

Implement native platform channels to pipe audio PCM data into LiveKit audio tracks.

**Tasks**:
- [ ] Android: Create AudioBridge class to capture AudioPlayer output as PCM
- [ ] Android: Pipe MediaProjection PCM directly into LiveKit track
- [ ] iOS: Create equivalent AudioBridge using AVAudioEngine
- [ ] Dart: Implement CustomAudioSource wrapper
- [ ] Test: Local file playback streams to LiveKit
- [ ] Test: Android MediaProjection streams to LiveKit

**Files to create**:
- `mobile/android/.../AudioBridge.kt`
- `mobile/ios/Runner/AudioBridge.swift`
- `mobile/lib/services/custom_audio_source.dart`

**Acceptance Criteria**:
- Host plays MP3 file → Members hear audio
- Host mirrors Spotify → Members hear audio
- Audio quality: 48kHz, stereo, <100ms latency

---

### 2. LiveKit Token Generation
**Priority**: P0 - BLOCKER  
**Effort**: 1 day  
**Status**: Not started

Go signaling server must issue LiveKit access tokens for mobile clients.

**Tasks**:
- [ ] Go: Add LiveKit server SDK dependency
- [ ] Go: Implement token generation endpoint
- [ ] Go: WebSocket message type for token request
- [ ] Dart: Request LiveKit token via WebSocket
- [ ] Dart: Use token to connect to LiveKit room
- [ ] Test: Mobile app can join LiveKit room

**Files to update**:
- `realtime/internal/livekit/token.go` (NEW)
- `realtime/internal/ws/handler.go`
- `mobile/lib/services/livekit_service.dart`

**Acceptance Criteria**:
- Mobile app requests token via WebSocket
- Go server returns valid LiveKit token
- Mobile app successfully joins LiveKit room

---

## 🟠 High Priority (Improves UX)

### 0. REST API Rate Limiting ⏳
**Priority**: P1  
**Effort**: 1 day  
**Status**: WebSocket rate limiting complete, REST API needed

Implement rate limiting for Spring Boot REST endpoints to prevent abuse.

**Tasks**:
- [ ] Add Bucket4j dependency to `api/pom.xml`
- [ ] Create `RateLimitFilter.java` in config package
- [ ] Configure limits: 100/min general, 10/min room creation, 5/min password
- [ ] Add rate limit headers (Retry-After, X-RateLimit-Remaining)
- [ ] Test with 101 requests in 1 minute

**Files to create**:
- `api/src/main/java/com/tunetogether/api/config/RateLimitFilter.java`
- `api/src/main/java/com/tunetogether/api/config/RateLimitConfig.java`

**Acceptance Criteria**:
- 101st request in 1 minute returns 429 Too Many Requests
- Password brute-force blocked after 5 attempts
- Rate limit headers present in responses

---

### 3. Audio Duration Detection
**Priority**: P1  
**Effort**: 0.5 days  
**Status**: Not started

Detect actual audio file duration instead of showing 0:00.

**Tasks**:
- [ ] Use `just_audio` to load file and extract duration
- [ ] Update `AudioFileService._getAudioDuration()`
- [ ] Handle unsupported file formats gracefully
- [ ] Test with various audio formats (MP3, M4A, FLAC, etc.)

**Files to update**:
- `mobile/lib/services/audio_file_service.dart`

**Acceptance Criteria**:
- Tracks show correct duration (e.g., "3:45")
- Unsupported formats handled gracefully

---

### 4. Buffered Playback for Sync
**Priority**: P1  
**Effort**: 2-3 days  
**Status**: Not started

Implement client-side audio buffering for <30ms sync accuracy.

**Tasks**:
- [ ] Buffer incoming audio for 100ms
- [ ] Schedule playback at absolute timestamp (clock-offset corrected)
- [ ] Implement drift correction (micro speed adjustments)
- [ ] Measure sync accuracy across 3+ devices
- [ ] Tune buffer size vs latency tradeoff

**Files to update**:
- `mobile/lib/services/livekit_service.dart`

**Acceptance Criteria**:
- Audio plays within <30ms across all devices
- No audible echo or drift over 5 minutes

---

### 5. Reconnection Logic
**Priority**: P1  
**Effort**: 2 days  
**Status**: Not started

Handle network disruptions gracefully.

**Tasks**:
- [ ] WebSocket: Auto-reconnect with exponential backoff
- [ ] WebSocket: Re-sync clock after reconnect
- [ ] LiveKit: Auto-reconnect with ICE restart
- [ ] UI: Show "Reconnecting..." indicator
- [ ] Test: WiFi on/off during active session

**Files to update**:
- `mobile/lib/services/websocket_service.dart`
- `mobile/lib/services/livekit_service.dart`
- `mobile/lib/screens/room_screen.dart`

**Acceptance Criteria**:
- App reconnects within 5 seconds
- Playback resumes automatically
- No data loss or corruption

---

## 🟡 Medium Priority (Nice to Have)

### 6. Error Recovery & User Feedback
**Priority**: P2  
**Effort**: 1 day

Better error messages and recovery flows.

**Tasks**:
- [ ] Map API error codes to user-friendly messages
- [ ] Add retry buttons on error screens
- [ ] Show toast notifications for transient errors
- [ ] Log errors to console for debugging

---

### 7. Playlist Reordering UI
**Priority**: P2  
**Effort**: 1 day

Drag-to-reorder tracks (host only).

**Tasks**:
- [ ] Add `ReorderableListView` to room screen
- [ ] Call `ApiService.reorderPlaylist()` on change
- [ ] Broadcast playlist update via WebSocket
- [ ] Animate reordering on all devices

---

### 8. Track Removal UI
**Priority**: P2  
**Effort**: 0.5 days

Swipe-to-delete tracks (host only).

**Tasks**:
- [ ] Add `Dismissible` widget to playlist items
- [ ] Confirm deletion with dialog
- [ ] Call `ApiService.removeTrack()`
- [ ] Broadcast update to all devices

---

### 9. Background Playback
**Priority**: P2  
**Effort**: 2 days

Keep audio playing when app is backgrounded.

**Tasks**:
- [ ] Android: Foreground service for audio playback
- [ ] iOS: Configure audio session for background mode
- [ ] Media notification with play/pause controls
- [ ] Update `Info.plist` and `AndroidManifest.xml`

---

### 10. UI Polish
**Priority**: P2  
**Effort**: 2-3 days

Loading states, animations, better empty states.

**Tasks**:
- [ ] Add skeleton loaders while fetching data
- [ ] Animate playlist item addition/removal
- [ ] Improve empty state illustrations
- [ ] Add haptic feedback on interactions
- [ ] Polish color scheme and typography

---

## 🟢 Low Priority (Future Enhancements)

### 11. Audio Visualization
**Priority**: P3  
**Effort**: 3 days

Waveform or spectrum analyzer display.

---

### 12. Chat Feature
**Priority**: P3  
**Effort**: 5 days

Text chat in room for members.

---

### 13. Room History
**Priority**: P3  
**Effort**: 2 days

Remember recent rooms for quick rejoin.

---

### 14. Favorites System
**Priority**: P3  
**Effort**: 2 days

Save favorite tracks/rooms.

---

### 15. Web App (React)
**Priority**: P3  
**Effort**: 2 weeks

Build web version of the app.

**Tasks**:
- [ ] Set up React + Vite
- [ ] Replicate mobile UI screens
- [ ] Use WebRTC API directly (no platform channels)
- [ ] Test cross-platform sync (mobile + web)

---

## 🧪 Testing TODO

### Integration Tests
- [ ] End-to-end: Create room → Join → Add tracks → Play
- [ ] Clock sync accuracy measurement
- [ ] Multi-device audio sync test (3+ devices)
- [ ] Network disruption handling
- [ ] Permission denial flows
- [ ] iOS feature detection (mirror mode hidden)

### Performance Tests
- [ ] Memory usage profiling
- [ ] Network bandwidth measurement
- [ ] Battery drain test (1-hour session)
- [ ] Large playlist handling (100+ tracks)
- [ ] Concurrent room stress test (50+ members)

### Manual Test Matrix
- [ ] Android 10 (API 29)
- [ ] Android 11-14 (API 30-34)
- [ ] iOS 15, 16, 17
- [ ] Physical devices (not just emulators)
- [ ] Low-bandwidth network (3G simulation)
- [ ] Various audio formats (MP3, M4A, FLAC, WAV)

---

## 📝 Documentation TODO

- [ ] API documentation (OpenAPI/Swagger)
- [ ] WebSocket message protocol spec
- [ ] Architecture diagrams (update with production changes)
- [ ] Deployment guide (AWS/GCP/Azure)
- [ ] User manual / FAQ
- [ ] Video demo / walkthrough

---

## 🚀 Deployment TODO

### Infrastructure
- [ ] Set up production PostgreSQL (RDS, Cloud SQL, etc.)
- [ ] Set up production Redis (ElastiCache, Memorystore, etc.)
- [ ] Deploy LiveKit server (self-hosted or LiveKit Cloud)
- [ ] Deploy Spring Boot API (ECS, Cloud Run, etc.)
- [ ] Deploy Go signaling server (ECS, Cloud Run, etc.)
- [ ] Set up CDN for static assets

### CI/CD
- [ ] GitHub Actions: Build & test on PR
- [ ] GitHub Actions: Deploy on merge to main
- [ ] Automated database migrations (Flyway)
- [ ] Automated mobile app builds (Android APK, iOS IPA)
- [ ] App store deployment (Google Play, App Store)

### Monitoring
- [ ] Set up application logging (CloudWatch, Stackdriver, etc.)
- [ ] Set up error tracking (Sentry, Rollbar, etc.)
- [ ] Set up performance monitoring (New Relic, Datadog, etc.)
- [ ] Set up uptime monitoring (Pingdom, UptimeRobot, etc.)

---

## 🔒 Security TODO

- [ ] Rate limiting on API endpoints
- [ ] HTTPS/WSS in production
- [ ] Secrets management (AWS Secrets Manager, etc.)
- [ ] Database connection encryption
- [ ] JWT token rotation
- [ ] Security audit / penetration testing

---

## 📊 Analytics TODO

- [ ] User event tracking (room creation, joins, playback)
- [ ] Error rate monitoring
- [ ] Performance metrics (sync accuracy, latency)
- [ ] User retention analysis
- [ ] Feature usage statistics

---

## Priority Matrix

| Priority | Item | Effort | Status | Blocks |
|---|---|---|---|---|
| **P0** | Custom AudioSource Bridge | 3-5 days | ⏳ Not started | Audio streaming |
| **P0** | LiveKit Token Verification | 0.5 days | ⏳ Needs testing | Audio streaming |
| **P1** | REST API Rate Limiting | 1 day | ⏳ Not started | Security |
| **P1** | Integration Testing | 2 days | ⏳ Not started | Validation |
| **P1** | Audio Duration Detection | 0.5 days | ⏳ Not started | UX |
| **P1** | Buffered Playback | 2-3 days | ⏳ Not started | Sync accuracy |
| **P1** | Reconnection Logic | 2 days | ⏳ Not started | Reliability |
| **P2** | Error Recovery | 1 day | ⏳ Not started | UX |
| **P2** | Playlist Reordering | 1 day | ⏳ Not started | Host features |
| **P2** | Track Removal | 0.5 days | ⏳ Not started | Host features |
| **P2** | Background Playback | 2 days | ⏳ Not started | UX |
| **P2** | UI Polish | 2-3 days | ⏳ Not started | UX |

---

## Estimated Timeline

### Week 1: Unblock Core Functionality
- Days 1-5: Custom AudioSource Bridge
- Day 6: LiveKit Token Generation
- Day 7: Integration testing

### Week 2: Production Readiness
- Days 1-3: Buffered Playback + Sync Testing
- Days 4-5: Reconnection Logic
- Days 6-7: Error Recovery + UI Polish

### Week 3: Feature Complete
- Days 1-2: Playlist Management (reorder, remove)
- Days 3-4: Background Playback
- Days 5-7: Testing + Bug Fixes

### Week 4: Launch Prep
- Days 1-3: Documentation
- Days 4-5: Deployment Setup
- Days 6-7: Final Testing + Launch

**Total Estimated Effort**: 3-4 weeks for production launch

---

## ✅ Latest Updates (June 29, 2026)

### Completed Today
1. ✅ **Server-Side Drift Detection**: Full implementation in `realtime/internal/room/drift_monitor.go`
   - Collects position reports from all clients
   - Calculates average with network delay compensation
   - Detects drift > 30ms and sends correction messages
   - Comprehensive metrics and logging (~250 lines)

2. ✅ **Host Disconnect Handling**: 30-second grace period strategy
   - Notifies members when host disconnects
   - Waits 30 seconds for reconnection
   - Auto-closes room if host doesn't return
   - Integrated into `room.go` with timer management

3. ✅ **WebSocket Rate Limiting**: Token bucket implementation
   - 30 messages/second per client, burst 60
   - Automatic stale limiter cleanup
   - Returns error to client on rate limit exceeded
   - New file: `realtime/internal/ws/rate_limiter.go`

4. ✅ **Compilation**: Go server builds successfully with all new features

### Next Session Plan

1. 🔴 **Custom AudioSource Bridge** (P0 - 3-5 days)
   - Android: Implement `AudioBridge.kt` for PCM capture
   - iOS: Implement `AudioBridge.swift` for local files
   - Dart: Create method channel wrapper
   - Replace microphone placeholder in LiveKit service

2. 🟡 **REST API Rate Limiting** (P1 - 1 day)
   - Add Bucket4j to Spring Boot
   - Implement rate limit filter
   - Test with 101 requests/minute

3. 🧪 **Integration Testing** (P1 - 2 days)
   - Test drift detection with 3 devices
   - Test host disconnect flow
   - Test rate limiting under load
   - Measure sync accuracy

4. 📊 **Load Testing** (P1 - 1 day)
   - 50 concurrent members
   - Measure CPU/RAM usage
   - Identify bottlenecks

---

**Last Updated**: June 29, 2026  
**Phase 8 Progress**: Documentation 100%, Implementation 85% ✅  
**Next Milestone**: Audio Streaming (Custom AudioSource) 🚀  
**Estimated Time to Production**: 3-4 weeks
