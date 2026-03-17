import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getThemeColors, gradients, spacing, typography } from '../theme';

export function useAppTheme() {
  const { darkMode, highContrast, fontSize } = useSettings();

  return useMemo(() => {
    const colors = getThemeColors({ darkMode, highContrast });

    return {
      colors,
      gradients,
      spacing,
      typography,
      fontSize,
      darkMode,
      highContrast,
      textScale: fontSize / 16,
    };
  }, [darkMode, highContrast, fontSize]);
}
