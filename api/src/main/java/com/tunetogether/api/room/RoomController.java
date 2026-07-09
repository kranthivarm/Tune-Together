package com.tunetogether.api.room;

import com.tunetogether.api.auth.RoomToken;
import com.tunetogether.api.exception.ForbiddenException;
import com.tunetogether.api.room.dto.CreateRoomRequest;
import com.tunetogether.api.room.dto.JoinRoomRequest;
import com.tunetogether.api.room.dto.RoomResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    /**
     * POST /api/v1/rooms — Create a new room.
     * No auth required. Returns room code + host JWT.
     */
    @PostMapping
    public ResponseEntity<RoomResponse> createRoom(@Valid @RequestBody CreateRoomRequest request) {
        RoomResponse response = roomService.createRoom(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * POST /api/v1/rooms/{code}/join — Join an existing room.
     * No auth required. Returns member JWT.
     */
    @PostMapping("/{code}/join")
    public ResponseEntity<RoomResponse> joinRoom(
            @PathVariable String code,
            @Valid @RequestBody JoinRoomRequest request) {
        RoomResponse response = roomService.joinRoom(code, request);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/v1/rooms/{code} — Get room state.
     * Requires auth (any room member).
     */
    @GetMapping("/{code}")
    public ResponseEntity<RoomResponse> getRoomState(@PathVariable String code) {
        RoomToken auth = getAuthToken();
        validateRoomAccess(auth, code);
        RoomResponse response = roomService.getRoomState(code);
        return ResponseEntity.ok(response);
    }

    /**
     * DELETE /api/v1/rooms/{code} — Close/delete room.
     * Requires auth (host only).
     */
    @DeleteMapping("/{code}")
    public ResponseEntity<Void> closeRoom(@PathVariable String code) {
        RoomToken auth = getAuthToken();
        validateRoomAccess(auth, code);
        if (!auth.isHost()) {
            throw new ForbiddenException("Only the host can close the room");
        }
        roomService.closeRoom(code, auth.getUserId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Extract the RoomToken from the security context.
     */
    private RoomToken getAuthToken() {
        return (RoomToken) SecurityContextHolder.getContext().getAuthentication();
    }

    /**
     * Validate that the authenticated user's token is scoped to the requested room.
     */
    private void validateRoomAccess(RoomToken auth, String code) {
        if (!auth.getRoomCode().equals(code)) {
            throw new ForbiddenException("Token is not valid for room " + code);
        }
    }
}
