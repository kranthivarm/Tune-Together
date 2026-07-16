import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import websocketService from '../services/websocketService';
import livekitService from '../services/livekitService';
import audioEngine from '../services/AudioEngine';
import './RoomScreen.css';

// ─── Session persistence helpers ─────────────────────────────
const SESSION_KEY = 'tunetogether_auth';

function saveSession(auth) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth));
  } catch (e) { /* ignore */ }
}

function loadSession() {
  try {
    const data = sessionStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) { return null; }
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

function RoomScreen() {
  const location = useLocation();
  const navigate = useNavigate();

  // Load auth from router state OR from sessionStorage (page refresh)
  const auth = location.state?.auth || loadSession();
  const isHost = auth?.role === 'HOST';

  // Persist auth to sessionStorage
  useEffect(() => {
    if (auth) saveSession(auth);
  }, [auth]);

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

  // Device mirroring (tab audio capture)
  const [isMirroring, setIsMirroring] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const localFilesRef = useRef(new Map()); // trackId → File object (never sent to server)
  const playlistRef = useRef([]); // keep playlist in sync for callbacks

  // Keep playlistRef current
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  // ─── Initialize ───────────────────────────────────────────

  useEffect(() => {
    if (!auth) {
      navigate('/');
      return;
    }

    apiService.setAuthToken(auth.token);
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

      // 2. Register LiveKit token listener BEFORE connecting
      //    (Go sends room_state immediately on WS connect — must not miss it)
      websocketService.onRoomState((state) => {
        if (state.livekitToken && !livekitService.connected) {
          console.log('Got LiveKit token from room_state, connecting...');
          livekitService.connect({ token: state.livekitToken, isHost });
        }
        if (state.members) {
          setMembers(state.members);
        }
      });

      // 3. Connect WebSocket
      await websocketService.connect(auth.token);
      setupWebSocketListeners();

      // 4. Fallback: check if LiveKit token was already received during connect
      //    (in case room_state arrived before listeners were fully ready)
      setTimeout(() => {
        const token = websocketService.getLiveKitToken();
        if (token && !livekitService.connected) {
          console.log('LiveKit token found via fallback check, connecting...');
          livekitService.connect({ token, isHost });
        }
      }, 500);

      // 5. Set up AudioEngine listeners (host only)
      if (isHost) {
        audioEngine.onTimeUpdate(({ currentTime: ct, duration: dur, progress: p }) => {
          setCurrentTime(ct);
          setDuration(dur);
          setProgress(p);
        });

        audioEngine.onEnded((trackId) => {
          handleTrackEndedRef.current(trackId);
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
    // Play command — Go broadcasts { type: "play", payload: { trackId, positionMs, hostTimestamp } }
    websocketService.on('play', (payload) => {
      if (payload?.trackId) {
        setCurrentTrack((prev) => {
          // Find track in current playlist
          const track = playlistRef.current.find((t) => t.id === payload.trackId);
          return track || prev;
        });
        setIsPlaying(true);
      }
    });

    // Pause command
    websocketService.on('pause', () => {
      setIsPlaying(false);
    });

    // Track changed — Go broadcasts { type: "track_changed", payload: { trackId, title, artist, durationMs, trackIndex } }
    websocketService.on('track_changed', (payload) => {
      if (payload) {
        setCurrentTrack({
          id: payload.trackId,
          title: payload.title,
          artist: payload.artist,
          durationMs: payload.durationMs,
          orderIndex: payload.trackIndex,
        });
        // Members should also refresh playlist to get any new tracks
        refreshPlaylist();
      }
    });

    // Member joined/left
    websocketService.on('member_joined', () => refreshPlaylist());
    websocketService.on('member_left', () => refreshPlaylist());
  };

  const refreshPlaylist = async () => {
    try {
      const roomData = await apiService.getRoomState(auth.roomCode);
      setMembers(roomData.members || []);
      setPlaylist(roomData.playlist || []);
    } catch (e) { console.error('Refresh failed:', e); }
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
          : extractMeta(file);

        // Store file locally (NEVER sent to server)
        localFilesRef.current.set(trackId, file);

        // Send only metadata to server
        const savedTrack = await apiService.addTrackMetadata(auth.roomCode, {
          clientTrackId: trackId,
          title: meta.title,
          artist: meta.artist,
          durationMs: info.durationMs,
        });

        const newTrack = {
          id: savedTrack.id || trackId,
          title: meta.title,
          artist: meta.artist,
          durationMs: info.durationMs,
          orderIndex: playlist.length,
          clientTrackId: trackId,
        };

        // Also map the server-assigned ID to the same file
        if (savedTrack.id && savedTrack.id !== trackId) {
          localFilesRef.current.set(savedTrack.id, file);
          // Also cache the audio buffer under the server ID
          if (audioEngine.isTrackLoaded(trackId)) {
            await audioEngine.loadFile(file, savedTrack.id);
          }
        }

        // Update local playlist
        setPlaylist((prev) => [...prev, newTrack]);

        // Notify members about new track via WebSocket
        websocketService.sendTrackChanged(newTrack);
      }
    } catch (err) {
      console.error('Failed to add tracks:', err);
      setError('Failed to add tracks: ' + err.message);
    } finally {
      setIsAddingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  function extractMeta(file) {
    let name = file.name;
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0) name = name.substring(0, lastDot);
    const dash = name.indexOf(' - ');
    if (dash > 0) return { artist: name.substring(0, dash).trim(), title: name.substring(dash + 3).trim() };
    return { title: name.trim(), artist: 'Unknown Artist' };
  }

  // ─── Host: Playback Controls ──────────────────────────────

  const handlePlay = useCallback(async (track) => {
    if (!isHost) return;

    const trackId = track.clientTrackId || track.id;

    // Load file if not already cached
    if (!audioEngine.isTrackLoaded(trackId)) {
      const file = localFilesRef.current.get(trackId) || localFilesRef.current.get(track.id);
      if (!file) {
        setError('Audio file not found locally. Re-add the track.');
        return;
      }
      await audioEngine.loadFile(file, trackId);
    }

    // 1. Start playback FIRST — audio must flow through Web Audio graph
    //    before we can capture it for LiveKit
    await audioEngine.play(trackId);
    setCurrentTrack(track);
    setIsPlaying(true);

    // Notify all members via WebSocket
    websocketService.sendPlay(track.id, 0);
    websocketService.sendTrackChanged(track);

    // 2. THEN start/restart publishing to LiveKit
    //    Always re-publish to ensure a fresh audio track reference
    //    (AudioEngine creates new source nodes on each play())
    try {
      await livekitService.startPublishing();
    } catch (e) {
      console.error('LiveKit publish failed:', e);
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
    if (!isHost || playlistRef.current.length === 0) return;
    const currentIdx = currentTrack
      ? playlistRef.current.findIndex((t) => t.id === currentTrack.id)
      : -1;
    const nextIdx = (currentIdx + 1) % playlistRef.current.length;
    handlePlay(playlistRef.current[nextIdx]);
  }, [isHost, currentTrack, handlePlay]);

  const handleSkipPrev = useCallback(() => {
    if (!isHost || playlistRef.current.length === 0) return;
    const currentIdx = currentTrack
      ? playlistRef.current.findIndex((t) => t.id === currentTrack.id)
      : 0;
    const prevIdx = currentIdx <= 0 ? playlistRef.current.length - 1 : currentIdx - 1;
    handlePlay(playlistRef.current[prevIdx]);
  }, [isHost, currentTrack, handlePlay]);

  // Ref to avoid stale closure in audioEngine.onEnded
  const handleTrackEndedRef = useRef((trackId) => {
    const pl = playlistRef.current;
    const currentIdx = pl.findIndex(
      (t) => (t.clientTrackId || t.id) === trackId
    );
    if (currentIdx >= 0 && currentIdx < pl.length - 1) {
      handlePlay(pl[currentIdx + 1]);
    } else {
      setIsPlaying(false);
      setCurrentTrack(null);
    }
  });
  handleTrackEndedRef.current = (trackId) => {
    const pl = playlistRef.current;
    const currentIdx = pl.findIndex(
      (t) => (t.clientTrackId || t.id) === trackId
    );
    if (currentIdx >= 0 && currentIdx < pl.length - 1) {
      handlePlay(pl[currentIdx + 1]);
    } else {
      setIsPlaying(false);
      setCurrentTrack(null);
    }
  };

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

  // ─── Device Mirroring (Tab Audio Capture) ─────────────────

  // Check if getDisplayMedia is available (not on mobile browsers)
  const canMirror = typeof navigator?.mediaDevices?.getDisplayMedia === 'function';

  const startMirroring = async () => {
    if (!isHost) return;

    // Feature detection
    if (!canMirror) {
      setError(
        'Device mirroring is only available on desktop browsers (Chrome, Edge, Firefox). ' +
        'On mobile, use the TuneTogether Android app for device audio mirroring.'
      );
      return;
    }

    try {
      // Request tab/screen audio capture via getDisplayMedia
      // Note: Chrome requires video to be requested (we'll discard the video track)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,  // Required by Chrome, we'll discard it
        audio: true,
      });

      // Stop video track immediately (we only need audio)
      stream.getVideoTracks().forEach((t) => t.stop());

      // Check if audio track was captured
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setError(
          'No audio captured. When sharing, make sure to check "Share tab audio" ' +
          'or select a browser tab (not a window).'
        );
        return;
      }

      // Publish via LiveKit
      await livekitService.startPublishingStream(stream);
      setIsMirroring(true);
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        console.error('Mirror mode failed:', err);
        setError('Failed to start mirroring: ' + err.message);
      }
    }
  };

  const stopMirroring = async () => {
    await livekitService.stopPublishing();
    setIsMirroring(false);
  };

  // ─── Navigation ───────────────────────────────────────────

  const handleLeaveRoom = () => {
    if (window.confirm('Are you sure you want to leave this room?')) {
      cleanup();
      clearSession();
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

          {/* Device Mirroring Card (Host only) */}
          {isHost && (
            <div className="mirror-card">
              {!isMirroring ? (
                <div className="mirror-card-content">
                  <div className="mirror-info">
                    <span className="mirror-icon">{canMirror ? '🔊' : '📱'}</span>
                    <div>
                      <div className="mirror-title">Device Audio Mirroring</div>
                      <div className="mirror-subtitle">
                        {canMirror
                          ? 'Share audio from any browser tab — Spotify, YouTube, anything'
                          : 'Use a desktop browser or the Android app for device audio mirroring'}
                      </div>
                    </div>
                  </div>
                  {canMirror && (
                    <button className="mirror-btn" onClick={startMirroring}>
                      🔊 Start Mirroring
                    </button>
                  )}
                </div>
              ) : (
                <div className="mirror-active">
                  <span className="mirror-pulse">🔴</span>
                  <span>Mirroring device audio to all members...</span>
                  <button className="mirror-stop-btn" onClick={stopMirroring}>
                    Stop
                  </button>
                </div>
              )}
            </div>
          )}

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
          {currentTrack && !isMirroring && (
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

          {/* Mirror Active for members */}
          {!isHost && isMirroring && (
            <div className="now-playing-card">
              <div className="now-playing-header">DEVICE MIRRORING ACTIVE</div>
              <div className="playback-indicator">
                🔊 Host is sharing device audio...
              </div>
            </div>
          )}

          {/* Playlist Section */}
          {!isMirroring && (
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
                      style={isHost ? { cursor: 'pointer' } : {}}
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
          )}

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
                  {(member.displayName || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{member.displayName}</div>
                  {(member.role === 'HOST') && (
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
