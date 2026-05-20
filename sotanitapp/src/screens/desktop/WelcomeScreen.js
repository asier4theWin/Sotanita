import { Image, Modal, StyleSheet, Text, View, useWindowDimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useFirstVisit } from '../../hooks/useFirstVisit';
import { useRef, useState, useEffect } from 'react';
import Pressable from '../../components/A11yPressable';

const loginButtonImage = require('../../../assets/init/login.png');
const registerButtonImage = require('../../../assets/init/register.png');
const guestButtonImage = require('../../../assets/init/guest_pc.png');

export default function WelcomeScreen({ navigation }) {
  const { enterAsGuest } = useAuth();
  const { width } = useWindowDimensions();
  const { colors, spacing, typography, textScale, darkMode } = useAppTheme();
  const { isFirstVisit, loading, markFirstVisitSeen } = useFirstVisit();
  const [hoverButton, setHoverButton] = useState(null);
  
  // Animated scales for buttons
  const loginScale = useRef(new Animated.Value(1)).current;
  const registerScale = useRef(new Animated.Value(1)).current;
  const guestScale = useRef(new Animated.Value(1)).current;

  // Handle button hover animations
  useEffect(() => {
    const animateButtonScale = (scaleAnim, isHovered) => {
      Animated.timing(scaleAnim, {
        toValue: isHovered ? 1.08 : 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    if (hoverButton === 'login') animateButtonScale(loginScale, true);
    else animateButtonScale(loginScale, false);

    if (hoverButton === 'register') animateButtonScale(registerScale, true);
    else animateButtonScale(registerScale, false);

    if (hoverButton === 'guest') animateButtonScale(guestScale, true);
    else animateButtonScale(guestScale, false);
  }, [hoverButton, loginScale, registerScale, guestScale]);

  const titleFontSize = Math.min(96, Math.max(44, width * 0.065)) * textScale;
  const buttonWidth = Math.min(330, Math.max(220, width * 0.23));
  const backgroundColors = darkMode
    ? ['#020617', '#051649', '#020B2F']
    : ['#F6FAFF', '#DEE9FF', '#CBDBFF'];

  const handleGuest = () => {
    enterAsGuest();
  };

  return (
    <LinearGradient colors={backgroundColors} style={styles.background}>
      <Modal visible={!loading && isFirstVisit} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}> 
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.families.nougat }]}>Bienvenido a Sotanita</Text>
            <Text style={[styles.modalMessage, { color: colors.textMuted }]}>Esta es la primera vez que entras desde este dispositivo o navegador. La próxima vez no volverá a mostrarse este mensaje.</Text>
            <Pressable
              onPress={markFirstVisitSeen}
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              accessibilityLabel="Continuar"
            > 
              <Text style={[styles.modalButtonText, { color: colors.background }]}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={[styles.container, { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }]}> 
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontFamily: typography.families.nougat,
              fontSize: titleFontSize,
              lineHeight: titleFontSize * 1.03,
              maxWidth: width * 0.8,
            },
          ]}
        >
          AMANTES DEL MAL FUTBOL
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.primary, width: width * 0.7 }]} />

        <View style={styles.buttonsRow}>
          <Animated.View 
            style={{ 
              width: buttonWidth,
              transform: [{ scale: loginScale }],
            }}
          >
            <Pressable 
              onPress={() => navigation.navigate('Login')} 
              onMouseEnter={() => setHoverButton('login')}
              onMouseLeave={() => setHoverButton(null)}
              style={styles.imageButton}
              accessibilityLabel="Iniciar sesion"
            >
              <Image
                source={loginButtonImage}
                style={styles.imageButtonAsset}
                resizeMode="contain"
                accessibilityLabel="Boton iniciar sesion"
              />
            </Pressable>
          </Animated.View>

          <Animated.View 
            style={{ 
              width: buttonWidth,
              transform: [{ scale: registerScale }],
            }}
          >
            <Pressable 
              onPress={() => navigation.navigate('Register')} 
              onMouseEnter={() => setHoverButton('register')}
              onMouseLeave={() => setHoverButton(null)}
              style={styles.imageButton}
              accessibilityLabel="Registrarse"
            >
              <Image
                source={registerButtonImage}
                style={styles.imageButtonAsset}
                resizeMode="contain"
                accessibilityLabel="Boton registrarse"
              />
            </Pressable>
          </Animated.View>

          <Animated.View 
            style={{ 
              width: buttonWidth,
              transform: [{ scale: guestScale }],
            }}
          >
            <Pressable 
              onPress={handleGuest} 
              onMouseEnter={() => setHoverButton('guest')}
              onMouseLeave={() => setHoverButton(null)}
              style={styles.imageButton}
              accessibilityLabel="Entrar como invitado"
            >
              <Image
                source={guestButtonImage}
                style={styles.imageButtonAsset}
                resizeMode="contain"
                accessibilityLabel="Boton entrar como invitado"
              />
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.primary, width: width * 0.7 }]} />

        <Text
          style={[
            styles.subtitle,
            {
              color: colors.primary,
              fontSize: typography.sizes.lg * textScale,
            },
          ]}
        >
          La app donde los mejores no siempre la acaban metiendo
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    minHeight: 560,
    gap: 22,
  },
  title: {
    textAlign: 'center',
    transform: [{ scaleY: 1.08 }],
    letterSpacing: -0.5,
  },
  divider: {
    height: 5,
    borderRadius: 999,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
    maxWidth: 1100,
  },
  imageButton: {
    aspectRatio: 0.92,
  },
  imageButtonAsset: {
    width: '100%',
    height: '100%',
  },
  subtitle: {
    textAlign: 'center',
    fontWeight: '700',
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
    maxWidth: 560,
    borderRadius: 24,
    borderWidth: 2,
    paddingHorizontal: 28,
    paddingVertical: 30,
    gap: 16,
  },
  modalTitle: {
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 34,
  },
  modalMessage: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
  },
  modalButton: {
    alignSelf: 'center',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 999,
  },
  modalButtonText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
