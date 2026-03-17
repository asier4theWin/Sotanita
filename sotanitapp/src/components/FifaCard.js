import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

const sizes = {
  small: { width: 64, height: 92, title: 10, subtitle: 8, rating: 11 },
  medium: { width: 96, height: 132, title: 12, subtitle: 10, rating: 14 },
  large: { width: 132, height: 184, title: 15, subtitle: 12, rating: 18 },
};

export default function FifaCard({
  username,
  team,
  position,
  rating = 85,
  size = 'medium',
  style,
}) {
  const { colors, gradients } = useAppTheme();
  const current = sizes[size] || sizes.medium;

  return (
    <LinearGradient
      colors={gradients.fifaCard}
      style={[
        styles.card,
        {
          width: current.width,
          height: current.height,
          borderColor: `${colors.primary}99`,
        },
        style,
      ]}
    >
      <View style={styles.ratingWrap}>
        <Text style={[styles.rating, { color: '#4A2C00', fontSize: current.rating }]}>{rating}</Text>
        <Text style={[styles.position, { color: '#4A2C00' }]}>{position}</Text>
      </View>

      <View style={styles.avatarWrap}>
        <View style={styles.avatarBg}>
          <Ionicons name="person" size={size === 'large' ? 42 : size === 'medium' ? 30 : 22} color="rgba(74,44,0,0.45)" />
        </View>
      </View>

      <View style={styles.footer}>
        <Text numberOfLines={1} style={[styles.username, { fontSize: current.title }]}>
          {username}
        </Text>
        <Text numberOfLines={1} style={[styles.team, { fontSize: current.subtitle }]}>
          {team}
        </Text>
      </View>

      <View style={styles.shine} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 10,
  },
  ratingWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  rating: {
    fontWeight: '900',
    lineHeight: 20,
  },
  position: {
    fontWeight: '700',
    fontSize: 10,
  },
  avatarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  avatarBg: {
    width: '55%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(74,44,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 16,
    backgroundColor: 'rgba(74,44,0,0.6)',
  },
  username: {
    color: '#FFFBEB',
    textAlign: 'center',
    fontWeight: '800',
  },
  team: {
    color: '#FDE68A',
    textAlign: 'center',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.16)',
    transform: [{ skewY: '-24deg' }],
  },
});
