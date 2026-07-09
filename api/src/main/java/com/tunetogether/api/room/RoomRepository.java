package com.tunetogether.api.room;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface RoomRepository extends JpaRepository<Room, UUID> {

    Optional<Room> findByCodeAndStatus(String code, String status);

    Optional<Room> findByCode(String code);

    boolean existsByCode(String code);
}
