package com.tunetogether.api.playlist.dto;

import java.util.UUID;

public class TrackResponse {

    private UUID trackId;
    private String clientTrackId;
    private String title;
    private String artist;
    private long durationMs;
    private int orderIndex;

    public TrackResponse() {}

    public TrackResponse(UUID trackId, String clientTrackId, String title,
                         String artist, long durationMs, int orderIndex) {
        this.trackId = trackId;
        this.clientTrackId = clientTrackId;
        this.title = title;
        this.artist = artist;
        this.durationMs = durationMs;
        this.orderIndex = orderIndex;
    }

    public UUID getTrackId() {
        return trackId;
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
}
