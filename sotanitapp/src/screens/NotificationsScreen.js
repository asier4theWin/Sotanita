import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAuth } from '../context/AuthContext';
import useResetScrollOnFocus from '../hooks/useResetScrollOnFocus';
import { getAllNotifications } from '../api/backend';
import ScreenGradient from '../components/ScreenGradient';
import NotificationItem from '../components/NotificationItem';

function formatRelativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'ahora';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'ahora';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export default function NotificationsScreen({ navigation }) {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const { user, isLoggedIn } = useAuth();
  const listRef = useRef(null);
  const [items, setItems] = useState([]);

  useResetScrollOnFocus(listRef);

  useFocusEffect(
    useCallback(() => {
      const loadNotifications = async () => {
        if (!isLoggedIn || !user?.email) {
          setItems([]);
          return;
        }

        try {
          const currentUserEmail = String(user.email).trim().toLowerCase();
          const data = await getAllNotifications(currentUserEmail, 50, 50);
          const filtered = data.filter(
            (item) => String(item.recipientUserId || '').trim().toLowerCase() === currentUserEmail
          );

          const mapped = filtered.map((item) => ({
            id: item.id,
            user: String(item.actorUsername || item.actorUserId || 'Usuario').split('@')[0],
            action: 'le ha dado me gusta a tu video',
            videoId: item.videoId,
            videoTitle: item.videoTitle || '',
            time: formatRelativeTime(item.createdAt),
          }));
          setItems(mapped);
        } catch (error) {
          console.error('Error cargando notificaciones:', error);
          setItems([]);
        }
      };

      loadNotifications();
    }, [isLoggedIn, user?.email])
  );

  return (
    <ScreenGradient>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xl * textScale, fontWeight: typography.weights.bold, fontFamily: typography.families.worldCup }}>
          Notificaciones
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <NotificationItem
            item={item}
            onOpenVideo={(videoId) => {
              if (!videoId) return;
              navigation.navigate('MyVideos', {
                videoId,
                sourceTab: 'uploaded',
              });
            }}
          />
        )}
        ListEmptyComponent={
          <View style={{ paddingTop: spacing.lg, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>No tienes notificaciones</Text>
          </View>
        }
      />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
  },
});
