package com.tunetogether.api.playlist;

import com.tunetogether.api.playlist.dto.ReorderPlaylistRequest;
import com.tunetogether.api.playlist.dto.TrackMetadataRequest;
import com.tunetogether.api.playlist.dto.TrackResponse;
import com.tunetogether.api.room.Room;
import com.tunetogether.api.user.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PlaylistServiceTest {

    @Mock private PlaylistTrackRepository trackRepository;

    @InjectMocks
    private PlaylistService playlistService;

    @Test
    void addTrack_appendsToEnd() {
        User host = new User("Host");
        Room room = new Room("TT-ABC123", host, null);
        UUID roomId = UUID.randomUUID();

        TrackMetadataRequest request = new TrackMetadataRequest(
                "track-1", "Bohemian Rhapsody", "Queen", 354000);

        when(trackRepository.findMaxOrderIndex(any())).thenReturn(2);
        when(trackRepository.save(any(PlaylistTrack.class))).thenAnswer(invocation -> {
            PlaylistTrack track = invocation.getArgument(0);
            assertEquals(3, track.getOrderIndex()); // Should be max + 1
            return track;
        });

        TrackResponse response = playlistService.addTrack(room, request);

        assertNotNull(response);
        assertEquals("track-1", response.getClientTrackId());
        assertEquals("Bohemian Rhapsody", response.getTitle());
        assertEquals("Queen", response.getArtist());
        assertEquals(354000, response.getDurationMs());
        assertEquals(3, response.getOrderIndex());
    }

    @Test
    void addTrack_firstTrackGetsIndexZero() {
        User host = new User("Host");
        Room room = new Room("TT-ABC123", host, null);

        TrackMetadataRequest request = new TrackMetadataRequest(
                "track-1", "First Song", "Artist", 180000);

        when(trackRepository.findMaxOrderIndex(any())).thenReturn(-1);
        when(trackRepository.save(any(PlaylistTrack.class))).thenAnswer(invocation -> {
            PlaylistTrack track = invocation.getArgument(0);
            assertEquals(0, track.getOrderIndex());
            return track;
        });

        TrackResponse response = playlistService.addTrack(room, request);
        assertEquals(0, response.getOrderIndex());
    }

    @Test
    void addTrack_trimsWhitespace() {
        User host = new User("Host");
        Room room = new Room("TT-ABC123", host, null);

        TrackMetadataRequest request = new TrackMetadataRequest(
                "track-1", "  Song Title  ", "  Artist Name  ", 200000);

        when(trackRepository.findMaxOrderIndex(any())).thenReturn(-1);
        when(trackRepository.save(any(PlaylistTrack.class))).thenAnswer(invocation -> {
            PlaylistTrack track = invocation.getArgument(0);
            assertEquals("Song Title", track.getTitle());
            assertEquals("Artist Name", track.getArtist());
            return track;
        });

        playlistService.addTrack(room, request);
        verify(trackRepository).save(any());
    }

    @Test
    void getTracks_returnsOrdered() {
        UUID roomId = UUID.randomUUID();
        User host = new User("Host");
        Room room = new Room("TT-ABC123", host, null);

        PlaylistTrack t1 = new PlaylistTrack(room, "t1", "Song A", "Artist", 100000, 0);
        PlaylistTrack t2 = new PlaylistTrack(room, "t2", "Song B", "Artist", 200000, 1);

        when(trackRepository.findByRoomIdOrderByOrderIndex(roomId))
                .thenReturn(Arrays.asList(t1, t2));

        List<TrackResponse> tracks = playlistService.getTracks(roomId);

        assertEquals(2, tracks.size());
        assertEquals("Song A", tracks.get(0).getTitle());
        assertEquals("Song B", tracks.get(1).getTitle());
        assertEquals(0, tracks.get(0).getOrderIndex());
        assertEquals(1, tracks.get(1).getOrderIndex());
    }

    @Test
    void removeTrack_callsRepository() {
        UUID roomId = UUID.randomUUID();
        UUID trackId = UUID.randomUUID();

        playlistService.removeTrack(roomId, trackId);

        verify(trackRepository).deleteByIdAndRoomId(trackId, roomId);
    }
}
