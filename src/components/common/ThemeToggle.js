import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeToggle = ({ isMobile }) => {
  const { darkMode, toggleDarkMode } = useTheme();

  return (
    <button
      onClick={toggleDarkMode}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: darkMode 
          ? 'linear-gradient(135deg, #1e293b, #0f172a)' 
          : 'linear-gradient(135deg, #ffffff, #f1f5f9)',
        border: `2px solid ${darkMode ? 'rgba(212, 175, 55, 0.3)' : 'rgba(102, 126, 234, 0.3)'}`,
        borderRadius: 20,
        padding: isMobile ? '8px 16px' : '10px 20px',
        cursor: 'pointer',
        boxShadow: darkMode 
          ? '0 8px 25px rgba(212, 175, 55, 0.2)' 
          : '0 8px 25px rgba(102, 126, 234, 0.2)',
        transition: 'all 0.3s ease',
        fontSize: isMobile ? 13 : 15,
        fontWeight: 700,
        color: darkMode ? '#d4af37' : '#667eea',
      }}
      className="moroccan-hover"
      title={darkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
    >
      <span style={{ fontSize: isMobile ? 18 : 20 }}>
        {darkMode ? '☀️' : '🌙'}
      </span>
      <span style={{ display: isMobile ? 'none' : 'inline' }}>
        {darkMode ? 'Mode Clair' : 'Mode Sombre'}
      </span>
    </button>
  );
};

export default ThemeToggle;