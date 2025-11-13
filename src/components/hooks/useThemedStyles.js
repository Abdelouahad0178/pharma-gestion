import { useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export const useThemedStyles = () => {
  const { darkMode } = useTheme();

  const theme = useMemo(() => ({
    // Couleurs principales
    primaryBg: darkMode ? '#0f172a' : '#f8fafc',
    cardBg: darkMode ? '#1e293b' : '#ffffff',
    
    // Textes
    text: darkMode ? '#f1f5f9' : '#1e293b',
    textSecondary: darkMode ? '#94a3b8' : '#64748b',
    
    // Bordures
    border: darkMode ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0',
    
    // Tableaux
    tableBg: darkMode ? '#1e293b' : '#ffffff',
    tableHeaderBg: darkMode ? 'linear-gradient(135deg, #1f2937, #111827)' : 'linear-gradient(135deg, #1e293b, #334155)',
    tableRowHover: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    
    // Accent doré (pour mode sombre)
    accentGold: '#d4af37',
  }), [darkMode]);

  const styles = useMemo(() => ({
    container: {
      minHeight: '100vh',
      background: darkMode ? theme.primaryBg : 'linear-gradient(135deg, #667eea, #764ba2)',
      padding: 20,
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    },
    card: {
      background: darkMode ? theme.cardBg : 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: 24,
      padding: 24,
      marginBottom: 16,
      border: `1px solid ${darkMode ? theme.border : 'rgba(255, 255, 255, 0.2)'}`,
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
    },
    title: {
      margin: 0,
      fontSize: 32,
      fontWeight: 800,
      background: darkMode 
        ? `linear-gradient(135deg, ${theme.accentGold}, #b8860b)` 
        : 'linear-gradient(135deg, #667eea, #764ba2)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    subtitle: {
      margin: '6px 0 0',
      color: theme.textSecondary,
      fontSize: 16,
    },
    table: {
      width: '100%',
      minWidth: 1000,
      borderCollapse: 'collapse',
    },
    th: {
      padding: 16,
      textAlign: 'left',
      fontWeight: 700,
      fontSize: 13,
      color: 'white',
    },
    td: {
      padding: 12,
      borderBottom: `1px solid ${theme.border}`,
      color: theme.text,
    },
  }), [darkMode, theme]);

  return { theme, styles, darkMode };
};