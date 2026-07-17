package com.tunetogether.api.auth;

import com.tunetogether.api.auth.dto.AuthResponse;
import com.tunetogether.api.auth.dto.LoginRequest;
import com.tunetogether.api.auth.dto.SignupRequest;
import com.tunetogether.api.exception.InvalidPasswordException;
import com.tunetogether.api.user.User;
import com.tunetogether.api.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Transactional
    public AuthResponse signup(SignupRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new IllegalArgumentException("Email already in use");
        }

        User user = new User(request.getDisplayName().trim());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        // Default theme
        user.setThemeMode("dark");
        user.setThemeColor("purple");

        user = userRepository.save(user);

        String token = jwtTokenProvider.generateToken(
                user.getId(), null, null, user.getDisplayName(), TokenType.APP_USER);

        return new AuthResponse(token, new AuthResponse.UserDto(
                user.getId(), user.getDisplayName(), user.getEmail(), user.getThemeMode(), user.getThemeColor()
        ));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new InvalidPasswordException();
        }

        String token = jwtTokenProvider.generateToken(
                user.getId(), null, null, user.getDisplayName(), TokenType.APP_USER);

        return new AuthResponse(token, new AuthResponse.UserDto(
                user.getId(), user.getDisplayName(), user.getEmail(), user.getThemeMode(), user.getThemeColor()
        ));
    }
}
