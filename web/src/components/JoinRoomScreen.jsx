import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import './FormScreen.css';

function JoinRoomScreen() {
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const auth = await apiService.joinRoom({
        roomCode: roomCode.toUpperCase().trim(),
        displayName: displayName.trim(),
        password: password || undefined,
      });

      // Navigate to room with auth data
      navigate('/room', { state: { auth } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-screen">
      <div className="form-container">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back
        </button>

        <h1>Join Room</h1>
        <p className="form-subtitle">Enter the room code shared by the host</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="roomCode">Room Code</label>
            <input
              id="roomCode"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="TT-A3B7K2"
              required
              maxLength={10}
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="displayName">Your Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              required
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password (if required)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="error-message">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default JoinRoomScreen;
