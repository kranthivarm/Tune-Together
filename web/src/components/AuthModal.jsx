import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthModal.css';

function AuthModal() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState(null); // 'login' or 'signup'
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash === 'login' || hash === 'signup') {
        setMode(hash);
      } else {
        setMode(null);
      }
      setError('');
    };
    
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check on mount
    
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const close = () => {
    window.location.hash = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signup(displayName, email, password);
      } else {
        await login(email, password);
      }
      close();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (!mode) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label>Display Name</label>
              <input 
                type="text" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <button type="submit" className="primary-button submit-btn" disabled={loading}>
            {loading ? 'Processing...' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
        
        <div className="modal-footer">
          {mode === 'login' ? (
            <p>Don't have an account? <a href="#signup">Sign Up</a></p>
          ) : (
            <p>Already have an account? <a href="#login">Log In</a></p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
