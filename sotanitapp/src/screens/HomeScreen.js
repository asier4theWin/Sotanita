import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useAppTheme } from '../hooks/useAppTheme';
import { getVideos } from '../api/backend';
import { formatLikes } from '../utils/format';

const FeedVideoItem = ({ video, isActive, height }) => {
  const { colors, typography, textScale, spacing } = useAppTheme();
  const videoRef = useRef(null);

  useEffect(() => {
    // Asegurar que el audio se escuche en iOS incluso con el boton de silencio
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncPlayback = async () => {
      if (!videoRef.current || cancelled) return;

      try {
        if (isActive) {
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
  }, [isActive]);

  return (
    <View style={[styles.videoContainer, { height }]}>
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFillObject}
        source={{ uri: video.url }}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay={isActive}
        isMuted={!isActive}
        volume={1.0}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.bottomGradient}
      />
      
      <View style={[styles.infoWrapper, { bottom: spacing.md }]}>
        <Text style={[styles.title, { fontSize: typography.sizes.lg * textScale, color: colors.white, fontWeight: 'bold' }]}>
          @{video.id_usuario ? video.id_usuario.split('@')[0] : 'usuario'}
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
        <Pressable style={styles.actionWrap}>
          <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}>
            <Ionicons name="heart-outline" size={28} color={colors.white} />
          </View>
          <Text style={styles.actionText}>{formatLikes(video.likes || 0)}</Text>
        </Pressable>

        <Pressable style={styles.actionWrap}>
          <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}>
            <Ionicons name="chatbubble-outline" size={26} color={colors.white} />
          </View>
          <Text style={styles.actionText}>0</Text>
        </Pressable>

        <Pressable style={styles.actionWrap}>
          <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}>
            <Ionicons name="share-social-outline" size={26} color={colors.white} />
          </View>
          <Text style={styles.actionText}>Compartir</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default function HomeScreen({ navigation }) {
  const { colors } = useAppTheme();
  const isFocused = useIsFocused();
  
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const activeIndexRef = useRef(0);

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);

    try {
      const limit = 5;
      const data = await getVideos(limit, 0);

      setVideos(data);
      setActiveIndex(0);
      activeIndexRef.current = 0;

      const nextOffset = data.length;
      offsetRef.current = nextOffset;
      setOffset(nextOffset);

      const nextHasMore = data.length === limit;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const fetchMoreFeedVideos = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const limit = 5;
      const currentOffset = offsetRef.current;
      const data = await getVideos(limit, currentOffset);

      setVideos((prev) => [...prev, ...data]);

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
  }, []);

  useEffect(() => {
    refreshFeed();
  }, [refreshFeed]);

  useFocusEffect(
    useCallback(() => {
      refreshFeed();
    }, [refreshFeed])
  );

  const onRefresh = useCallback(() => {
    refreshFeed();
  }, [refreshFeed]);

  const updateActiveIndexFromOffset = useCallback((offsetY) => {
    if (!containerHeight || videos.length === 0) return;
    const nextIndex = Math.round(offsetY / containerHeight);
    const clampedIndex = Math.max(0, Math.min(nextIndex, videos.length - 1));
    if (clampedIndex !== activeIndexRef.current) {
      activeIndexRef.current = clampedIndex;
      setActiveIndex(clampedIndex);
    }
  }, [containerHeight, videos.length]);

  const onMomentumScrollEnd = useCallback((event) => {
    updateActiveIndexFromOffset(event.nativeEvent.contentOffset.y);
  }, [updateActiveIndexFromOffset]);

  const onScroll = useCallback((event) => {
    updateActiveIndexFromOffset(event.nativeEvent.contentOffset.y);
  }, [updateActiveIndexFromOffset]);

  return (
    <View style={styles.root} onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}>
      {loading && videos.length === 0 ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : containerHeight > 0 ? (
        <FlatList
          data={videos}
          extraData={{ activeIndex, isFocused, containerHeight }}
          renderItem={({ item, index }) => (
            <FeedVideoItem 
               video={item} 
               isActive={index === activeIndex && isFocused} 
               height={containerHeight} 
            />
          )}
          keyExtractor={(item) => item.id.toString()}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onMomentumScrollEnd}
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 200 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  videoContainer: { width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
  infoWrapper: { position: 'absolute', left: 16, right: 80, zIndex: 10 },
  title: { marginBottom: 4, textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  description: { fontWeight: '500', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  descriptionText: { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  categoryBadge: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryText: { textTransform: 'uppercase' },
  sideActions: { position: 'absolute', right: 16, alignItems: 'center', gap: 20, zIndex: 10 },
  actionWrap: { alignItems: 'center', gap: 4 },
  actionCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' }
});
