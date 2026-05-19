import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Animated, Dimensions, FlatList, Pressable, StyleSheet, Text, View, RefreshControl, Alert, Image, ScrollView, TextInput, Modal, Platform, Linking, Share, PanResponder } from 'react-native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, ResizeMode, Video, getStreamingVideoSourceFromVideo } from '../../utils/media';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getAllVideos, getVideos, getCategories, likeVideo, unlikeVideo, getVideoComments, postVideoComment, uploadCommentAudio, deleteVideoComment, deleteVideo, getTeamById, postForumMessage, resolveApiBaseUrl } from '../../api/backend';
import { useAuth } from '../../context/AuthContext';
import { formatLikes } from '../../utils/format';
import FifaCard from '../../components/FifaCard';
import LoadingOverlay from '../../components/LoadingOverlay';
import AppButton from '../../components/AppButton';
import StrokeText from '../../components/StrokeText';

const isNonMobileDevice = () => {
  if (Platform.OS !== 'web') {
    return Device.deviceType !== Device.DeviceType.PHONE;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth >= 600;
};

const isLikelyVideoUrl = (url) => {
  const value = String(url || '').toLowerCase();
  return value.includes('/video/') || value.endsWith('.mp4') || value.endsWith('.mov') || value.endsWith('.m4v');
};

const normalizeCloudinaryVideoUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return raw;

  const marker = '/video/upload/';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) return raw;

  const afterMarker = raw.slice(markerIndex + marker.length);
  if (afterMarker.includes('fl_progressive')) {
    return raw;
  }

  if (afterMarker.startsWith('f_') || afterMarker.startsWith('c_') || afterMarker.startsWith('w_')) {
    return `${raw.slice(0, markerIndex + marker.length)}vc_h264,ac_aac,fl_progressive,so_0,q_auto/${afterMarker}`;
  }

  const transform = 'f_mp4,vc_h264,ac_aac,c_pad,w_1080,h_1920,ar_9:16,fl_progressive,so_0,q_auto';
  return `${raw.slice(0, markerIndex + marker.length)}${transform}/${afterMarker}`;
};

const normalizeUserId = (value) => String(value || '').trim().toLowerCase();

const matchesUserIdentifier = (sourceValue, user) => {
  const normalizedSource = normalizeUserId(sourceValue);
  if (!normalizedSource) return false;

  const candidates = [
    user?.email,
    user?.id,
    user?.username,
    user?.email ? String(user.email).split('@')[0] : '',
  ].map(normalizeUserId).filter(Boolean);

  return candidates.includes(normalizedSource);
};

const parseCarouselIndex = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const BACKEND_URL = resolveApiBaseUrl();
const FRONTEND_URL = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://sotanita.vercel.app';


const isDesktopLikeWeb = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth >= 900;
};

