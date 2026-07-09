# ADR-001: SFU Selection — LiveKit over mediasoup

## Status
**Accepted** — 2026-06-20

## Context

TuneTogether requires a Selective Forwarding Unit (SFU) to relay audio from a host device to all room members via WebRTC. The SFU must support:

- **Audio-only rooms** (no video needed for v1)
- **Go-centric backend** integration (our signaling server is Go)
- **Flutter client SDK** (mobile app)
- **React/Web client SDK** (web app)
- **Self-hosting** for local development and production deployment
- **Data channels** for clock-sync signals alongside media
- **Low latency** (<30ms drift target across devices)

The two leading open-source SFU options evaluated were **LiveKit** and **mediasoup**.

## Decision

**We will use LiveKit as the SFU.**

## Comparison

| Criterion | LiveKit | mediasoup |
|---|---|---|
| **Core language** | Go (Pion WebRTC) | C++ library with Node.js bindings |
| **Go server SDK** | First-class `server-sdk-go` | None — would need custom REST/gRPC wrapper |
| **Flutter SDK** | Official `livekit_client` (pub.dev) | Community wrappers only |
| **React SDK** | Official `@livekit/components-react` | Official `mediasoup-client` (lower-level) |
| **Self-hosting** | Single Go binary + optional Redis; official Docker image | Must build custom Node.js server around library |
| **Audio-only mode** | Native support | Manual SDP configuration required |
| **Data channels** | Built-in reliable + lossy data tracks | Available but requires manual plumbing |
| **Room management** | Built-in via Server API (create, list, delete rooms, manage participants) | Must implement entirely from scratch |
| **Token-based auth** | Built-in JWT-based access tokens with granular grants | Must implement custom auth |
| **Operational complexity** | Low — turnkey deployment | High — you are building the media server |
| **Recording/Egress** | Built-in (useful for future features) | Must integrate external recording |
| **Community & docs** | Large, active, well-documented | Large community, good docs but lower-level |
| **Time to production** | ~2 weeks for our use case | ~2–3 months |

## Rationale

### 1. Language Alignment
LiveKit's server is written in Go using the Pion WebRTC stack. Our realtime signaling server is also Go. This means:
- We can use the `server-sdk-go` to manage LiveKit rooms directly from our Go service
- No additional runtime (Node.js) needed in the infrastructure
- Consistent deployment and debugging story

### 2. Client SDK Quality
LiveKit provides **official, actively maintained SDKs** for both our client platforms:
- `livekit_client` for Flutter — handles WebRTC negotiation, audio track management, reconnection
- `@livekit/components-react` for React — provides hooks and pre-built components

mediasoup's Flutter support is community-maintained and fragile, which would be a significant risk for our mobile app.

### 3. Built-in Primitives We Need
LiveKit provides out-of-the-box:
- **Data tracks** (reliable + lossy) — perfect for broadcasting clock-sync pulses and playback commands alongside audio
- **Room management API** — create/delete rooms, manage participants, all via Go SDK
- **JWT access tokens** — granular grants (can publish audio, can subscribe, can use data channels)

With mediasoup, we'd need to build all of this ourselves, adding months of development time.

### 4. Operational Simplicity
LiveKit deploys as a single Docker container (with optional Redis for multi-node). mediasoup requires building, deploying, and maintaining a custom Node.js application wrapping the C++ library.

### 5. Audio Sync Feasibility
For our <30ms sync target, we need:
- Low-latency audio forwarding (SFU handles this)
- Data channels for clock-sync signals (LiveKit data tracks)
- Client-side buffered playback (our responsibility, but LiveKit provides the transport)

LiveKit's architecture supports all of these natively.

## Trade-offs Accepted

- **Less low-level control**: LiveKit is opinionated — we can't customize the RTP pipeline as deeply as mediasoup allows. For audio-only rooms, this is acceptable.
- **Vendor coupling**: We depend on LiveKit's API surface. Mitigated by the fact that LiveKit is open-source (Apache 2.0) and self-hostable.
- **Resource overhead**: LiveKit's Go binary is slightly heavier than a purpose-built mediasoup worker for pure audio. Acceptable for our scale.

## Consequences

- Infrastructure includes a LiveKit server container (+ Redis for state)
- Go signaling server uses `server-sdk-go` for room lifecycle and token generation
- Flutter app uses `livekit_client` package
- React app uses `@livekit/react-components` package
- Audio sync implementation will use LiveKit data tracks for clock signals + a client-side buffered playback strategy
