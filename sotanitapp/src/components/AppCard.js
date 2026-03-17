import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function AppCard({ children, style }) {
  const { colors } = useAppTheme();

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
});
