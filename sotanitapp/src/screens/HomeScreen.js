import { useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../hooks/useAppTheme';
import FifaCard from '../components/FifaCard';
import AppButton from '../components/AppButton';
import { categories, feedVideos } from '../utils/mockData';
import { formatLikes } from '../utils/format';

export default function HomeScreen({ navigation }) {
  const { colors, gradients, spacing, typography, textScale } = useAppTheme();

  const [currentVideo, setCurrentVideo] = useState(0);
  const [liked, setLiked] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchCategory, setSearchCategory] = useState('Todos');
  const [sortBy, setSortBy] = useState('Mas recientes');
  const [activeSearchField, setActiveSearchField] = useState(null);
  const [showSearchCategoryList, setShowSearchCategoryList] = useState(false);
  const [showSortList, setShowSortList] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentText, setCommentText] = useState('');
  const commentsAnim = useRef(new Animated.Value(0)).current;
  const searchAnim = useRef(new Animated.Value(0)).current;
  const sortOptions = ['Mas recientes', 'Mas gustados', 'Mas comentados'];

  const filteredVideos = useMemo(() => {
    if (selectedCategory === 'Todos') {
      return feedVideos;
    }
    return feedVideos.filter((video) => video.category === selectedCategory);
  }, [selectedCategory]);

  const activeVideo = filteredVideos[currentVideo] || feedVideos[0];

  const openComments = () => {
    setShowComments(true);
    Animated.timing(commentsAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeComments = () => {
    Animated.timing(commentsAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowComments(false);
      }
    });
  };

  const openAdvancedSearch = () => {
    if (showAdvancedSearch) {
      Animated.timing(searchAnim, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShowAdvancedSearch(false);
        }
      });
      return;
    }

    setShowCategoryMenu(false);
    setShowAdvancedSearch(true);
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeAdvancedSearch = () => {
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setActiveSearchField(null);
        setShowSearchCategoryList(false);
        setShowSortList(false);
        setShowAdvancedSearch(false);
      }
    });
  };

  const commentsTranslateY = commentsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
  });

  const searchTranslateY = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 0],
  });

  const goNextVideo = () => {
    if (showAdvancedSearch) {
      closeAdvancedSearch();
    }
    setShowCategoryMenu(false);
    if (filteredVideos.length <= 1) {
      return;
    }
    setCurrentVideo((prev) => (prev + 1) % filteredVideos.length);
    setLiked(false);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.video} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.topBar, { paddingHorizontal: spacing.md, paddingTop: spacing.xs }]}>
          <Pressable
            onPress={openAdvancedSearch}
            style={[styles.roundButton, { backgroundColor: `${colors.black}88` }]}
          >
            <Ionicons name="search" size={20} color={colors.white} />
          </Pressable>

          <Pressable
            onPress={() => {
              setShowCategoryMenu((prev) => !prev);
              if (showAdvancedSearch) {
                closeAdvancedSearch();
              }
            }}
            style={[styles.categoryChip, { backgroundColor: `${colors.black}88` }]}
          >
            <Text style={{ color: colors.white, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm * textScale }}>
              {selectedCategory}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.white} />
          </Pressable>

          {activeVideo.owner ? (
            <Pressable
              onPress={() => {
                setShowDeleteConfirm(true);
                if (showAdvancedSearch) {
                  closeAdvancedSearch();
                }
                setShowCategoryMenu(false);
              }}
              style={[styles.roundButton, { backgroundColor: `${colors.danger}CC` }]}
            >
              <Ionicons name="trash" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={styles.roundButton} />
          )}
        </View>

        <Pressable style={styles.videoCenter} onPress={goNextVideo}>
          <Ionicons name="play-circle" size={90} color={`${colors.white}55`} />
          <Text style={{ color: `${colors.white}80`, marginTop: spacing.xs }}>Video de {activeVideo.user}</Text>
        </Pressable>

        <View style={[styles.sideActions, { right: spacing.md }]}>
          <FifaCard
            size="small"
            username={activeVideo.user}
            team={activeVideo.team}
            position={activeVideo.position}
          />

          <Pressable onPress={() => setLiked((prev) => !prev)} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? colors.danger : colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale, fontWeight: typography.weights.semibold }}>
              {formatLikes(activeVideo.likes + (liked ? 1 : 0))}
            </Text>
          </Pressable>

          <Pressable onPress={openComments} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="chatbubble-outline" size={26} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale, fontWeight: typography.weights.semibold }}>
              234
            </Text>
          </Pressable>

          <Pressable onPress={() => setShowShare(true)} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="share-social-outline" size={26} color={colors.white} />
            </View>
          </Pressable>
        </View>

        <Text style={[styles.swipeHint, { color: `${colors.white}88` }]}>Toca para cambiar video</Text>
      </SafeAreaView>

      <Modal visible={showCategoryMenu} transparent animationType="fade" onRequestClose={() => setShowCategoryMenu(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowCategoryMenu(false)}>
          <Pressable
            style={[
              styles.categoryDropdown,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            {categories.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setSelectedCategory(item);
                  setCurrentVideo(0);
                  setShowCategoryMenu(false);
                }}
                style={[styles.categoryDropdownItem, selectedCategory === item && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={{
                    color: selectedCategory === item ? colors.black : colors.text,
                    fontWeight: typography.weights.semibold,
                  }}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAdvancedSearch} transparent animationType="none" onRequestClose={closeAdvancedSearch}>
        <Pressable style={styles.searchModalOverlay} onPress={closeAdvancedSearch}>
          <Pressable onPress={() => {}}>
            <Animated.View
              style={[
                styles.topShareSheet,
                {
                  backgroundColor: colors.surface,
                  transform: [{ translateY: searchTranslateY }],
                  opacity: searchAnim,
                },
              ]}
            >
              <View style={styles.sheetHeader}>
                <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>
                  Busqueda Avanzada
                </Text>
                <Pressable onPress={closeAdvancedSearch}>
                  <Ionicons name="close" size={26} color={colors.text} />
                </Pressable>
              </View>

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                onFocus={() => {
                  setActiveSearchField('search');
                  setShowSearchCategoryList(false);
                  setShowSortList(false);
                }}
                placeholder="Buscar usuario..."
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: colors.surfaceElevated,
                    color: colors.text,
                    borderColor: activeSearchField === 'search' ? colors.primary : colors.border,
                  },
                ]}
              />

              <Text style={{ color: colors.textMuted, marginBottom: 6, fontSize: typography.sizes.sm * textScale }}>Categoria</Text>
              <View style={styles.dropdownBlock}>
                <Pressable
                  style={[styles.selectTrigger, { borderColor: activeSearchField === 'category' ? colors.primary : colors.border }]}
                  onPress={() => {
                    setActiveSearchField('category');
                    setShowSearchCategoryList((prev) => !prev);
                    setShowSortList(false);
                  }}
                >
                  <Text style={[styles.selectTriggerText, { fontSize: typography.sizes.lg * textScale }]}>
                    {searchCategory === 'Todos' ? 'Todas las categorias' : searchCategory}
                  </Text>
                  <Ionicons name={showSearchCategoryList ? 'chevron-up' : 'chevron-down'} size={18} color="#FFFFFF" />
                </Pressable>

                {showSearchCategoryList ? (
                  <View style={styles.dropdownMenu}>
                    <View style={styles.dropdownSelectedRow}>
                      <Text style={[styles.dropdownSelectedText, { fontSize: typography.sizes.lg * textScale }]}>
                        {searchCategory === 'Todos' ? 'Todas las categorias' : searchCategory}
                      </Text>
                    </View>
                    {categories.map((item) => (
                      <Pressable
                        key={item}
                        style={styles.listItem}
                        onPress={() => {
                          setSearchCategory(item);
                          setShowSearchCategoryList(false);
                        }}
                      >
                        <Text style={[styles.listItemText, { fontSize: typography.sizes.lg * textScale }]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <Text style={{ color: colors.textMuted, marginBottom: 6, marginTop: 10, fontSize: typography.sizes.sm * textScale }}>Orden</Text>
              <View style={styles.dropdownBlock}>
                <Pressable
                  style={[styles.selectTrigger, { borderColor: activeSearchField === 'sort' ? colors.primary : colors.border }]}
                  onPress={() => {
                    setActiveSearchField('sort');
                    setShowSortList((prev) => !prev);
                    setShowSearchCategoryList(false);
                  }}
                >
                  <Text style={[styles.selectTriggerText, { fontSize: typography.sizes.lg * textScale }]}>{sortBy}</Text>
                  <Ionicons name={showSortList ? 'chevron-up' : 'chevron-down'} size={18} color="#FFFFFF" />
                </Pressable>

                {showSortList ? (
                  <View style={styles.dropdownMenu}>
                    <View style={styles.dropdownSelectedRow}>
                      <Text style={[styles.dropdownSelectedText, { fontSize: typography.sizes.lg * textScale }]}>{sortBy}</Text>
                    </View>
                    {sortOptions.map((item) => (
                      <Pressable
                        key={item}
                        style={styles.listItem}
                        onPress={() => {
                          setSortBy(item);
                          setShowSortList(false);
                        }}
                      >
                        <Text style={[styles.listItemText, { fontSize: typography.sizes.lg * textScale }]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <AppButton title="Buscar" onPress={closeAdvancedSearch} />
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {showComments ? (
        <View style={styles.commentsLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeComments}>
            <Animated.View style={[styles.commentsBackdrop, { backgroundColor: colors.overlay, opacity: commentsAnim }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: colors.surface,
                transform: [{ translateX: commentsTranslateY }],
                opacity: commentsAnim,
              },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}> 
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>
                Comentarios
              </Text>
              <Pressable onPress={closeComments}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>

            <FlatList
              data={[1, 2, 3, 4, 5]}
              keyExtractor={(item) => String(item)}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={[styles.commentAvatar, { backgroundColor: colors.surfaceElevated }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: typography.weights.semibold }}>Usuario{item}</Text>
                    <Text style={{ color: colors.textMuted }}>Que golazo! Increible jugada.</Text>
                  </View>
                </View>
              )}
            />

            <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}> 
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Anade un comentario..."
                placeholderTextColor={colors.textMuted}
                style={[styles.commentInput, { backgroundColor: colors.surfaceElevated, color: colors.text }]}
              />
              <Pressable style={[styles.actionCircle, { backgroundColor: colors.primary }]} onPress={() => setCommentText('')}>
                <Ionicons name="send" size={18} color={colors.black} />
              </Pressable>
              <Pressable style={[styles.actionCircle, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}}>
                <Ionicons name="mic" size={18} color={colors.text} />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}

      <Modal visible={showShare} transparent animationType="slide" onRequestClose={() => setShowShare(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setShowShare(false)}>
          <Pressable style={[styles.shareSheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>
                Compartir
              </Text>
              <Pressable onPress={() => setShowShare(false)}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>

            <AppButton title="Compartir enlace" variant="secondary" style={{ marginBottom: spacing.sm }} />
            <AppButton title="Descargar video" variant="secondary" />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={[styles.dialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale, marginBottom: 8 }}>
              Eliminar video?
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: 16 }}>Esta accion no se puede deshacer.</Text>
            <View style={styles.dialogActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1 }} />
              <AppButton title="Eliminar" variant="danger" onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 5,
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
  },
  videoCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideActions: {
    position: 'absolute',
    bottom: 118,
    alignItems: 'center',
    gap: 20,
  },
  actionWrap: {
    alignItems: 'center',
    gap: 4,
  },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeHint: {
    position: 'absolute',
    bottom: 104,
    alignSelf: 'center',
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'stretch',
    alignItems: 'flex-end',
    zIndex: 20,
  },
  commentsBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  searchModalOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  categoryDropdown: {
    marginTop: 92,
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
  },
  categoryDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  topShareSheet: {
    width: '100%',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    padding: 20,
    gap: 8,
    paddingTop: 44,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  dropdownBlock: {
    marginBottom: 4,
  },
  selectTrigger: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E2E46',
  },
  selectTriggerText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#1E2E46',
    marginTop: 0,
    marginBottom: 6,
  },
  dropdownSelectedRow: {
    minHeight: 42,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
  },
  dropdownSelectedText: {
    color: '#111827',
    fontWeight: '500',
  },
  listItem: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.35)',
  },
  listItemText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  bottomSheet: {
    width: '92%',
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
  },
  shareSheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
    paddingBottom: 40,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  commentInputRow: {
    borderTopWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  dialog: {
    margin: 20,
    borderRadius: 18,
    padding: 18,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
