import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import useResetScrollOnFocus from '../../hooks/useResetScrollOnFocus';
import { emailRegex } from '../../utils/format';
import AppButton from '../../components/AppButton';
import AppInput from '../../components/AppInput';
import Header from '../../components/Header';
import LoadingOverlay from '../../components/LoadingOverlay';
import Pressable from '../../components/A11yPressable';

const isValidEmailOrUsername = (value) => {
  if (value.includes('@')) {
    return emailRegex.test(value);
  }
  return value.length > 0;
};

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { width } = useWindowDimensions();
  const { colors, spacing, typography, textScale, darkMode } = useAppTheme();
  const backgroundColors = darkMode
    ? ['#020617', '#051649', '#020B2F']
    : ['#F6FAFF', '#DEE9FF', '#CBDBFF'];

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loggingIn, setLoggingIn] = useState(false);
  const [serverError, setServerError] = useState('');
  const scrollRef = useRef(null);

  useResetScrollOnFocus(scrollRef);

  const onSubmit = async () => {
    const next = {};

    if (!isValidEmailOrUsername(emailOrUsername)) {
      if (emailOrUsername.includes('@')) {
        next.emailOrUsername = 'Email invalido';
      } else {
        next.emailOrUsername = 'Username requerido';
      }
    }
    if (!password || password.length < 6) {
      next.password = 'La contrasena debe tener al menos 6 caracteres';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    setLoggingIn(true);
    setServerError('');

    try {
      await login(emailOrUsername, password);
      // navigation.replace('Home'); // Manejado por AppNavigator condicionalmente
    } catch (error) {
      setServerError(error.message || 'No se pudo iniciar sesion');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <LinearGradient colors={backgroundColors} style={styles.background}>
      <View style={[styles.stage, { padding: spacing.lg }]}> 
        <View style={[styles.formContainer, { width: width * 0.6, backgroundColor: colors.overlay }]}> 
          <Header
            title="Iniciar sesion"
            titleSize="xxl"
            titleScale={1.3}
            titleStyle={{ transform: [{ scaleY: 1.12 }], letterSpacing: -0.8 }}
            onBack={() => navigation.goBack()}
          />
          <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
            <View style={{ marginBottom: spacing.xl }}>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.md * textScale }}>Bienvenido de vuelta</Text>
            </View>

            <AppInput
              label="Email o Username"
              value={emailOrUsername}
              onChangeText={setEmailOrUsername}
              placeholder="tu@email.com o usuario"
              keyboardType="email-address"
              error={errors.emailOrUsername}
            />

            <AppInput
              label="Contrasena"
              value={password}
              onChangeText={setPassword}
              placeholder="........"
              secureTextEntry={!showPassword}
              rightIcon={showPassword ? 'eye-off' : 'eye'}
              onRightPress={() => setShowPassword((prev) => !prev)}
              error={errors.password}
            />

            {serverError ? <Text style={[styles.error, { color: colors.danger }]}>{serverError}</Text> : null}

            <AppButton 
              title="INICIAR SESION" 
              onPress={onSubmit} 
              loading={loggingIn} 
              strokeText={true}
              strokeColor="black"
               strokeWidth={3}
              style={{ marginTop: spacing.md, paddingVertical: spacing.lg / 1.5 }} 
              textStyle={{ color: colors.white, fontSize: typography.sizes.xxl * textScale, fontFamily: typography.families.nougat }}
            />

            <View style={styles.footer}>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale }}>No tienes cuenta?</Text>
              <Pressable onPress={() => navigation.navigate('Register')} accessibilityLabel="Ir a registro">
                <Text style={{ color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm * textScale }}>
                  Registrate
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
      <LoadingOverlay visible={loggingIn} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    height: '86%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  error: {
    fontSize: 12,
    marginBottom: 12,
  },
});
