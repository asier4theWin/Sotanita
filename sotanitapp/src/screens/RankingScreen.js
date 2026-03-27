import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';
import FifaCard from '../components/FifaCard';
import { rankingByCategory } from '../utils/mockData';
import { formatLikes } from '../utils/format';

const rankingCategories = Object.keys(rankingByCategory);

export default function RankingScreen() {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const [category, setCategory] = useState('Goles');
  const [showPicker, setShowPicker] = useState(false);

  const ranking = rankingByCategory[category];

  return (
    <ScreenGradient>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.header, { borderBottomColor: colors.border, padding: spacing.md }]}> 
          <Pressable onPress={() => setShowPicker(true)} style={[styles.categoryBtn, { backgroundColor: colors.surface }]}> 
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>{category}</Text>
            <Ionicons name="chevron-down" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.xxl * textScale, fontFamily: typography.families.worldCup }}>
            Ranking Semanal
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: spacing.xs }}>Top 3 de la semana</Text>
        </View>

        <View style={{ paddingTop: 22, alignItems: 'center' }}>
          <View style={[styles.crown, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 24 }}>👑</Text>
          </View>
          <FifaCard
            username={ranking[0].username}
            team={ranking[0].team}
            position={ranking[0].position}
            rating={ranking[0].rating}
            size="large"
          />
          <Text style={{ color: colors.primary, fontSize: typography.sizes.xxl * textScale, fontWeight: typography.weights.bold, marginTop: spacing.sm }}>
            1°
          </Text>
          <View style={styles.likes}>
            <Ionicons name="heart" size={16} color="#EF4444" />
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold }}>{formatLikes(ranking[0].likes)}</Text>
          </View>
        </View>

        <View style={[styles.bottomPodium, { paddingHorizontal: spacing.md }]}> 
          {[ranking[1], ranking[2]].map((item, index) => (
            <View key={item.username} style={{ alignItems: 'center' }}>
              <View
                style={[
                  styles.rankBubble,
                  {
                    backgroundColor: index === 0 ? '#9CA3AF' : '#B45309',
                  },
                ]}
              >
                <Text style={{ color: colors.white, fontWeight: typography.weights.bold }}>{index === 0 ? 2 : 3}</Text>
              </View>
              <FifaCard username={item.username} team={item.team} position={item.position} rating={item.rating} size="medium" />
              <Text
                style={{
                  color: index === 0 ? '#9CA3AF' : '#B45309',
                  fontSize: typography.sizes.xl * textScale,
                  fontWeight: typography.weights.bold,
                  marginTop: spacing.sm,
                }}
              >
                {index === 0 ? '2°' : '3°'}
              </Text>
              <View style={styles.likes}>
                <Ionicons name="heart" size={14} color="#EF4444" />
                <Text style={{ color: colors.text }}>{formatLikes(item.likes)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowPicker(false)}>
          <View style={[styles.menu, { backgroundColor: colors.surface }]}> 
            {rankingCategories.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setCategory(item);
                  setShowPicker(false);
                }}
                style={[styles.menuItem, item === category && { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: item === category ? colors.black : colors.text, fontWeight: typography.weights.semibold }}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  categoryBtn: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  crown: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -18,
    zIndex: 2,
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bottomPodium: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  rankBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -14,
    zIndex: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menu: {
    width: 220,
    borderRadius: 14,
    padding: 8,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
