const baseDark = {
  primary: '#22C55E',
  primaryDark: '#15803D',
  secondary: '#34D399',
  background: '#020617',
  surface: '#111827',
  surfaceElevated: '#1F2937',
  text: '#F9FAFB',
  textMuted: '#9CA3AF',
  border: '#374151',
  danger: '#EF4444',
  success: '#22C55E',
  overlay: 'rgba(0,0,0,0.65)',
  white: '#FFFFFF',
  black: '#000000',
};

const baseLight = {
  primary: '#16A34A',
  primaryDark: '#166534',
  secondary: '#22C55E',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#F3F4F6',
  text: '#111827',
  textMuted: '#4B5563',
  border: '#D1D5DB',
  danger: '#DC2626',
  success: '#16A34A',
  overlay: 'rgba(17,24,39,0.3)',
  white: '#FFFFFF',
  black: '#000000',
};

const highContrastDark = {
  primary: '#39FF14',
  primaryDark: '#1DBF0A',
  secondary: '#00E676',
  background: '#000000',
  surface: '#0A0A0A',
  surfaceElevated: '#111111',
  text: '#FFFFFF',
  textMuted: '#E5E5E5',
  border: '#39FF14',
  danger: '#FF5252',
  success: '#00E676',
  overlay: 'rgba(0,0,0,0.75)',
  white: '#FFFFFF',
  black: '#000000',
};

export const gradients = {
  appDark: ['#02160C', '#0B2D1A', '#14532D'],
  appLight: ['#F7FDF9', '#DCFCE7', '#BBF7D0'],
  video: ['rgba(6,78,59,0.4)', 'rgba(17,24,39,0.9)', 'rgba(30,64,175,0.4)'],
  fifaCard: ['#86EFAC', '#22C55E', '#15803D'],
};

export const getThemeColors = ({ darkMode = true, highContrast = false } = {}) => {
  if (highContrast) {
    return highContrastDark;
  }
  return darkMode ? baseDark : baseLight;
};

export default baseDark;
