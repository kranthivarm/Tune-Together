# TuneTogether — Render Deployment Guide

## Architecture on Render

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Clients    │────▶│  tunetogether-   │────▶│  tunetogether-db   │
│  (Mobile/   │     │  api             │     │  (PostgreSQL)      │
│   Web)      │     │  (Spring Boot)   │     │  Managed by Render │
│             │     └──────────────────┘     └────────────────────┘
│             │
│             │     ┌──────────────────┐     ┌────────────────────┐
│             │────▶│  tunetogether-   │────▶│  LiveKit Cloud     │
│             │ WS  │  realtime        │     │  (External SFU)    │
│             │     │  (Go)            │     │  livekit.cloud     │
│             │     └──────────────────┘     └────────────────────┘
│             │
│             │     ┌──────────────────┐
│             │────▶│  LiveKit Cloud   │  ◀── WebRTC audio
│             │     │  (SFU)           │
│             │     └──────────────────┘
└─────────────┘
```

## Prerequisites

1. A [Render](https://render.com) account
2. A [LiveKit Cloud](https://cloud.livekit.io) account (free tier available)
3. Your TuneTogether repo pushed to GitHub

## Step 1: Set Up LiveKit Cloud

> [!IMPORTANT]
> Render cannot host LiveKit because it needs UDP port ranges for WebRTC.
> Use LiveKit Cloud's free tier (100 participant-minutes/month).

1. Go to [cloud.livekit.io](https://cloud.livekit.io) and sign up
2. Create a new project
3. Note down these three values:
   - **WebSocket URL** (e.g., `wss://your-project.livekit.cloud`)
   - **API Key** (e.g., `APIxxxxxxx`)
   - **API Secret** (e.g., `xxxxxxxxxxxxxxxxxxxxxx`)

## Step 2: Deploy via Render Blueprint

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Blueprint**
3. Connect your GitHub repository containing TuneTogether
4. Render will detect `render.yaml` and show the services to create:
   - `tunetogether-db` (PostgreSQL)
   - `tunetogether-api` (Spring Boot)
   - `tunetogether-realtime` (Go WebSocket)
5. Click **Apply**

## Step 3: Set LiveKit Environment Variables

After deployment, set these env vars on **both** services:

### On `tunetogether-api`:
| Variable | Value |
|---|---|
| `LIVEKIT_HOST` | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | Your LiveKit API key |
| `LIVEKIT_API_SECRET` | Your LiveKit API secret |

### On `tunetogether-realtime`:
| Variable | Value |
|---|---|
| `LIVEKIT_HOST` | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | Your LiveKit API key |
| `LIVEKIT_API_SECRET` | Your LiveKit API secret |

> [!TIP]
> The `JWT_SECRET` is automatically generated and shared between both services
> via the Render Blueprint. You don't need to set it manually.

## Step 4: Verify Deployment

### Check API health:
```bash
curl https://tunetogether-api.onrender.com/actuator/health
# Expected: {"status":"UP"}
```

### Check Realtime health:
```bash
curl https://tunetogether-realtime.onrender.com/health
# Expected: {"status":"ok","service":"tunetogether-realtime","rooms":0}
```

### Test room creation:
```bash
curl -X POST https://tunetogether-api.onrender.com/api/v1/rooms \
  -H 'Content-Type: application/json' \
  -d '{"hostDisplayName": "TestHost"}'
# Expected: {"roomId":"...","roomCode":"TT-XXXXXX","token":"...","role":"HOST"}
```

### Test WebSocket connection:
```bash
# Use the token from the room creation response
wscat -c "wss://tunetogether-realtime.onrender.com/ws?token=<JWT_TOKEN>"
# Expected: room_state message received
```

## Environment Variables Reference

### tunetogether-api
| Variable | Source | Description |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | Activates production config |
| `DATABASE_URL` | Auto (Render DB) | PostgreSQL connection string |
| `JWT_SECRET` | Auto-generated | Shared JWT signing key |
| `LIVEKIT_HOST` | Manual | LiveKit Cloud WebSocket URL |
| `LIVEKIT_API_KEY` | Manual | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | Manual | LiveKit Cloud API secret |
| `CORS_ALLOWED_ORIGINS` | Set in render.yaml | Allowed frontend origins |

### tunetogether-realtime
| Variable | Source | Description |
|---|---|---|
| `PORT` | `10000` | Render's expected port |
| `JWT_SECRET` | Shared from API | Same JWT signing key |
| `LIVEKIT_HOST` | Manual | LiveKit Cloud WebSocket URL |
| `LIVEKIT_API_KEY` | Manual | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | Manual | LiveKit Cloud API secret |
| `SPRING_BOOT_URL` | Auto (Render) | Internal API URL |

## Render Free Tier Limitations

> [!WARNING]
> Render free tier services spin down after 15 minutes of inactivity.
> The first request after spin-down takes 30-60 seconds (cold start).

| Limitation | Free Tier | Starter ($7/mo) |
|---|---|---|
| Spin-down | After 15 min idle | Always on |
| PostgreSQL | 256 MB, 90-day expiry | 1 GB, persistent |
| Bandwidth | 100 GB/mo | 100 GB/mo |
| Build minutes | 500/mo | 500/mo |

For production, upgrade to the **Starter** plan ($7/service/month).

## Troubleshooting

### API returns 500 on startup
- Check Render logs: `Dashboard → tunetogether-api → Logs`
- Common issue: DATABASE_URL not set → check DB binding
- Common issue: Flyway migration fails → check SQL syntax for Render Postgres version

### WebSocket connection fails
- Render serves WebSocket over HTTPS → use `wss://` (not `ws://`)
- Check that JWT_SECRET matches between API and Realtime services

### LiveKit audio not working
- Ensure LIVEKIT_HOST uses `wss://` protocol
- Verify API key/secret are from LiveKit Cloud (not local dev)
- Check LiveKit Cloud dashboard for room/participant activity
