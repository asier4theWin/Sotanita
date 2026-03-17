import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) {
  const { colors, spacing, typography, textScale } = useAppTheme();

  const variants = {
    primary: {
      container: { backgroundColor: colors.primary },
      label: { color: colors.black },
    },
    secondary: {
      container: { backgroundColor: colors.surface },
      label: { color: colors.text },
    },
    ghost: {
      container: { backgroundColor: 'transparent', borderWidth: 2, borderColor: `${colors.text}55` },
      label: { color: colors.text },
    },
    danger: {
      container: { backgroundColor: colors.danger },
      label: { color: colors.white },
    },
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: 52,
          borderRadius: 14,
          opacity: pressed || disabled ? 0.85 : 1,
          paddingHorizontal: spacing.xl,
        },
        variants[variant].container,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.black : colors.text} />
      ) : (
        <Text
          style={[
            {
              fontSize: typography.sizes.md * textScale,
              fontWeight: typography.weights.bold,
            },
            variants[variant].label,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
