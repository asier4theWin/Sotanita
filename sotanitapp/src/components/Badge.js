import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function Badge({ text, tone = 'neutral' }) {
  const { colors, typography, textScale } = useAppTheme();

  const palette = {
    neutral: { bg: colors.surfaceElevated, label: colors.text },
    primary: { bg: colors.primary, label: colors.black },
    danger: { bg: `${colors.danger}33`, label: colors.danger },
  };

  return (
    <View style={[styles.badge, { backgroundColor: palette[tone].bg }]}>
      <Text style={{ color: palette[tone].label, fontWeight: typography.weights.semibold, fontSize: typography.sizes.xs * textScale }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
