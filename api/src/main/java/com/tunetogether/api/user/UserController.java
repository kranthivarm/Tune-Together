package com.tunetogether.api.user;

import com.tunetogether.api.auth.RoomToken;
import com.tunetogether.api.auth.dto.AuthResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(@AuthenticationPrincipal RoomToken auth) {
        if (auth == null || auth.getUserId() == null) {
            return ResponseEntity.status(401).build();
        }
        
        User user = userRepository.findById(auth.getUserId()).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(new AuthResponse.UserDto(
                user.getId(), user.getDisplayName(), user.getEmail(), user.getThemeMode(), user.getThemeColor()
        ));
    }

    @PutMapping("/me/theme")
    public ResponseEntity<?> updateTheme(@AuthenticationPrincipal RoomToken auth, @RequestBody Map<String, String> payload) {
        if (auth == null || auth.getUserId() == null) {
            return ResponseEntity.status(401).build();
        }

        User user = userRepository.findById(auth.getUserId()).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        if (payload.containsKey("themeMode")) {
            user.setThemeMode(payload.get("themeMode"));
        }
        if (payload.containsKey("themeColor")) {
            user.setThemeColor(payload.get("themeColor"));
        }

        user = userRepository.save(user);

        return ResponseEntity.ok(new AuthResponse.UserDto(
                user.getId(), user.getDisplayName(), user.getEmail(), user.getThemeMode(), user.getThemeColor()
        ));
    }
}
