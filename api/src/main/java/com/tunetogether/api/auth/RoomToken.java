package com.tunetogether.api.auth;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.UUID;

/**
 * Spring Security authentication token scoped to a specific room.
 * Serves as the principal throughout the request lifecycle.
 */
public class RoomToken extends AbstractAuthenticationToken {

    private final UUID userId;
    private final UUID roomId;
    private final String roomCode;
    private final String displayName;
    private final TokenType tokenType;

    public RoomToken(UUID userId, UUID roomId, String roomCode,
                     String displayName, TokenType tokenType) {
        super(List.of(new SimpleGrantedAuthority("ROLE_" + tokenType.name())));
        this.userId = userId;
        this.roomId = roomId;
        this.roomCode = roomCode;
        this.displayName = displayName;
        this.tokenType = tokenType;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return userId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getRoomId() {
        return roomId;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public String getDisplayName() {
        return displayName;
    }

    public TokenType getTokenType() {
        return tokenType;
    }

    public boolean isHost() {
        return tokenType == TokenType.HOST;
    }
}
