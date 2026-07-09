# TuneTogether API Service (Spring Boot)

## Purpose

REST API service providing:
- Room creation and management
- User authentication (JWT-based, room-scoped)
- Playlist metadata storage
- Member management

**Does NOT handle**:
- Audio file storage (files stay on client devices)
- Real-time signaling (handled by Go service)
- Audio streaming (handled by LiveKit)

## Technology Stack

- **Framework**: Spring Boot 3.2+
- **Language**: Java 21
- **Database**: PostgreSQL 16
- **ORM**: Spring Data JPA + Hibernate
- **Migrations**: Flyway
- **Security**: BCrypt password hashing, JWT tokens
- **Build Tool**: Maven

## Architecture

```
┌─────────────────────────────────────┐
│          REST API Layer             │
│  - RoomController                   │
│  - PlaylistController               │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│         Service Layer               │
│  - RoomService                      │
│  - PlaylistService                  │
│  - MembershipService                │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│       Repository Layer              │
│  - RoomRepository (JPA)             │
│  - PlaylistTrackRepository          │
│  - RoomMembershipRepository         │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│        PostgreSQL Database          │
└─────────────────────────────────────┘
```

## Setup

### Prerequisites

- Java 21+
- Maven 3.8+
- PostgreSQL 16 (or Docker)

### Local Development

```bash
# Start PostgreSQL (if using Docker)
docker run -d \
  --name tunetogether-postgres \
  -e POSTGRES_USER=tunetogether \
  -e POSTGRES_PASSWORD=tunetogether \
  -e POSTGRES_DB=tunetogether \
  -p 5432:5432 \
  postgres:16

# Run application
cd api
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Or with custom config
./mvnw spring-boot:run \
  -Dspring-boot.run.profiles=dev \
  -Dspring-boot.run.arguments="--server.port=8080"
```

### Build

```bash
# Package JAR
./mvnw clean package

# Run JAR
java -jar target/tunetogether-api-*.jar
```

### Run Tests

```bash
# All tests
./mvnw test

# Integration tests only
./mvnw verify -P integration-tests

# With coverage
./mvnw test jacoco:report
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `dev` | Profile: dev, prod |
| `SERVER_PORT` | `8080` | HTTP port |
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/tunetogether` | Database connection |
| `DATABASE_USERNAME` | `tunetogether` | DB user |
| `DATABASE_PASSWORD` | `tunetogether` | DB password |
| `JWT_SECRET` | (generated) | JWT signing secret |
| `JWT_EXPIRATION` | `86400000` | Token expiry (24h in ms) |

### Application Profiles

**development (`application-dev.yml`)**:
- H2 in-memory database
- Debug logging
- CORS enabled for localhost

**production (`application-prod.yml`)**:
- PostgreSQL required
- Info logging
- CORS configured for production domains

## API Endpoints

### Room Management

#### Create Room
```http
POST /api/v1/rooms
Content-Type: application/json

{
  "displayName": "John Doe",
  "roomName": "My Room",      // optional
  "password": "secret123"      // optional
}

Response (201):
{
  "roomCode": "TT-A3B7K2",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "uuid",
  "displayName": "John Doe",
  "role": "HOST"
}
```

#### Join Room
```http
POST /api/v1/rooms/{code}/join
Content-Type: application/json

{
  "displayName": "Jane Smith",
  "password": "secret123"      // if required
}

Response (200):
{
  "roomCode": "TT-A3B7K2",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "uuid",
  "displayName": "Jane Smith",
  "role": "MEMBER"
}
```

#### Get Room State
```http
GET /api/v1/rooms/{code}
Authorization: Bearer <token>

Response (200):
{
  "code": "TT-A3B7K2",
  "name": "My Room",
  "hostUserId": "uuid",
  "status": "ACTIVE",
  "createdAt": "2026-06-20T10:00:00Z",
  "members": [...],
  "playlist": [...]
}
```

#### Close Room
```http
DELETE /api/v1/rooms/{code}
Authorization: Bearer <token>  // Host only

Response (204 No Content)
```

### Playlist Management

#### Add Track Metadata
```http
POST /api/v1/rooms/{code}/playlist
Authorization: Bearer <token>  // Host only
Content-Type: application/json

{
  "clientTrackId": "uuid",
  "title": "Song Title",
  "artist": "Artist Name",
  "durationMs": 180000
}

Response (201):
{
  "id": "uuid",
  "title": "Song Title",
  "artist": "Artist Name",
  "durationMs": 180000,
  "orderIndex": 0
}
```

#### Reorder Playlist
```http
PUT /api/v1/rooms/{code}/playlist
Authorization: Bearer <token>  // Host only
Content-Type: application/json

{
  "trackIds": ["uuid1", "uuid2", "uuid3"]
}

Response (200):
[...]  // Updated playlist
```

#### Remove Track
```http
DELETE /api/v1/rooms/{code}/playlist/{trackId}
Authorization: Bearer <token>  // Host only

Response (204 No Content)
```

### Error Responses

