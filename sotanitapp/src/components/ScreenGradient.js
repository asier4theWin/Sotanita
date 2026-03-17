import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function ScreenGradient({ children, style }) {
  const { darkMode, gradients } = useAppTheme();

  return (
    <LinearGradient colors={darkMode ? gradients.appDark : gradients.appLight} style={[styles.container, style]}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
