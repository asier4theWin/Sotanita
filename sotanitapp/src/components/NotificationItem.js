import { StyleSheet, Text, View } from 'react-native';
import Avatar from './Avatar';
import { useAppTheme } from '../hooks/useAppTheme';

export default function NotificationItem({ item }) {
  const { colors, spacing, typography, textScale } = useAppTheme();

  return (
    <View style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: spacing.sm }]}> 
      <Avatar name={item.user} />
      <View style={styles.content}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.sm * textScale }}>
          <Text style={{ fontWeight: typography.weights.bold }}>{item.user}</Text> <Text style={{ color: colors.textMuted }}>{item.action}</Text>
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale, marginTop: 4 }}>{item.time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
  },
});
