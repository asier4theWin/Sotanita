import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';
import AppButton from '../components/AppButton';

const appLogo = require('../../assets/LOGO.png');

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
          <Text style={{ color: colors.text, fontSize: typography.sizes.hero * textScale, fontWeight: typography.weights.bold, fontFamily: typography.families.worldCup }}>
            AMANTES DEL MAL FUTBOL
          </Text>
          <Text style={{ color: colors.primary, fontSize: typography.sizes.lg * textScale }}>
            Cuando las jugadas están bien... pa no verlas.
          </Text>
        </View>

        <View style={styles.actions}>
          <AppButton title="Iniciar sesion" onPress={() => navigation.navigate('Login')} />
          <AppButton title="Registrarse" variant="secondary" onPress={() => navigation.navigate('Register')} />

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
  guestButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
