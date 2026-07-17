import React, { createContext, useContext, useState, useEffect } from 'react';
import apiService from '../services/apiService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('appToken'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      apiService.setAuthToken(token);
      apiService.getMe()
        .then(data => {
          setUser(data);
        })
        .catch(err => {
          console.error("Failed to fetch user profile", err);
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    const data = await apiService.login({ email, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('appToken', data.token);
    apiService.setAuthToken(data.token);
    return data.user;
  };

  const signup = async (displayName, email, password) => {
    const data = await apiService.signup({ displayName, email, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('appToken', data.token);
    apiService.setAuthToken(data.token);
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('appToken');
    apiService.setAuthToken(null);
    // Note: this doesn't clear sessionStorage (RoomToken) so active rooms stay alive
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
