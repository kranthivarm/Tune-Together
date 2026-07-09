package config

import (
	"fmt"
	"os"
)

// Config holds all configuration for the realtime server.
type Config struct {
	Port            string
	JWTSecret       string
	LiveKitHost     string
	LiveKitAPIKey   string
	LiveKitSecret   string
	DatabaseURL     string
	SpringBootURL   string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		Port:          getEnv("PORT", "8081"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-key-change-in-production-min-32-chars!!"),
		LiveKitHost:   getEnv("LIVEKIT_HOST", "http://localhost:7880"),
		LiveKitAPIKey: getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitSecret: getEnv("LIVEKIT_API_SECRET", "dev-secret-that-is-at-least-32-characters-long"),
		DatabaseURL:   getEnv("DATABASE_URL", ""),
		SpringBootURL: getEnv("SPRING_BOOT_URL", "http://localhost:8080"),
	}

	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
