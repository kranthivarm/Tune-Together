# Known Limitations

This document outlines the current limitations of TuneTogether, including platform constraints, performance boundaries, and feature restrictions.

## Platform Limitations

### iOS Device Audio Mirroring ❌

**Status**: Not Supported  
**Reason**: iOS does not provide system-level audio capture APIs to third-party apps for privacy and security reasons  
**Impact**: iOS users cannot use "Live Device-Audio Mirroring" feature  
**Workaround**: Use Android device as host for mirror mode, or use local playlist feature  
**Future**: No ETA (depends on Apple policy changes)

**Technical Details**:
- `AVAudioEngine` only captures microphone or app's own audio
- `ReplayKit` is for screen recording (insufficient audio quality)
- System audio output is not accessible to third-party apps
- This is an intentional OS design, not a bug

### Web Client Hosting ❌

**Status**: Not Supported in v1  
**Reason**: Browser security sandbox prevents system audio capture and arbitrary file system access  
**Impact**: Web users can only listen (subscribe-only), not host rooms  
**Workaround**: Use mobile app to host, web app to listen  
**Future**: May add limited web hosting with user-selected files in v2

**Technical Details**:
- No system audio capture API in browsers
- `getUserMedia()` only captures microphone
- File API requires user interaction per file (can't scan music library)
- WebRTC can receive but not send from files in v1

---

## Performance Limitations

### Maximum Tested Room Size

**Current**: 50 concurrent members  
**Theoretical Limit**: ~100 members (depends on server resources)  
**Bottleneck**: WebSocket message broadcasting, drift monitoring CPU usage  
**Symptoms at Scale**:
- Increased latency (>100ms)
- More frequent drift corrections
- Higher server CPU usage
- Potential audio dropouts

**Recommendations**:
- **Optimal**: 10-20 members (best experience)
- **Good**: 20-30 members (minor latency)
- **Acceptable**: 30-50 members (occasional drift)
- **Not Recommended**: 50+ members (degraded experience)

### Audio Sync Accuracy

**Target**: <30ms drift between devices  
**Typical (WiFi)**: 10-20ms on same network  
**Good (4G/5G)**: 20-40ms on cellular  
**Degraded (3G)**: 50-150ms on slow networks  

**Factors Affecting Sync**:
- Network latency (ping time)
- Network jitter (latency variation)
- Device performance (CPU, RAM)
- Distance to server
- WiFi congestion
- Number of members

**Real-World Examples**:
- Same WiFi network: Virtually undetectable (<15ms)
- Different WiFi networks: Slight delay perceptible (~30ms)
- Mixed WiFi + cellular: Noticeable if >50ms

### Storage & Bandwidth

**Mobile App**:
- App Size: ~50MB installed
- Memory Usage: 80-120MB during playback
- No Local Storage: Audio files not copied/stored

**Web App**:
- Initial Load: ~500KB (gzipped)
- Memory Usage: 40-80MB during playback

**Server (per room)**:
- Metadata Only: ~100KB per room
- Database: ~10KB per member
- No Audio Storage: Files stay on client devices

**Network Bandwidth (per client)**:
- Audio Streaming: ~100 KB/s (Opus codec, 48kHz stereo)
- Signaling: <1 KB/s (WebSocket messages)
- Position Reports: ~100 bytes every 2 seconds
- **Total**: ~100 KB/s per listener

**Example**: 20-person room = 20 × 100 KB/s = 2 MB/s upload from host

---

## Feature Limitations

### Playlist Management

**Host Only**: Add, reorder, remove tracks  
**Members**: View-only, cannot modify  
**Reason**: Prevent playlist chaos and conflicts  
**Future**: May add collaborative playlists with voting system

### Audio Format Support

**Supported**:
- MP3 (all bitrates)
- M4A / AAC
- FLAC (lossless)
- WAV (uncompressed)
- OGG Vorbis

**Not Supported**:
- DRM-protected files (iTunes FairPlay, etc.)
- Streaming URLs (YouTube, Spotify URLs)
- Proprietary formats (WMA, etc.)

**Reason**: Local file playback only, no third-party platform integration  
**Workaround**: Download and convert files first

### Playback Control

**Host Controls**:
- Play / Pause
- Skip (next/previous)
- Seek (jump to position)
- Playlist management

**Member Controls**:
- None (view-only)
- Local volume only

**Reason**: Single source of truth for sync

### Offline Mode

**Status**: Not Available  
**Reason**: Real-time synchronization requires network connectivity  
**Impact**: Cannot use app without internet  
**Workaround**: None (fundamental design limitation)

---

## Security & Privacy Limitations

### Room Persistence

**Duration**: 24 hours maximum, or until host leaves  
**No History**: Rooms are ephemeral, no playback history stored  
**No Recording**: Audio is not recorded server-side  
**Reason**: Privacy by design, stateless architecture

### Password Strength

**Minimum**: No enforced minimum (UX choice)  
**Recommendation**: Use 6+ character passwords for protection  
**Implementation**: BCrypt hashing with 10 rounds  
**Limitation**: Short passwords susceptible to brute-force

**Security Measures**:
- Rate limiting: 5 password attempts per minute per room
- Automatic account lockout: Not implemented (room-based, not account-based)

### User Accounts

**v1 Status**: No persistent user accounts  
**Limitation**: Cannot save preferences, favorites, history  
**Impact**: Must re-enter name when joining rooms  
**Future**: Optional account system planned for v2

**Current Behavior**:
- Display name stored per session only
- No user preferences
- No favorite rooms/tracks
- No playback history

---

## Network & Connectivity Limitations

### Firewall Compatibility

**Requires**:
- UDP ports for WebRTC (dynamic range)
- WebSocket (TCP port 8081)
- HTTP/HTTPS (TCP port 8080/443)

**May Fail On**:
- Corporate networks with strict firewalls
- VPNs that block UDP
- Networks with symmetric NAT

**Workaround**: Use TURN server (increases latency by ~50-100ms)

### Bandwidth Requirements

**Minimum (per listener)**:
- Audio: 100 KB/s
- Signaling: <1 KB/s
- **Total**: ~101 KB/s

**Recommended**:
- WiFi: 802.11n or better
- Cellular: 4G/LTE or better
- Avoid: 3G (may work but degraded)

**Host Requirements**:
- Upload: 100 KB/s × number of listeners
- Example: 20 listeners = 2 MB/s upload

### Cross-Region Latency

**Same Region**: <20ms latency  
**Cross-Region**: 50-150ms latency  
**Intercontinental**: 150-300ms latency  

**Impact**: Higher latency = worse sync accuracy  
**Recommendation**: Host server in region where most users are located

---

## Deployment Limitations

### Self-Hosting Requirements

**Minimum Server Specs**:
- CPU: 2 cores
- RAM: 4GB (2GB for services, 2GB for OS)
- Storage: 10GB
- Network: 100 Mbps

**Complexity**: Moderate (requires Docker knowledge)

**Services Required**:
- PostgreSQL 16
- Redis 7
- LiveKit SFU
- Spring Boot API
- Go Signaling Server

### Scaling Limitations

**Vertical Scaling**: Up to 8 cores, 16GB RAM (single server)  
**Horizontal Scaling**: Requires load balancer + sticky sessions  
**Database**: Single PostgreSQL instance (no replication in v1)  
**LiveKit**: Requires separate scaling strategy

**Bottlenecks**:
1. WebSocket broadcasting (Go server CPU)
2. Database connections (PostgreSQL)
3. LiveKit SFU bandwidth

### Cloud Hosting Costs

**Estimated Monthly Cost** (100 concurrent users):
- AWS/GCP/Azure: $50-200/month
- Managed Database: $20-50/month
- Load Balancer: $20-30/month
- Bandwidth: $10-30/month
- **Total**: ~$100-300/month

**Factors**:
- Region selection
- Reserved instances vs on-demand
- Managed services vs self-managed

---

## Browser Compatibility

### Fully Supported ✅

- **Chrome 90+** (recommended)
- **Edge 90+** (Chromium-based)
- **Firefox 88+**

### Partial Support ⚠️

- **Safari 14+**
  - WebRTC limitations on older versions
  - May require TURN server
  - Autoplay policy more restrictive

- **Mobile Safari**
  - Audio playback may require user interaction
  - Background playback limited

### Not Supported ❌

- **Internet Explorer** (any version)
- **Opera Mini**
- **UC Browser**
- Browsers without WebRTC support

---

## Mobile Compatibility

### Android

**Minimum**: Android 10 (API 29) for mirror mode  
**Recommended**: Android 11+ for best performance  
**Limitation**: Some apps block audio capture (Netflix, banking apps)  
**Device Audio Capture**: Works on most devices, fails on apps with `FLAG_SECURE`

### iOS

**Minimum**: iOS 15+  
**Recommended**: iOS 16+ for best performance  
**Limitation**: No system audio capture (OS restriction)  
**Features Available**: Local playlist only, not mirror mode

---

## Audio Quality Limitations

### Codec

**Used**: Opus codec at 48kHz stereo  
**Bitrate**: ~128 kbps (adaptive)  
**Quality**: Transparent (indistinguishable from original for most music)  
**Limitation**: Not lossless (FLAC quality not preserved)

### Latency

**Target**: <100ms end-to-end  
**Typical**: 50-80ms  
**Breakdown**:
- Capture: 10-20ms
- Encoding: 5-10ms
- Network: 10-50ms
- Decoding: 5-10ms
- Playback: 10-20ms

**Limitation**: Not suitable for live performance (musicians playing together)

---

## Development & Testing Limitations

### Test Coverage

**Current**: ~60% code coverage  
**Target**: 80%+  
**Limitation**: Some integration tests require manual verification

### Supported Development Platforms

**Recommended**:
- **macOS**: Full support (all platforms)
- **Linux**: Full support (Android, web, server)
- **Windows**: Partial support (web, server; limited mobile testing)

### CI/CD

**Current**: GitHub Actions for linting and build  
**Missing**: Automated integration tests, deployment pipelines  
**Limitation**: Manual deployment required

---

## Known Bugs & Issues

### Minor Issues

1. **Audio crackling on low-end Android devices**: Increase buffer size
2. **Occasional ghost members in list**: WebSocket state sync issue
3. **First audio packet delayed**: Cold start on LiveKit
4. **Progress bar jumps on seek**: UI update lag

### Won't Fix (By Design)

1. **Cannot play YouTube URLs**: Legal/ToS compliance
2. **Cannot download from Spotify**: Legal/ToS compliance
3. **No server-side audio storage**: Privacy by design
4. **No persistent user accounts in v1**: Simplified architecture

---

## Comparison with Alternatives

### vs. Spotify Connect

| Feature | TuneTogether | Spotify Connect |
|---|---|---|
| Multi-device sync | ✅ <30ms | ✅ ~50ms |
| Local files | ✅ Yes | ❌ No |
| System audio capture | ✅ Android only | ❌ No |
| Platform support | ✅ Android, iOS, Web | ✅ Most platforms |
| Requires subscription | ❌ No | ✅ Yes (Premium) |
| Open source | ✅ Yes | ❌ No |

### vs. Sonos / Multi-Room Audio

| Feature | TuneTogether | Sonos |
|---|---|---|
| Hardware required | ❌ No | ✅ Yes ($$$) |
| Sync accuracy | ✅ <30ms | ✅ <1ms |
| Setup complexity | ✅ Simple | ⚠️ Moderate |
| Device agnostic | ✅ Yes | ❌ Sonos speakers only |
| Cost | ✅ Free | ❌ $200+ per speaker |

---

## Future Improvements

### Planned (v2)

- [ ] Optional user accounts
- [ ] Collaborative playlists with voting
- [ ] Web client hosting (limited)
- [ ] Background playback on all platforms
- [ ] Audio visualization
- [ ] Chat feature
- [ ] Room history and favorites

### Under Consideration

- [ ] Video sync (requires major architecture change)
- [ ] Cross-platform screen sharing
- [ ] Desktop applications (Electron)
- [ ] Smart speaker integration
- [ ] Podcast support with chapter markers

### Not Planned

- ❌ Content downloading from third-party platforms
- ❌ Built-in music streaming service
- ❌ DRM content playback
- ❌ Video streaming
- ❌ Voice chat

---

## Getting Help

### Documentation

- [Main README](README.md)
- [Architecture](docs/architecture.md)
- [Integration Guide](docs/integration-guide.md)
- [Quick Start](QUICKSTART.md)

### Reporting Issues

If you encounter a limitation not listed here, or believe something should work but doesn't:

1. Check this document first
2. Review existing GitHub issues
3. Create new issue with:
   - Platform/version
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Logs/screenshots

### Support Channels

- GitHub Issues: Bug reports, feature requests
- GitHub Discussions: General questions, ideas
- Documentation: Technical how-tos

---

**Last Updated**: June 20, 2026  
**Version**: 1.0 (All phases 0-8 complete)  
**Maintained By**: TuneTogether Contributors
