import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, getStreamingVideoSourceFromVideo } from '../../utils/media';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import FifaCard from '../../components/FifaCard';
import AppButton from '../../components/AppButton';
import LoadingOverlay from '../../components/LoadingOverlay';
import { deleteVideo, getAllVideos } from '../../api/backend';
import { formatLikes } from '../../utils/format';

const isLikelyVideoUrl = (url) => {
  const value = String(url || '').toLowerCase();
  return value.includes('/video/') || value.endsWith('.mp4') || value.endsWith('.mov') || value.endsWith('.m4v');
};

const normalizeMediaUrls = (video) => {
  const raw = video?.mediaUrls;
  const extractUrl = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return value.url || value.secure_url || value.uri || '';
    return '';
  };

  if (Array.isArray(raw) && raw.length) {
    return raw.map(extractUrl).filter(Boolean);
  }

  if (raw && typeof raw === 'object') {
    const values = Object.values(raw).map(extractUrl).filter(Boolean);
    if (values.length) return values;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(extractUrl).filter(Boolean);
      }
    } catch (error) {
      // Not JSON, try comma-separated list.
      const splitUrls = raw.split(',').map((item) => item.trim()).filter(Boolean);
      if (splitUrls.length) return splitUrls;
    }
  }

  if (video?.url) return [video.url];
  return [];
};

