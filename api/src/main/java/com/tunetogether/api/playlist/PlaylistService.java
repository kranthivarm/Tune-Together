package com.tunetogether.api.playlist;

import com.tunetogether.api.playlist.dto.ReorderPlaylistRequest;
import com.tunetogether.api.playlist.dto.TrackMetadataRequest;
import com.tunetogether.api.playlist.dto.TrackResponse;
import com.tunetogether.api.room.Room;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class PlaylistService {

    private final PlaylistTrackRepository trackRepository;

    public PlaylistService(PlaylistTrackRepository trackRepository) {
        this.trackRepository = trackRepository;
    }

    /**
     * Add a track to the room's playlist. Appends to the end.
     */
    @Transactional
    public TrackResponse addTrack(Room room, TrackMetadataRequest request) {
        int nextOrder = trackRepository.findMaxOrderIndex(room.getId()) + 1;

        PlaylistTrack track = new PlaylistTrack(
                room,
                request.getClientTrackId(),
                request.getTitle().trim(),
                request.getArtist() != null ? request.getArtist().trim() : null,
                request.getDurationMs(),
                nextOrder);

        track = trackRepository.save(track);

        return toResponse(track);
    }

    /**
     * Get all tracks for a room, ordered by order_index.
     */
    @Transactional(readOnly = true)
    public List<TrackResponse> getTracks(UUID roomId) {
        return trackRepository.findByRoomIdOrderByOrderIndex(roomId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Reorder tracks by providing the new ordered list of client track IDs.
     */
    @Transactional
    public List<TrackResponse> reorderTracks(UUID roomId, ReorderPlaylistRequest request) {
        List<PlaylistTrack> tracks = trackRepository.findByRoomIdOrderByOrderIndex(roomId);

        Map<String, PlaylistTrack> trackMap = tracks.stream()
                .collect(Collectors.toMap(PlaylistTrack::getClientTrackId, Function.identity()));

        List<String> newOrder = request.getTrackOrder();
        for (int i = 0; i < newOrder.size(); i++) {
            PlaylistTrack track = trackMap.get(newOrder.get(i));
            if (track != null) {
                track.setOrderIndex(i);
            }
        }

        trackRepository.saveAll(tracks);

        return trackRepository.findByRoomIdOrderByOrderIndex(roomId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Remove a track from the playlist.
     */
    @Transactional
    public void removeTrack(UUID roomId, UUID trackId) {
        trackRepository.deleteByIdAndRoomId(trackId, roomId);
    }

    private TrackResponse toResponse(PlaylistTrack track) {
        return new TrackResponse(
                track.getId(),
                track.getClientTrackId(),
                track.getTitle(),
                track.getArtist(),
                track.getDurationMs(),
                track.getOrderIndex());
    }
}
