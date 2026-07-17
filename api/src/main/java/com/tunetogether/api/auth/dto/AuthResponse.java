package com.tunetogether.api.auth.dto;

import java.util.UUID;

public class AuthResponse {

    private String token;
    private UserDto user;

    public AuthResponse() {}

    public AuthResponse(String token, UserDto user) {
        this.token = token;
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public UserDto getUser() {
        return user;
    }

    public void setUser(UserDto user) {
        this.user = user;
    }

    public static class UserDto {
        private UUID id;
        private String displayName;
        private String email;
        private String themeMode;
        private String themeColor;

        public UserDto() {}

        public UserDto(UUID id, String displayName, String email, String themeMode, String themeColor) {
            this.id = id;
            this.displayName = displayName;
            this.email = email;
            this.themeMode = themeMode;
            this.themeColor = themeColor;
        }

        public UUID getId() { return id; }
        public String getDisplayName() { return displayName; }
        public String getEmail() { return email; }
        public String getThemeMode() { return themeMode; }
        public String getThemeColor() { return themeColor; }
    }
}
