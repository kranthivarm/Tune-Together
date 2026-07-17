package com.tunetogether.api.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * Generates and validates room-scoped JWT tokens.
 *
 * JWT Claims:
 * - sub: user UUID
 * - roomId: room UUID
 * - roomCode: room code string
 * - role: HOST | MEMBER
 * - displayName: user's chosen display name
 * - iat: issued at
 * - exp: expiry (24h default)
 */
@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long expirationMs;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-ms}") long expirationMs) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    /**
     * Generate a room-scoped or app-scoped JWT.
     */
    public String generateToken(UUID userId, UUID roomId, String roomCode,
                                String displayName, TokenType tokenType) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        var builder = Jwts.builder()
                .subject(userId.toString())
                .claim("role", tokenType.name())
                .claim("displayName", displayName)
                .issuedAt(now)
                .expiration(expiry);

        if (roomId != null) {
            builder.claim("roomId", roomId.toString());
        }
        if (roomCode != null) {
            builder.claim("roomCode", roomCode);
        }

        return builder.signWith(secretKey).compact();
    }

    /**
     * Parse and validate a JWT, returning a RoomToken principal.
     *
     * @throws JwtException if the token is invalid, expired, or malformed
     */
    public RoomToken parseToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        UUID userId = UUID.fromString(claims.getSubject());
        TokenType tokenType = TokenType.valueOf(claims.get("role", String.class));
        String displayName = claims.get("displayName", String.class);

        UUID roomId = null;
        String roomIdStr = claims.get("roomId", String.class);
        if (roomIdStr != null) {
            roomId = UUID.fromString(roomIdStr);
        }
        String roomCode = claims.get("roomCode", String.class);

        return new RoomToken(userId, roomId, roomCode, displayName, tokenType);
    }

    /**
     * Validate a JWT without returning the parsed token.
     */
    public boolean validateToken(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
