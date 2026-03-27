import { Image, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

const cardBackground = require('../../assets/fondo.png');
const cardFrame = require('../../assets/marco.png');

const sizes = {
  small: { width: 66, height: 94, title: 12, subtitle: 8, rating: 11, position: 9, topPad: 7 },
  medium: { width: 100, height: 142, title: 14, subtitle: 10, rating: 14, position: 10, topPad: 9 },
  large: { width: 146, height: 206, title: 17, subtitle: 12, rating: 19, position: 11, topPad: 11 },
  xlarge: { width: 174, height: 246, title: 19, subtitle: 13, rating: 22, position: 12, topPad: 13 },
};

export default function FifaCard({
  username,
  team,
  position,
  rating = 85,
  size = 'medium',
  disableShadow = false,
  style,
}) {
  const { colors } = useAppTheme();
  const current = sizes[size] || sizes.medium;

  return (
    <View
      style={[
        styles.card,
        disableShadow && styles.noShadow,
        {
          width: current.width,
          height: current.height,
        },
        style,
      ]}
    >
      <Image source={cardBackground} style={styles.assetLayer} resizeMode="stretch" />

      <View style={[styles.contentLayer, { paddingTop: current.topPad }]}> 
        <View style={styles.footer}>
          <Text numberOfLines={1} style={[styles.username, { fontSize: current.title, color: colors.black }]}>
            {username}
          </Text>
          <Text numberOfLines={1} style={[styles.position, { fontSize: current.position, color: colors.black }]}>
            {position}
          </Text>
        </View>
      </View>

      <Image source={cardFrame} style={styles.assetLayer} resizeMode="stretch" />
    </View>
  );
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
    borderRadius: 12,
  },
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 2,
  },
  footer: {
    paddingHorizontal: 8,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    textAlign: 'center',
    fontWeight: '800',
    fontFamily: 'WorldCup26',
    transform: [{ skewY: -12 }],
    marginBottom: 4,
  },
  position: {
    textAlign: 'center',
    fontWeight: '800',
  },
});
