package com.tunetogether.api.room;

import com.tunetogether.api.auth.JwtTokenProvider;
import com.tunetogether.api.exception.InvalidPasswordException;
import com.tunetogether.api.exception.RoomNotFoundException;
import com.tunetogether.api.membership.MembershipService;
import com.tunetogether.api.membership.RoomMembership;
import com.tunetogether.api.playlist.PlaylistTrackRepository;
import com.tunetogether.api.room.dto.CreateRoomRequest;
import com.tunetogether.api.room.dto.JoinRoomRequest;
import com.tunetogether.api.room.dto.RoomResponse;
import com.tunetogether.api.user.User;
import com.tunetogether.api.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RoomServiceTest {

    @Mock private RoomRepository roomRepository;
    @Mock private UserRepository userRepository;
    @Mock private MembershipService membershipService;
    @Mock private PlaylistTrackRepository playlistTrackRepository;
    @Mock private JwtTokenProvider jwtTokenProvider;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks
    private RoomService roomService;

    @Test
    void createRoom_success() {
        CreateRoomRequest request = new CreateRoomRequest("TestHost", null);

        User savedUser = new User("TestHost");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);
        when(roomRepository.existsByCode(anyString())).thenReturn(false);
        when(roomRepository.save(any(Room.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(membershipService.addMember(any(), any(), eq("HOST")))
                .thenReturn(new RoomMembership(null, savedUser, "HOST"));
        when(jwtTokenProvider.generateToken(any(), any(), anyString(), anyString(), any()))
                .thenReturn("mock-jwt-token");

        RoomResponse response = roomService.createRoom(request);

        assertNotNull(response);
        assertNotNull(response.getRoomCode());
        assertTrue(response.getRoomCode().startsWith("TT-"));
        assertEquals(9, response.getRoomCode().length()); // "TT-" (3) + 6 chars = 9
        assertEquals("mock-jwt-token", response.getToken());
        assertEquals("HOST", response.getRole());

        verify(userRepository).save(any(User.class));
        verify(roomRepository).save(any(Room.class));
        verify(membershipService).addMember(any(), any(), eq("HOST"));
    }

    @Test
    void createRoom_withPassword() {
        CreateRoomRequest request = new CreateRoomRequest("TestHost", "secret123");

        when(userRepository.save(any(User.class))).thenReturn(new User("TestHost"));
        when(roomRepository.existsByCode(anyString())).thenReturn(false);
        when(roomRepository.save(any(Room.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(passwordEncoder.encode("secret123")).thenReturn("$2a$12$hashedvalue");
        when(membershipService.addMember(any(), any(), eq("HOST")))
                .thenReturn(new RoomMembership(null, new User("TestHost"), "HOST"));
        when(jwtTokenProvider.generateToken(any(), any(), anyString(), anyString(), any()))
                .thenReturn("mock-jwt-token");

        RoomResponse response = roomService.createRoom(request);
        assertNotNull(response);
        verify(passwordEncoder).encode("secret123");
    }

    @Test
    void joinRoom_success_noPassword() {
        User host = new User("Host");
        Room room = new Room("TT-ABC123", host, null);
        JoinRoomRequest request = new JoinRoomRequest("Joiner", null);

        when(roomRepository.findByCodeAndStatus("TT-ABC123", "ACTIVE"))
                .thenReturn(Optional.of(room));
        when(userRepository.save(any(User.class))).thenReturn(new User("Joiner"));
        when(membershipService.addMember(any(), any(), eq("MEMBER")))
                .thenReturn(new RoomMembership(room, new User("Joiner"), "MEMBER"));
        when(jwtTokenProvider.generateToken(any(), any(), anyString(), anyString(), any()))
                .thenReturn("member-token");

        RoomResponse response = roomService.joinRoom("TT-ABC123", request);

        assertNotNull(response);
        assertEquals("MEMBER", response.getRole());
        assertEquals("member-token", response.getToken());
    }

    @Test
    void joinRoom_wrongPassword() {
        User host = new User("Host");
        Room room = new Room("TT-ABC123", host, "$2a$12$hashedvalue");
        JoinRoomRequest request = new JoinRoomRequest("Joiner", "wrong");

        when(roomRepository.findByCodeAndStatus("TT-ABC123", "ACTIVE"))
                .thenReturn(Optional.of(room));
        when(passwordEncoder.matches("wrong", "$2a$12$hashedvalue")).thenReturn(false);

        assertThrows(InvalidPasswordException.class,
                () -> roomService.joinRoom("TT-ABC123", request));
    }

    @Test
    void joinRoom_roomNotFound() {
        JoinRoomRequest request = new JoinRoomRequest("Joiner", null);

        when(roomRepository.findByCodeAndStatus("TT-NONEXIST", "ACTIVE"))
                .thenReturn(Optional.empty());

        assertThrows(RoomNotFoundException.class,
                () -> roomService.joinRoom("TT-NONEXIST", request));
    }

    @Test
    void generateUniqueCode_format() {
        when(roomRepository.existsByCode(anyString())).thenReturn(false);

        String code = roomService.generateUniqueCode();

        assertNotNull(code);
        assertTrue(code.startsWith("TT-"));
        assertEquals(9, code.length()); // "TT-" (3) + 6 chars = 9
    }

    @Test
    void generateUniqueCode_retriesOnCollision() {
        // First call returns true (collision), second returns false
        when(roomRepository.existsByCode(anyString()))
                .thenReturn(true)
                .thenReturn(false);

        String code = roomService.generateUniqueCode();
        assertNotNull(code);

        verify(roomRepository, times(2)).existsByCode(anyString());
    }
}
