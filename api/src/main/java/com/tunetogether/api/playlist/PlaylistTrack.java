package com.tunetogether.api.playlist;

import com.tunetogether.api.room.Room;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Playlist track metadata entity.
 * IMPORTANT: Only metadata is stored. NO audio files, NO URLs, NO binary data.
 * Audio bytes only ever leave the host device live through WebRTC.
 */
@Entity
@Table(name = "playlist_tracks",
       uniqueConstraints = @UniqueConstraint(columnNames = {"room_id", "client_track_id"}))
public class PlaylistTrack {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @Column(name = "client_track_id", nullable = false, length = 255)
    private String clientTrackId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(length = 500)
    private String artist;

    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column(name = "added_at", nullable = false, updatable = false)
    private Instant addedAt;

    protected PlaylistTrack() {
        // JPA
    }

    public PlaylistTrack(Room room, String clientTrackId, String title,
                         String artist, long durationMs, int orderIndex) {
        this.room = room;
        this.clientTrackId = clientTrackId;
        this.title = title;
        this.artist = artist;
        this.durationMs = durationMs;
        this.orderIndex = orderIndex;
        this.addedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public String getClientTrackId() {
        return clientTrackId;
    }

    public String getTitle() {
        return title;
    }

    public String getArtist() {
        return artist;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public int getOrderIndex() {
        return orderIndex;
    }

    public void setOrderIndex(int orderIndex) {
        this.orderIndex = orderIndex;
    }

    public Instant getAddedAt() {
        return addedAt;
    }

    @PrePersist
    protected void onCreate() {
        if (addedAt == null) {
            addedAt = Instant.now();
        }
    }
}
