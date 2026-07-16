import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import websocketService from '../services/websocketService';
import livekitService from '../services/livekitService';
import audioEngine from '../services/AudioEngine';
import './RoomScreen.css';

function RoomScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth } = location.state || {};
  const isHost = auth?.role === 'HOST';

  // Room state
  const [members, setMembers] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Playback progress
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  // Sync
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [syncQuality, setSyncQuality] = useState('excellent');

  // UI state
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const localFilesRef = useRef(new Map()); // trackId → File object (never sent to server)

  // ─── Initialize ───────────────────────────────────────────

  useEffect(() => {
    if (!auth) {
      navigate('/');
      return;
    }

    initializeRoom();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeRoom = async () => {
    try {
      // 1. Fetch room state from REST API
      const roomData = await apiService.getRoomState(auth.roomCode);
      setMembers(roomData.members || []);
      setPlaylist(roomData.playlist || []);

      // 2. Connect WebSocket
      await websocketService.connect(auth.token);
      setupWebSocketListeners();

      // 3. Connect LiveKit (token comes from WebSocket room_state message)
      websocketService.onRoomState((state) => {
        if (state.livekitToken) {
          livekitService.connect({ token: state.livekitToken, isHost });
        }
      });

      // 4. Set up AudioEngine listeners (host only)
      if (isHost) {
        audioEngine.onTimeUpdate(({ currentTime: ct, duration: dur, progress: p }) => {
          setCurrentTime(ct);
          setDuration(dur);
          setProgress(p);
        });

        audioEngine.onEnded((trackId) => {
          handleTrackEnded(trackId);
        });
      }

      setConnectionStatus('connected');
    } catch (err) {
      console.error('Failed to initialize room:', err);
      setError(err.message);
      setConnectionStatus('error');
    }
  };

  const setupWebSocketListeners = () => {
    // Play command (for members)
    websocketService.on('play', (message) => {
      const payload = message.payload || message;
      const track = playlist.find((t) => t.id === payload.trackId);
      if (track) {
        setCurrentTrack(track);
        setIsPlaying(true);
      }
    });

    // Pause command
    websocketService.on('pause', () => {
      setIsPlaying(false);
    });

    // Track changed
    websocketService.on('track_changed', (message) => {
      const payload = message.payload || message;
      setCurrentTrack({
        id: payload.trackId,
        title: payload.title,
        artist: payload.artist,
        durationMs: payload.durationMs,
        orderIndex: payload.trackIndex,
      });
    });

    // Member joined/left
    websocketService.on('member_joined', async () => {
      try {
        const roomData = await apiService.getRoomState(auth.roomCode);
        setMembers(roomData.members || []);
      } catch (e) { console.error(e); }
    });

    websocketService.on('member_left', async () => {
      try {
        const roomData = await apiService.getRoomState(auth.roomCode);
        setMembers(roomData.members || []);
      } catch (e) { console.error(e); }
    });

    // Clock sync
    websocketService.onClockSync(({ offsetMs, rttMs }) => {
      setClockOffsetMs(offsetMs);
      livekitService.setClockOffset(offsetMs);
      if (rttMs < 20) setSyncQuality('excellent');
      else if (rttMs < 50) setSyncQuality('good');
      else if (rttMs < 100) setSyncQuality('fair');
      else setSyncQuality('poor');
    });
  };

  const cleanup = () => {
    websocketService.disconnect();
    livekitService.disconnect();
    audioEngine.stop();
  };

  // ─── Host: File Picking ───────────────────────────────────

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsAddingFiles(true);

    try {
      for (const file of files) {
        // Generate a client-side track ID
        const trackId = crypto.randomUUID();

        // Decode audio to get duration
        const info = await audioEngine.loadFile(file, trackId);

        // Extract metadata from filename
        const meta = audioEngine.constructor.extractMetadata
          ? audioEngine.constructor.extractMetadata(file)
          : { title: file.name, artist: 'Unknown Artist' };

        // Store file locally (NEVER sent to server)
        localFilesRef.current.set(trackId, file);

        // Send only metadata to server
        const savedTrack = await apiService.addTrackMetadata(auth.roomCode, {
          clientTrackId: trackId,
          title: meta.title,
          artist: meta.artist,
          durationMs: info.durationMs,
        });

        // Update local playlist
        setPlaylist((prev) => [...prev, {
          id: savedTrack.id || trackId,
          title: meta.title,
          artist: meta.artist,
          durationMs: info.durationMs,
          orderIndex: prev.length,
          clientTrackId: trackId,
        }]);
      }
    } catch (err) {
      console.error('Failed to add tracks:', err);
      setError('Failed to add tracks: ' + err.message);
    } finally {
      setIsAddingFiles(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Host: Playback Controls ──────────────────────────────

  const handlePlay = useCallback(async (track) => {
    if (!isHost) return;

    const trackId = track.clientTrackId || track.id;

    // Load file if not already cached
    if (!audioEngine.isTrackLoaded(trackId)) {
      const file = localFilesRef.current.get(trackId);
      if (!file) {
        setError('Audio file not found locally. Re-add the track.');
        return;
      }
      await audioEngine.loadFile(file, trackId);
    }

    // Start playback
    await audioEngine.play(trackId);
    setCurrentTrack(track);
    setIsPlaying(true);

    // Notify all members via WebSocket
    websocketService.sendPlay(track.id, 0);
    websocketService.sendTrackChanged(track);

    // Ensure LiveKit is publishing
    if (!livekitService.isPublishing) {
      await livekitService.startPublishing();
    }
  }, [isHost]);

  const handlePause = useCallback(() => {
    if (!isHost) return;
    audioEngine.pause();
    setIsPlaying(false);
    websocketService.sendPause(audioEngine.getCurrentTimeMs());
  }, [isHost]);

  const handleResume = useCallback(async () => {
    if (!isHost) return;
    await audioEngine.resume();
    setIsPlaying(true);
    websocketService.sendPlay(
      currentTrack?.id,
      audioEngine.getCurrentTimeMs()
    );
  }, [isHost, currentTrack]);

  const handleSeek = useCallback((e) => {
    if (!isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = x / rect.width;
    const seekTime = fraction * duration;
    audioEngine.seek(seekTime);
    websocketService.sendSeek(Math.round(seekTime * 1000));
  }, [isHost, duration]);

  const handleSkipNext = useCallback(() => {
    if (!isHost || playlist.length === 0) return;
    const currentIdx = currentTrack
      ? playlist.findIndex((t) => t.id === currentTrack.id)
      : -1;
    const nextIdx = (currentIdx + 1) % playlist.length;
    handlePlay(playlist[nextIdx]);
  }, [isHost, playlist, currentTrack, handlePlay]);

  const handleSkipPrev = useCallback(() => {
    if (!isHost || playlist.length === 0) return;
    const currentIdx = currentTrack
      ? playlist.findIndex((t) => t.id === currentTrack.id)
      : 0;
    const prevIdx = currentIdx <= 0 ? playlist.length - 1 : currentIdx - 1;
    handlePlay(playlist[prevIdx]);
  }, [isHost, playlist, currentTrack, handlePlay]);

  const handleTrackEnded = useCallback((trackId) => {
    // Auto-play next track
    const currentIdx = playlist.findIndex(
      (t) => (t.clientTrackId || t.id) === trackId
    );
    if (currentIdx >= 0 && currentIdx < playlist.length - 1) {
      handlePlay(playlist[currentIdx + 1]);
    } else {
      setIsPlaying(false);
      setCurrentTrack(null);
    }
  }, [playlist, handlePlay]);

  const handleRemoveTrack = async (track) => {
    if (!isHost) return;
    try {
      await apiService.removeTrack(auth.roomCode, track.id);
      setPlaylist((prev) => prev.filter((t) => t.id !== track.id));
      audioEngine.removeTrack(track.clientTrackId || track.id);
      localFilesRef.current.delete(track.clientTrackId || track.id);
      if (currentTrack?.id === track.id) {
        audioEngine.stop();
        setCurrentTrack(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Failed to remove track:', err);
    }
  };

  // ─── Navigation ───────────────────────────────────────────

  const handleLeaveRoom = () => {
    if (window.confirm('Are you sure you want to leave this room?')) {
      cleanup();
      navigate('/');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(auth.roomCode);
  };

  // ─── Render ───────────────────────────────────────────────

  if (!auth) return null;

  if (error && connectionStatus === 'error') {
    return (
      <div className="room-screen">
        <div className="error-container">
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="room-screen">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Connecting to room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="room-screen">
      <header className="room-header">
        <div className="room-title">
          <h1>{auth.roomCode}</h1>
          <span className="member-count">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <button className="leave-button" onClick={handleLeaveRoom}>
          Leave Room
        </button>
      </header>

      <div className="room-content">
        <div className="main-section">
          {/* Room Code Card */}
          <div className="room-code-card">
            <div className="room-code-content">
              <div>
                <div className="label">Room Code</div>
                <div className="room-code">{auth.roomCode}</div>
              </div>
              <button className="copy-button" onClick={copyRoomCode}>
                📋 Copy
              </button>
            </div>
          </div>

          {/* Sync Status */}
          <div className="sync-status-card">
            <div className="sync-indicator">
              <span className={`sync-dot ${syncQuality}`}></span>
              <span>Sync: {syncQuality}</span>
            </div>
            <div className="sync-details">
              <span>Offset: {clockOffsetMs}ms</span>
            </div>
          </div>

          {/* Now Playing Card */}
          {currentTrack && (
            <div className="now-playing-card">
              <div className="now-playing-header">NOW PLAYING</div>
              <div className="track-info">
                <div className="track-title">{currentTrack.title}</div>
                <div className="track-artist">{currentTrack.artist}</div>
              </div>

              {/* Progress Bar (host only shows accurate progress) */}
              {isHost && (
                <div className="progress-container" onClick={handleSeek}>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <div className="progress-times">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              )}

              {/* Playback Controls (host only) */}
              {isHost && (
                <div className="playback-controls">
                  <button className="control-btn" onClick={handleSkipPrev}>
                    ⏮
                  </button>
                  <button
                    className="control-btn play-btn"
                    onClick={isPlaying ? handlePause : handleResume}
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <button className="control-btn" onClick={handleSkipNext}>
                    ⏭
                  </button>
                </div>
              )}

              {/* Member view */}
              {!isHost && (
                <div className="playback-indicator">
                  {isPlaying ? '🔊 Playing...' : '⏸ Paused'}
                </div>
              )}
            </div>
          )}

          {/* Playlist Section */}
          <div className="playlist-section">
            <div className="playlist-header">
              <h2>Playlist</h2>
              {isHost && (
                <div className="add-tracks-wrapper">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="audio-file-input"
                  />
                  <button
                    className="add-tracks-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAddingFiles}
                  >
                    {isAddingFiles ? '⏳ Adding...' : '➕ Add Tracks'}
                  </button>
                </div>
              )}
            </div>

            {playlist.length === 0 ? (
              <div className="empty-state">
                <p>No tracks yet</p>
                <p className="empty-state-subtitle">
                  {isHost
                    ? 'Click "Add Tracks" to pick audio files from your device'
                    : 'Waiting for host to add tracks...'}
                </p>
              </div>
            ) : (
              <div className="playlist">
                {playlist.map((track, index) => (
                  <div
                    key={track.id}
                    className={`playlist-item ${currentTrack?.id === track.id ? 'active' : ''}`}
                    onClick={() => isHost && handlePlay(track)}
                  >
                    <div className="track-number">{index + 1}</div>
                    <div className="track-details">
                      <div className="track-name">{track.title}</div>
                      <div className="track-meta">
                        {track.artist} • {formatDuration(track.durationMs)}
                      </div>
                    </div>
                    {currentTrack?.id === track.id && isPlaying && (
                      <div className="playing-icon">♫</div>
                    )}
                    {isHost && (
                      <button
                        className="remove-track-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTrack(track);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="error-toast">
              ⚠️ {error}
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}
        </div>

        {/* Sidebar: Members */}
        <aside className="sidebar">
          <h2>Members</h2>
          <div className="members-list">
            {members.map((member) => (
              <div key={member.userId} className="member-item">
                <div className="member-avatar">
                  {member.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{member.displayName}</div>
                  {member.role === 'HOST' && (
                    <span className="host-badge">HOST</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatDuration(ms) {
  if (!ms) return '0:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default RoomScreen;
