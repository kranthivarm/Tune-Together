package com.tunetogether.api.playlist;

import com.tunetogether.api.auth.RoomToken;
import com.tunetogether.api.exception.ForbiddenException;
import com.tunetogether.api.playlist.dto.ReorderPlaylistRequest;
import com.tunetogether.api.playlist.dto.TrackMetadataRequest;
import com.tunetogether.api.playlist.dto.TrackResponse;
import com.tunetogether.api.room.Room;
import com.tunetogether.api.room.RoomService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rooms/{code}/playlist")
public class PlaylistController {

    private final PlaylistService playlistService;
    private final RoomService roomService;

    public PlaylistController(PlaylistService playlistService, RoomService roomService) {
        this.playlistService = playlistService;
        this.roomService = roomService;
    }

    /**
     * POST /api/v1/rooms/{code}/playlist — Add track metadata.
     * Host only.
     */
    @PostMapping
    public ResponseEntity<TrackResponse> addTrack(
            @PathVariable String code,
            @Valid @RequestBody TrackMetadataRequest request) {
        RoomToken auth = requireHost(code);
        Room room = roomService.findActiveRoom(code);
        TrackResponse response = playlistService.addTrack(room, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * PUT /api/v1/rooms/{code}/playlist — Reorder playlist.
     * Host only.
     */
    @PutMapping
    public ResponseEntity<List<TrackResponse>> reorderPlaylist(
            @PathVariable String code,
            @Valid @RequestBody ReorderPlaylistRequest request) {
        RoomToken auth = requireHost(code);
        Room room = roomService.findActiveRoom(code);
        List<TrackResponse> response = playlistService.reorderTracks(room.getId(), request);
        return ResponseEntity.ok(response);
    }

    /**
     * DELETE /api/v1/rooms/{code}/playlist/{trackId} — Remove track.
     * Host only.
     */
    @DeleteMapping("/{trackId}")
    public ResponseEntity<Void> removeTrack(
            @PathVariable String code,
            @PathVariable UUID trackId) {
        RoomToken auth = requireHost(code);
        Room room = roomService.findActiveRoom(code);
        playlistService.removeTrack(room.getId(), trackId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Require the authenticated user to be the HOST of the specified room.
     */
    private RoomToken requireHost(String code) {
        RoomToken auth = (RoomToken) SecurityContextHolder.getContext().getAuthentication();
        if (!auth.getRoomCode().equals(code)) {
            throw new ForbiddenException("Token is not valid for room " + code);
        }
        if (!auth.isHost()) {
            throw new ForbiddenException("Only the host can manage the playlist");
        }
        return auth;
    }
}
