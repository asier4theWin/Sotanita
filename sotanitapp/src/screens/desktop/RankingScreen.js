import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import StrokeText from '../../components/StrokeText';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../../hooks/useAppTheme';
import useResetScrollOnFocus from '../../hooks/useResetScrollOnFocus';
import ScreenGradient from '../../components/ScreenGradient';
import FifaCard from '../../components/FifaCard';
import { formatLikes } from '../../utils/format';
import { getCategories, getWeeklyRankings } from '../../api/backend';
import Pressable from '../../components/A11yPressable';

export default function RankingScreen({ navigation }) {
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();
  const categoryItemFontSize = 22 * textScale;
  const categorySelectedFontSize = 26 * textScale;
  const categoryTextColor = highContrast
    ? colors.primary
    : darkMode
      ? colors.white
      : colors.primary;
  const [categories, setCategories] = useState(['Ranking General']);
  const [category, setCategory] = useState('Ranking General');
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rankingData, setRankingData] = useState({
    previous: { items: [], weekLabel: '' },
    current: { items: [], weekLabel: '' },
  });
  const scrollRef = useRef(null);

  useResetScrollOnFocus(scrollRef);

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      const normalized = ['Ranking General', ...new Set((Array.isArray(data) ? data : []).map((value) => String(value || '').trim()).filter(Boolean))];
      setCategories(normalized);
      if (!normalized.includes(category)) {
        setCategory('Ranking General');
      }
    } catch (error) {
      console.error('Error cargando categorias del ranking:', error);
      setCategories(['Ranking General']);
    }
  }, [category]);

  const loadRanking = useCallback(async (selectedCategory = category) => {
    setLoading(true);
    try {
      const [previousData, currentData] = await Promise.all([
        getWeeklyRankings(selectedCategory, false),
        getWeeklyRankings(selectedCategory, true),
      ]);

      const buildSectionData = (data) => {
        const items = selectedCategory === 'Ranking General'
          ? (Array.isArray(data?.general) ? data.general : [])
          : (Array.isArray(data?.selectedRanking) ? data.selectedRanking : []);

        if (data?.week?.start && data?.week?.end) {
          const start = new Date(data.week.start);
          const end = new Date(data.week.end);
          const startLabel = start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
          const endLabel = end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
          return { items, weekLabel: `${startLabel} - ${endLabel}` };
        }

        return { items, weekLabel: '' };
      };

      setRankingData({
        previous: buildSectionData(previousData),
        current: buildSectionData(currentData),
      });
    } catch (error) {
      console.error('Error cargando ranking semanal:', error);
      setRankingData({
        previous: { items: [], weekLabel: '' },
        current: { items: [], weekLabel: '' },
      });
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadRanking(category);
  }, [category, loadRanking]);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
      loadRanking(category);
    }, [category, loadCategories, loadRanking])
  );

  const rankingSections = useMemo(() => ([
    {
      key: 'previous',
      title: 'Ranking de Ultimos Ganadores',
      subtitle: `Resultados de la semana anterior${rankingData.previous.weekLabel ? ` · ${rankingData.previous.weekLabel}` : ''}`,
      items: rankingData.previous.items,
      backgroundColor: highContrast
        ? `${colors.primary}18`
        : darkMode
          ? `${colors.primary}12`
          : `${colors.primary}10`,
    },
    {
      key: 'current',
      title: 'Ranking de la Semana Actual',
      subtitle: `Resultados de la semana en curso${rankingData.current.weekLabel ? ` · ${rankingData.current.weekLabel}` : ''}`,
      items: rankingData.current.items,
      backgroundColor: highContrast
        ? `${colors.text}10`
        : darkMode
          ? `${colors.surfaceElevated}`
          : `${colors.secondary}14`,
    },
  ]), [colors, darkMode, highContrast, rankingData.current.items, rankingData.current.weekLabel, rankingData.previous.items, rankingData.previous.weekLabel]);

  const renderRankingSection = (section) => {
    const topThree = section.items.slice(0, 3);
    const hasResults = topThree.length > 0;

    return (
      <View key={section.key} style={[styles.rankingPanel, { backgroundColor: section.backgroundColor, borderColor: colors.border }]}> 
        <Text style={{ color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.xl * textScale, fontFamily: typography.families.nougat, textAlign: 'center' }}>
          {section.title}
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' }}>
          {section.subtitle}
        </Text>

        {hasResults ? (
          <>
            <View style={{ paddingTop: 18, alignItems: 'center' }}>
              {renderPodiumCard(topThree[0], 1, 'large', colors.primary)}
            </View>

            <View style={[styles.bottomPodium, { paddingHorizontal: 0 }]}> 
              {renderPodiumCard(topThree[1], 2, 'medium', '#9CA3AF')}
              {renderPodiumCard(topThree[2], 3, 'medium', '#B45309')}
            </View>
          </>
        ) : (
          <View style={styles.emptySectionWrap}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg * textScale, fontWeight: typography.weights.bold, textAlign: 'center' }}>
              Todavía no hay suficiente actividad para mostrar este ranking.
            </Text>
            <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
              Cuando haya videos, likes y comentarios aparecerán aquí.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderPodiumCard = (item, rank, size, accentColor) => {
    if (!item) {
      return (
        <View style={{ alignItems: 'center', width: size === 'large' ? 164 : 124 }}>
          <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: `${colors.surface}AA` }]}>
            <Text style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Sin datos</Text>
          </View>
        </View>
      );
    }

    const numberColor = rank === 1 ? '#D4AF37' : rank === 2 ? '#C0C0C0' : '#CD7F32';
    const numberFontSize = size === 'large' ? 40 * textScale : 32 * textScale;

    return (
      <View style={{ alignItems: 'center', width: size === 'large' ? 164 : 124 }}>
        <View style={{ position: 'relative' }}>
          <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, width: 56, alignItems: 'flex-end' }}>
            <StrokeText
              strokeColor="black"
              strokeWidth={3}
              style={{ fontFamily: typography.families.nougat, fontSize: numberFontSize, color: numberColor }}
            >
              {String(rank)}
            </StrokeText>
          </View>

          <FifaCard
            username={item.username}
            team={item.teamName || item.team}
            position={item.position}
            rating={item.rating}
            photoUrl={item.profileImageUrl}
            backgroundUrl={item.teamImageUrl}
            frameUrl={item.frameImageId}
            frameId={item.frameId}
            size={size}
            disableShadow
            onPress={() => navigation.navigate('Home', { videoId: item.videoId })}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ionicons name="heart" size={size === 'large' ? 16 : 14} color="#EF4444" />
          <Text style={{ color: colors.text, fontWeight: typography.weights.bold }}>{formatLikes(item.likes)}</Text>
        </View>
        <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: typography.sizes.sm * textScale }}>
          {item.commentsCount} comentarios
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: typography.sizes.xs * textScale }}>
          Puntuación: {item.score}
        </Text>
      </View>
    );
  };

  return (
    <ScreenGradient>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.header, { borderBottomColor: colors.border, padding: spacing.md }]}> 
          <View style={[styles.categorySelectWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Pressable
              style={styles.categorySelectButton}
              onPress={() => setShowPicker(true)}
              accessibilityLabel="Seleccionar categoria"
            >
              <Text
                style={{
                  color: categoryTextColor,
                  fontFamily: typography.families.nougat,
                  fontSize: categorySelectedFontSize,
                  textAlign: 'center',
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {category}
              </Text>
              <Ionicons name="chevron-down" size={20} color={categoryTextColor} />
            </Pressable>
          </View>
        </View>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.desktopRankingGrid, { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg }]}> 
            {rankingSections.map(renderRankingSection)}
          </View>
        )}
      </ScrollView>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowPicker(false)}
          accessibilityLabel="Cerrar selector de categoria"
        >
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            {categories.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setCategory(item);
                  setShowPicker(false);
                }}
                style={[styles.menuItem, item === category && { backgroundColor: `${colors.primary}22` }]}
                accessibilityLabel={`Categoria ${item}`}
              >
                <Text style={{ color: categoryTextColor, fontFamily: typography.families.nougat, fontSize: categoryItemFontSize, textAlign: 'center' }}>{item}</Text>
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
  categorySelectWrap: { borderWidth: 0, borderRadius: 18, minHeight: 52, justifyContent: 'center', backgroundColor: 'transparent', width: '100%' },
  categorySelectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8 },
  desktopRankingGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  bottomPodium: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    alignItems: 'flex-start',
  },
  rankingPanel: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    minHeight: 640,
  },
  emptySectionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 24,
  },
  emptyCard: {
    width: 100,
    height: 142,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  menu: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
