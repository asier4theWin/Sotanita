import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, getStreamingVideoSourceFromVideo } from '../../utils/media';
import { useFocusEffect } from '@react-navigation/native';
import { getAllVideos, getCategories } from '../../api/backend';
import { useAppTheme } from '../../hooks/useAppTheme';
import ScreenGradient from '../../components/ScreenGradient';
import LoadingOverlay from '../../components/LoadingOverlay';
import MyVideosScreen from './MyVideosScreen';
import FifaCard from '../../components/FifaCard';
import Pressable from '../../components/A11yPressable';

const qrCodeImage = require('../../../assets/qrcode.png');
const copyrightLightImage = require('../../../assets/copyright/light.png');
const copyrightDarkImage = require('../../../assets/copyright/dark.png');

function parseCreatedAt(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isImageMedia(video) {
  const mediaType = String(video?.mediaType || '').toLowerCase();
  if (mediaType === 'image') return true;

  const firstMedia = Array.isArray(video?.mediaUrls) && video.mediaUrls.length
    ? video.mediaUrls[0]
    : video?.url;
  const source = String(firstMedia || '').toLowerCase();
  return /\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(source);
}

function getPreviewUrl(video) {
  if (Array.isArray(video?.mediaUrls) && video.mediaUrls.length) {
    return video.mediaUrls[0];
  }
  return video?.url || '';
}

function VideoPreviewCard({ video, colors, typography, textScale, onPress }) {
  const imagePreview = isImageMedia(video);
  const rawPreviewUrl = getPreviewUrl(video);
  const previewUrl = imagePreview
    ? rawPreviewUrl
    : getStreamingVideoSourceFromVideo(video, 0, rawPreviewUrl);
  const previewLabel = video?.title
    ? `Vista previa de ${video.title}`
    : imagePreview
      ? 'Vista previa de imagen'
      : 'Vista previa de video';
  const [hovered, setHovered] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: hovered ? 0.95 : 1,
      duration: 120,
      easing: hovered ? undefined : undefined,
      useNativeDriver: true,
    }).start();
  }, [hovered, scaleAnim]);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityLabel={video?.title || 'Abrir video'}
      style={({ pressed }) => [
        styles.videoCardPressable,
        Platform.OS === 'web' ? styles.webPointer : null,
        { opacity: pressed ? 0.98 : 1 },
      ]}
    >
      <Animated.View style={[styles.videoCard, { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ scale: scaleAnim }] }]}> 
        <View style={styles.mediaFrame}>
        {imagePreview ? (
          <Image
            source={{ uri: previewUrl }}
            style={styles.media}
            resizeMode="cover"
            accessibilityLabel={previewLabel}
          />
        ) : Platform.OS === 'web' ? (
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            style={styles.webVideo}
            onLoadedMetadata={(event) => {
              try {
                event.currentTarget.currentTime = 0;
                event.currentTarget.pause();
              } catch (error) {
                // Ignore preview load errors so the feed stays responsive.
              }
            }}
          />
        ) : (
          <>
            <Video
              source={{ uri: previewUrl }}
              style={[styles.media, styles.mediaVideo]}
              shouldPlay={false}
              isMuted
              isLooping={false}
              resizeMode={ResizeMode.STRETCH}
            />
            <View style={styles.videoIconOverlay}>
              <Ionicons name="play-circle" size={34} color="#FFFFFFE6" />
            </View>
          </>
        )}
        {video?.uploaderCard ? (
          <View style={styles.previewUploaderWrap}>
            <FifaCard
              username={video.uploaderCard.username || (video.id_usuario ? String(video.id_usuario).split('@')[0] : 'usuario')}
              position={video.uploaderCard.position}
              team={video.uploaderCard.teamName}
              backgroundUrl={video.uploaderCard.teamImageUrl}
              frameUrl={video.uploaderCard.frameImageId}
              frameId={video.uploaderCard.frameId}
              photoUrl={video.uploaderCard.profileImageUrl}
              size="small"
              disableShadow
            />
          </View>
        ) : null}
        </View>

        <View style={styles.videoMeta}>
          <Text
            style={{
              color: colors.text,
              fontSize: typography.sizes.sm * textScale,
              fontWeight: typography.weights.bold,
            }}
            numberOfLines={1}
          >
            {video?.title || 'Video'}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: typography.sizes.xs * textScale,
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {video?.category || 'Sin categoria'}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen({ navigation, route }) {
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const categorySelectorRef = useRef(null);
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categoryPickerAnchor, setCategoryPickerAnchor] = useState({ x: 20, y: 110, width: 300, height: 50 });
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const [popupVideoId, setPopupVideoId] = useState(null);
  const consumedRouteVideoRef = useRef(null);
  const popupWheelLockedRef = useRef(false);
  const popupWheelIdleTimerRef = useRef(null);
  const popupTransitionAnim = useRef(new Animated.Value(1)).current;
  const [popupTransitionDir, setPopupTransitionDir] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const routeVideoId = route?.params?.videoId ? String(route.params.videoId) : null;

  const loadFeedData = useCallback(async () => {
    try {
      const [allVideos, availableCategories] = await Promise.all([
        getAllVideos(20, 60),
        getCategories(),
      ]);

      setVideos(Array.isArray(allVideos) ? allVideos : []);
      setCategories(Array.isArray(availableCategories) ? availableCategories.filter(Boolean) : []);
    } catch (error) {
      console.error('Error loading desktop feed:', error);
      setVideos([]);
      setCategories([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const run = async () => {
        setLoading(true);
        await loadFeedData();
        if (mounted) setLoading(false);
      };

      run();
      return () => {
        mounted = false;
      };
    }, [loadFeedData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeedData();
    setRefreshing(false);
  }, [loadFeedData]);

  const sortedVideos = useMemo(() => {
    const normalized = [...videos].sort((left, right) => parseCreatedAt(right?.createdAt) - parseCreatedAt(left?.createdAt));

    if (!selectedCategory) {
      return normalized;
    }

    return normalized.filter((video) => String(video?.category || '').trim().toLowerCase() === selectedCategory.toLowerCase());
  }, [videos, selectedCategory]);

  const centralColumnVideos = useMemo(
    () => sortedVideos.filter((_, index) => index % 2 === 0),
    [sortedVideos]
  );
  const rightColumnVideos = useMemo(
    () => sortedVideos.filter((_, index) => index % 2 !== 0),
    [sortedVideos]
  );

  const selectedCategoryLabel = selectedCategory || 'Últimas Subidas';
  const copyrightSource = darkMode || highContrast ? copyrightDarkImage : copyrightLightImage;
  const popupRoute = useMemo(() => ({ params: { videoId: popupVideoId, sourceTab: 'ranking' } }), [popupVideoId]);
  const popupNavigation = useMemo(() => ({
    goBack: () => setShowVideoPopup(false),
    navigate: (...args) => {
      setShowVideoPopup(false);
      navigation.navigate(...args);
    },
  }), [navigation]);

  const openVideoPopup = useCallback((videoId) => {
    if (!videoId) return;
    setPopupVideoId(String(videoId));
    setShowVideoPopup(true);
  }, []);

  useEffect(() => {
    if (!routeVideoId) {
      consumedRouteVideoRef.current = null;
      return;
    }

    setSelectedCategory('');
  }, [routeVideoId]);

  useEffect(() => {
    if (!routeVideoId || !sortedVideos.length) return;
    if (consumedRouteVideoRef.current === routeVideoId) return;

    const exists = sortedVideos.some((video) => String(video?.id) === routeVideoId);
    if (!exists) return;

    consumedRouteVideoRef.current = routeVideoId;
    setPopupVideoId(routeVideoId);
    setShowVideoPopup(true);
    navigation.setParams({ videoId: undefined, carouselIndex: undefined, mediaIndex: undefined });
  }, [navigation, routeVideoId, sortedVideos]);

  const movePopupVideo = useCallback((step) => {
    if (!sortedVideos.length) return;
    const currentIndexRaw = sortedVideos.findIndex((video) => String(video?.id) === String(popupVideoId));
    const currentIndex = currentIndexRaw >= 0 ? currentIndexRaw : 0;
    const nextIndex = Math.min(sortedVideos.length - 1, Math.max(0, currentIndex + step));
    if (nextIndex === currentIndex) return;
    const nextVideoId = sortedVideos[nextIndex]?.id;
    if (nextVideoId == null) return;
    setPopupTransitionDir(step > 0 ? 1 : -1);
    setPopupVideoId(String(nextVideoId));
  }, [popupVideoId, sortedVideos]);

  const handlePopupWheel = useCallback((event) => {
    if (!showVideoPopup) return;
    const deltaY = Number(event?.nativeEvent?.deltaY || 0);
    if (Math.abs(deltaY) < 10) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (popupWheelLockedRef.current) {
      if (popupWheelIdleTimerRef.current) {
        clearTimeout(popupWheelIdleTimerRef.current);
      }
      popupWheelIdleTimerRef.current = setTimeout(() => {
        popupWheelLockedRef.current = false;
      }, 180);
      return;
    }

    popupWheelLockedRef.current = true;
    if (popupWheelIdleTimerRef.current) {
      clearTimeout(popupWheelIdleTimerRef.current);
    }
    popupWheelIdleTimerRef.current = setTimeout(() => {
      popupWheelLockedRef.current = false;
    }, 180);

    movePopupVideo(deltaY > 0 ? 1 : -1);
  }, [movePopupVideo, showVideoPopup]);

  useEffect(() => {
    if (!showVideoPopup) {
      popupWheelLockedRef.current = false;
      if (popupWheelIdleTimerRef.current) {
        clearTimeout(popupWheelIdleTimerRef.current);
        popupWheelIdleTimerRef.current = null;
      }
    }
  }, [showVideoPopup]);

  useEffect(() => {
    if (!showVideoPopup || !popupVideoId) return;
    popupTransitionAnim.setValue(0);
    Animated.timing(popupTransitionAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [popupTransitionAnim, popupTransitionDir, popupVideoId, showVideoPopup]);

  const openCategoryPicker = useCallback(() => {
    const node = categorySelectorRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        setCategoryPickerAnchor({
          x: Number.isFinite(x) ? x : 20,
          y: Number.isFinite(y) ? y : 110,
          width: Number.isFinite(width) ? width : 300,
          height: Number.isFinite(height) ? height : 50,
        });
        setShowCategoryPicker(true);
      });
      return;
    }

    setShowCategoryPicker(true);
  }, []);

  const categoryPickerTop = categoryPickerAnchor.y + categoryPickerAnchor.height + 6;
  const categoryPickerMaxHeight = Math.max(
    320,
    Math.min(560, windowHeight - categoryPickerTop - 24)
  );

  return (
    <ScreenGradient>
      <View style={styles.root}>
        <View style={[styles.leftPanel, { borderRightColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.xl }]}> 
          <View style={styles.leftPanelTopStack}>
            <Pressable
              ref={categorySelectorRef}
              onPress={openCategoryPicker}
              style={({ pressed }) => [
                styles.categorySelector,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                  paddingHorizontal: spacing.md,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: typography.sizes.lg * textScale * 1.1,
                  fontWeight: typography.weights.semibold,
                  fontFamily: typography.families.nougat,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {selectedCategoryLabel}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
            </Pressable>

            <View style={styles.qrBlock}>
              <Image
                source={qrCodeImage}
                style={styles.qrImage}
                resizeMode="contain"
                accessibilityLabel="Codigo QR de descarga"
              />
              <Image
                source={copyrightSource}
                style={styles.copyrightImage}
                resizeMode="contain"
                accessibilityLabel="Logo de derechos de autor"
              />
            </View>
          </View>
        </View>

        <View style={[styles.feedColumnsWrapper, { paddingTop: spacing.lg, paddingHorizontal: spacing.md }]}> 
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
          >
            <View style={styles.twoColumns}>
              <View style={styles.videoColumn}>
                {centralColumnVideos.map((video) => (
                  <VideoPreviewCard
                    key={String(video.id || video._id || Math.random())}
                    video={video}
                    colors={colors}
                    typography={typography}
                    textScale={textScale}
                    onPress={() => openVideoPopup(video.id)}
                  />
                ))}
              </View>

              <View style={styles.videoColumn}>
                {rightColumnVideos.map((video) => (
                  <VideoPreviewCard
                    key={String(video.id || video._id || Math.random())}
                    video={video}
                    colors={colors}
                    typography={typography}
                    textScale={textScale}
                    onPress={() => openVideoPopup(video.id)}
                  />
                ))}
              </View>
            </View>

            {!sortedVideos.length ? (
              <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
                <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                  No hay videos para esta categoria.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>

        <Modal transparent animationType="fade" visible={showVideoPopup} onRequestClose={() => setShowVideoPopup(false)}>
          <Pressable
            style={[styles.videoPopupOverlay, { backgroundColor: colors.overlay }]}
            onPress={() => setShowVideoPopup(false)}
          >
            <Pressable
              onPress={() => {}}
              onPressIn={(event) => event?.stopPropagation?.()}
              onWheel={handlePopupWheel}
              style={[
                styles.videoPopupCard,
                {
                  width: windowWidth * 0.67,
                  height: windowHeight * 0.95,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {popupVideoId ? (
                <Animated.View
                  style={{
                    flex: 1,
                    opacity: popupTransitionAnim,
                    transform: [
                      {
                        translateY: popupTransitionAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [popupTransitionDir > 0 ? 26 : -26, 0],
                        }),
                      },
                    ],
                  }}
                >
                  <MyVideosScreen
                    navigation={popupNavigation}
                    route={popupRoute}
                    embedded
                    onVideoDeleted={loadFeedData}
                  />
                </Animated.View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={showCategoryPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCategoryPicker(false)}
        >
          <Pressable
            style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
            onPress={() => setShowCategoryPicker(false)}
          >
            <Pressable
              onPress={() => {}}
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  left: categoryPickerAnchor.x,
                  top: categoryPickerTop,
                  width: categoryPickerAnchor.width,
                  maxHeight: categoryPickerMaxHeight,
                },
              ]}
            >
              <ScrollView
                showsVerticalScrollIndicator
                contentContainerStyle={styles.modalScrollContent}
              >
                <Pressable
                  onPress={() => {
                    setSelectedCategory('');
                    setShowCategoryPicker(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalItem,
                    { opacity: pressed ? 0.75 : 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: typography.weights.semibold, fontFamily: typography.families.nougat, fontSize: typography.sizes.lg * textScale * 1.1 }}>
                    Últimas Subidas
                  </Text>
                </Pressable>

                {categories.map((item) => (
                  <Pressable
                    key={String(item)}
                    onPress={() => {
                      setSelectedCategory(String(item));
                      setShowCategoryPicker(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalItem,
                      { opacity: pressed ? 0.75 : 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontFamily: typography.families.nougat, fontSize: typography.sizes.lg * textScale * 1.1 }}>
                      {String(item)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <LoadingOverlay visible={loading} />
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    width: '33.3333%',
    borderRightWidth: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  leftPanelTopStack: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    flexGrow: 0,
  },
  categorySelector: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 30,
  },
  qrImage: {
    width: 500,
    height: 500,
  },
  copyrightImage: {
    width: '85%',
    height: 168,
    marginTop: 20,
  },
  feedColumnsWrapper: {
    width: '66.6667%',
  },
  twoColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  videoColumn: {
    flex: 1,
    gap: 16,
  },
  videoCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  videoCardPressable: {
    borderRadius: 14,
  },
  webPointer: {
    cursor: 'pointer',
  },
  mediaFrame: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: '#000000',
    position: 'relative',
  },
  previewUploaderWrap: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 5,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  mediaVideo: {
    width: '100%',
    height: '100%',
  },
  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
  },
  videoIconOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  videoMeta: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 18,
    padding: 16,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  videoPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPopupCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalCard: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalScrollContent: {
    paddingBottom: 2,
  },
  modalItem: {
    minHeight: 56,
    borderBottomWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
