/**
 * WebSocket Service for TuneTogether Signaling Server
 * Handles real-time commands, clock sync, and room events
 * 
 * Go backend uses snake_case message types:
 *   play, pause, seek, skip, track_changed, time_sync_response, etc.
 * 
 * Go Message struct: { "type": "...", "payload": {...} }
 */

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081/ws';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.listeners = new Map();
    this.clockSyncListeners = [];
    this.driftListeners = [];
    this.roomStateListeners = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.livekitToken = null;
    this.authToken = null;
  }

  /**
   * Connect to WebSocket server with auth token
   */
  connect(authToken) {
    this.authToken = authToken;
    return new Promise((resolve, reject) => {
      const url = `${WS_BASE_URL}?token=${authToken}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.connected = false;
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.connected = false;
        this.attemptReconnect(authToken);
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect(authToken) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(authToken).catch(console.error);
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    this.maxReconnectAttempts = 0; // Prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /**
   * Send a message to the server.
   * Go expects: { "type": "...", "payload": {...} }
   */
  send(type, payload = null) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = { type };
    if (payload !== null) {
      message.payload = payload;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming messages from Go backend.
   * Go sends: { "type": "...", "payload": {...} }
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const { type, payload } = message;

      // Handle clock sync — Go sends type "time_sync_response" with payload {t0}
      if (type === 'time_sync_response') {
        this.handleTimeSyncRequest(payload || message);
        return;
      }

      // Handle clock sync result — Go sends type "time_sync_result" with payload {offsetMs, rttMs}
      if (type === 'time_sync_result') {
        this.handleTimeSyncResult(payload || message);
        return;
      }

      // Handle room state — contains LiveKit token
      if (type === 'room_state') {
        const statePayload = payload || message;
        if (statePayload.livekitToken) {
          this.livekitToken = statePayload.livekitToken;
        }
        this.roomStateListeners.forEach((cb) => cb(statePayload));
        return;
      }

      // Handle drift correction
      if (type === 'drift_correction') {
        this.handleDriftCorrection(payload || message);
        return;
      }

      // For all other messages (play, pause, track_changed, member_joined, etc.)
      // notify listeners with the payload extracted
      const listeners = this.listeners.get(type) || [];
      listeners.forEach((callback) => callback(payload || message));
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Handle time sync probe from server (NTP-style).
   * Server sends: { t0: <server_timestamp> }
   * We respond with: { t0, t1, t2 } where t1=receive, t2=send
   */
  handleTimeSyncRequest(payload) {
    const t0 = payload.t0 || payload.T0; // Server send time
    const t1 = Date.now(); // Client receive time
    const t2 = Date.now(); // Client send time (immediate)

    this.send('time_sync_response', { t0, t1, t2 });
  }

  /**
   * Handle time sync result from server
   */
  handleTimeSyncResult(payload) {
    const offsetMs = payload.offsetMs || 0;
    const rttMs = payload.rttMs || payload.RTTMs || 0;
    console.log(`Clock sync: offset=${offsetMs}ms, rtt=${rttMs}ms`);

    this.clockSyncListeners.forEach((callback) =>
      callback({ offsetMs, rttMs })
    );
  }

  /**
   * Handle drift correction command
   */
  handleDriftCorrection(payload) {
    const targetPositionMs = payload.targetPositionMs || 0;
    const adjustmentRate = payload.adjustmentRate || 1.0;
    console.log(`Drift correction: target=${targetPositionMs}ms, rate=${adjustmentRate}x`);

    this.driftListeners.forEach((callback) =>
      callback({ targetPositionMs, adjustmentRate })
    );
  }

  /**
   * Report playback position for drift monitoring
   */
  reportPlaybackPosition(positionMs, trackId) {
    this.send('playback_position_report', {
      positionMs,
      trackId,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to a message type
   */
  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);

    return () => {
      const listeners = this.listeners.get(type) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to clock sync updates
   */
  onClockSync(callback) {
    this.clockSyncListeners.push(callback);
    return () => {
      const index = this.clockSyncListeners.indexOf(callback);
      if (index > -1) {
        this.clockSyncListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to drift correction commands
   */
  onDriftCorrection(callback) {
    this.driftListeners.push(callback);
    return () => {
      const index = this.driftListeners.indexOf(callback);
      if (index > -1) {
        this.driftListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to room state updates (contains LiveKit token)
   */
  onRoomState(callback) {
    this.roomStateListeners.push(callback);
    return () => {
      const index = this.roomStateListeners.indexOf(callback);
      if (index > -1) this.roomStateListeners.splice(index, 1);
    };
  }

  /**
   * Get the LiveKit token received from room state
   */
  getLiveKitToken() {
    return this.livekitToken;
  }

  // ─── Host Control Messages ──────────────────────────────────
  // All match Go's model.MsgType constants (snake_case)

  sendPlay(trackId, positionMs = 0) {
    this.send('play', {
      trackId,
      positionMs,
      hostTimestamp: Date.now(),
    });
  }

  sendPause(positionMs = 0) {
    this.send('pause', {
      positionMs,
      hostTimestamp: Date.now(),
    });
  }

  sendSeek(positionMs) {
    this.send('seek', {
      positionMs,
      hostTimestamp: Date.now(),
    });
  }

  sendSkip(direction = 'next') {
    this.send('skip', { direction });
  }

  sendTrackChanged(track) {
    this.send('track_changed', {
      trackId: track.id,
      trackIndex: track.orderIndex || 0,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
    });
  }
}

export default new WebSocketService();
