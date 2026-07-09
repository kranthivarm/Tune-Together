package com.tunetogether.api.room.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateRoomRequest {

    @NotBlank(message = "Display name is required")
    @Size(min = 1, max = 100, message = "Display name must be between 1 and 100 characters")
    private String hostDisplayName;

    @Size(min = 4, max = 128, message = "Password must be between 4 and 128 characters")
    private String password;

    public CreateRoomRequest() {}

    public CreateRoomRequest(String hostDisplayName, String password) {
        this.hostDisplayName = hostDisplayName;
        this.password = password;
    }

    public String getHostDisplayName() {
        return hostDisplayName;
    }

    public void setHostDisplayName(String hostDisplayName) {
        this.hostDisplayName = hostDisplayName;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