export default function MyVideosScreen({ navigation, route }) {
  const { user } = useAuth();
  const { colors, gradients, spacing, typography, textScale } = useAppTheme();
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [currentVideo, setCurrentVideo] = useState(0);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVideo, setDeletingVideo] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isBlocking = loadingVideos || deletingVideo;
  const [commentText, setCommentText] = useState('');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const commentsAnim = useRef(new Animated.Value(0)).current;
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    const firstVisible = viewableItems?.[0];
    if (firstVisible?.index != null) {
      setCarouselIndex(firstVisible.index);
    }
  });
  const selectedVideoId = route.params?.videoId;
  const sourceTab = route.params?.sourceTab || 'uploaded';

  useEffect(() => {
    const loadVideos = async () => {
      if (!user?.email) {
        setVideos([]);
        setLoadingVideos(false);
        return;
      }

      setLoadingVideos(true);
      try {
        const currentUserId = String(user.email).trim().toLowerCase();
        const allVideos = await getAllVideos(20, 50);
        const normalized = allVideos.map((video) => {
          const uploader = String(video.id_usuario || '').trim().toLowerCase();
          const likedBy = Array.isArray(video.likedBy)
            ? video.likedBy.map((value) => String(value).trim().toLowerCase())
            : [];

          return {
            ...video,
            user: uploader ? uploader.split('@')[0] : 'usuario',
            uploader,
            hasLiked: likedBy.includes(currentUserId),
          };
        });

        const filtered = sourceTab === 'liked'
          ? normalized.filter((video) => video.hasLiked)
          : sourceTab === 'ranking'
            ? normalized
            : normalized.filter((video) => video.uploader === currentUserId);

        setVideos(filtered);

        if (selectedVideoId) {
          const selectedIndex = filtered.findIndex((video) => String(video.id) === String(selectedVideoId));
          setCurrentVideo(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          setCurrentVideo(0);
        }
      } catch (error) {
        console.error('Error cargando videos en MyVideos:', error);
        setVideos([]);
      } finally {
        setLoadingVideos(false);
      }
    };

    loadVideos();
  }, [sourceTab, selectedVideoId, user?.email]);

  const activeVideo = videos[currentVideo] || null;
  const mediaUrls = normalizeMediaUrls(activeVideo);
  const normalizedType = String(activeVideo?.mediaType || '').trim().toLowerCase();
  const mediaType = normalizedType
    || (mediaUrls.length > 1
      ? 'carousel'
      : isLikelyVideoUrl(mediaUrls[0] || activeVideo?.url)
        ? 'video'
        : 'image');
  const isCarousel = ['carousel', 'carrusel'].includes(mediaType) || mediaUrls.length > 1;
  const streamingVideoUrl = useMemo(
    () => (mediaType === 'video' ? getStreamingVideoSourceFromVideo(activeVideo, 0, activeVideo?.url) : activeVideo?.url),
    [activeVideo, mediaType]
  );
  const sharePopupTitle = isCarousel
    ? 'COMPARTIR CARRUSEL'
    : mediaType === 'image'
      ? 'COMPARTIR FOTO'
      : 'COMPARTIR VIDEO';
  const uploaderCard = activeVideo?.uploaderCard || null;
  const uploaderName = uploaderCard?.username || (activeVideo?.id_usuario ? String(activeVideo.id_usuario).split('@')[0] : 'usuario');
  const canCycleVideos = videos.length > 1;
  const isLikedView = sourceTab === 'liked';
  const canDeleteVideo = sourceTab === 'uploaded' && Boolean(activeVideo);
  const carouselItemWidth = carouselWidth || windowWidth;

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

  const commentsTranslateY = commentsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
  });

  const headerTitle = useMemo(
    () => (sourceTab === 'liked' ? 'Video que te gusta' : sourceTab === 'ranking' ? 'Video del ranking' : 'Tu video'),
    [sourceTab]
  );

  useEffect(() => {
    setCarouselIndex(0);
  }, [activeVideo?.id]);

  const updateCarouselIndex = (offsetX) => {
    if (!carouselWidth) return;
    const nextIndex = Math.round(offsetX / carouselWidth);
    setCarouselIndex(Math.max(0, Math.min(nextIndex, mediaUrls.length - 1)));
  };

  const handleDeleteVideo = async () => {
    if (!activeVideo?.id || !user?.email || deletingVideo) return;

    setDeletingVideo(true);
    try {
      await deleteVideo(activeVideo.id, user.email);

      setVideos((prev) => {
        const filtered = prev.filter((video) => String(video.id) !== String(activeVideo.id));

        if (filtered.length === 0) {
          setCurrentVideo(0);
          navigation.goBack();
          return filtered;
        }

        setCurrentVideo((prevIndex) => Math.min(prevIndex, filtered.length - 1));
        return filtered;
      });

      setShowDeleteConfirm(false);
      Alert.alert('Listo', 'Publicacion eliminada correctamente.');
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo eliminar la publicacion.');
    } finally {
      setDeletingVideo(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.video} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.topBar, { padding: spacing.md }]}> 
          <Pressable onPress={() => navigation.goBack()} style={[styles.roundButton, { backgroundColor: `${colors.black}88` }]}> 
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>

          {canDeleteVideo ? (
            <Pressable onPress={() => setShowDeleteConfirm(true)} style={[styles.roundButton, { backgroundColor: `${colors.danger}CC` }]}> 
              <Ionicons name="trash" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={styles.roundButtonSpacer} />
          )}
        </View>

        {isCarousel ? (
          <View style={styles.carouselDotsBar} pointerEvents="none"> 
            <View style={styles.carouselDotsRow}>
              {mediaUrls.map((_, index) => (
                <View
                  key={`carousel-dot-${index}`}
                  style={[
                    styles.dot,
                    {
                      width: index === carouselIndex ? 16 : 6,
                      backgroundColor: index === carouselIndex ? colors.primary : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {loadingVideos ? (
          <View style={styles.videoCenter}>
            <Text style={{ color: `${colors.white}80` }}>Cargando videos...</Text>
          </View>
        ) : !activeVideo ? (
          <View style={styles.videoCenter}>
            <Text style={{ color: `${colors.white}80` }}>
              {sourceTab === 'liked'
                ? 'No tienes videos con like'
                : sourceTab === 'ranking'
                  ? 'No se pudo cargar el video del ranking'
                  : 'No tienes videos subidos'}
            </Text>
          </View>
        ) : (
          mediaType === 'video' ? (
            <Pressable
              style={styles.videoCenter}
              onPress={() => {
                if (!canCycleVideos) return;
                setCurrentVideo((prev) => (prev + 1) % videos.length);
                setLiked(false);
                setCarouselIndex(0);
              }}
            >
              <Video
                style={StyleSheet.absoluteFillObject}
                source={{ uri: streamingVideoUrl }}
                resizeMode={ResizeMode.CONTAIN}
                isLooping
                shouldPlay
                isMuted={false}
                volume={1.0}
              />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.infoWrapper}>
                {uploaderCard ? (
                  <View style={styles.uploaderCardWrap}>
                    <FifaCard
                      username={uploaderCard.username || uploaderName}
                      position={uploaderCard.position}
                      team={uploaderCard.teamName}
                      backgroundUrl={uploaderCard.teamImageUrl}
                      frameUrl={uploaderCard.frameImageId}
                      frameId={uploaderCard.frameId}
                      photoUrl={uploaderCard.profileImageUrl}
                      size="small"
                      disableShadow
                    />
                  </View>
                ) : null}
                <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
                  {activeVideo?.user || uploaderName}
                </Text>
                {activeVideo?.title ? (
                  <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}> 
                    {activeVideo.title}
                  </Text>
                ) : null}
                {activeVideo?.description ? (
                  <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}> 
                    {activeVideo.description}
                  </Text>
                ) : null}
                {activeVideo?.category ? (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}> 
                    <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}> 
                      {activeVideo.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : isCarousel ? (
            <View
              style={styles.videoCenter}
              onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
            >
              <FlatList
                key={activeVideo?.id || 'carousel'}
                data={mediaUrls}
                horizontal
                pagingEnabled
                scrollEnabled
                extraData={mediaUrls.length}
                keyExtractor={(item, index) => `${item}-${index}`}
                renderItem={({ item }) => (
                  <View style={{ width: carouselItemWidth, height: '100%' }}>
                    <Image
                      source={{ uri: item }}
                      resizeMode="stretch"
                      style={StyleSheet.absoluteFillObject}
                      accessibilityLabel="Imagen del carrusel"
                    />
                  </View>
                )}
                getItemLayout={(_, index) => ({
                  length: carouselItemWidth,
                  offset: carouselItemWidth * index,
                  index,
                })}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => updateCarouselIndex(event.nativeEvent.contentOffset.x)}
                onScroll={(event) => updateCarouselIndex(event.nativeEvent.contentOffset.x)}
                scrollEventThrottle={16}
                onViewableItemsChanged={onViewableItemsChangedRef.current}
                viewabilityConfig={viewabilityConfigRef.current}
                style={styles.carouselScroll}
                contentContainerStyle={styles.carouselContent}
                snapToInterval={Platform.OS === 'web' ? carouselItemWidth : undefined}
                snapToAlignment={Platform.OS === 'web' ? 'start' : undefined}
                decelerationRate={Platform.OS === 'web' ? 'fast' : undefined}
                initialNumToRender={2}
                windowSize={3}
                removeClippedSubviews={false}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.2)']}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={styles.infoWrapper}>
                {uploaderCard ? (
                  <View style={styles.uploaderCardWrap}>
                    <FifaCard
                      username={uploaderCard.username || uploaderName}
                      position={uploaderCard.position}
                      team={uploaderCard.teamName}
                      backgroundUrl={uploaderCard.teamImageUrl}
                      frameUrl={uploaderCard.frameImageId}
                      frameId={uploaderCard.frameId}
                      photoUrl={uploaderCard.profileImageUrl}
                      size="small"
                      disableShadow
                    />
                  </View>
                ) : null}
                <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
                  {activeVideo?.user || uploaderName}
                </Text>
                {activeVideo?.title ? (
                  <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}> 
                    {activeVideo.title}
                  </Text>
                ) : null}
                {activeVideo?.description ? (
                  <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}> 
                    {activeVideo.description}
                  </Text>
                ) : null}
                {activeVideo?.category ? (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}> 
                    <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}> 
                      {activeVideo.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.videoCenter}
              onPress={() => {
                if (!canCycleVideos) return;
                setCurrentVideo((prev) => (prev + 1) % videos.length);
                setLiked(false);
                setCarouselIndex(0);
              }}
            >
              <Image
                source={{ uri: activeVideo.url }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="stretch"
                accessibilityLabel="Vista previa de imagen"
              />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.infoWrapper}>
                {uploaderCard ? (
                  <View style={styles.uploaderCardWrap}>
                    <FifaCard
                      username={uploaderCard.username || uploaderName}
                      position={uploaderCard.position}
                      team={uploaderCard.teamName}
                      backgroundUrl={uploaderCard.teamImageUrl}
                      frameUrl={uploaderCard.frameImageId}
                      frameId={uploaderCard.frameId}
                      photoUrl={uploaderCard.profileImageUrl}
                      size="small"
                      disableShadow
                    />
                  </View>
                ) : null}
                <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
                  {activeVideo?.user || uploaderName}
                </Text>
                {activeVideo?.title ? (
                  <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}> 
                    {activeVideo.title}
                  </Text>
                ) : null}
                {activeVideo?.description ? (
                  <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}> 
                    {activeVideo.description}
                  </Text>
                ) : null}
                {activeVideo?.category ? (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}> 
                    <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}> 
                      {activeVideo.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )
        )}

        <View style={[styles.sideActions, { right: spacing.md }]}> 
          <Pressable onPress={() => setLiked((prev) => !prev)} style={styles.actionWrap} disabled={!activeVideo}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? colors.danger : colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>
              {formatLikes((activeVideo?.likes || 0) + (liked ? 1 : 0))}
            </Text>
          </Pressable>

          <Pressable onPress={openComments} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="chatbubble-outline" size={26} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>
              {activeVideo?.commentsCount || 0}
            </Text>
          </Pressable>

          <Pressable onPress={() => setShowShare(true)} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="share-social-outline" size={26} color={colors.white} />
            </View>
          </Pressable>
        </View>
      </SafeAreaView>

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
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontFamily: typography.families.nougat, fontSize: typography.sizes.xl * textScale, textAlign: 'left', flex: 1 }}>
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
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <FifaCard
                    username={`Usuario${item}`}
                    team="Sin equipo"
                    position="---"
                    size="small"
                    disableShadow
                  />
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
                {sharePopupTitle}
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

      <Modal visible={canDeleteVideo && showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={[styles.dialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale, marginBottom: 8 }}>
              Eliminar video?
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: 16 }}>Esta accion no se puede deshacer.</Text>
            <View style={styles.dialogActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1 }} />
              <AppButton title="Eliminar" variant="danger" loading={deletingVideo} onPress={handleDeleteVideo} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <LoadingOverlay visible={isBlocking} />
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  roundButtonSpacer: {
    width: 42,
    height: 42,
  },
  videoCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    overflow: 'hidden',
  },
  carouselScroll: {
    flex: 1,
    width: '100%',
  },
  carouselContent: {
    flexGrow: 1,
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
  infoWrapper: {
    position: 'absolute',
    left: 16,
    right: 90,
    bottom: 24,
    zIndex: 4,
  },
  title: {
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  description: {
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  descriptionText: {
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  uploaderCardWrap: {
    marginBottom: 6,
  },
  categoryBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    textTransform: 'uppercase',
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  carouselDotsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 72,
    paddingTop: 2,
    paddingBottom: 8,
    alignItems: 'center',
    zIndex: 6,
  },
  carouselDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
