import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { formatLikes } from '../utils/format';

export default function VideoTile({ item, onPress, variant = 'uploaded' }) {
  const { colors, typography, textScale } = useAppTheme();

  return (
    <Pressable onPress={onPress} style={[styles.tile, { backgroundColor: colors.surface }]}> 
      <View style={styles.preview}>
        <Ionicons name="play" size={24} color={`${colors.textMuted}CC`} />
      </View>

      {variant === 'liked' ? (
        <View style={[styles.userTag, { backgroundColor: `${colors.black}80` }]}>
          <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>@{item.user}</Text>
        </View>
      ) : null}

      <View style={styles.likesRow}>
        <Ionicons name="heart" size={13} color="#EF4444" />
        <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale, fontWeight: '700' }}>
          {formatLikes(item.likes)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '31.5%',
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  userTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  likesRow: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
