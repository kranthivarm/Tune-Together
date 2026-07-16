/**
 * LiveKit Service for TuneTogether Web App
 * 
 * Host: Publishes audio from AudioEngine's MediaStream output
 * Member: Subscribes to host's audio track and plays through speakers
 */

import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
} from 'livekit-client';
import audioEngine from './AudioEngine';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

class LiveKitService {
  constructor() {
    this.room = null;
    this.localAudioTrack = null;
    this.audioElement = null;
    this.connected = false;
    this.isPublishing = false;

    // Clock sync
    this.clockOffsetMs = 0;

    // Listeners
    this.connectionListeners = [];
    this.audioTrackListeners = [];
  }

  /**
   * Connect to LiveKit room
   * @param {Object} opts
   * @param {string} opts.token - LiveKit access token
   * @param {boolean} opts.isHost - Whether this client is the host
   */
  async connect({ token, isHost }) {
    if (!token) {
      console.warn('No LiveKit token provided, skipping LiveKit connection');
      return;
    }

    try {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      this.setupRoomEventListeners();

      await this.room.connect(LIVEKIT_URL, token);
      this.connected = true;
      console.log('Connected to LiveKit room');
      this.notifyConnectionListeners(true);

      // If host, start publishing audio from AudioEngine
      if (isHost) {
        await this.startPublishing();
      }
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      this.connected = false;
      this.notifyConnectionListeners(false);
      // Don't throw — LiveKit is optional for room functionality
    }
  }

  /**
   * Host: Start publishing audio from AudioEngine's MediaStream
   */
  async startPublishing() {
    if (!this.room || !this.connected) return;

    try {
      // Initialize AudioEngine if needed
      await audioEngine.init();

      const stream = audioEngine.getOutputStream();
      if (!stream) {
        console.warn('AudioEngine has no output stream yet');
        return;
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn('No audio tracks in MediaStream');
        return;
      }

      // Create LocalAudioTrack from AudioEngine's MediaStream
      this.localAudioTrack = new LocalAudioTrack(audioTracks[0], undefined, false);

      // Publish to room
      await this.room.localParticipant.publishTrack(this.localAudioTrack, {
        name: 'host-audio',
        source: Track.Source.Microphone, // Use microphone source for audio
      });

      this.isPublishing = true;
      console.log('Publishing audio track to LiveKit');
    } catch (error) {
      console.error('Failed to publish audio:', error);
    }
  }

  /**
   * Host: Stop publishing audio
   */
  async stopPublishing() {
    if (this.localAudioTrack && this.room?.localParticipant) {
      await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    // Also stop any display media streams
    if (this._displayStream) {
      this._displayStream.getTracks().forEach(t => t.stop());
      this._displayStream = null;
    }
    this.isPublishing = false;
  }

  /**
   * Host: Publish audio from an external MediaStream (e.g., getDisplayMedia for tab capture)
   * Used for device mirroring — captures Spotify, YouTube, etc.
   */
  async startPublishingStream(stream) {
    if (!this.room || !this.connected) {
      console.warn('Not connected to LiveKit, cannot publish stream');
      return;
    }

    try {
      // Stop any existing publishing
      await this.stopPublishing();

      this._displayStream = stream;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in the provided stream');
      }

      // Create LocalAudioTrack from the display media stream
      this.localAudioTrack = new LocalAudioTrack(audioTracks[0], undefined, false);

      // When the user stops sharing from the browser UI
      audioTracks[0].addEventListener('ended', () => {
        this.stopPublishing();
        this.notifyConnectionListeners(true); // notify UI to update mirror state
      });

      // Publish to room
      await this.room.localParticipant.publishTrack(this.localAudioTrack, {
        name: 'mirror-audio',
        source: Track.Source.ScreenShareAudio,
      });

      this.isPublishing = true;
      console.log('Publishing mirrored audio to LiveKit');
    } catch (error) {
      console.error('Failed to publish mirrored audio:', error);
      throw error;
    }
  }

  /**
   * Set up room event listeners
   */
  setupRoomEventListeners() {
    if (!this.room) return;

    // Track subscribed (members receive host audio)
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('Track subscribed:', track.kind, 'from', participant.identity);

      if (track.kind === 'audio') {
        this.handleAudioTrack(track);
      }
    });

    // Track unsubscribed
    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === 'audio') {
        this.stopAudio();
      }
    });

    // Disconnected
    this.room.on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from LiveKit');
      this.connected = false;
      this.isPublishing = false;
      this.notifyConnectionListeners(false);
    });

    // Reconnected
    this.room.on(RoomEvent.Reconnected, () => {
      console.log('Reconnected to LiveKit');
      this.connected = true;
      this.notifyConnectionListeners(true);
    });
  }

  /**
   * Handle incoming audio track from host (member side)
   */
  handleAudioTrack(track) {
    if (!this.audioElement) {
      this.audioElement = track.attach();
      document.body.appendChild(this.audioElement);
      this.audioElement.style.display = 'none';
    } else {
      track.attach(this.audioElement);
    }

    this.audioElement.play().catch((error) => {
      console.error('Failed to play audio:', error);
    });

    this.audioTrackListeners.forEach((cb) => cb(track));
  }

  /**
   * Stop audio playback (member side)
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
    await this.stopPublishing();

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
   * Set clock offset from time sync
   */
  setClockOffset(offsetMs) {
    this.clockOffsetMs = offsetMs;
  }

  /**
   * Get current playback position (delegates to AudioEngine for host)
   */
  getCurrentPosition() {
    return audioEngine.getCurrentTimeMs();
  }

  /**
   * Pause (delegates to AudioEngine)
   */
  pause() {
    audioEngine.pause();
  }

  /**
   * Apply drift correction
   */
  applyDriftCorrection({ targetPositionMs, adjustmentRate }) {
    // For members: adjust the audio element playback rate
    if (this.audioElement) {
      const clampedRate = Math.max(0.98, Math.min(1.02, adjustmentRate));
      this.audioElement.playbackRate = clampedRate;

      setTimeout(() => {
        if (this.audioElement) {
          this.audioElement.playbackRate = 1.0;
        }
      }, 5000);
    }
  }

  // ─── Listener management ─────────────────────────────────

  onConnectionStateChange(callback) {
    this.connectionListeners.push(callback);
    return () => {
      const idx = this.connectionListeners.indexOf(callback);
      if (idx > -1) this.connectionListeners.splice(idx, 1);
    };
  }

  onAudioTrack(callback) {
    this.audioTrackListeners.push(callback);
    return () => {
      const idx = this.audioTrackListeners.indexOf(callback);
      if (idx > -1) this.audioTrackListeners.splice(idx, 1);
    };
  }

  notifyConnectionListeners(connected) {
    this.connectionListeners.forEach((cb) => cb(connected));
  }
}

export default new LiveKitService();
