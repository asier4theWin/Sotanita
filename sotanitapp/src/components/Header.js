import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import Pressable from './A11yPressable';

export default function Header({
  title,
  onBack,
  rightIcon,
  onRightPress,
  titleSize = 'lg',
  titleScale = 1,
  titleStyle,
}) {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const resolvedTitleSize = typography.sizes[titleSize] ?? typography.sizes.lg;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.iconButton} accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}
      </View>

      <Text
        style={[
          {
            color: colors.text,
            fontWeight: typography.weights.bold,
            fontSize: resolvedTitleSize * titleScale * textScale,
            fontFamily: typography.families.nougat,
          },
          titleStyle,
        ]}
      >
        {title}
      </Text>

      <View style={styles.right}>
        {rightIcon ? (
          <Pressable onPress={onRightPress} style={styles.iconButton} accessibilityLabel="Accion secundaria">
            <Ionicons name={rightIcon} size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    width: 40,
    alignItems: 'flex-start',
  },
  right: {
    width: 40,
    alignItems: 'flex-end',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 40,
    height: 40,
  },
});
