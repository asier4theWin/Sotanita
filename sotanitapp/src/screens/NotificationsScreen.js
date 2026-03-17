import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';
import NotificationItem from '../components/NotificationItem';
import { notifications } from '../utils/mockData';

export default function NotificationsScreen() {
  const { colors, spacing, typography, textScale } = useAppTheme();

  return (
    <ScreenGradient>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xl * textScale, fontWeight: typography.weights.bold }}>
          Notificaciones
        </Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => <NotificationItem item={item} />}
      />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
  },
});
