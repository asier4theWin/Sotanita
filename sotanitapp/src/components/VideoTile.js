import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video, getStreamingVideoSourceFromVideo } from '../utils/media';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useAppTheme } from '../hooks/useAppTheme';
import { formatLikes } from '../utils/format';

export default function VideoTile({ item, onPress, variant = 'uploaded' }) {
  const { colors, typography, textScale } = useAppTheme();
  const videoRef = useRef(null);
  const mediaUrls = Array.isArray(item.mediaUrls) && item.mediaUrls.length
    ? item.mediaUrls
    : item.url
      ? [item.url]
      : [];
  const mediaType = item.mediaType || 'video';
  const isCarousel = mediaType === 'carousel' || mediaUrls.length > 1;
  const isImage = mediaType === 'image' || isCarousel;
  const isVideo = !isImage;
  const primaryMediaUrl = mediaUrls[0] || '';
  const streamingUrl = isVideo
    ? getStreamingVideoSourceFromVideo(item, 0, primaryMediaUrl)
    : primaryMediaUrl;
  const [videoThumbnail, setVideoThumbnail] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadThumbnail = async () => {
      if (!isVideo || !primaryMediaUrl) {
        if (isMounted) setVideoThumbnail(null);
        return;
      }

      try {
        const result = await VideoThumbnails.getThumbnailAsync(primaryMediaUrl, { time: 0 });
        if (isMounted) {
          setVideoThumbnail(result?.uri || null);
        }
      } catch (error) {
        if (isMounted) {
          setVideoThumbnail(null);
        }
      }
    };

    loadThumbnail();

    return () => {
      isMounted = false;
    };
  }, [isVideo, mediaUrls]);

  return (
    <Pressable onPress={onPress} style={[styles.tile, { backgroundColor: colors.surface }]}> 
      <View style={styles.preview}>
        {isImage ? (
          <Image source={{ uri: primaryMediaUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : isVideo ? (
          videoThumbnail ? (
            <Image source={{ uri: videoThumbnail }} style={StyleSheet.absoluteFillObject} resizeMode="stretch" />
          ) : Platform.OS === 'web' ? (
            <video
              src={streamingUrl}
              muted
              playsInline
              preload="metadata"
              style={styles.webVideo}
              onLoadedMetadata={(event) => {
                try {
                  event.currentTarget.currentTime = 0;
                  event.currentTarget.pause();
                } catch (error) {
                  // Ignore thumbnail load errors to avoid blocking UI.
                }
              }}
            />
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: streamingUrl }}
              style={[StyleSheet.absoluteFillObject, styles.media]}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              isMuted
              onLoad={async () => {
                try {
                  if (videoRef.current) {
                    await videoRef.current.pauseAsync();
                    await videoRef.current.setPositionAsync(0);
                  }
                } catch (error) {
                  // Ignore thumbnail load errors to avoid blocking UI.
                }
              }}
            />
          )
        ) : null}
        <View style={styles.iconOverlay}>
          <Ionicons name={isImage ? (isCarousel ? 'images' : 'image') : 'play'} size={24} color={`${colors.textMuted}CC`} />
        </View>
      </View>

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
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  iconOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
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
