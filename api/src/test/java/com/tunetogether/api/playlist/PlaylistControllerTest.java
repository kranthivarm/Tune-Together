package com.tunetogether.api.playlist;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tunetogether.api.playlist.dto.TrackMetadataRequest;
import com.tunetogether.api.room.dto.CreateRoomRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlaylistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String roomCode;
    private String hostToken;
    private String memberToken;

    @BeforeEach
    void setupRoom() throws Exception {
        // Create a room
        CreateRoomRequest createReq = new CreateRoomRequest("PlaylistHost", null);
        MvcResult createResult = mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String body = createResult.getResponse().getContentAsString();
        roomCode = objectMapper.readTree(body).get("roomCode").asText();
        hostToken = objectMapper.readTree(body).get("token").asText();

        // Join room as member
        MvcResult joinResult = mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\": \"Member\"}"))
                .andExpect(status().isOk())
                .andReturn();
        memberToken = objectMapper.readTree(joinResult.getResponse().getContentAsString())
                .get("token").asText();
    }

    @Test
    void addTrack_hostCanAdd() throws Exception {
        TrackMetadataRequest track = new TrackMetadataRequest(
                "track-001", "Bohemian Rhapsody", "Queen", 354000);

        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(track)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.clientTrackId", is("track-001")))
                .andExpect(jsonPath("$.title", is("Bohemian Rhapsody")))
                .andExpect(jsonPath("$.artist", is("Queen")))
                .andExpect(jsonPath("$.durationMs", is(354000)))
                .andExpect(jsonPath("$.orderIndex", is(0)));
    }

    @Test
    void addTrack_memberCannotAdd() throws Exception {
        TrackMetadataRequest track = new TrackMetadataRequest(
                "track-001", "Song", "Artist", 180000);

        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(track)))
                .andExpect(status().isForbidden());
    }

    @Test
    void addMultipleTracks_orderIncrements() throws Exception {
        TrackMetadataRequest track1 = new TrackMetadataRequest(
                "track-a", "Song A", "Artist A", 180000);
        TrackMetadataRequest track2 = new TrackMetadataRequest(
                "track-b", "Song B", "Artist B", 240000);

        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(track1)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderIndex", is(0)));

        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(track2)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderIndex", is(1)));
    }

    @Test
    void addTrack_invalidRequest_missingTitle() throws Exception {
        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientTrackId\": \"t1\", \"durationMs\": 100}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void addTrack_noAuth_returns401() throws Exception {
        TrackMetadataRequest track = new TrackMetadataRequest(
                "track-001", "Song", "Artist", 180000);

        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(track)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void playlistVisibleInRoomState() throws Exception {
        // Add a track
        TrackMetadataRequest track = new TrackMetadataRequest(
                "track-xyz", "My Song", "My Artist", 200000);

        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/playlist")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(track)))
                .andExpect(status().isCreated());

        // Room state should include the track
        mockMvc.perform(get("/api/v1/rooms/" + roomCode)
                        .header("Authorization", "Bearer " + hostToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$.playlist[?(@.title == 'My Song')]", hasSize(1)));
    }
}
