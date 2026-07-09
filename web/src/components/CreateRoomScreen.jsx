import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import './FormScreen.css';

function CreateRoomScreen() {
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const auth = await apiService.createRoom({
        displayName: displayName.trim(),
        roomName: roomName.trim() || undefined,
        password: requirePassword && password ? password : undefined,
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

        <h1>Create Room</h1>
        <p className="form-subtitle">
          You'll be the host with full control over playback
        </p>

        <form onSubmit={handleSubmit}>
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
            <label htmlFor="roomName">Room Name (optional)</label>
            <input
              id="roomName"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g., Living Room Party"
              maxLength={100}
            />
          </div>

          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={requirePassword}
                onChange={(e) => setRequirePassword(e.target.checked)}
              />
              Require Password
            </label>
          </div>

          {requirePassword && (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required={requirePassword}
              />
            </div>
          )}

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
            {loading ? 'Creating...' : 'Create Room'}
          </button>
        </form>

        <div className="info-note">
          ℹ️ Note: Web clients can listen to audio but cannot host (play files) in v1.
          Use the mobile app to host a room.
        </div>
      </div>
    </div>
  );
}

export default CreateRoomScreen;
