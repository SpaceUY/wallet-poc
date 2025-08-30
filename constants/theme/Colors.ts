/**
 * Theme colors for the wallet app.
 * These colors are used throughout the app for consistent theming.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#4FC3F7';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Additional colors for better theming
    cardBackground: '#f5f5f5',
    border: '#ccc',
    inputBackground: '#fff',
    inputBorder: '#ccc',
    buttonPrimary: '#2196F3',
    buttonSecondary: '#666',
    buttonSuccess: '#4CAF50',
    buttonWarning: '#ff9800',
    buttonDanger: '#ff4444',
    buttonDisabled: '#cccccc',
    modalOverlay: 'rgba(0,0,0,0.5)',
    modalBackground: '#fff',
    link: '#0a7ea4',
    placeholder: '#999',
    success: '#4CAF50',
    error: '#f44336',
    textSecondary: '#666',
    errorBackground: '#ffebee',
    primary: '#2196F3',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // Additional colors for better dark mode theming
    cardBackground: '#1E1E1E',
    border: '#333',
    inputBackground: '#2A2A2A',
    inputBorder: '#444',
    buttonPrimary: '#2196F3',
    buttonSecondary: '#666',
    buttonSuccess: '#4CAF50',
    buttonWarning: '#ff9800',
    buttonDanger: '#ff4444',
    buttonDisabled: '#555',
    modalOverlay: 'rgba(0,0,0,0.7)',
    modalBackground: '#1E1E1E',
    link: '#4FC3F7',
    placeholder: '#666',
    success: '#4CAF50',
    error: '#f44336',
    textSecondary: '#999',
    errorBackground: '#2d1b1b',
    primary: '#4FC3F7',
  },
}; 