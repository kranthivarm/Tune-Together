package com.tunetogether.api.room;

import jakarta.persistence.*;
import com.tunetogether.api.user.User;
import java.time.Instant;
import java.util.UUID;

/**
 * Room entity. Represents a sync session.
 * Status: ACTIVE (accepting members, playable) or CLOSED (archived).
 */
@Entity
@Table(name = "rooms")
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 10)
    private String code;

    @Column(name = "password_hash")
    private String passwordHash;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "host_user_id", nullable = false)
    private User host;

    @Column(nullable = false, length = 20)
    private String status = "ACTIVE";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    protected Room() {
        // JPA
    }

    public Room(String code, User host, String passwordHash) {
        this.code = code;
        this.host = host;
        this.passwordHash = passwordHash;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public User getHost() {
        return host;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }

    public boolean hasPassword() {
        return passwordHash != null;
    }

    public void close() {
        this.status = "CLOSED";
        this.closedAt = Instant.now();
    }

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
