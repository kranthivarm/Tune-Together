/**
 * LiveKit Service for TuneTogether Web App
 * 
 * Host: Publishes audio from AudioEngine's MediaStream output
 * Member: Subscribes to host's audio track and plays through speakers
 * 
 * IMPORTANT: The host should NOT publish until audio is actually playing,
 * otherwise LiveKit may get a silent/empty stream.
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
    this.isHost = false;
    this._displayStream = null;

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

    if (this.connected) {
      console.log('Already connected to LiveKit');
      return;
    }

    this.isHost = isHost;

    try {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      this.setupRoomEventListeners();

      console.log('Connecting to LiveKit at:', LIVEKIT_URL);
      await this.room.connect(LIVEKIT_URL, token);
      this.connected = true;
      console.log('Connected to LiveKit room:', this.room.name);
      this.notifyConnectionListeners(true);

      // DO NOT publish here for host — wait until they actually play a track
      // Publishing a silent stream causes issues
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      this.connected = false;
      this.notifyConnectionListeners(false);
    }
  }

  /**
   * Host: Start publishing audio from AudioEngine's MediaStream.
   * Called when the host actually starts playing a track.
   */
  async startPublishing() {
    if (!this.room || !this.connected) {
      console.warn('Not connected to LiveKit, cannot publish');
      return;
    }

    try {
      // Ensure AudioEngine is initialized
      await audioEngine.init();

      const stream = audioEngine.getOutputStream();
      if (!stream) {
        console.warn('AudioEngine has no output stream');
        return;
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn('No audio tracks in AudioEngine MediaStream');
        return;
      }

      // If already publishing, unpublish first
      if (this.localAudioTrack) {
        try {
          await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
          this.localAudioTrack.stop();
        } catch (e) {
          // Ignore
        }
        this.localAudioTrack = null;
      }

      // Get a FRESH reference to the audio track from the MediaStreamDestination
      // The MediaStreamDestination continuously outputs whatever goes through
      // the Web Audio graph, so this track is always "live"
      const freshTrack = stream.getAudioTracks()[0];
      console.log('Publishing audio track:', freshTrack.label, 'state:', freshTrack.readyState);

      // Create LiveKit LocalAudioTrack
      this.localAudioTrack = new LocalAudioTrack(freshTrack, undefined, false);

      // Publish to room
      await this.room.localParticipant.publishTrack(this.localAudioTrack, {
        name: 'host-audio',
        source: Track.Source.Microphone,
      });

      this.isPublishing = true;
      console.log('✅ Publishing audio track to LiveKit');
    } catch (error) {
      console.error('Failed to publish audio:', error);
    }
  }

  /**
   * Host: Stop publishing audio
   */
  async stopPublishing() {
    if (this.localAudioTrack && this.room?.localParticipant) {
      try {
        await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
        this.localAudioTrack.stop();
      } catch (e) {
        // Ignore
      }
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
      });

      // Publish to room
      await this.room.localParticipant.publishTrack(this.localAudioTrack, {
        name: 'mirror-audio',
        source: Track.Source.ScreenShareAudio,
      });

      this.isPublishing = true;
      console.log('✅ Publishing mirrored audio to LiveKit');
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
      console.log('🔊 Track subscribed:', track.kind, 'from', participant.identity);

      if (track.kind === 'audio') {
        this.handleAudioTrack(track);
      }
    });

    // Track unsubscribed
    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      console.log('Track unsubscribed:', track.kind);
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

    // Connection quality changed
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.log('Connection quality:', quality, 'for', participant.identity);
    });
  }

  /**
   * Handle incoming audio track from host (member side).
   * Creates a hidden <audio> element and plays the stream.
   */
  handleAudioTrack(track) {
    console.log('Handling audio track, creating audio element...');

    // Remove old element if any
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.remove();
      this.audioElement = null;
    }

    // Use LiveKit's track.attach() which creates a proper <audio> element
    this.audioElement = track.attach();
    this.audioElement.style.display = 'none';

    // Set attributes for autoplay
    this.audioElement.autoplay = true;
    this.audioElement.playsInline = true;
    this.audioElement.volume = 1.0;

    document.body.appendChild(this.audioElement);

    // Try to play (may need user interaction on mobile)
    const playPromise = this.audioElement.play();
    if (playPromise) {
      playPromise
        .then(() => {
          console.log('✅ Audio playing on member device');
        })
        .catch((error) => {
          console.warn('Autoplay blocked, will play on user interaction:', error.message);
          // Set up a one-time click handler to resume playback
          const resumeAudio = () => {
            this.audioElement?.play().catch(console.error);
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
          };
          document.addEventListener('click', resumeAudio, { once: true });
          document.addEventListener('touchstart', resumeAudio, { once: true });
        });
    }

    this.audioTrackListeners.forEach((cb) => cb(track));
  }

  /**
   * Stop audio playback (member side)
   */
  stopAudio() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.remove();
      this.audioElement = null;
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
    this.isPublishing = false;
  }

  /**
   * Set clock offset for sync corrections
   */
  setClockOffset(offsetMs) {
    this.clockOffsetMs = offsetMs;
  }

  // ─── Listener Management ────────────────────────────────

  onConnectionChange(callback) {
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
