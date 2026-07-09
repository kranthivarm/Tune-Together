package auth

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

// RoomClaims represents the JWT claims issued by the Spring Boot API.
// The Go signaling server validates these same tokens (shared secret).
type RoomClaims struct {
	RoomID      string `json:"roomId"`
	RoomCode    string `json:"roomCode"`
	Role        string `json:"role"`        // HOST or MEMBER
	DisplayName string `json:"displayName"`
	jwt.RegisteredClaims
}

// IsHost returns true if the token holder is the room host.
func (c *RoomClaims) IsHost() bool {
	return c.Role == "HOST"
}

// UserID returns the user UUID from the Subject claim.
func (c *RoomClaims) UserID() string {
	return c.Subject
}

// JWTValidator validates room-scoped JWTs using the shared secret.
type JWTValidator struct {
	secret []byte
}

// NewJWTValidator creates a validator with the shared HMAC secret.
func NewJWTValidator(secret string) *JWTValidator {
	return &JWTValidator{secret: []byte(secret)}
}

// Validate parses and validates a JWT token string, returning the claims.
func (v *JWTValidator) Validate(tokenStr string) (*RoomClaims, error) {
	claims := &RoomClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		// Ensure HMAC signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return v.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("token is not valid")
	}

	// Validate required claims
	if claims.RoomCode == "" {
		return nil, fmt.Errorf("missing roomCode claim")
	}
	if claims.Role != "HOST" && claims.Role != "MEMBER" {
		return nil, fmt.Errorf("invalid role claim: %s", claims.Role)
	}

	return claims, nil
}
