import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function Avatar({ name, size = 40 }) {
  const { colors, typography, textScale } = useAppTheme();
  const label = name?.charAt(0)?.toUpperCase() || '?';

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary,
        },
      ]}
    >
      <Text style={{ color: colors.black, fontWeight: typography.weights.bold, fontSize: typography.sizes.sm * textScale }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
