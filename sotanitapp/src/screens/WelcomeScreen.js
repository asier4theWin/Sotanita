import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';

const appLogo = require('../../assets/LOGO.png');
const loginButtonImage = require('../../assets/init/login.png');
const registerButtonImage = require('../../assets/init/register.png');

export default function WelcomeScreen({ navigation }) {
  const { enterAsGuest } = useAuth();
  const { colors, spacing, typography, textScale } = useAppTheme();

  const handleGuest = () => {
    enterAsGuest();
  };

  return (
    <ScreenGradient>
      <View style={[styles.container, { padding: spacing.xl }]}> 
        <View style={styles.logoBlock}>
          <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
          <Text
            style={{
              color: colors.text,
              fontSize: typography.sizes.hero * 1.3 * textScale,
              fontWeight: typography.weights.bold,
              fontFamily: typography.families.worldCup,
              textAlign: 'center',
              transform: [{ scaleY: 1.12 }],
              letterSpacing: -0.8,
            }}
          >
            AMANTES DEL MAL FUTBOL
          </Text>
          <Text style={{ color: colors.primary, fontSize: typography.sizes.lg * textScale }}>
            Cuando las jugadas están bien... pa no verlas.
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.authImageButtonsRow}>
            <Pressable onPress={() => navigation.navigate('Login')} style={styles.authImageButton}>
              <Image source={loginButtonImage} style={styles.authImageButtonAsset} resizeMode="contain" />
            </Pressable>

            <Pressable onPress={() => navigation.navigate('Register')} style={styles.authImageButton}>
              <Image source={registerButtonImage} style={styles.authImageButtonAsset} resizeMode="contain" />
            </Pressable>
          </View>

          <Pressable onPress={handleGuest} style={[styles.guestButton, { borderColor: `${colors.white}66` }]}>
            <Text style={{ color: colors.text, fontWeight: typography.weights.semibold, fontSize: typography.sizes.md * textScale }}>
              Entrar como invitado
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  logoBlock: {
    alignItems: 'center',
    marginBottom: 52,
    gap: 8,
  },
  logoImage: {
    width: 200,
    height: 200,
    marginBottom: 10,
  },
  actions: {
    gap: 14,
  },
  authImageButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  authImageButton: {
    flex: 1,
    aspectRatio: 1,
  },
  authImageButtonAsset: {
    width: '100%',
    height: '100%',
  },
  guestButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
