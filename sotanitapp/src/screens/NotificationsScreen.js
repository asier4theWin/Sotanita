import { useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import useResetScrollOnFocus from '../hooks/useResetScrollOnFocus';
import ScreenGradient from '../components/ScreenGradient';
import NotificationItem from '../components/NotificationItem';
import { notifications } from '../utils/mockData';

export default function NotificationsScreen() {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const listRef = useRef(null);

  useResetScrollOnFocus(listRef);

  return (
    <ScreenGradient>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xl * textScale, fontWeight: typography.weights.bold, fontFamily: typography.families.worldCup }}>
          Notificaciones
        </Text>
      </View>

      <FlatList
        ref={listRef}
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
