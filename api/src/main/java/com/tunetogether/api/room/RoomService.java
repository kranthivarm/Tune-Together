package com.tunetogether.api.room;

import com.tunetogether.api.auth.JwtTokenProvider;
import com.tunetogether.api.auth.TokenType;
import com.tunetogether.api.exception.ForbiddenException;
import com.tunetogether.api.exception.InvalidPasswordException;
import com.tunetogether.api.exception.RoomNotFoundException;
import com.tunetogether.api.membership.MembershipService;
import com.tunetogether.api.membership.RoomMembership;
import com.tunetogether.api.playlist.PlaylistTrackRepository;
import com.tunetogether.api.playlist.dto.TrackResponse;
import com.tunetogether.api.room.dto.CreateRoomRequest;
import com.tunetogether.api.room.dto.JoinRoomRequest;
import com.tunetogether.api.room.dto.RoomResponse;
import com.tunetogether.api.user.User;
import com.tunetogether.api.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;

import com.tunetogether.api.auth.RoomToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

@Service
public class RoomService {

    private static final String CODE_PREFIX = "TT-";
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
    private static final int CODE_LENGTH = 6;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RoomRepository roomRepository;
    private final UserRepository userRepository;
    private final MembershipService membershipService;
    private final PlaylistTrackRepository playlistTrackRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    public RoomService(RoomRepository roomRepository,
                       UserRepository userRepository,
                       MembershipService membershipService,
                       PlaylistTrackRepository playlistTrackRepository,
                       JwtTokenProvider jwtTokenProvider,
                       PasswordEncoder passwordEncoder) {
        this.roomRepository = roomRepository;
        this.userRepository = userRepository;
        this.membershipService = membershipService;
        this.playlistTrackRepository = playlistTrackRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Create a new room with auto-generated code.
     * Creates a lightweight user, the room, and HOST membership.
     */
    @Transactional
    public RoomResponse createRoom(CreateRoomRequest request) {
        User host = getAuthenticatedAppUser();
        if (host == null) {
            // Create lightweight guest user
            host = new User(request.getHostDisplayName().trim());
            host = userRepository.save(host);
        } else {
            // If logged in, they might have provided a different display name for the room,
            // but we'll stick to their main display name or update it? Let's just use their existing name.
            // Actually, let's allow them to override it if they want by updating the User record?
            // For now, let's just use the name they provided in the request or keep their original name.
            // We'll use their original name to be safe and consistent.
        }

        // Generate unique room code
        String code = generateUniqueCode();

        // Hash password if provided
        String passwordHash = null;
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            passwordHash = passwordEncoder.encode(request.getPassword());
        }

        // Create room
        Room room = new Room(code, host, passwordHash);
        room = roomRepository.save(room);

        // Add host as member
        membershipService.addMember(room, host, "HOST");

        // Generate JWT
        String token = jwtTokenProvider.generateToken(
                host.getId(), room.getId(), code,
                host.getDisplayName(), TokenType.HOST);

        return RoomResponse.forAuth(room.getId(), code, token, "HOST");
    }

    /**
     * Join an existing active room. Validates password if required.
     */
    @Transactional
    public RoomResponse joinRoom(String code, JoinRoomRequest request) {
        Room room = findActiveRoom(code);

        // Check password
        if (room.hasPassword()) {
            if (request.getPassword() == null ||
                !passwordEncoder.matches(request.getPassword(), room.getPasswordHash())) {
                throw new InvalidPasswordException();
            }
        }

        User user = getAuthenticatedAppUser();
        if (user == null) {
            // Create lightweight guest user
            user = new User(request.getDisplayName().trim());
            user = userRepository.save(user);
        }

        // Add membership
        membershipService.addMember(room, user, "MEMBER");

        // Generate JWT
        String token = jwtTokenProvider.generateToken(
                user.getId(), room.getId(), code,
                user.getDisplayName(), TokenType.MEMBER);

        return RoomResponse.forAuth(room.getId(), code, token, "MEMBER");
    }

    /**
     * Get full room state including playlist and member list.
     */
    @Transactional(readOnly = true)
    public RoomResponse getRoomState(String code) {
        Room room = findActiveRoom(code);

        // Get playlist
        List<TrackResponse> playlist = playlistTrackRepository
                .findByRoomIdOrderByOrderIndex(room.getId())
                .stream()
                .map(t -> new TrackResponse(
                        t.getId(), t.getClientTrackId(), t.getTitle(),
                        t.getArtist(), t.getDurationMs(), t.getOrderIndex()))
                .toList();

        // Get members
        List<RoomResponse.MemberInfo> members = membershipService.getMembers(room)
                .stream()
                .map(m -> new RoomResponse.MemberInfo(
                        m.getUser().getId(),
                        m.getUser().getDisplayName(),
                        m.getRole(),
                        m.getJoinedAt()))
                .toList();

        return RoomResponse.forState(
                room.getId(), room.getCode(),
                room.getHost().getDisplayName(),
                room.getStatus(), room.hasPassword(),
                members.size(), room.getCreatedAt(),
                playlist, members);
    }

    /**
     * Close a room. Only the host can do this.
     */
    @Transactional
    public void closeRoom(String code, UUID hostUserId) {
        Room room = findActiveRoom(code);

        if (!room.getHost().getId().equals(hostUserId)) {
            throw new ForbiddenException("Only the host can close the room");
        }

        room.close();
        roomRepository.save(room);
    }

    /**
     * Find an active room by code or throw 404.
     */
    public Room findActiveRoom(String code) {
        return roomRepository.findByCodeAndStatus(code, "ACTIVE")
                .orElseThrow(() -> new RoomNotFoundException(code));
    }

    /**
     * Generate a unique room code with TT- prefix.
     * Format: TT-XXXXXX (6 alphanumeric chars, no ambiguous chars).
     */
    String generateUniqueCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_PREFIX);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_CHARS.charAt(RANDOM.nextInt(CODE_CHARS.length())));
            }
            String code = sb.toString();
            if (!roomRepository.existsByCode(code)) {
                return code;
            }
        }
        throw new RuntimeException("Failed to generate unique room code after 10 attempts");
    }

    /**
     * Helper to get the authenticated APP_USER from the security context.
     */
    private User getAuthenticatedAppUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof RoomToken roomToken && roomToken.getTokenType() == TokenType.APP_USER) {
            return userRepository.findById(roomToken.getUserId()).orElse(null);
        }
        return null;
    }
}
