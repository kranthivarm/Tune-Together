package com.tunetogether.api.membership;

import com.tunetogether.api.exception.AlreadyMemberException;
import com.tunetogether.api.room.Room;
import com.tunetogether.api.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MembershipService {

    private final RoomMembershipRepository membershipRepository;

    public MembershipService(RoomMembershipRepository membershipRepository) {
        this.membershipRepository = membershipRepository;
    }

    @Transactional
    public RoomMembership addMember(Room room, User user, String role) {
        if (membershipRepository.existsByRoomIdAndUserId(room.getId(), user.getId())) {
            throw new AlreadyMemberException(room.getCode());
        }
        RoomMembership membership = new RoomMembership(room, user, role);
        return membershipRepository.save(membership);
    }

    @Transactional(readOnly = true)
    public List<RoomMembership> getMembers(Room room) {
        return membershipRepository.findByRoomId(room.getId());
    }

    @Transactional(readOnly = true)
    public int getMemberCount(Room room) {
        return membershipRepository.countByRoomId(room.getId());
    }
}
