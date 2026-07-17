/**
 * API Service for TuneTogether REST API
 * Communicates with Spring Boot backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

class ApiService {
  constructor() {
    this.authToken = null;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  getHeaders(includeAuth = false) {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (includeAuth && this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async handleResponse(response) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: `HTTP ${response.status}`,
      }));
      throw new Error(error.message || error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * POST /auth/signup
   */
  async signup({ displayName, email, password }) {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ displayName, email, password }),
    });
    return this.handleResponse(response);
  }

  /**
   * POST /auth/login
   */
  async login({ email, password }) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    return this.handleResponse(response);
  }

  /**
   * GET /users/me
   */
  async getMe() {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: 'GET',
      headers: this.getHeaders(true),
    });
    return this.handleResponse(response);
  }

  /**
   * PUT /users/me/theme
   */
  async updateTheme({ themeMode, themeColor }) {
    const response = await fetch(`${API_BASE_URL}/users/me/theme`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify({ themeMode, themeColor }),
    });
    return this.handleResponse(response);
  }

  /**
   * POST /rooms — Create a new room
   */
  async createRoom({ displayName, roomName, password }) {
    const response = await fetch(`${API_BASE_URL}/rooms`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        hostDisplayName: displayName,
        ...(roomName && { roomName }),
        ...(password && { password }),
      }),
    });

    const data = await this.handleResponse(response);
    this.setAuthToken(data.token);
    return data;
  }

  /**
   * POST /rooms/{code}/join — Join an existing room
   */
  async joinRoom({ roomCode, displayName, password }) {
    const response = await fetch(`${API_BASE_URL}/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        displayName,
        ...(password && { password }),
      }),
    });

    const data = await this.handleResponse(response);
    this.setAuthToken(data.token);
    return data;
  }

  /**
   * GET /rooms/{code} — Get room state
   */
  async getRoomState(roomCode) {
    const response = await fetch(`${API_BASE_URL}/rooms/${roomCode}`, {
      method: 'GET',
      headers: this.getHeaders(true),
    });

    return this.handleResponse(response);
  }

  /**
   * DELETE /rooms/{code} — Close room (host only)
   */
  async closeRoom(roomCode) {
    const response = await fetch(`${API_BASE_URL}/rooms/${roomCode}`, {
      method: 'DELETE',
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      throw new Error('Failed to close room');
    }
  }

  // ─── Playlist Endpoints ────────────────────────────────────

  /**
   * POST /rooms/{code}/playlist — Add track metadata (host only)
   * Note: Only metadata is sent. Audio files NEVER leave the host device.
   */
  async addTrackMetadata(roomCode, { clientTrackId, title, artist, durationMs }) {
    const response = await fetch(`${API_BASE_URL}/rooms/${roomCode}/playlist`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ clientTrackId, title, artist, durationMs }),
    });

    return this.handleResponse(response);
  }

  /**
   * DELETE /rooms/{code}/playlist/{trackId} — Remove track (host only)
   */
  async removeTrack(roomCode, trackId) {
    const response = await fetch(`${API_BASE_URL}/rooms/${roomCode}/playlist/${trackId}`, {
      method: 'DELETE',
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      throw new Error('Failed to remove track');
    }
  }

  /**
   * PUT /rooms/{code}/playlist — Reorder playlist (host only)
   */
  async reorderPlaylist(roomCode, trackIds) {
    const response = await fetch(`${API_BASE_URL}/rooms/${roomCode}/playlist`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify({ trackIds }),
    });

    return this.handleResponse(response);
  }
}

export default new ApiService();
