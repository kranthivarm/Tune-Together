import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import apiService from '../services/apiService';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const { user, setUser } = useAuth();
  
  const [themeMode, setThemeMode] = useState(localStorage.getItem('themeMode') || 'dark');
  const [themeColor, setThemeColor] = useState(localStorage.getItem('themeColor') || 'purple');

  useEffect(() => {
    if (user) {
      if (user.themeMode && user.themeMode !== themeMode) setThemeMode(user.themeMode);
      if (user.themeColor && user.themeColor !== themeColor) setThemeColor(user.themeColor);
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    document.documentElement.setAttribute('data-color', themeColor);
    localStorage.setItem('themeMode', themeMode);
    localStorage.setItem('themeColor', themeColor);
  }, [themeMode, themeColor]);

  const updateThemeMode = async (mode) => {
    setThemeMode(mode);
    if (user) {
      setUser({ ...user, themeMode: mode });
      await apiService.updateTheme({ themeMode: mode });
    }
  };

  const updateThemeColor = async (color) => {
    setThemeColor(color);
    if (user) {
      setUser({ ...user, themeColor: color });
      await apiService.updateTheme({ themeColor: color });
    }
  };

  return (
    <ThemeContext.Provider value={{ themeMode, themeColor, updateThemeMode, updateThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
