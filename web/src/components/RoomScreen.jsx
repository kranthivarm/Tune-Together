import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import websocketService from '../services/websocketService';
import livekitService from '../services/livekitService';
import './RoomScreen.css';

function RoomScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth } = location.state || {};

  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState(null);

  // Phase 7: Drift monitoring
  const [driftMs, setDriftMs] = useState(0);
  const [syncQuality, setSyncQuality] = useState('excellent');
  const positionReportInterval = useRef(null);

  useEffect(() => {
    if (!auth) {
      navigate('/');
      return;
    }

    initializeRoom();

    return () => {
      cleanup();
    };
  }, [auth, navigate]);

  const initializeRoom = async () => {
    try {
      // 1. Fetch room state
      const roomData = await apiService.getRoomState(auth.roomCode);
      setRoom(roomData);
      setMembers(roomData.members || []);
      setPlaylist(roomData.playlist || []);

      // 2. Connect to WebSocket
      await websocketService.connect(auth.token);
      setupWebSocketListeners();

      // 3. Connect to LiveKit (would need LiveKit token from server)
      // For now, commented out until token endpoint is implemented
      // await connectToLiveKit();

      setConnectionStatus('connected');
    } catch (err) {
      console.error('Failed to initialize room:', err);
      setError(err.message);
      setConnectionStatus('error');
    }
  };

  const setupWebSocketListeners = () => {
    // Play command
    websocketService.on('playCommand', (message) => {
      const { trackId, playAtTime } = message;
      const track = playlist.find((t) => t.id === trackId);
      if (track) {
        setCurrentTrack(track);
        setIsPlaying(true);
        if (playAtTime) {
          livekitService.playAtTime(playAtTime);
        }
      }
    });

    // Pause command
    websocketService.on('pauseCommand', () => {
      setIsPlaying(false);
      livekitService.pause();
    });

    // Playlist updated
    websocketService.on('playlistUpdated', async () => {
      const roomData = await apiService.getRoomState(auth.roomCode);
      setPlaylist(roomData.playlist || []);
    });

    // Member joined/left
    websocketService.on('memberJoined', async () => {
      const roomData = await apiService.getRoomState(auth.roomCode);
      setMembers(roomData.members || []);
    });

    websocketService.on('memberLeft', async () => {
      const roomData = await apiService.getRoomState(auth.roomCode);
      setMembers(roomData.members || []);
    });

    // Clock sync
    websocketService.onClockSync(({ offsetMs, rttMs }) => {
      setClockOffsetMs(offsetMs);
      livekitService.setClockOffset(offsetMs);
      
      // Update sync quality indicator based on RTT
      if (rttMs < 20) {
        setSyncQuality('excellent');
      } else if (rttMs < 50) {
        setSyncQuality('good');
      } else if (rttMs < 100) {
        setSyncQuality('fair');
      } else {
        setSyncQuality('poor');
      }
    });

    // Phase 7: Drift correction
    websocketService.onDriftCorrection(({ targetPositionMs, adjustmentRate }) => {
      livekitService.applyDriftCorrection({ targetPositionMs, adjustmentRate });
      
      // Calculate drift amount
      const currentPos = livekitService.getCurrentPosition();
      const drift = Math.abs(currentPos - targetPositionMs);
      setDriftMs(drift);
    });
  };

  // Phase 7: Start position reporting when playing
  useEffect(() => {
    if (isPlaying && currentTrack) {
      // Report position every 2 seconds
      positionReportInterval.current = setInterval(() => {
        const position = livekitService.getCurrentPosition();
        websocketService.reportPlaybackPosition(position, currentTrack.id);
      }, 2000);
    } else {
      if (positionReportInterval.current) {
        clearInterval(positionReportInterval.current);
        positionReportInterval.current = null;
      }
    }

    return () => {
      if (positionReportInterval.current) {
        clearInterval(positionReportInterval.current);
      }
    };
  }, [isPlaying, currentTrack]);

  const cleanup = () => {
    websocketService.disconnect();
    livekitService.disconnect();
    if (positionReportInterval.current) {
      clearInterval(positionReportInterval.current);
    }
  };

  const handleLeaveRoom = async () => {
    if (window.confirm('Are you sure you want to leave this room?')) {
      cleanup();
      navigate('/');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(auth.roomCode);
    alert('Room code copied to clipboard!');
  };

  if (error) {
    return (
      <div className="room-screen">
        <div className="error-container">
          <h2>Error</h2>
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
          <h1>{room?.name || auth.roomCode}</h1>
          <span className="member-count">{members.length} {members.length === 1 ? 'member' : 'members'}</span>
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

          {/* Sync Status Card (Phase 7) */}
          <div className="sync-status-card">
            <div className="sync-indicator">
              <span className={`sync-dot ${syncQuality}`}></span>
              <span>Sync: {syncQuality}</span>
            </div>
            <div className="sync-details">
              <span>Offset: {clockOffsetMs}ms</span>
              {driftMs > 0 && <span>Drift: {driftMs.toFixed(0)}ms</span>}
            </div>
          </div>

          {/* Now Playing */}
          {currentTrack && (
            <div className="now-playing-card">
              <div className="now-playing-header">NOW PLAYING</div>
              <div className="track-info">
                <div className="track-title">{currentTrack.title}</div>
                <div className="track-artist">{currentTrack.artist}</div>
              </div>
              <div className="playback-indicator">
                {isPlaying ? '▶️ Playing' : '⏸️ Paused'}
              </div>
            </div>
          )}

          {/* Playlist */}
          <div className="playlist-section">
            <h2>Playlist</h2>
            {playlist.length === 0 ? (
              <div className="empty-state">
                <p>No tracks yet</p>
                <p className="empty-state-subtitle">Waiting for host to add tracks...</p>
              </div>
            ) : (
              <div className="playlist">
                {playlist.map((track) => (
                  <div
                    key={track.id}
                    className={`playlist-item ${currentTrack?.id === track.id ? 'active' : ''}`}
                  >
                    <div className="track-number">{track.orderIndex + 1}</div>
                    <div className="track-details">
                      <div className="track-name">{track.title}</div>
                      <div className="track-meta">
                        {track.artist} • {formatDuration(track.durationMs)}
                      </div>
                    </div>
                    {currentTrack?.id === track.id && isPlaying && (
                      <div className="playing-icon">♫</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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

export default RoomScreen;
