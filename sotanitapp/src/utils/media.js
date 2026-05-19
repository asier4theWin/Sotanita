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
const STREAMING_TRANSFORM = 'fl_progressive,so_0,q_auto';

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
  return `${prefix}${STREAMING_TRANSFORM}/${afterMarker}`;
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

export { Audio, ResizeMode, Video, hasNativeMediaSupport, getStreamingVideoUrl, isLikelyVideoUrl };