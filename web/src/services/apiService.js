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
}

export default new ApiService();
