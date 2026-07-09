package com.tunetogether.api.membership;

import com.tunetogether.api.room.Room;
import com.tunetogether.api.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Tracks membership of a user in a room.
 * Role is either HOST or MEMBER.
 */
@Entity
@Table(name = "room_memberships",
       uniqueConstraints = @UniqueConstraint(columnNames = {"room_id", "user_id"}))
public class RoomMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 10)
    private String role = "MEMBER";

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected RoomMembership() {
        // JPA
    }

    public RoomMembership(Room room, User user, String role) {
        this.room = room;
        this.user = user;
        this.role = role;
        this.joinedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public User getUser() {
        return user;
    }

    public String getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    @PrePersist
    protected void onCreate() {
        if (joinedAt == null) {
            joinedAt = Instant.now();
        }
    }
}
