package com.tunetogether.api.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tunetogether.api.room.dto.CreateRoomRequest;
import com.tunetogether.api.room.dto.JoinRoomRequest;
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
class RoomControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void createRoom_returnsCodeAndToken() throws Exception {
        CreateRoomRequest request = new CreateRoomRequest("TestHost", null);

        mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomCode", startsWith("TT-")))
                .andExpect(jsonPath("$.roomCode", hasLength(9)))
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.role", is("HOST")));
    }

    @Test
    void createRoom_withPassword() throws Exception {
        CreateRoomRequest request = new CreateRoomRequest("TestHost", "secret123");

        mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomCode", startsWith("TT-")))
                .andExpect(jsonPath("$.token", notNullValue()));
    }

    @Test
    void createRoom_invalidRequest_missingName() throws Exception {
        mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\": \"test\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("VALIDATION_ERROR")));
    }

    @Test
    void fullLifecycle_createJoinGetClose() throws Exception {
        // 1. Create room
        CreateRoomRequest createReq = new CreateRoomRequest("Host", null);
        MvcResult createResult = mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String createBody = createResult.getResponse().getContentAsString();
        String roomCode = objectMapper.readTree(createBody).get("roomCode").asText();
        String hostToken = objectMapper.readTree(createBody).get("token").asText();

        // 2. Join room
        JoinRoomRequest joinReq = new JoinRoomRequest("Member1", null);
        MvcResult joinResult = mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(joinReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role", is("MEMBER")))
                .andExpect(jsonPath("$.token", notNullValue()))
                .andReturn();

        String memberToken = objectMapper.readTree(joinResult.getResponse().getContentAsString())
                .get("token").asText();

        // 3. Get room state (as host)
        mockMvc.perform(get("/api/v1/rooms/" + roomCode)
                        .header("Authorization", "Bearer " + hostToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomCode", is(roomCode)))
                .andExpect(jsonPath("$.status", is("ACTIVE")))
                .andExpect(jsonPath("$.hostDisplayName", is("Host")))
                .andExpect(jsonPath("$.memberCount", is(2)))
                .andExpect(jsonPath("$.members", hasSize(2)));

        // 4. Get room state (as member)
        mockMvc.perform(get("/api/v1/rooms/" + roomCode)
                        .header("Authorization", "Bearer " + memberToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomCode", is(roomCode)));

        // 5. Member cannot close room
        mockMvc.perform(delete("/api/v1/rooms/" + roomCode)
                        .header("Authorization", "Bearer " + memberToken))
                .andExpect(status().isForbidden());

        // 6. Host closes room
        mockMvc.perform(delete("/api/v1/rooms/" + roomCode)
                        .header("Authorization", "Bearer " + hostToken))
                .andExpect(status().isNoContent());

        // 7. Room is now gone (closed)
        mockMvc.perform(get("/api/v1/rooms/" + roomCode)
                        .header("Authorization", "Bearer " + hostToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void joinRoom_wrongPassword() throws Exception {
        // Create room with password
        CreateRoomRequest createReq = new CreateRoomRequest("Host", "correct-password");
        MvcResult createResult = mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String roomCode = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("roomCode").asText();

        // Try joining with wrong password
        JoinRoomRequest joinReq = new JoinRoomRequest("Intruder", "wrong-password");
        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(joinReq)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error", is("INVALID_PASSWORD")));
    }

    @Test
    void joinRoom_correctPassword() throws Exception {
        // Create room with password
        CreateRoomRequest createReq = new CreateRoomRequest("Host", "my-secret");
        MvcResult createResult = mockMvc.perform(post("/api/v1/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String roomCode = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("roomCode").asText();

        // Join with correct password
        JoinRoomRequest joinReq = new JoinRoomRequest("Friend", "my-secret");
        mockMvc.perform(post("/api/v1/rooms/" + roomCode + "/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(joinReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role", is("MEMBER")));
    }

    @Test
    void joinRoom_notFound() throws Exception {
        JoinRoomRequest joinReq = new JoinRoomRequest("Nobody", null);
        mockMvc.perform(post("/api/v1/rooms/TT-NOTFND/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(joinReq)))
                .andExpect(status().isNotFound());
    }

    @Test
    void getRoomState_noAuth_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/rooms/TT-ABC123"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getRoomState_invalidToken_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/rooms/TT-ABC123")
                        .header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
    }
}
