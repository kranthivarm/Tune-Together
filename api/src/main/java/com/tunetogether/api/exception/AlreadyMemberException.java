package com.tunetogether.api.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class AlreadyMemberException extends RuntimeException {

    public AlreadyMemberException(String roomCode) {
        super("User is already a member of room " + roomCode);
    }
}
