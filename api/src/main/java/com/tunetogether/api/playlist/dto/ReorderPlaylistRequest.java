package com.tunetogether.api.playlist.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * Request DTO for reordering the playlist.
 * Contains the full ordered list of track IDs.
 */
public class ReorderPlaylistRequest {

    @NotNull(message = "Track order list is required")
    private List<String> trackOrder;

    public ReorderPlaylistRequest() {}

    public ReorderPlaylistRequest(List<String> trackOrder) {
        this.trackOrder = trackOrder;
    }

    public List<String> getTrackOrder() {
        return trackOrder;
    }

    public void setTrackOrder(List<String> trackOrder) {
        this.trackOrder = trackOrder;
    }
}
