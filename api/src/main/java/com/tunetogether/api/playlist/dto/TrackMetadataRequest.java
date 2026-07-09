package com.tunetogether.api.playlist.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class TrackMetadataRequest {

    @NotBlank(message = "Client track ID is required")
    @Size(max = 255, message = "Client track ID must not exceed 255 characters")
    private String clientTrackId;

    @NotBlank(message = "Title is required")
    @Size(min = 1, max = 500, message = "Title must be between 1 and 500 characters")
    private String title;

    @Size(max = 500, message = "Artist must not exceed 500 characters")
    private String artist;

    @Min(value = 1, message = "Duration must be positive")
    private long durationMs;

    public TrackMetadataRequest() {}

    public TrackMetadataRequest(String clientTrackId, String title, String artist, long durationMs) {
        this.clientTrackId = clientTrackId;
        this.title = title;
        this.artist = artist;
        this.durationMs = durationMs;
    }

    public String getClientTrackId() {
        return clientTrackId;
    }

    public void setClientTrackId(String clientTrackId) {
        this.clientTrackId = clientTrackId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getArtist() {
        return artist;
    }

    public void setArtist(String artist) {
        this.artist = artist;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }
}
