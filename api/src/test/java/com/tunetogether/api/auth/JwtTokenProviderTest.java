package com.tunetogether.api.auth;

import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenProviderTest {

    private JwtTokenProvider tokenProvider;

    // Must be at least 32 chars for HMAC-SHA256
    private static final String SECRET = "test-secret-key-for-jwt-testing-at-least-32-chars!!";
    private static final long EXPIRATION_MS = 86400000L; // 24h

    @BeforeEach
    void setUp() {
        tokenProvider = new JwtTokenProvider(SECRET, EXPIRATION_MS);
    }

    @Test
    void generateAndParseToken_host() {
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String roomCode = "TT-ABC123";
        String displayName = "TestHost";

        String token = tokenProvider.generateToken(userId, roomId, roomCode, displayName, TokenType.HOST);
        assertNotNull(token);
        assertFalse(token.isBlank());

        RoomToken parsed = tokenProvider.parseToken(token);
        assertEquals(userId, parsed.getUserId());
        assertEquals(roomId, parsed.getRoomId());
        assertEquals(roomCode, parsed.getRoomCode());
        assertEquals(displayName, parsed.getDisplayName());
        assertEquals(TokenType.HOST, parsed.getTokenType());
        assertTrue(parsed.isHost());
        assertTrue(parsed.isAuthenticated());
    }

    @Test
    void generateAndParseToken_member() {
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String roomCode = "TT-XYZ789";
        String displayName = "TestMember";

        String token = tokenProvider.generateToken(userId, roomId, roomCode, displayName, TokenType.MEMBER);
        RoomToken parsed = tokenProvider.parseToken(token);

        assertEquals(TokenType.MEMBER, parsed.getTokenType());
        assertFalse(parsed.isHost());
    }

    @Test
    void validateToken_valid() {
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String token = tokenProvider.generateToken(userId, roomId, "TT-ABC123", "Test", TokenType.HOST);

        assertTrue(tokenProvider.validateToken(token));
    }

    @Test
    void validateToken_invalid() {
        assertFalse(tokenProvider.validateToken("garbage.token.value"));
    }

    @Test
    void validateToken_wrongSecret() {
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String token = tokenProvider.generateToken(userId, roomId, "TT-ABC123", "Test", TokenType.HOST);

        // Parse with a different secret
        JwtTokenProvider otherProvider = new JwtTokenProvider(
                "different-secret-key-at-least-32-characters-long!!", EXPIRATION_MS);
        assertFalse(otherProvider.validateToken(token));
    }

    @Test
    void parseToken_expired() {
        // Create provider with 0ms expiration
        JwtTokenProvider expiredProvider = new JwtTokenProvider(SECRET, 0L);
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();

        String token = expiredProvider.generateToken(userId, roomId, "TT-ABC123", "Test", TokenType.HOST);

        // Token should be immediately expired
        assertFalse(expiredProvider.validateToken(token));
    }

    @Test
    void parseToken_malformed() {
        assertThrows(JwtException.class, () -> tokenProvider.parseToken("not.a.jwt"));
    }

    @Test
    void roomToken_hasCorrectAuthorities() {
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String token = tokenProvider.generateToken(userId, roomId, "TT-ABC123", "Test", TokenType.HOST);

        RoomToken parsed = tokenProvider.parseToken(token);
        assertTrue(parsed.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_HOST")));
    }
}
