/**
 * WebSocket Service for TuneTogether Signaling Server
 * Handles real-time commands, clock sync, and room events
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /**
   * Send a message to the server
   */
  send(type, payload = {}) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type,
      ...payload,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const { type } = message;

      // Handle clock sync
      if (type === 'timeSyncRequest') {
        this.handleTimeSyncRequest(message);
        return;
      } else if (type === 'timeSyncResult') {
        this.handleTimeSyncResult(message);
        return;
      }

      // Handle room state (contains LiveKit token)
      if (type === 'room_state') {
        const payload = message.payload || message;
        if (payload.livekitToken) {
          this.livekitToken = payload.livekitToken;
        }
        this.roomStateListeners.forEach((cb) => cb(payload));
        return;
      }

      // Handle drift correction
      if (type === 'driftCorrection' || type === 'drift_correction') {
        this.handleDriftCorrection(message);
        return;
      }

      // Notify listeners
      const listeners = this.listeners.get(type) || [];
      listeners.forEach((callback) => callback(message));
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Handle time sync request (NTP-style)
   */
  handleTimeSyncRequest(message) {
    const t1 = message.t1; // Server sent time
    const t2 = Date.now(); // Client receive time
    const t3 = Date.now(); // Client send time (immediate)

    this.send('timeSyncResponse', {
      t1,
      t2,
      t3,
    });
  }

  /**
   * Handle time sync result
   */
  handleTimeSyncResult(message) {
    const { offsetMs, rttMs } = message;
    console.log(`Clock sync: offset=${offsetMs}ms, rtt=${rttMs}ms`);

    this.clockSyncListeners.forEach((callback) =>
      callback({ offsetMs, rttMs })
    );
  }

  /**
   * Phase 7: Handle drift correction command
   */
  handleDriftCorrection(message) {
    const { targetPositionMs, adjustmentRate } = message;
    console.log(`Drift correction: target=${targetPositionMs}ms, rate=${adjustmentRate}x`);

    this.driftListeners.forEach((callback) =>
      callback({ targetPositionMs, adjustmentRate })
    );
  }

  /**
   * Phase 7: Report playback position for drift monitoring
   */
  reportPlaybackPosition(positionMs, trackId) {
    this.send('playbackPositionReport', {
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

    // Return unsubscribe function
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
   * Phase 7: Subscribe to drift corrections
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

  sendPlay(trackId, positionMs = 0) {
    this.send('play', {
      payload: { trackId, positionMs, hostTimestamp: Date.now() },
    });
  }

  sendPause(positionMs = 0) {
    this.send('pause', {
      payload: { positionMs, hostTimestamp: Date.now() },
    });
  }

  sendSeek(positionMs) {
    this.send('seek', {
      payload: { positionMs, hostTimestamp: Date.now() },
    });
  }

  sendSkip(direction = 'next') {
    this.send('skip', {
      payload: { direction },
    });
  }

  sendTrackChanged(track) {
    this.send('track_changed', {
      payload: {
        trackId: track.id,
        trackIndex: track.orderIndex || 0,
        title: track.title,
        artist: track.artist,
        durationMs: track.durationMs,
      },
    });
  }
}

export default new WebSocketService();
