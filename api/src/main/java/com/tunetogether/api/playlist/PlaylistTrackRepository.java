package com.tunetogether.api.playlist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlaylistTrackRepository extends JpaRepository<PlaylistTrack, UUID> {

    List<PlaylistTrack> findByRoomIdOrderByOrderIndex(UUID roomId);

    Optional<PlaylistTrack> findByRoomIdAndClientTrackId(UUID roomId, String clientTrackId);

    Optional<PlaylistTrack> findByIdAndRoomId(UUID id, UUID roomId);

    int countByRoomId(UUID roomId);

    void deleteByIdAndRoomId(UUID id, UUID roomId);

    @Query("SELECT COALESCE(MAX(pt.orderIndex), -1) FROM PlaylistTrack pt WHERE pt.room.id = :roomId")
    int findMaxOrderIndex(@Param("roomId") UUID roomId);
}
