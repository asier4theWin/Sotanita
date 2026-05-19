import React, { useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';

let ExpoAV = null;

try {
  ExpoAV = require('expo-av');
} catch (error) {
  ExpoAV = null;
}

const ResizeMode = ExpoAV?.ResizeMode || {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'stretch',
  NONE: 'none',
};

const CLOUDINARY_VIDEO_MARKER = '/video/upload/';
const STREAMING_TRANSFORM = 'f_mp4,fl_progressive,so_0,q_auto';
const RAW_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, '');

function isLikelyVideoUrl(url) {
  const value = String(url || '').toLowerCase();
  return value.includes('/video/')
    || value.endsWith('.mp4')
    || value.endsWith('.mov')
    || value.endsWith('.m4v')
    || value.endsWith('.webm')
    || value.endsWith('.m3u8');
}

function getStreamingVideoUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;

  const markerIndex = raw.indexOf(CLOUDINARY_VIDEO_MARKER);
  if (markerIndex === -1) return raw;

  const afterMarker = raw.slice(markerIndex + CLOUDINARY_VIDEO_MARKER.length);
  if (afterMarker.includes('fl_progressive')) return raw;

  const prefix = raw.slice(0, markerIndex + CLOUDINARY_VIDEO_MARKER.length);
  const segments = afterMarker.split('/');
  const firstSegment = segments[0] || '';
  const hasVersionSegment = /^v\d+$/.test(firstSegment);

  if (hasVersionSegment) {
    return `${prefix}${STREAMING_TRANSFORM}/${afterMarker}`;
  }

  if (firstSegment.includes('f_')) {
    const merged = `${firstSegment},fl_progressive,so_0,q_auto`;
    return `${prefix}${merged}/${segments.slice(1).join('/')}`;
  }

  return `${prefix}${STREAMING_TRANSFORM}/${afterMarker}`;
}

function getStreamingVideoSource({ videoId, url, mediaIndex }) {
  const safeId = String(videoId || '').trim();
  if (safeId && BACKEND_URL) {
    const indexValue = Number.isFinite(mediaIndex) ? `?mediaIndex=${mediaIndex}` : '';
    return `${BACKEND_URL}/api/videos/${encodeURIComponent(safeId)}/stream${indexValue}`;
  }

  return getStreamingVideoUrl(url);
}

function getStreamingVideoSourceFromVideo(video, mediaIndex, fallbackUrl) {
  if (!video) return getStreamingVideoUrl(fallbackUrl || '');
  const videoId = video?.id || video?._id || video?.videoId;
  const url = fallbackUrl || video?.url || '';
  return getStreamingVideoSource({ videoId, url, mediaIndex });
}

const FallbackVideo = React.forwardRef(({ style, ...props }, ref) => {
  useImperativeHandle(ref, () => ({
    async playAsync() {},
    async pauseAsync() {},
    async setPositionAsync() {},
    async unloadAsync() {},
    async getStatusAsync() {
      return { isLoaded: false, isPlaying: false, positionMillis: 0, durationMillis: 0, didJustFinish: false };
    },
  }));

  return (
    <View style={[styles.fallbackVideo, style]} {...props}>
      <Text style={styles.fallbackText}>Video no disponible en Expo Go</Text>
    </View>
  );
});

FallbackVideo.displayName = 'FallbackVideo';

const fallbackAudio = {
  setAudioModeAsync: async () => {},
  requestPermissionsAsync: async () => ({ granted: false, status: 'denied', canAskAgain: false }),
  RecordingOptionsPresets: {
    HIGH_QUALITY: {},
  },
  Recording: class {
    async prepareToRecordAsync() {}
    async startAsync() {}
    async stopAndUnloadAsync() {}
    getURI() {
      return null;
    }
  },
  Sound: {
    createAsync: async () => ({
      sound: {
        async getStatusAsync() {
          return { isLoaded: false, isPlaying: false, positionMillis: 0, durationMillis: 0, didJustFinish: false };
        },
        async playAsync() {},
        async pauseAsync() {},
        async unloadAsync() {},
      },
    }),
  },
};

const Audio = ExpoAV?.Audio || fallbackAudio;
const Video = ExpoAV?.Video || FallbackVideo;

const hasNativeMediaSupport = Boolean(ExpoAV?.Video && ExpoAV?.Audio);

const styles = StyleSheet.create({
  fallbackVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    textAlign: 'center',
  },
});

export {
  Audio,
  ResizeMode,
  Video,
  hasNativeMediaSupport,
  getStreamingVideoUrl,
  getStreamingVideoSource,
  getStreamingVideoSourceFromVideo,
  isLikelyVideoUrl,
};