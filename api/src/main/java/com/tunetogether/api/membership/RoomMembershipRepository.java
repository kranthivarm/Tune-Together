package com.tunetogether.api.membership;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RoomMembershipRepository extends JpaRepository<RoomMembership, UUID> {

    List<RoomMembership> findByRoomId(UUID roomId);

    boolean existsByRoomIdAndUserId(UUID roomId, UUID userId);

    int countByRoomId(UUID roomId);
}
