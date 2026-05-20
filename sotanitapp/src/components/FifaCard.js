import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import StrokeText from './StrokeText';
import { useAppTheme } from '../hooks/useAppTheme';
import Pressable from './A11yPressable';

const cardBackground = require('../../assets/fondo.png');
const cardFrame = require('../../assets/marco.png');

const sizes = {
  small: { width: 84, height: 120 },
  medium: { width: 100, height: 142 },
  large: { width: 146, height: 206 },
  xlarge: { width: 174, height: 246 },
};

const baseWidth = 100;

const baseMetrics = {
  title: 14,
  position: 10,
  topPad: 10,
  footerBottom: 17,
  borderRadius: 12,
  marginBottom: 0,
};

function getCardMetrics(size) {
  const current = sizes[size] || sizes.medium;
  const scale = current.width / baseWidth;

  return {
    width: current.width,
    height: current.height,
    scale,
    title: Math.round(baseMetrics.title * scale),
    position: Math.round(baseMetrics.position * scale),
    topPad: Math.round(baseMetrics.topPad * scale),
    footerBottom: Math.round(baseMetrics.footerBottom * scale),
    borderRadius: Math.round(baseMetrics.borderRadius * scale),
    marginBottom: Math.round(baseMetrics.marginBottom * scale),
    photoWidth: Math.round(current.width * 0.92),
    photoHeight: Math.round(current.height * 0.72),
  };
}

function normalizeRemoteUri(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('file:')) return raw;
  return null;
}

export default function FifaCard({
  username,
  team,
  position,
  rating = 85,
  size = 'medium',
  disableShadow = false,
  backgroundUrl,
  photoUrl,
  frameUrl,
  frameId,
  style,
  onPress,
}) {
  const { colors, typography } = useAppTheme();
  const current = getCardMetrics(size);
  const [backgroundLoadFailed, setBackgroundLoadFailed] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [frameLoadFailed, setFrameLoadFailed] = useState(false);
  const normalizedBackgroundUrl = useMemo(() => normalizeRemoteUri(backgroundUrl), [backgroundUrl]);
  const normalizedPhotoUrl = useMemo(() => normalizeRemoteUri(photoUrl), [photoUrl]);
  const normalizedFrameUrl = useMemo(() => normalizeRemoteUri(frameUrl), [frameUrl]);
  const backgroundSource = normalizedBackgroundUrl && !backgroundLoadFailed ? { uri: normalizedBackgroundUrl } : cardBackground;
  const photoSource = normalizedPhotoUrl && !photoLoadFailed ? { uri: normalizedPhotoUrl } : null;
  const frameSource = normalizedFrameUrl && !frameLoadFailed ? { uri: normalizedFrameUrl } : cardFrame;
  const cardLabel = username ? `Carta de ${username}` : 'Carta de jugador';

  const cardContent = (
    <View
      style={[
        styles.card,
        disableShadow && styles.noShadow,
        {
          width: current.width,
          height: current.height,
          borderRadius: current.borderRadius,
        },
        style,
      ]}
    >
      <Image
        source={backgroundSource}
        style={styles.assetLayer}
        resizeMode="stretch"
        onError={() => setBackgroundLoadFailed(true)}
        accessibilityLabel="Fondo de carta"
      />

      {photoSource ? (
        <View style={styles.photoLayer} pointerEvents="none">
          <Image
            source={photoSource}
            style={{ width: current.photoWidth, height: current.photoHeight }}
            resizeMode="contain"
            onError={() => setPhotoLoadFailed(true)}
            accessibilityLabel={username ? `Foto de ${username}` : 'Foto de jugador'}
          />
        </View>
      ) : null}

      <View style={[styles.contentLayer, { paddingTop: current.topPad }]}> 
        <View style={[styles.footer, { paddingBottom: current.footerBottom }]}> 
          <StrokeText
            style={[
              styles.username,
              {
                fontSize: current.title,
                color: colors.white,
                fontFamily: typography.families.nougat,
                marginBottom: current.marginBottom,
                textAlign: 'center',
              },
            ]}
            strokeColor="black"
            strokeWidth={2}
          >
            {username}
          </StrokeText>
          <StrokeText
            style={[
              styles.position,
              {
                fontSize: current.position,
                color: colors.white,
                textAlign: 'center',
              },
            ]}
            strokeColor="black"
            strokeWidth={2}
          >
            {position}
          </StrokeText>
        </View>
      </View>

      <Image
        source={frameSource}
        style={styles.frameLayer}
        resizeMode="stretch"
        onError={() => setFrameLoadFailed(true)}
        accessibilityLabel="Marco de carta"
      />
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress} accessibilityLabel={cardLabel}>{cardContent}</Pressable>;
  }

  return cardContent;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 8,
  },
  noShadow: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  assetLayer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  photoLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 1,
  },
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 3,
  },
  frameLayer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 2,
  },
  footer: {
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    textAlign: 'center',
    fontWeight: '800',
    transform: [{ skewY: -12 }],
  },
  position: {
    textAlign: 'center',
    fontWeight: '800',
  },
});