const MediaCarousel = ({ urls, height, activeIndex, onIndexChange }) => {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef(null);
  const lastIndexRef = useRef(activeIndex || 0);

  useEffect(() => {
    lastIndexRef.current = activeIndex || 0;
  }, [activeIndex]);

  useEffect(() => {
    if (!scrollRef.current || !width || !urls.length) return;
    const safeIndex = Math.max(0, Math.min(activeIndex || 0, urls.length - 1));
    scrollRef.current.scrollTo({ x: safeIndex * width, y: 0, animated: false });
  }, [activeIndex, urls.length, width]);

  const updateIndexFromOffset = (offsetX) => {
    if (!width) return;
    const nextIndex = Math.max(0, Math.min(Math.round(offsetX / width), urls.length - 1));
    if (nextIndex !== lastIndexRef.current) {
      lastIndexRef.current = nextIndex;
      onIndexChange(nextIndex);
    }
  };

  return (
    <View
      style={[styles.mediaContainer, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => updateIndexFromOffset(event.nativeEvent.contentOffset.x)}
        onScroll={(event) => updateIndexFromOffset(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        {urls.map((url) => (
          <Image
            key={url}
            source={{ uri: url }}
            resizeMode="cover"
            style={{ width: width || '100%', height }}
          />
        ))}
      </ScrollView>

    </View>
  );
};

const FeedVideoItem = ({
  video,
  isActive,
  height,
  onLikePress,
  onDeletePress,
  onCommentPress,
  onSharePress,
  commentsCount,
  liking,
  deleting,
  isAudioPlaying,
  isRecording,
  carouselIndex,
  onCarouselIndexChange,
  isOwnVideo,
}) => {
  const { colors, typography, textScale, spacing } = useAppTheme();
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const tapFeedbackAnim = useRef(new Animated.Value(0)).current;
  const tapFeedbackSource = require('../../../assets/like.gif');
  const screenWidth = Dimensions.get('window').width;
  const [videoNatural, setVideoNatural] = useState(null);
  const gifMaxSize = Math.round(screenWidth * 0.65);
  const videoUrl = useMemo(() => normalizeCloudinaryVideoUrl(video.url), [video.url]);
  const streamingVideoUrl = useMemo(
    () => getStreamingVideoSourceFromVideo(video, 0, videoUrl),
    [video, videoUrl]
  );
  const mediaUrls = Array.isArray(video.mediaUrls) && video.mediaUrls.length
    ? video.mediaUrls
    : video.url
      ? [video.url]
      : [];
  const mediaType = video.mediaType || (isLikelyVideoUrl(video.url) ? 'video' : 'image');
  const isVideo = mediaType === 'video';
  const uploaderCard = video?.uploaderCard || null;
  const uploaderName = uploaderCard?.username || (video.id_usuario ? video.id_usuario.split('@')[0] : 'usuario');

  const playTapFeedback = useCallback(() => {
    tapFeedbackAnim.stopAnimation(() => {
      tapFeedbackAnim.setValue(0);
      Animated.sequence([
        Animated.timing(tapFeedbackAnim, {
          toValue: 0.7,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.delay(700),
        Animated.timing(tapFeedbackAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [tapFeedbackAnim]);

    const posterUrl = video.thumbnailUrl || video.posterUrl || video.previewUrl || '';
  useEffect(() => {
    if (!isVideo) return;
    // Asegurar que el audio se escuche en iOS incluso con el boton de silencio
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  }, [isVideo]);

  const videoSurfaceStyle = useMemo(() => {
    const naturalWidth = Number(videoNatural?.width) || 0;
    const naturalHeight = Number(videoNatural?.height) || 0;
    if (!naturalWidth || !naturalHeight || !height || !screenWidth) {
      return styles.videoSurface;
    }

    let width = naturalWidth;
    let heightValue = naturalHeight;
    const orientation = String(videoNatural?.orientation || '').toLowerCase();

    if (orientation === 'portrait' && width > heightValue) {
      [width, heightValue] = [heightValue, width];
    }

    if (orientation === 'landscape' && heightValue > width) {
      [width, heightValue] = [heightValue, width];
    }

    const aspect = width / heightValue;
    const containerAspect = screenWidth / height;
    const displayWidth = aspect > containerAspect ? screenWidth : height * aspect;
    const displayHeight = aspect > containerAspect ? screenWidth / aspect : height;

    return { width: displayWidth, height: displayHeight };
  }, [height, screenWidth, videoNatural]);

  useEffect(() => {
    let cancelled = false;

    const syncPlayback = async () => {
      if (!videoRef.current || cancelled) return;

      try {
        if (isActive && !isAudioPlaying && !isRecording) {
          await videoRef.current.playAsync();
        } else {
          await videoRef.current.pauseAsync();
          await videoRef.current.setPositionAsync(0);
        }
      } catch (error) {
        console.log('Playback sync error:', error);
      }
    };

    syncPlayback();

    return () => {
      cancelled = true;
    };
  }, [isActive, isVideo, isAudioPlaying, isRecording]);

  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 250) {
      playTapFeedback();
      onLikePress(video, { forceLike: true });
    }
    lastTapRef.current = now;
  };

  return (
    <Pressable style={[styles.videoContainer, { height }]} onPress={handleMediaTap}> 
      {isVideo ? (
        Platform.OS === 'web' ? (
          <video
            src={streamingVideoUrl}
            muted={!isActive || isAudioPlaying || isRecording}
            loop
            playsInline
            preload="metadata"
            autoPlay={isActive && !isAudioPlaying && !isRecording}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : isActive ? (
          <Video
            ref={videoRef}
            style={videoSurfaceStyle}
            source={{ uri: streamingVideoUrl }}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay={isActive && !isAudioPlaying && !isRecording}
            isMuted={!isActive || isAudioPlaying || isRecording}
            volume={1.0}
            onLoad={(status) => {
              if (status?.naturalSize?.width && status?.naturalSize?.height) {
                setVideoNatural(status.naturalSize);
              }
            }}
          />
        ) : posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={[StyleSheet.absoluteFillObject, styles.videoPoster]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoPoster, styles.videoPosterFallback]}>
            <Ionicons name="play-circle-outline" size={60} color={`${colors.white}CC`} />
            <Text style={[styles.posterHint, { color: `${colors.white}CC`, fontSize: typography.sizes.sm * textScale }]}>Desliza para reproducir</Text>
          </View>
        )
      ) : mediaUrls.length > 1 ? (
        <MediaCarousel
          urls={mediaUrls}
          height={height}
          activeIndex={carouselIndex}
          onIndexChange={onCarouselIndexChange}
        />
      ) : (
        <Image
          source={{ uri: video.url }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tapFeedbackOverlay,
          {
            opacity: tapFeedbackAnim,
            transform: [
              {
                scale: tapFeedbackAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 2.5],
                }),
              },
            ],
          },
        ]}
      >
        <View style={[styles.tapFeedbackBubble, { width: gifMaxSize, height: gifMaxSize, borderRadius: gifMaxSize / 2 }]}>
          <Image source={tapFeedbackSource} style={[styles.tapFeedbackGif, { width: gifMaxSize * 0.89, height: gifMaxSize * 0.89 }]} resizeMode="contain" />
        </View>
      </Animated.View>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.bottomGradient}
      />
      
      <View style={[styles.infoWrapper, { bottom: spacing.md }]}>
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
        <Text style={[styles.title, { fontSize: typography.sizes.lg * textScale, color: colors.white, fontWeight: 'bold' }]}>
          @{uploaderName}
        </Text>
        <Text style={[styles.description, { fontSize: typography.sizes.md * textScale, color: colors.white }]}>
          {video.title}
        </Text>
        {video.description ? (
           <Text style={[styles.descriptionText, { fontSize: typography.sizes.sm * textScale, color: '#DDD', marginTop: 4 }]}>
              {video.description}
           </Text>
        ) : null}
        <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.categoryText, { color: colors.black, fontWeight: 'bold', fontSize: typography.sizes.xs }]}>
            {video.category}
          </Text>
        </View>
      </View>

      <View style={[styles.sideActions, { bottom: spacing.xxl }]}>
        {isOwnVideo ? (
          <Pressable style={styles.actionWrap} onPress={() => onDeletePress(video)} disabled={deleting} hitSlop={10}>
            <View style={[styles.actionCircle, { backgroundColor: colors.danger, borderWidth: 1, borderColor: '#ffffff55' }]}>
              <Ionicons name="trash-outline" size={24} color={colors.white} />
            </View>
            <Text style={styles.actionText}>Borrar</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.actionWrap} onPress={() => onLikePress(video)} disabled={liking}>
          <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}>
            <Ionicons name={video.hasLiked ? 'heart' : 'heart-outline'} size={28} color={video.hasLiked ? '#ef4444' : colors.white} />
          </View>
          <Text style={styles.actionText}>{formatLikes(video.likes || 0)}</Text>
        </Pressable>

        <Pressable style={styles.actionWrap} onPress={() => onCommentPress(video.id)}>
          <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}>
            <Ionicons name="chatbubble-outline" size={26} color={colors.white} />
          </View>
          <Text style={styles.actionText}>{commentsCount}</Text>
        </Pressable>

        <Pressable style={styles.actionWrap} onPress={() => onSharePress(video.id)}>
          <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}>
            <Ionicons name="share-social-outline" size={26} color={colors.white} />
          </View>
          <Text style={styles.actionText}>Compartir</Text>
        </Pressable>
      </View>
    </Pressable>
  );
};

export default function HomeScreen({ navigation, route }) {
  const { colors, typography, textScale, darkMode, highContrast } = useAppTheme();
  const isFocused = useIsFocused();
  const { user, isLoggedIn } = useAuth();
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [likingVideoId, setLikingVideoId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  const [shareVideoId, setShareVideoId] = useState(null);
  const [fanZoneShieldUri, setFanZoneShieldUri] = useState('');
  const [deletingVideoId, setDeletingVideoId] = useState(null);
  const [pendingDeleteVideo, setPendingDeleteVideo] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadFanZoneEscudo = async () => {
      if (!showShareModal) {
        if (!cancelled) {
          setFanZoneShieldUri('');
        }
        return;
      }

      if (!isLoggedIn || !user?.teamId) {
        if (!cancelled) {
          setFanZoneShieldUri(user?.teamImageUrl || '');
        }
        return;
      }

      try {
        const team = await getTeamById(user.teamId);
        if (!cancelled) {
          setFanZoneShieldUri(team?.escudoUrl || team?.imageUrl || user?.teamImageUrl || '');
        }
      } catch (error) {
        if (!cancelled) {
          setFanZoneShieldUri(user?.teamImageUrl || '');
        }
      }
    };

    loadFanZoneEscudo();

    return () => {
      cancelled = true;
    };
  }, [showShareModal, isLoggedIn, user?.teamId, user?.teamImageUrl]);
  const [commentText, setCommentText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [commentsByVideo, setCommentsByVideo] = useState({});
  const [carouselIndexByVideo, setCarouselIndexByVideo] = useState({});
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [pendingFeedVideoId, setPendingFeedVideoId] = useState(null);
  const [pendingFeedCarouselIndex, setPendingFeedCarouselIndex] = useState(null);
  const [pendingDeleteComment, setPendingDeleteComment] = useState(null);
  const [loadingNewComment, setLoadingNewComment] = useState(false);
  const commentsAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const recordingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const audioRef = useRef(null);
  const [activeAudioId, setActiveAudioId] = useState(null);
  const [audioPositionMs, setAudioPositionMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const offsetRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const dragStartIndexRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const activeIndexRef = useRef(0);
  const listRef = useRef(null);
  const categoryItemFontSize = 22 * textScale;
  const categorySelectedFontSize = 26 * textScale;
  const categoryTextColor = highContrast
    ? colors.primary
    : darkMode
      ? colors.white
      : colors.primary;
  const categoryLabel = selectedCategory || 'Últimos videos';
  const routeVideoId = route?.params?.videoId ? String(route.params.videoId) : null;
  const pinnedFeedVideoId = pendingFeedVideoId || routeVideoId;

  const normalizedSelectedCategory = String(selectedCategory || '').trim().toLowerCase();
  const visibleVideos = normalizedSelectedCategory
    ? videos.filter((video) => String(video.category || '').trim().toLowerCase() === normalizedSelectedCategory)
    : videos;

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategories([]);
    }
  }, []);

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);

    try {
      const limit = 5;
      let data = [];

      if (pinnedFeedVideoId && !selectedCategory) {
        const allVideos = await getAllVideos(10, 50);
        const targetIndex = allVideos.findIndex((video) => String(video.id) === pinnedFeedVideoId);

        if (targetIndex >= 0) {
          const targetVideo = allVideos[targetIndex];
          data = [targetVideo, ...allVideos.filter((video) => String(video.id) !== pinnedFeedVideoId)];
        } else {
          data = allVideos;
        }
      } else {
        data = await getVideos(limit, 0, selectedCategory);
      }

      const currentUserId = String(user?.email || '').trim().toLowerCase();
      const normalizedData = data.map((video) => {
        const likedBy = Array.isArray(video.likedBy) ? video.likedBy.map((value) => String(value).toLowerCase()) : [];
        return {
          ...video,
          hasLiked: currentUserId ? likedBy.includes(currentUserId) : false,
        };
      });

      setVideos(normalizedData);

      if (pendingFeedVideoId && !selectedCategory && pendingFeedCarouselIndex != null) {
        const pinnedVideo = normalizedData.find((video) => String(video.id) === String(pendingFeedVideoId));
        if (pinnedVideo) {
          const pinnedMediaUrls = Array.isArray(pinnedVideo.mediaUrls) && pinnedVideo.mediaUrls.length
            ? pinnedVideo.mediaUrls
            : pinnedVideo.url
              ? [pinnedVideo.url]
              : [];
          const clampedIndex = Math.max(0, Math.min(pendingFeedCarouselIndex, Math.max(pinnedMediaUrls.length - 1, 0)));
          setCarouselIndexByVideo((prev) => ({
            ...prev,
            [pendingFeedVideoId]: clampedIndex,
          }));
        }
      }

      setActiveIndex(0);
      activeIndexRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });

      const nextOffset = data.length;
      offsetRef.current = nextOffset;
      setOffset(nextOffset);

      const nextHasMore = pinnedFeedVideoId && !selectedCategory ? false : data.length === limit;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);

      if (pendingFeedVideoId && !selectedCategory) {
        setPendingFeedVideoId(null);
        setPendingFeedCarouselIndex(null);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [pendingFeedCarouselIndex, user?.email, selectedCategory, pendingFeedVideoId, pinnedFeedVideoId]);

  const fetchMoreFeedVideos = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const limit = 5;
      const currentOffset = offsetRef.current;
      const data = await getVideos(limit, currentOffset, selectedCategory);
      const currentUserId = String(user?.email || '').trim().toLowerCase();
      const normalizedData = data.map((video) => {
        const likedBy = Array.isArray(video.likedBy) ? video.likedBy.map((value) => String(value).toLowerCase()) : [];
        return {
          ...video,
          hasLiked: currentUserId ? likedBy.includes(currentUserId) : false,
        };
      });

      setVideos((prev) => [...prev, ...normalizedData]);

      const nextOffset = currentOffset + data.length;
      offsetRef.current = nextOffset;
      setOffset(nextOffset);

      const nextHasMore = data.length === limit;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } catch (error) {
      console.error('Error fetching more videos:', error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [user?.email, selectedCategory]);

  const handleLike = useCallback(async (video, options = {}) => {
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para gestionar likes.');
      return;
    }

    if (!video?.id || likingVideoId === video.id) return;

    const wasLiked = Boolean(video.hasLiked);
    const forceLike = Boolean(options.forceLike);

    if (forceLike && wasLiked) return;

    setLikingVideoId(video.id);

    const nextLiked = forceLike ? true : !wasLiked;

    // Actualizacion optimista para una respuesta instantanea en UI.
    setVideos((prev) => prev.map((item) => (
      item.id === video.id
        ? {
            ...item,
            likes: nextLiked
              ? Number(item.likes || 0) + (wasLiked ? 0 : 1)
              : Math.max(0, Number(item.likes || 0) - 1),
            hasLiked: nextLiked,
          }
        : item
    )));

    try {
      const response = !forceLike && wasLiked
        ? await unlikeVideo(video.id, user.email)
        : await likeVideo(video.id, user.email);

      setVideos((prev) => prev.map((item) => (
        item.id === video.id
          ? {
              ...item,
              likes: Number(response.likes ?? item.likes ?? 0),
              hasLiked: Boolean(response.liked),
            }
          : item
      )));
    } catch (error) {
      // Revertir optimista en caso de fallo real.
      setVideos((prev) => prev.map((item) => (
        item.id === video.id
          ? {
              ...item,
              likes: wasLiked
                ? Number(item.likes || 0) + 1
                : Math.max(0, Number(item.likes || 0) - 1),
              hasLiked: wasLiked,
            }
          : item
      )));
      Alert.alert('Error', error.message || 'No se pudo actualizar el like.');
    } finally {
      setLikingVideoId(null);
    }
  }, [isLoggedIn, user?.email, likingVideoId]);

  const handleDeleteVideo = useCallback((video) => {
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para borrar videos.');
      return;
    }

    if (!video?.id || deletingVideoId === video.id) return;

    const ownerMatches = matchesUserIdentifier(video.id_usuario, user)
      || matchesUserIdentifier(video.uploaderCard?.username, user)
      || matchesUserIdentifier(video.uploaderCard?.email, user)
      || matchesUserIdentifier(video.uploaderCard?.id, user);

    if (!ownerMatches) {
      Alert.alert('No permitido', 'Solo puedes borrar tus propios videos.');
      return;
    }

    setPendingDeleteVideo(video);
  }, [deletingVideoId, isLoggedIn, selectedVideoId, user?.email]);

  const confirmDeleteVideo = useCallback(async () => {
    if (!pendingDeleteVideo?.id || !user?.email) {
      setPendingDeleteVideo(null);
      return;
    }

    setDeletingVideoId(pendingDeleteVideo.id);
    try {
      await deleteVideo(pendingDeleteVideo.id, user.email);
      setVideos((prev) => prev.filter((item) => item.id !== pendingDeleteVideo.id));
      setCommentsByVideo((prev) => {
        const next = { ...prev };
        delete next[pendingDeleteVideo.id];
        return next;
      });
      setCarouselIndexByVideo((prev) => {
        const next = { ...prev };
        delete next[pendingDeleteVideo.id];
        return next;
      });

      if (String(selectedVideoId) === String(pendingDeleteVideo.id)) {
        setShowComments(false);
        setSelectedVideoId(null);
      }

      setPendingDeleteVideo(null);
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo borrar el video.');
    } finally {
      setDeletingVideoId(null);
    }
  }, [pendingDeleteVideo, selectedVideoId, user?.email]);

  const mapComment = useCallback((comment) => ({
    id: comment.id || comment._id,
    author: comment.username || comment.authorUsername,
    authorUsername: comment.authorUsername || comment.username,
    userId: comment.userId || comment.id_usuario,
    authorProfileImageUrl: comment.authorProfileImageUrl,
    authorTeamName: comment.authorTeamName,
    authorTeamImageUrl: comment.authorTeamImageUrl,
    authorFrameImageId: comment.authorFrameImageId,
    type: comment.type,
    content: comment.type === 'audio' ? null : comment.text,
    audioUrl: comment.audioUrl,
  }), []);

  const openComments = useCallback(async (videoId) => {
    setSelectedVideoId(videoId);
    setShowComments(true);
    try {
      const data = await getVideoComments(videoId);
      setCommentsByVideo((prev) => ({
        ...prev,
        [videoId]: data.map(mapComment),
      }));
      setVideos((prev) => prev.map((item) => (
        item.id === videoId
          ? { ...item, commentsCount: data.length }
          : item
      )));
    } catch (error) {
      console.error('Error cargando comentarios:', error);
    }
  }, [mapComment]);

  const closeComments = useCallback(() => {
    Animated.timing(commentsAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (audioRef.current) {
        audioRef.current.pauseAsync().catch(() => {});
      }
      setIsAudioPlaying(false);
      setShowComments(false);
      setSelectedVideoId(null);
      setCommentText('');
      setIsRecording(false);
      setPendingDeleteComment(null);
    });
  }, [commentsAnim]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.unloadAsync().catch(() => {});
        audioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const formatTime = (ms) => {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleToggleAudio = useCallback(async (comment) => {
    const audioUrl = comment?.audioUrl || comment?.audio_url;
    if (!audioUrl || audioUrl === 'pending') {
      Alert.alert('Audio no disponible', 'Este comentario aun no tiene audio.');
      return;
    }

    try {
      if (activeAudioId === comment.id && audioRef.current) {
        const status = await audioRef.current.getStatusAsync();
        if (status.isPlaying) {
          await audioRef.current.pauseAsync();
          setIsAudioPlaying(false);
        } else {
          await audioRef.current.playAsync();
          setIsAudioPlaying(true);
        }
        return;
      }

      if (audioRef.current) {
        await audioRef.current.unloadAsync();
        audioRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setAudioPositionMs(status.positionMillis || 0);
          setAudioDurationMs(status.durationMillis || 0);
          setIsAudioPlaying(Boolean(status.isPlaying));
          if (status.didJustFinish) {
            setIsAudioPlaying(false);
            setAudioPositionMs(0);
          }
        }
      );

      audioRef.current = sound;
      setActiveAudioId(comment.id);
      setIsAudioPlaying(true);
    } catch (error) {
      Alert.alert('Error', 'No se pudo reproducir el audio.');
    }
  }, [activeAudioId]);

  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    hasMoreRef.current = true;
    setHasMore(true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    setVideos([]);
    setLoading(true);
    if (!listRef.current) return;
    listRef.current.scrollToOffset({ offset: 0, animated: false });
  }, [selectedCategory]);

  const handleDeleteComment = useCallback((comment) => {
    if (!comment) return;
    setPendingDeleteComment(comment);
  }, []);

  const confirmDeleteComment = useCallback(async () => {
    if (!selectedVideoId || !pendingDeleteComment || !user?.email) {
      setPendingDeleteComment(null);
      return;
    }

    const commentId = pendingDeleteComment.id || pendingDeleteComment._id;
    if (!commentId) {
      setPendingDeleteComment(null);
      return;
    }

    try {
      await deleteVideoComment(commentId, user.email);
      setCommentsByVideo((prev) => ({
        ...prev,
        [selectedVideoId]: (prev[selectedVideoId] || []).filter((c) => (c.id || c._id) !== commentId),
      }));
      setVideos((prev) => prev.map((item) => (
        item.id === selectedVideoId
          ? { ...item, commentsCount: Math.max(0, (item.commentsCount || 0) - 1) }
          : item
      )));
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo eliminar el comentario.');
    } finally {
      setPendingDeleteComment(null);
    }
  }, [pendingDeleteComment, selectedVideoId, user?.email]);

  const handleStopRecording = useCallback(async () => {
    if (!selectedVideoId) return;

    if (Platform.OS === 'web') {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') return;
      setIsUploadingAudio(true);
      setLoadingNewComment(true);

      const stopPromise = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);

      await stopPromise;

      try {
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'comment-audio.webm', { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);
        const uploadResult = await uploadCommentAudio(formData);
        const payload = {
          id_usuario: user?.email || 'usuario',
          type: 'audio',
          text: null,
          audioUrl: uploadResult.url,
        };
        await postVideoComment(selectedVideoId, payload);
        
        // Recargar comentarios del servidor
        const updatedComments = await getVideoComments(selectedVideoId);
        const mapped = updatedComments.map(mapComment);
        setCommentsByVideo((prev) => ({
          ...prev,
          [selectedVideoId]: mapped,
        }));
        setVideos((prev) => prev.map((item) => (
          item.id === selectedVideoId
            ? { ...item, commentsCount: mapped.length || 0 }
            : item
        )));
      } catch (error) {
        Alert.alert('Error', error.message || 'No se pudo subir el audio.');
      } finally {
        setIsUploadingAudio(false);
        setLoadingNewComment(false);
      }

      return;
    }

    try {
      const recording = recordingRef.current;
      if (!recording) return;
      setIsRecording(false);
      setIsUploadingAudio(true);
      setLoadingNewComment(true);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsUploadingAudio(false);
        setLoadingNewComment(false);
        Alert.alert('Error', 'No se pudo obtener el audio.');
        return;
      }

      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'comment-audio.m4a',
      });

      const uploadResult = await uploadCommentAudio(formData);
      const payload = {
        id_usuario: user?.email || 'usuario',
        type: 'audio',
        text: null,
        audioUrl: uploadResult.url,
      };

      await postVideoComment(selectedVideoId, payload);
      
      // Recargar comentarios del servidor
      const updatedComments = await getVideoComments(selectedVideoId);
      const mapped = updatedComments.map(mapComment);

      setCommentsByVideo((prev) => ({
        ...prev,
        [selectedVideoId]: mapped,
      }));
      setVideos((prev) => prev.map((item) => (
        item.id === selectedVideoId
          ? { ...item, commentsCount: mapped.length || 0 }
          : item
      )));
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo subir el audio.');
    } finally {
      setIsUploadingAudio(false);
      setLoadingNewComment(false);
    }
  }, [selectedVideoId, user?.email, user?.username, mapComment]);

  useEffect(() => {
    if (!showComments) return;
    commentsAnim.setValue(0);
    Animated.timing(commentsAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showComments, commentsAnim]);

  const handleSendComment = useCallback(async () => {
    if (!selectedVideoId) return;
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para comentar.');
      return;
    }
    if (isUploadingAudio) {
      Alert.alert('Espera', 'Se esta subiendo el audio.');
      return;
    }

    if (isRecording) {
      await handleStopRecording();
      return;
    }

    if (!commentText.trim()) {
      Alert.alert('Vacio', 'Escribe un comentario o graba un audio.');
      return;
    }

    setLoadingNewComment(true);
    try {
      const payload = {
        id_usuario: user?.email || 'usuario',
        type: 'text',
        text: commentText.trim(),
        audioUrl: null,
      };

      await postVideoComment(selectedVideoId, payload);

      // Recargar comentarios del servidor para obtener datos enriquecidos
      const updatedComments = await getVideoComments(selectedVideoId);
      const mapped = updatedComments.map(mapComment);
      setCommentsByVideo((prev) => ({
        ...prev,
        [selectedVideoId]: mapped,
      }));
      
      setVideos((prev) => prev.map((item) => (
        item.id === selectedVideoId
          ? { ...item, commentsCount: mapped.length || 0 }
          : item
      )));
      setCommentText('');
      setIsRecording(false);
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo enviar el comentario.');
    } finally {
      setLoadingNewComment(false);
    }
  }, [commentText, isRecording, isUploadingAudio, selectedVideoId, user?.email, user?.username, mapComment, handleStopRecording]);

  const handleToggleRecording = useCallback(async () => {
    if (!selectedVideoId) return;
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para comentar.');
      return;
    }

    if (isUploadingAudio || isRecording) return;

    if (Platform.OS === 'web') {
      if (!navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
        Alert.alert('No disponible', 'Tu navegador no soporta grabacion de audio.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        mediaChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            mediaChunksRef.current.push(event.data);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setCommentText('');
        setIsRecording(true);
      } catch (error) {
        Alert.alert('Permisos requeridos', 'Necesitas permisos de microfono.');
      }
      return;
    }

    if (!isRecording) {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permisos requeridos', 'Necesitas permisos de microfono.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setCommentText('');
      setIsRecording(true);
      return;
    }
  }, [selectedVideoId, isRecording, isUploadingAudio, user?.email, user?.username, mapComment]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useFocusEffect(
    useCallback(() => {
      refreshFeed();
    }, [refreshFeed])
  );

  const onRefresh = useCallback(() => {
    loadCategories();
    refreshFeed();
  }, [loadCategories, refreshFeed]);

  const feedPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (!containerHeight || visibleVideos.length <= 1) return false;
      const verticalDistance = Math.abs(gestureState.dy);
      const horizontalDistance = Math.abs(gestureState.dx);
      return verticalDistance > 8 && verticalDistance > horizontalDistance;
    },
    onPanResponderGrant: () => {
      dragStartOffsetRef.current = activeIndexRef.current * containerHeight;
      dragStartIndexRef.current = activeIndexRef.current;
    },
    onPanResponderMove: (_, gestureState) => {
      if (!containerHeight || !listRef.current) return;

      const maxOffset = Math.max(0, (visibleVideos.length - 1) * containerHeight);
      const minOffset = Math.max(0, dragStartOffsetRef.current - containerHeight);
      const maxAllowedOffset = Math.min(maxOffset, dragStartOffsetRef.current + containerHeight);
      const nextOffset = Math.max(
        minOffset,
        Math.min(dragStartOffsetRef.current - gestureState.dy, maxAllowedOffset)
      );

      listRef.current.scrollToOffset({
        offset: nextOffset,
        animated: false,
      });
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!containerHeight || visibleVideos.length === 0 || !listRef.current) return;

      const threshold = Math.max(24, containerHeight * 0.12);
      const direction = gestureState.dy < -threshold ? 1 : gestureState.dy > threshold ? -1 : 0;
      const currentIndex = dragStartIndexRef.current;
      const targetIndex = Math.max(0, Math.min(currentIndex + direction, visibleVideos.length - 1));

      listRef.current.scrollToOffset({
        offset: targetIndex * containerHeight,
        animated: true,
      });

      activeIndexRef.current = targetIndex;
      setActiveIndex(targetIndex);
    },
    onPanResponderTerminate: (_, gestureState) => {
      if (!containerHeight || visibleVideos.length === 0 || !listRef.current) return;

      const threshold = Math.max(24, containerHeight * 0.12);
      const direction = gestureState.dy < -threshold ? 1 : gestureState.dy > threshold ? -1 : 0;
      const currentIndex = dragStartIndexRef.current;
      const targetIndex = Math.max(0, Math.min(currentIndex + direction, visibleVideos.length - 1));

      listRef.current.scrollToOffset({
        offset: targetIndex * containerHeight,
        animated: true,
      });

      activeIndexRef.current = targetIndex;
      setActiveIndex(targetIndex);
    },
    onShouldBlockNativeResponder: () => true,
  }), [containerHeight, visibleVideos.length]);

  const activeComments = selectedVideoId ? (commentsByVideo[selectedVideoId] || []) : [];
  const activeVideo = visibleVideos[activeIndex];
  const currentUserId = normalizeUserId(user?.email || user?.id || user?.username || (user?.email ? String(user.email).split('@')[0] : ''));
  const activeMediaUrls = Array.isArray(activeVideo?.mediaUrls) && activeVideo?.mediaUrls?.length
    ? activeVideo.mediaUrls
    : activeVideo?.url
      ? [activeVideo.url]
      : [];
  const activeMediaType = activeVideo?.mediaType || (isLikelyVideoUrl(activeVideo?.url) ? 'video' : 'image');
  const showCarouselDots = activeMediaType === 'carousel' || activeMediaUrls.length > 1;
  const activeCarouselIndex = carouselIndexByVideo[activeVideo?.id] || 0;
  const shareVideo = useMemo(
    () => videos.find((item) => String(item.id) === String(shareVideoId)),
    [videos, shareVideoId]
  );
  const shareMediaUrls = Array.isArray(shareVideo?.mediaUrls) && shareVideo.mediaUrls.length
    ? shareVideo.mediaUrls
    : shareVideo?.url
      ? [shareVideo.url]
      : [];
  const normalizedShareMediaType = String(shareVideo?.mediaType || '').trim().toLowerCase();
  const isShareCarousel = normalizedShareMediaType === 'carousel' || normalizedShareMediaType === 'carrusel' || shareMediaUrls.length > 1;
  const isShareImage = normalizedShareMediaType === 'image' || (shareMediaUrls.length > 0 && !isLikelyVideoUrl(shareMediaUrls[0]));
  const shareCarouselIndex = isShareCarousel
    ? Math.max(0, Math.min(Number(carouselIndexByVideo[shareVideo?.id] || 0), Math.max(shareMediaUrls.length - 1, 0)))
    : 0;
  const shareModalTitle = isShareCarousel
    ? 'COMPARTIR CARRUSEL'
    : isShareImage
      ? 'COMPARTIR FOTO'
      : 'COMPARTIR VIDEO';

  const handleCarouselIndexChange = useCallback((videoId, index) => {
    setCarouselIndexByVideo((prev) => ({
      ...prev,
      [videoId]: index,
    }));
  }, []);

    const buildShareUrl = useCallback((videoId, carouselIndex = null) => {
      const encodedVideoId = encodeURIComponent(String(videoId || ''));

      // La interfaz pública de share vive en el frontend de Vercel.
      // Usar path param para que sea reconocida por deep linking
      const baseUrl = `${FRONTEND_URL}/share/${encodedVideoId}`;
      if (Number.isInteger(carouselIndex) && carouselIndex >= 0) {
        return `${baseUrl}?carouselIndex=${carouselIndex}`;
      }
      return baseUrl;
    }, []);





    const writeToClipboard = useCallback(async (value) => {
      if (Platform.OS !== 'web') {
        try {
          const clipboardModule = require('react-native/Libraries/Components/Clipboard/Clipboard');
          const clipboard = clipboardModule?.default || clipboardModule;

          if (clipboard?.setString) {
            clipboard.setString(value);
            return true;
          }
        } catch (error) {
          // Fall through to other strategies.
        }
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        return copied;
      }

      return false;
    }, []);

    const handleSharePress = useCallback((videoId) => {
      if (!videoId) return;
      setShareVideoId(videoId);
      setShowShareModal(true);
    }, []);



    const closeShareModal = useCallback(() => {
      setShowShareModal(false);
      setShareVideoId(null);
    }, []);

    const handleCopyShareLink = useCallback(async () => {
      if (!shareVideoId) return;

      const shareUrl = buildShareUrl(shareVideoId, isShareCarousel ? shareCarouselIndex : null);

      try {
        const copied = await writeToClipboard(shareUrl);
        if (!copied) {
          Alert.alert('No se pudo copiar', 'No fue posible copiar el enlace en este dispositivo.');
          return;
        }

        closeShareModal();
        Alert.alert('Listo', 'Enlace copiado al portapapeles.');
      } catch (error) {
        Alert.alert('Error', 'No se pudo copiar el enlace.');
      }
    }, [buildShareUrl, closeShareModal, isShareCarousel, shareCarouselIndex, shareVideoId, writeToClipboard]);

    const handleDownloadVideo = useCallback(async () => {
      if (!shareVideoId) {
        Alert.alert('Error', 'No se ha seleccionado ningun video.');
        return;
      }

      closeShareModal();

      const videoToDownload = videos.find((item) => String(item.id) === String(shareVideoId));
      const mediaUrls = Array.isArray(videoToDownload?.mediaUrls) && videoToDownload.mediaUrls.length
        ? videoToDownload.mediaUrls
        : videoToDownload?.url
          ? [videoToDownload.url]
          : [];
      const normalizedMediaType = String(videoToDownload?.mediaType || '').toLowerCase();
      const isCarouselMedia = normalizedMediaType === 'carousel' || normalizedMediaType === 'carrusel' || mediaUrls.length > 1;
      const selectedMediaIndex = isCarouselMedia
        ? Math.max(0, Math.min(shareCarouselIndex, Math.max(mediaUrls.length - 1, 0)))
        : 0;
      const primaryMediaUrl = mediaUrls[selectedMediaIndex] || videoToDownload?.url;
      const isImageMedia = normalizedMediaType === 'image'
        || (normalizedMediaType === 'carousel' && !isLikelyVideoUrl(primaryMediaUrl))
        || (!normalizedMediaType && !isLikelyVideoUrl(primaryMediaUrl));
      const outputExtension = isImageMedia ? 'jpg' : 'mp4';
      const targetWidth = Math.max(1, Math.round(screenWidth || 1080));
      const targetHeight = Math.max(1, Math.round(containerHeight || Math.round(targetWidth * 16 / 9)));
      const downloadUrl = `${BACKEND_URL}/api/videos/${encodeURIComponent(String(shareVideoId))}/download-watermarked?targetWidth=${targetWidth}&targetHeight=${targetHeight}&mediaIndex=${selectedMediaIndex}`;
      const downloadFileName = `video_${shareVideoId}_watermarked.${outputExtension}`;
      const webDownloadUrl = `${BACKEND_URL}/api/videos/${encodeURIComponent(String(shareVideoId))}/download?mediaIndex=${selectedMediaIndex}`;
      const webDownloadFileName = `media_${shareVideoId}.${outputExtension}`;
      const isHostedBackend = !/localhost|127\.0\.0\.1/.test(String(BACKEND_URL || ''));
      const shouldUseDirectDownload = Platform.OS === 'web' || isHostedBackend;
      const resolvedDownloadUrl = shouldUseDirectDownload ? webDownloadUrl : downloadUrl;
      const resolvedFileName = shouldUseDirectDownload ? webDownloadFileName : downloadFileName;

      try {
        if (Platform.OS === 'web') {
          const a = document.createElement('a');
          a.href = resolvedDownloadUrl;
          a.download = resolvedFileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          Alert.alert('Listo', 'Descarga iniciada.');
          return;
        }

        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permisos', 'Se necesitan permisos para guardar en el dispositivo.');
          return;
        }

        const localUri = FileSystem.documentDirectory + `sotanita_media_${shareVideoId}.${outputExtension}`;
        const downloadResumable = FileSystem.createDownloadResumable(resolvedDownloadUrl, localUri);

        const { uri } = await downloadResumable.downloadAsync();
        const asset = await MediaLibrary.createAssetAsync(uri);
        await MediaLibrary.createAlbumAsync('Sotanita', asset, false).catch(() => {});
        Alert.alert('Listo', shouldUseDirectDownload ? 'Video guardado en la galeria.' : 'Video guardado en la galeria con marca de agua.');
      } catch (error) {
        console.error('Download error', error);
        Alert.alert('Error', 'No se pudo descargar el video.');
      }
    }, [shareVideoId, shareCarouselIndex, videos, containerHeight, screenWidth]);

    const handleShareToFanZone = useCallback(() => {
      if (!shareVideoId) {
        Alert.alert('Error', 'No se ha seleccionado ningun video.');
        return;
      }

      // Cerrar el modal inmediatamente (como hace "Copiar enlace")
      try {
        closeShareModal();
      } catch (e) {
        // ignore
      }

      // Ejecutar el post al foro en background y notificar cuando termine
      (async () => {
        try {
          const teamId = user?.teamId || user?.team || null;
          const videoObj = videos.find((v) => String(v.id) === String(shareVideoId));
          const mediaUrls = Array.isArray(videoObj?.mediaUrls) && videoObj.mediaUrls.length
            ? videoObj.mediaUrls
            : videoObj?.url
              ? [videoObj.url]
              : [];
          const normalizedVideoType = String(videoObj?.mediaType || '').trim().toLowerCase();
          const isCarouselMedia = normalizedVideoType === 'carousel' || normalizedVideoType === 'carrusel' || mediaUrls.length > 1;
          const selectedMediaIndex = isCarouselMedia
            ? Math.max(0, Math.min(shareCarouselIndex, Math.max(mediaUrls.length - 1, 0)))
            : 0;
          const thumbnail = mediaUrls[selectedMediaIndex] || videoObj?.url || null;
          const title = videoObj?.title || videoObj?.name || videoObj?.caption || '';

          if (!teamId) {
            Alert.alert('Compartido', 'Video enviado a Fan Zone.');
            return;
          }

          const payload = {
            user: user?.email || user?.id || user?.username || '',
            type: 'share',
            text: title || '',
            share: {
              videoId: String(shareVideoId),
              thumbnailUrl: thumbnail || null,
              title: title || '',
              mediaType: videoObj?.mediaType || (Array.isArray(videoObj?.mediaUrls) && videoObj.mediaUrls.length > 1 ? 'carousel' : 'video'),
              carouselIndex: isCarouselMedia ? selectedMediaIndex : null,
            },
          };
          await postForumMessage(teamId, payload);
          Alert.alert('Compartido', 'Video enviado a Fan Zone.');
        } catch (err) {
          console.error('Error compartiendo en Fan Zone', err?.message || err);
          Alert.alert('Error', err?.message || 'No se pudo compartir en Fan Zone.');
        }
      })();
    }, [shareCarouselIndex, shareVideoId, closeShareModal, user?.teamId, user?.email, user?.id, user?.username, videos]);
  useEffect(() => {
    const targetVideoId = route?.params?.videoId;
    const targetCarouselIndex = parseCarouselIndex(route?.params?.carouselIndex ?? route?.params?.mediaIndex);
    if (!targetVideoId) {
      return;
    }

    setPendingFeedVideoId(String(targetVideoId));
    setPendingFeedCarouselIndex(targetCarouselIndex);
    setSelectedCategory('');
    setLoading(true);
  }, [route?.params?.carouselIndex, route?.params?.mediaIndex, route?.params?.videoId]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (route?.params?.videoId) {
          navigation.setParams({ videoId: undefined, carouselIndex: undefined, mediaIndex: undefined });
        }

        setPendingFeedVideoId(null);
        setPendingFeedCarouselIndex(null);
      };
    }, [navigation, route?.params?.videoId])
  );

  return (
    <View style={styles.root}>
      
      <View style={styles.categoryBar}>
        <View
          style={[
            styles.categorySelectWrap,
            {
              backgroundColor: `${colors.surface}99`,
              borderColor: colors.border,
            },
          ]}
        >
          <Pressable style={styles.categorySelectButton} onPress={() => setShowCategoryPicker(true)}>
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
              {categoryLabel}
            </Text>
            <Ionicons name="chevron-down" size={20} color={categoryTextColor} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable
          style={[styles.categoryOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View style={[styles.categoryMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Pressable
              onPress={() => {
                setSelectedCategory('');
                setShowCategoryPicker(false);
              }}
              style={[
                styles.categoryMenuItem,
                selectedCategory === '' && { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Text
                style={{
                  color: categoryTextColor,
                  fontFamily: typography.families.nougat,
                  fontSize: categoryItemFontSize,
                  textAlign: 'center',
                }}
              >
                Últimos videos
              </Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={category}
                onPress={() => {
                  setSelectedCategory(category);
                  setShowCategoryPicker(false);
                }}
                style={[
                  styles.categoryMenuItem,
                  category === selectedCategory && { backgroundColor: `${colors.primary}22` },
                ]}
              >
                <Text
                  style={{
                    color: categoryTextColor,
                    fontFamily: typography.families.nougat,
                    fontSize: categoryItemFontSize,
                    textAlign: 'center',
                  }}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {showCarouselDots ? (
        <View style={styles.carouselDotsBar}>
          <View style={styles.carouselDotsRow}>
            {activeMediaUrls.map((_, index) => (
              <View
                key={`carousel-dot-${index}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === activeCarouselIndex ? colors.primary : colors.border,
                    width: index === activeCarouselIndex ? 16 : 6,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.listWrap} onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)} {...feedPanResponder.panHandlers}>
      {loading && videos.length === 0 ? (
        <View style={styles.loaderContainer} />
      ) : containerHeight > 0 ? (
        <FlatList
          ref={listRef}
          scrollEnabled={false}
          data={visibleVideos}
          extraData={{ activeIndex, isFocused, containerHeight }}
          renderItem={({ item, index }) => (
            <FeedVideoItem 
               video={item} 
               isActive={index === activeIndex && isFocused} 
               height={containerHeight}
               onLikePress={handleLike}
               onDeletePress={handleDeleteVideo}
               onCommentPress={openComments}
               onSharePress={handleSharePress}
               commentsCount={item.commentsCount ?? (commentsByVideo[item.id] || []).length}
               deleting={deletingVideoId === item.id}
               isAudioPlaying={isAudioPlaying}
              isRecording={isRecording}
               liking={likingVideoId === item.id}
               isOwnVideo={matchesUserIdentifier(item.id_usuario, user) || matchesUserIdentifier(item.uploaderCard?.username, user)}
              carouselIndex={carouselIndexByVideo[item.id] || 0}
              onCarouselIndexChange={(nextIndex) => handleCarouselIndexChange(item.id, nextIndex)}
            />
          )}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: containerHeight,
            offset: containerHeight * index,
            index,
          })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          onEndReached={fetchMoreFeedVideos}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <Text style={[styles.emptyText, { color: colors.white }]}>No hay videos publicados</Text>
            </View>
          }
        />
      ) : null}
      </View>

      <Modal visible={showComments} transparent animationType="none" onRequestClose={closeComments}>
        <View style={[styles.commentsOverlay, { backgroundColor: colors.overlay }]}> 
          <Animated.View
            style={[
              styles.commentsPanel,
              {
                backgroundColor: colors.surface,
                transform: [{ translateX: commentsAnim.interpolate({ inputRange: [0, 1], outputRange: [screenWidth, 0] }) }],
              },
            ]}
          >
            <View style={[styles.commentsHeader, { borderBottomColor: colors.border }]}> 
              <Text style={{ color: colors.text, fontWeight: '700', fontFamily: typography.families.nougat, fontSize: typography.sizes.xl * textScale, textAlign: 'left', flex: 1 }}>
                COMENTARIOS
              </Text>
              <Pressable onPress={closeComments}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
              {activeComments.length === 0 ? (
                <Text style={{ color: colors.textMuted }}>No hay comentarios todavia.</Text>
              ) : (
                activeComments.map((comment) => (
                  <View key={comment.id} style={[styles.commentRow, { backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 10 }]}>
                    <FifaCard
                      username={comment.authorUsername || comment.author}
                      team={comment.authorTeamName || 'Sin equipo'}
                      position="---"
                      backgroundUrl={comment.authorTeamImageUrl}
                      frameUrl={comment.authorFrameImageId}
                      photoUrl={comment.authorProfileImageUrl}
                      size="small"
                      disableShadow
                      style={{ marginRight: 4 }}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={[styles.commentHeaderRow, { marginBottom: 4 }]}>
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                          @{comment.author || comment.authorUsername}
                          {(comment.type || comment?.type) === 'audio' ? '  -  Mensaje de Audio' : ''}
                        </Text>
                        {String(comment.userId || '').trim().toLowerCase() === String(user?.email || '').trim().toLowerCase() ? (
                          <Pressable
                            onPress={() => handleDeleteComment(comment)}
                            style={[styles.commentDelete, { backgroundColor: colors.danger }]}
                            hitSlop={8}
                          >
                            <Ionicons name="trash" size={14} color={colors.white} />
                          </Pressable>
                        ) : null}
                      </View>
                      {(comment.type || comment?.type) === 'audio' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                          <Pressable
                            onPress={() => handleToggleAudio(comment)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                            }}
                          >
                            <View
                              style={{
                                width: 64 * (textScale || 1),
                                height: 64 * (textScale || 1),
                                borderRadius: 64 * (textScale || 1) / 2,
                                backgroundColor: colors.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                                elevation: 2,
                              }}
                            >
                              <Ionicons
                                name={activeAudioId === comment.id && isAudioPlaying ? 'pause' : 'play'}
                                size={32 * (textScale || 1)}
                                color={colors.white}
                              />
                            </View>

                            <Text style={{ color: colors.white, marginLeft: 16, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }}>
                              {activeAudioId === comment.id ? formatTime(audioPositionMs) : '0:00'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Text style={{ color: colors.text, fontSize: 13 }}>{comment.content || comment.text}</Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {pendingDeleteComment ? (
              <View style={styles.deleteConfirmOverlay}>
                <View style={[styles.deleteConfirmCard, { backgroundColor: colors.surface }]}> 
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
                    Desea borrar el comentario
                  </Text>
                  <View style={styles.deleteConfirmActions}>
                    <Pressable
                      style={[styles.deleteConfirmButton, { backgroundColor: colors.surfaceElevated }]}
                      onPress={() => setPendingDeleteComment(null)}
                    >
                      <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.deleteConfirmButton, { backgroundColor: colors.danger }]}
                      onPress={confirmDeleteComment}
                    >
                      <Text style={{ color: colors.white, fontWeight: '700' }}>Borrar</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}> 
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={isLoggedIn ? 'Escribe un comentario...' : 'Inicia sesion para comentar'}
                placeholderTextColor={colors.textMuted}
                style={[styles.commentInput, { backgroundColor: colors.surfaceElevated, color: colors.text }]}
                editable={isLoggedIn && !isRecording && !isUploadingAudio}
                showSoftInputOnFocus={isLoggedIn}
                focusable={isLoggedIn}
              />
              <Pressable
                disabled={!isLoggedIn}
                style={[styles.actionCircle, { backgroundColor: isRecording ? colors.primary : colors.surfaceElevated, opacity: isLoggedIn ? 1 : 0.5 }]}
                onPress={handleToggleRecording}
              >
                <Ionicons name="mic" size={18} color={isRecording ? colors.black : colors.text} />
              </Pressable>
              <Pressable
                disabled={!isLoggedIn}
                style={[styles.actionCircle, { backgroundColor: colors.primary, opacity: isLoggedIn ? 1 : 0.5 }]}
                onPress={handleSendComment}
              >
                <Ionicons name="send" size={18} color={colors.black} />
              </Pressable>
            </View>
            {isRecording || isUploadingAudio ? (
              <View style={styles.recordingBar}>
                <View style={styles.recordingDot} />
                <Text style={{ color: colors.text }}>{isUploadingAudio ? 'Subiendo audio...' : 'Grabando audio...'}</Text>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(pendingDeleteVideo)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDeleteVideo(null)}
      >
        <View style={styles.deleteConfirmOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDeleteVideo(null)} />
          <View style={[styles.deleteConfirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="trash-outline" size={34} color={colors.danger} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 10, textAlign: 'center' }}>
              ¿Quieres borrar este video?
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
              Se eliminará de forma permanente.
            </Text>
            <View style={styles.deleteConfirmActions}>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setPendingDeleteVideo(null)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.danger }]}
                onPress={confirmDeleteVideo}
              >
                <Text style={{ color: colors.white, fontWeight: '700' }}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={closeShareModal}>
        <Pressable style={styles.shareOverlay} onPress={closeShareModal}>
          <Pressable style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: typography.sizes.xl * textScale * 1.5, textAlign: 'center', marginBottom: 8, fontFamily: typography.families.nougat }}>
              {shareModalTitle}
            </Text>

            <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale, textAlign: 'center', marginBottom: 12 }}>
              Comparte este contenido en un toque
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <Pressable onPress={handleCopyShareLink} style={[styles.shareRectButton, { backgroundColor: colors.primary }]}>
                  <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <View style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="copy" size={62} color="#000" style={{ position: 'absolute' }} />
                      <Ionicons name="copy" size={56} color={colors.white} />
                    </View>
                    <StrokeText
                      strokeColor="#000"
                      strokeWidth={3}
                      style={{
                        color: colors.white,
                        fontWeight: '700',
                        textAlign: 'center',
                      }}
                    >
                      Copiar enlace
                    </StrokeText>
                  </View>
                </Pressable>

              <Pressable onPress={handleShareToFanZone} style={[styles.shareRectButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Image source={fanZoneShieldUri ? { uri: fanZoneShieldUri } : require('../../../assets/perfil/teamChange_light.png')} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="contain" />
                  <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>Compartir en Fan Zone</Text>
                </View>
              </Pressable>
            </View>


            <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale, marginBottom: 8, textAlign: 'center' }}>O si lo prefieres...</Text>

            <Pressable onPress={handleDownloadVideo} style={[styles.downloadButton, { backgroundColor: colors.primary }]}> 
              <StrokeText
                strokeColor="#000"
                strokeWidth={2}
                style={{
                  color: colors.white,
                  fontWeight: '700',
                  textAlign: 'center',
                  fontFamily: typography.families.nougat,
                  textTransform: 'uppercase',
                  fontSize: typography.sizes.xl * textScale * 1.2,
                  lineHeight: typography.sizes.xl * textScale * 1.25,
                }}
              >
                DESCARGAR
              </StrokeText>
            </Pressable>

            
          </Pressable>
        </Pressable>
      </Modal>
      <LoadingOverlay visible={loadingNewComment || (loading && Boolean(pinnedFeedVideoId))} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  categoryBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  categoryRow: { gap: 8, paddingRight: 12 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  carouselDotsBar: { paddingTop: 2, paddingBottom: 8, alignItems: 'center' },
  carouselDotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categorySelectWrap: { borderWidth: 0, borderRadius: 18, minHeight: 52, justifyContent: 'center', backgroundColor: 'transparent' },
  categorySelectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8 },
  categoryOverlay: { flex: 1, justifyContent: 'center', padding: 18 },
  categoryMenu: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  categoryMenuItem: { paddingVertical: 14, paddingHorizontal: 16 },
  shareOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.72)' },
  shareCard: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 24, paddingHorizontal: 30, paddingVertical: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  shareRectButton: { flex: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  circleIconButton: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  downloadButton: { width: '100%', paddingVertical: 18, paddingHorizontal: 18, borderRadius: 28 },
  listWrap: { flex: 1 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 200 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  videoContainer: { width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', overflow: 'hidden' },
  videoPoster: {
    width: '100%',
    height: '100%',
  },
  videoPosterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.92)',
    gap: 8,
  },
  posterHint: {
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  mediaContainer: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  videoSurface: { width: '100%', height: '100%' },
  dotsRow: { position: 'absolute', bottom: 18, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
  tapFeedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapFeedbackBubble: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapFeedbackGif: {
    width: 150,
    height: 150,
  },
  infoWrapper: { position: 'absolute', left: 16, right: 80, zIndex: 10 },
  title: { marginBottom: 4, textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  description: { fontWeight: '500', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  descriptionText: { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  uploaderCardWrap: { marginBottom: 6 },
  categoryBadge: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryText: { textTransform: 'uppercase' },
  sideActions: { position: 'absolute', right: 16, alignItems: 'center', gap: 20, zIndex: 10 },
  actionWrap: { alignItems: 'center', gap: 4 },
  actionCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  commentsOverlay: { flex: 1, justifyContent: 'flex-end' },
  commentsPanel: { width: '92%', height: '100%', alignSelf: 'flex-end', borderTopLeftRadius: 24, borderBottomLeftRadius: 24 },
  commentsHeader: { padding: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commentHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentDelete: { marginLeft: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  commentAvatar: { width: 38, height: 38, borderRadius: 19 },
  commentInputRow: { borderTopWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: { flex: 1, minHeight: 46, borderRadius: 24, paddingHorizontal: 16 },
  audioBubble: { marginTop: 6, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  recordingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  deleteConfirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  deleteConfirmCard: { width: '80%', borderRadius: 16, padding: 16, alignItems: 'center' },
  deleteConfirmActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  deleteConfirmButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
});
