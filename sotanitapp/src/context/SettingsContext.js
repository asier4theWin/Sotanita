import { createContext, useContext, useMemo, useState } from 'react';

const SettingsContext = createContext(undefined);

export function SettingsProvider({ children }) {
  const [highContrast, setHighContrast] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(16);

  const toggleHighContrast = () => {
    setHighContrast((prev) => {
      const next = !prev;
      if (next) {
        setDarkMode(true);
      }
      return next;
    });
  };

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      if (!next) {
        setHighContrast(false);
      }
      return next;
    });
  };

  const value = useMemo(
    () => ({
      highContrast,
      darkMode,
      fontSize,
      setFontSize,
      toggleHighContrast,
      toggleDarkMode,
    }),
    [highContrast, darkMode, fontSize]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
