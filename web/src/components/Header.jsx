import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './Header.css';

function Header() {
  const { user, logout } = useAuth();
  const { themeMode, themeColor, updateThemeMode, updateThemeColor } = useTheme();

  const colors = [
    { name: 'purple', hex: '#673ab7' },
    { name: 'blue', hex: '#2563eb' },
    { name: 'orange', hex: '#ea580c' },
    { name: 'green', hex: '#16a34a' }
  ];

  return (
    <div className="header">
      <div className="theme-selector">
        <button 
          className="theme-button" 
          onClick={() => updateThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
        >
          {themeMode === 'dark' ? '☀️' : '🌙'}
        </button>
        <div className="color-palette">
          {colors.map(c => (
            <div 
              key={c.name}
              className={`color-dot ${themeColor === c.name ? 'active' : ''}`}
              style={{ backgroundColor: c.hex }}
              onClick={() => updateThemeColor(c.name)}
              title={`Switch to ${c.name} accent`}
            />
          ))}
        </div>
      </div>
      
      {user ? (
        <div className="user-menu">
          <span className="user-greeting">Hi, {user.displayName}</span>
          <button className="auth-button" onClick={logout}>Logout</button>
        </div>
      ) : (
        <div className="auth-buttons">
          {/* We will implement Login and Signup modals soon */}
          <button className="auth-button" onClick={() => window.location.hash = '#login'}>Log In</button>
          <button className="auth-button primary" onClick={() => window.location.hash = '#signup'}>Sign Up</button>
        </div>
      )}
    </div>
  );
}

export default Header;
