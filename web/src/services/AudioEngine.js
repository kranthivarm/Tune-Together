/**
 * AudioEngine — Web Audio API manager for TuneTogether
 * 
 * Decodes local audio files, manages playback, and provides a
 * MediaStream output for LiveKit publishing.
 * 
 * Pipeline: File → AudioBuffer → AudioBufferSourceNode → MediaStreamDestination → LiveKit
 */

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];

class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.audioContext = null;
    /** @type {AudioBufferSourceNode|null} */
    this.sourceNode = null;
    /** @type {MediaStreamAudioDestinationNode|null} */
    this.streamDestination = null;
    /** @type {GainNode|null} */
    this.gainNode = null;
    /** @type {AudioBuffer|null} */
    this.currentBuffer = null;

    // Playback state
    this.isPlaying = false;
    this.startTime = 0;       // audioContext.currentTime when playback started
    this.startOffset = 0;     // offset in seconds where we started
    this.duration = 0;        // total duration in seconds

    // Track info
    this.currentTrackId = null;
    this.currentFile = null;

    // Loaded file buffers cache: trackId → AudioBuffer
    this._bufferCache = new Map();

    // Event listeners
    this._onEndedCallbacks = [];
    this._onTimeUpdateCallbacks = [];
    this._timeUpdateInterval = null;
  }

  /**
   * Initialize the AudioContext (must be called after user gesture)
   */
  async init() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000, // Match LiveKit Opus default
    });

    // Create gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1.0;

    // Create MediaStream destination for LiveKit
    this.streamDestination = this.audioContext.createMediaStreamDestination();

    // Connect gain → stream destination
    this.gainNode.connect(this.streamDestination);
    // Also connect to speakers so host can hear
    this.gainNode.connect(this.audioContext.destination);
  }

  /**
   * Get the MediaStream for LiveKit publishing
   * @returns {MediaStream|null}
   */
  getOutputStream() {
    return this.streamDestination?.stream || null;
  }

  /**
   * Load an audio file and decode it
   * @param {File} file - The audio file to load
   * @param {string} trackId - Unique track identifier
   * @returns {Promise<{duration: number, title: string, artist: string}>}
   */
  async loadFile(file, trackId) {
    await this.init();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    this._bufferCache.set(trackId, audioBuffer);

    return {
      duration: audioBuffer.duration,
      durationMs: Math.round(audioBuffer.duration * 1000),
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    };
  }

  /**
   * Play a loaded track
   * @param {string} trackId - Track to play
   * @param {number} [offsetSeconds=0] - Position to start from
   */
  async play(trackId, offsetSeconds = 0) {
    await this.init();

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Stop any current playback
    this._stopSource();

    const buffer = this._bufferCache.get(trackId);
    if (!buffer) {
      throw new Error(`Track ${trackId} not loaded. Call loadFile() first.`);
    }

    // Create new source node (can only be used once)
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.connect(this.gainNode);

    // Handle track ended
    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this._stopTimeUpdates();
        this._onEndedCallbacks.forEach(cb => cb(trackId));
      }
    };

    // Start playback
    this.currentBuffer = buffer;
    this.currentTrackId = trackId;
    this.duration = buffer.duration;
    this.startOffset = offsetSeconds;
    this.startTime = this.audioContext.currentTime;
    this.isPlaying = true;

    this.sourceNode.start(0, offsetSeconds);
    this._startTimeUpdates();
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this.isPlaying || !this.sourceNode) return;

    // Calculate current position
    this.startOffset = this.getCurrentTime();
    this._stopSource();
    this.isPlaying = false;
    this._stopTimeUpdates();
  }

  /**
   * Resume playback from paused position
   */
  async resume() {
    if (this.isPlaying || !this.currentTrackId) return;
    await this.play(this.currentTrackId, this.startOffset);
  }

  /**
   * Seek to a position
   * @param {number} seconds - Position in seconds
   */
  async seek(seconds) {
    const wasPlaying = this.isPlaying;
    const trackId = this.currentTrackId;

    if (wasPlaying) {
      this._stopSource();
      this.isPlaying = false;
    }

    this.startOffset = Math.max(0, Math.min(seconds, this.duration));

    if (wasPlaying && trackId) {
      await this.play(trackId, this.startOffset);
    }
  }

  /**
   * Stop playback completely
   */
  stop() {
    this._stopSource();
    this.isPlaying = false;
    this.startOffset = 0;
    this.currentTrackId = null;
    this.currentBuffer = null;
    this._stopTimeUpdates();
  }

  /**
   * Get current playback time in seconds
   * @returns {number}
   */
  getCurrentTime() {
    if (!this.isPlaying || !this.audioContext) {
      return this.startOffset;
    }
    const elapsed = this.audioContext.currentTime - this.startTime;
    return Math.min(this.startOffset + elapsed, this.duration);
  }

  /**
   * Get current playback time in milliseconds
   * @returns {number}
   */
  getCurrentTimeMs() {
    return Math.round(this.getCurrentTime() * 1000);
  }

  /**
   * Get total duration in seconds
   * @returns {number}
   */
  getDuration() {
    return this.duration;
  }

  /**
   * Get total duration in milliseconds
   * @returns {number}
   */
  getDurationMs() {
    return Math.round(this.duration * 1000);
  }

  /**
   * Set volume (0.0 to 1.0)
   * @param {number} volume
   */
  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Check if a file is a supported audio format
   * @param {File} file
   * @returns {boolean}
   */
  static isSupportedFile(file) {
    const name = file.name.toLowerCase();
    return AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
  }

  /**
   * Extract basic metadata from file name
   * @param {File} file
   * @returns {{title: string, artist: string}}
   */
  static extractMetadata(file) {
    let name = file.name;
    // Remove extension
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0) name = name.substring(0, lastDot);

    // Try to split "Artist - Title" format
    const dashIndex = name.indexOf(' - ');
    if (dashIndex > 0) {
      return {
        artist: name.substring(0, dashIndex).trim(),
        title: name.substring(dashIndex + 3).trim(),
      };
    }

    return {
      title: name.trim(),
      artist: 'Unknown Artist',
    };
  }

  /**
   * Register callback for track ended
   * @param {Function} callback
   */
  onEnded(callback) {
    this._onEndedCallbacks.push(callback);
    return () => {
      const idx = this._onEndedCallbacks.indexOf(callback);
      if (idx > -1) this._onEndedCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register callback for time updates (fires ~4x/sec)
   * @param {Function} callback - receives {currentTime, duration, progress}
   */
  onTimeUpdate(callback) {
    this._onTimeUpdateCallbacks.push(callback);
    return () => {
      const idx = this._onTimeUpdateCallbacks.indexOf(callback);
      if (idx > -1) this._onTimeUpdateCallbacks.splice(idx, 1);
    };
  }

  /**
   * Check if a track is loaded in cache
   * @param {string} trackId
   * @returns {boolean}
   */
  isTrackLoaded(trackId) {
    return this._bufferCache.has(trackId);
  }

  /**
   * Remove a track from cache
   * @param {string} trackId
   */
  removeTrack(trackId) {
    this._bufferCache.delete(trackId);
  }

  /**
   * Clean up everything
   */
  async destroy() {
    this.stop();
    this._bufferCache.clear();
    this._onEndedCallbacks = [];
    this._onTimeUpdateCallbacks = [];
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  // ─── Private ─────────────────────────────────────────────

  _stopSource() {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode = null;
    }
  }

  _startTimeUpdates() {
    this._stopTimeUpdates();
    this._timeUpdateInterval = setInterval(() => {
      if (!this.isPlaying) return;
      const currentTime = this.getCurrentTime();
      const data = {
        currentTime,
        currentTimeMs: Math.round(currentTime * 1000),
        duration: this.duration,
        durationMs: Math.round(this.duration * 1000),
        progress: this.duration > 0 ? currentTime / this.duration : 0,
      };
      this._onTimeUpdateCallbacks.forEach(cb => cb(data));
    }, 250); // 4 updates per second
  }

  _stopTimeUpdates() {
    if (this._timeUpdateInterval) {
      clearInterval(this._timeUpdateInterval);
      this._timeUpdateInterval = null;
    }
  }
}

export default new AudioEngine();
