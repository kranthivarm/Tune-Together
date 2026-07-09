package com.tunetogether.api.room.dto;

import com.tunetogether.api.playlist.dto.TrackResponse;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class RoomResponse {

    private UUID roomId;
    private String roomCode;
    private String token;
    private String role;
    private String hostDisplayName;
    private String status;
    private boolean hasPassword;
    private int memberCount;
    private Instant createdAt;
    private List<TrackResponse> playlist;
    private List<MemberInfo> members;

    public RoomResponse() {}

    // ── Static factory for create/join responses ──
    public static RoomResponse forAuth(UUID roomId, String roomCode, String token, String role) {
        RoomResponse r = new RoomResponse();
        r.roomId = roomId;
        r.roomCode = roomCode;
        r.token = token;
        r.role = role;
        return r;
    }

    // ── Static factory for room state response ──
    public static RoomResponse forState(UUID roomId, String roomCode, String hostDisplayName,
                                        String status, boolean hasPassword, int memberCount,
                                        Instant createdAt, List<TrackResponse> playlist,
                                        List<MemberInfo> members) {
        RoomResponse r = new RoomResponse();
        r.roomId = roomId;
        r.roomCode = roomCode;
        r.hostDisplayName = hostDisplayName;
        r.status = status;
        r.hasPassword = hasPassword;
        r.memberCount = memberCount;
        r.createdAt = createdAt;
        r.playlist = playlist;
        r.members = members;
        return r;
    }

    // ── Getters ──

    public UUID getRoomId() {
        return roomId;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public String getToken() {
        return token;
    }

    public String getRole() {
        return role;
    }

    public String getHostDisplayName() {
        return hostDisplayName;
    }

    public String getStatus() {
        return status;
    }

    public boolean isHasPassword() {
        return hasPassword;
    }

    public int getMemberCount() {
        return memberCount;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public List<TrackResponse> getPlaylist() {
        return playlist;
    }

    public List<MemberInfo> getMembers() {
        return members;
    }

    /**
     * Nested DTO for member info in room state.
     */
    public static class MemberInfo {
        private UUID userId;
        private String displayName;
        private String role;
        private Instant joinedAt;

        public MemberInfo() {}

        public MemberInfo(UUID userId, String displayName, String role, Instant joinedAt) {
            this.userId = userId;
            this.displayName = displayName;
            this.role = role;
            this.joinedAt = joinedAt;
        }

        public UUID getUserId() { return userId; }
        public String getDisplayName() { return displayName; }
        public String getRole() { return role; }
        public Instant getJoinedAt() { return joinedAt; }
    }
}
