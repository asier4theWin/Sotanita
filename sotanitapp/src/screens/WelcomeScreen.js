import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';
import AppButton from '../components/AppButton';

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
          <View style={[styles.logoFrame, { borderColor: colors.primaryDark }]}>
            <Ionicons name="football" size={74} color="#4A2C00" />
          </View>
          <Text style={{ color: colors.text, fontSize: typography.sizes.hero * textScale, fontWeight: typography.weights.bold }}>
            FutbolClips
          </Text>
          <Text style={{ color: colors.primary, fontSize: typography.sizes.lg * textScale }}>
            Comparte tus mejores jugadas
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
  logoFrame: {
    width: 132,
    height: 132,
    borderRadius: 28,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    backgroundColor: '#F59E0B',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
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
