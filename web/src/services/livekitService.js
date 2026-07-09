/**
 * LiveKit Service for TuneTogether Web App
 * Handles WebRTC audio streaming (subscribe-only for web clients)
 * 
 * Phase 7: Includes drift monitoring and correction
 */

import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  RemoteAudioTrack,
} from 'livekit-client';

class LiveKitService {
  constructor() {
    this.room = null;
    this.audioElement = null;
    this.connected = false;
    this.connectionListeners = [];
    this.audioTrackListeners = [];
    
    // Phase 7: Drift monitoring
    this.playbackStartTime = null;
    this.playbackStartPosition = 0;
    this.clockOffsetMs = 0;
    this.currentPlaybackRate = 1.0;
  }

  /**
   * Connect to LiveKit room (subscribe-only)
   */
  async connect({ url, token }) {
    try {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: { width: 0, height: 0 }, // No video
        },
      });

      // Listen to room events
      this.setupRoomEventListeners();

      // Connect to room
      await this.room.connect(url, token);
      this.connected = true;

      console.log('Connected to LiveKit room');
      this.notifyConnectionListeners(true);
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      this.connected = false;
      this.notifyConnectionListeners(false);
      throw error;
    }
  }

  /**
   * Set up room event listeners
   */
  setupRoomEventListeners() {
    if (!this.room) return;

    // Track subscribed (we receive audio from host)
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('Track subscribed:', track.kind, 'from', participant.identity);

      if (track.kind === 'audio' && track instanceof RemoteAudioTrack) {
        this.handleAudioTrack(track);
      }
    });

    // Track unsubscribed
    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log('Track unsubscribed:', track.kind);
      if (track.kind === 'audio') {
        this.stopAudio();
      }
    });

    // Disconnected
    this.room.on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from LiveKit');
      this.connected = false;
      this.notifyConnectionListeners(false);
    });

    // Reconnecting
    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('Reconnecting to LiveKit...');
    });

    // Reconnected
    this.room.on(RoomEvent.Reconnected, () => {
      console.log('Reconnected to LiveKit');
      this.connected = true;
      this.notifyConnectionListeners(true);
    });
  }

  /**
   * Handle incoming audio track from host
   */
  handleAudioTrack(track) {
    // Create audio element if it doesn't exist
    if (!this.audioElement) {
      this.audioElement = track.attach();
      document.body.appendChild(this.audioElement);
      this.audioElement.style.display = 'none';
    } else {
      track.attach(this.audioElement);
    }

    // Play audio
    this.audioElement.play().catch((error) => {
      console.error('Failed to play audio:', error);
    });

    // Notify listeners
    this.audioTrackListeners.forEach((callback) => callback(track));
  }

  /**
   * Stop audio playback
   */
  stopAudio() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }

  /**
   * Disconnect from LiveKit
   */
  async disconnect() {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    if (this.audioElement) {
      this.audioElement.remove();
      this.audioElement = null;
    }

    this.connected = false;
  }

  /**
   * Phase 7: Set clock offset from time sync
   */
  setClockOffset(offsetMs) {
    this.clockOffsetMs = offsetMs;
  }

  /**
   * Phase 7: Start playback at specific time (for sync)
   */
  async playAtTime(timestampMs, trackStartPosition = 0) {
    if (!this.audioElement) return;

    const now = Date.now();
    const delayMs = timestampMs - now - this.clockOffsetMs;

    console.log(`Scheduled playback in ${delayMs}ms`);

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    this.playbackStartTime = Date.now();
    this.playbackStartPosition = trackStartPosition;

    await this.audioElement.play();
  }

  /**
   * Phase 7: Get current playback position
   */
  getCurrentPosition() {
    if (!this.playbackStartTime || !this.audioElement) {
      return 0;
    }

    const elapsed = Date.now() - this.playbackStartTime;
    return this.playbackStartPosition + elapsed;
  }

  /**
   * Phase 7: Apply drift correction (adjust playback rate)
   */
  applyDriftCorrection({ targetPositionMs, adjustmentRate }) {
    if (!this.audioElement) return;

    // Adjust playback rate slightly (0.98x to 1.02x)
    // This is smooth and inaudible, unlike hard jumps
    const clampedRate = Math.max(0.98, Math.min(1.02, adjustmentRate));
    
    this.audioElement.playbackRate = clampedRate;
    this.currentPlaybackRate = clampedRate;

    console.log(`Applied drift correction: rate=${clampedRate.toFixed(4)}x, target=${targetPositionMs}ms`);

    // Reset to 1.0 after correction period (5 seconds)
    setTimeout(() => {
      if (this.audioElement && Math.abs(this.currentPlaybackRate - 1.0) > 0.001) {
        this.audioElement.playbackRate = 1.0;
        this.currentPlaybackRate = 1.0;
        console.log('Drift correction complete, reset to 1.0x');
      }
    }, 5000);
  }

  /**
   * Pause audio
   */
  pause() {
    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  /**
   * Resume audio
   */
  resume() {
    if (this.audioElement) {
      this.audioElement.play();
    }
  }

  /**
   * Subscribe to connection state changes
   */
  onConnectionStateChange(callback) {
    this.connectionListeners.push(callback);
    return () => {
      const index = this.connectionListeners.indexOf(callback);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to audio track events
   */
  onAudioTrack(callback) {
    this.audioTrackListeners.push(callback);
    return () => {
      const index = this.audioTrackListeners.indexOf(callback);
      if (index > -1) {
        this.audioTrackListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify connection listeners
   */
  notifyConnectionListeners(connected) {
    this.connectionListeners.forEach((callback) => callback(connected));
  }
}

export default new LiveKitService();