```http
400 Bad Request
{
  "error": "Validation error",
  "message": "Display name is required"
}

401 Unauthorized
{
  "error": "Invalid password",
  "message": "The password you entered is incorrect"
}

403 Forbidden
{
  "error": "Access denied",
  "message": "Only the host can manage the playlist"
}

404 Not Found
{
  "error": "Room not found",
  "message": "Room with code TT-A3B7K2 does not exist"
}

429 Too Many Requests
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Try again in 60 seconds"
}
```

## Database Schema

### Tables

**users**
- `id` (UUID, PK)
- `display_name` (VARCHAR)
- `created_at` (TIMESTAMP)

**rooms**
- `id` (UUID, PK)
- `code` (VARCHAR, unique)
- `name` (VARCHAR, nullable)
- `password_hash` (VARCHAR, nullable)
- `host_user_id` (UUID, FK → users)
- `status` (VARCHAR: ACTIVE, CLOSED)
- `created_at` (TIMESTAMP)

**room_memberships**
- `id` (UUID, PK)
- `room_id` (UUID, FK → rooms)
- `user_id` (UUID, FK → users)
- `role` (VARCHAR: HOST, MEMBER)
- `joined_at` (TIMESTAMP)

**playlist_tracks**
- `id` (UUID, PK)
- `room_id` (UUID, FK → rooms)
- `client_track_id` (VARCHAR)
- `title` (VARCHAR)
- `artist` (VARCHAR)
- `duration_ms` (INTEGER)
- `order_index` (INTEGER)
- `created_at` (TIMESTAMP)

### Migrations

Flyway migrations in `src/main/resources/db/migration/`:
- `V1__create_users_table.sql`
- `V2__create_rooms_table.sql`
- `V3__create_room_memberships_table.sql`
- `V4__create_playlist_tracks_table.sql`

## Security

### Authentication

- **JWT Tokens**: Room-scoped, 24-hour expiry
- **Claims**: `userId`, `roomCode`, `role` (HOST/MEMBER)
- **Validation**: Every endpoint except create/join

### Authorization

- **Public**: Create room, join room
- **Any Member**: View room state
- **Host Only**: Manage playlist, close room

### Password Security

- **Hashing**: BCrypt with 10 rounds
- **Storage**: Only hash stored, never plaintext
- **Validation**: Constant-time comparison

### Rate Limiting

- **Room Creation**: 10 per minute per IP
- **Password Attempts**: 5 per minute per room
- **General API**: 100 requests per minute per IP

## Deployment

### Docker

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/tunetogether-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

```bash
docker build -t tunetogether-api .
docker run -p 8080:8080 \
  -e DATABASE_URL=jdbc:postgresql://db:5432/tunetogether \
  -e DATABASE_USERNAME=tunetogether \
  -e DATABASE_PASSWORD=tunetogether \
  tunetogether-api
```

### Production Checklist

- [ ] Set `SPRING_PROFILES_ACTIVE=prod`
- [ ] Configure production database
- [ ] Set secure `JWT_SECRET` (256-bit random)
- [ ] Enable HTTPS (reverse proxy or Spring config)
- [ ] Configure CORS for production domains
- [ ] Set up database backups
- [ ] Configure logging (JSON format, log aggregation)
- [ ] Set up health check monitoring
- [ ] Configure rate limiting
- [ ] Review security headers

### Health Check

```http
GET /actuator/health

Response:
{
  "status": "UP",
  "components": {
    "db": {"status": "UP"},
    "diskSpace": {"status": "UP"}
  }
}
```

## Troubleshooting

### Database Connection Fails

```
Error: Could not connect to database
Solution: Check DATABASE_URL, username, password
Verify: docker ps | grep postgres
```

### Flyway Migration Fails

```
Error: Migration checksum mismatch
Solution: Clean and re-migrate (DEV ONLY)
Command: ./mvnw flyway:clean flyway:migrate
```

### JWT Token Invalid

```
Error: 401 Unauthorized
Solution: Token may be expired (24h limit)
Action: Re-authenticate (create/join room again)
```

### Rate Limit Exceeded

```
Error: 429 Too Many Requests
Solution: Wait 60 seconds, reduce request frequency
```

## Development Tips

### Hot Reload

```bash
# Enable Spring Boot DevTools
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
# Edit code → auto-restart
```

### Database Console

```bash
# H2 console (dev profile only)
# Open: http://localhost:8080/h2-console
# JDBC URL: jdbc:h2:mem:testdb
```

### API Testing

```bash
# Using curl
curl -X POST http://localhost:8080/api/v1/rooms \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test User"}'

# Using httpie
http POST http://localhost:8080/api/v1/rooms \
  displayName="Test User"
```

## Contributing

1. Create feature branch from `main`
2. Write tests (aim for 80%+ coverage)
3. Follow Java code style (Google Java Style)
4. Update API documentation if endpoints change
5. Run tests before committing: `./mvnw test`
6. Create pull request with clear description

## License

Part of TuneTogether project. See root LICENSE file.
