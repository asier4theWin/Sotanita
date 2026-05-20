import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useFirstVisit } from '../../hooks/useFirstVisit';
import ScreenGradient from '../../components/ScreenGradient';
import PresentationPopup from '../../components/PresentationPopup';

const appLogo = require('../../../assets/LOGO.png');
const loginButtonImage = require('../../../assets/init/login.png');
const registerButtonImage = require('../../../assets/init/register.png');
const guestButtonImage = require('../../../assets/init/guest.png');

export default function WelcomeScreen({ navigation }) {
  const { enterAsGuest } = useAuth();
  const { colors, spacing, typography, textScale } = useAppTheme();
  const { isFirstVisit, loading, markFirstVisitSeen } = useFirstVisit();

  const handleGuest = () => {
    enterAsGuest();
  };

  return (
    <ScreenGradient>
      <PresentationPopup onClose={markFirstVisitSeen} />

      <View style={[styles.container, { padding: spacing.xl }]}> 
        <View style={styles.logoBlock}>
          <Image
            source={appLogo}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Logo Sotanita"
          />
          <Text style={{ color: colors.primary, fontSize: typography.sizes.lg * textScale }}>
            Cuando las jugadas están bien... pa no verlas.
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.authImageButtonsRow}>
            <Pressable onPress={() => navigation.navigate('Login')} style={styles.authImageButton} accessibilityLabel="Iniciar sesion">
              <Image
                source={loginButtonImage}
                style={styles.authImageButtonAsset}
                resizeMode="contain"
                accessibilityLabel="Boton iniciar sesion"
              />
            </Pressable>

            <Pressable onPress={() => navigation.navigate('Register')} style={styles.authImageButton} accessibilityLabel="Registrarse">
              <Image
                source={registerButtonImage}
                style={styles.authImageButtonAsset}
                resizeMode="contain"
                accessibilityLabel="Boton registrarse"
              />
            </Pressable>
          </View>

          <Pressable onPress={handleGuest} style={styles.guestButton} accessibilityLabel="Entrar como invitado">
            <Image
              source={guestButtonImage}
              style={styles.guestButtonImage}
              resizeMode="contain"
              accessibilityLabel="Boton entrar como invitado"
            />
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
    gap: 30,
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
    width: '100%',
    aspectRatio: 3.2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  guestButtonImage: {
    width: '100%',
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: 2,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 14,
  },
  modalTitle: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 32,
  },
  modalMessage: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
  },
  modalButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
