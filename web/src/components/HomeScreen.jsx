import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import AuthModal from './AuthModal';
import './HomeScreen.css';

function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="home-screen">
      <Header />
      <AuthModal />
      <div className="main-content">
        <div className="hero-section">
        <div className="logo">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="30" cy="50" r="20" fill="#673ab7" opacity="0.8" />
            <circle cx="50" cy="50" r="20" fill="#673ab7" opacity="0.9" />
            <circle cx="70" cy="50" r="20" fill="#673ab7" opacity="0.8" />
          </svg>
        </div>
        
        <h1 className="title">TuneTogether</h1>
        <p className="subtitle">
          Turn every device into a<br />
          synchronized speaker
        </p>
      </div>

      <div className="action-buttons">
        <button
          className="primary-button"
          onClick={() => navigate('/create')}
        >
          Create Room
        </button>
        
        <button
          className="secondary-button"
          onClick={() => navigate('/join')}
        >
          Join Room
        </button>
      </div>

      <div className="info-section">
        <div className="info-card">
          <h3>🎵 Local Playlist</h3>
          <p>Host streams music from their device</p>
        </div>
        <div className="info-card">
          <h3>📱 Device Mirroring</h3>
          <p>Play Spotify, YouTube, anything (Android)</p>
        </div>
        <div className="info-card">
          <h3>⚡ Synced Playback</h3>
          <p>All devices play in perfect sync (&lt;30ms)</p>
        </div>
      </div>
      </div>
    </div>
  );
}

export default HomeScreen;
