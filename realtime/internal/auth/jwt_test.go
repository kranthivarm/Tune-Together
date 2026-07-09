package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "dev-secret-key-change-in-production-min-32-chars!!"

// generateTestToken creates a JWT matching the Spring Boot format.
func generateTestToken(t *testing.T, userID, roomID, roomCode, role, displayName string, expired bool) string {
	t.Helper()

	exp := time.Now().Add(24 * time.Hour)
	if expired {
		exp = time.Now().Add(-1 * time.Hour)
	}

	claims := RoomClaims{
		RoomID:      roomID,
		RoomCode:    roomCode,
		Role:        role,
		DisplayName: displayName,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}
	return signed
}

func TestValidateToken_Valid(t *testing.T) {
	v := NewJWTValidator(testSecret)
	tokenStr := generateTestToken(t, "user-123", "room-456", "TT-ABC123", "HOST", "TestHost", false)

	claims, err := v.Validate(tokenStr)
	if err != nil {
		t.Fatalf("expected valid token, got error: %v", err)
	}

	if claims.UserID() != "user-123" {
		t.Errorf("expected userID user-123, got %s", claims.UserID())
	}
	if claims.RoomCode != "TT-ABC123" {
		t.Errorf("expected roomCode TT-ABC123, got %s", claims.RoomCode)
	}
	if claims.Role != "HOST" {
		t.Errorf("expected role HOST, got %s", claims.Role)
	}
	if !claims.IsHost() {
		t.Error("expected IsHost() to be true")
	}
	if claims.DisplayName != "TestHost" {
		t.Errorf("expected displayName TestHost, got %s", claims.DisplayName)
	}
}

func TestValidateToken_Member(t *testing.T) {
	v := NewJWTValidator(testSecret)
	tokenStr := generateTestToken(t, "user-789", "room-456", "TT-ABC123", "MEMBER", "TestMember", false)

	claims, err := v.Validate(tokenStr)
	if err != nil {
		t.Fatalf("expected valid token, got error: %v", err)
	}

	if claims.IsHost() {
		t.Error("expected IsHost() to be false for MEMBER")
	}
	if claims.Role != "MEMBER" {
		t.Errorf("expected role MEMBER, got %s", claims.Role)
	}
}

func TestValidateToken_Expired(t *testing.T) {
	v := NewJWTValidator(testSecret)
	tokenStr := generateTestToken(t, "user-123", "room-456", "TT-ABC123", "HOST", "TestHost", true)

	_, err := v.Validate(tokenStr)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	v := NewJWTValidator("different-secret-key-at-least-32-characters-long!!")
	tokenStr := generateTestToken(t, "user-123", "room-456", "TT-ABC123", "HOST", "TestHost", false)

	_, err := v.Validate(tokenStr)
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestValidateToken_Garbage(t *testing.T) {
	v := NewJWTValidator(testSecret)

	_, err := v.Validate("not.a.valid.jwt")
	if err == nil {
		t.Fatal("expected error for garbage token")
	}
}
