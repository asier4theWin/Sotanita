import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import useResetScrollOnFocus from '../hooks/useResetScrollOnFocus';
import { emailRegex } from '../utils/format';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import ScreenGradient from '../components/ScreenGradient';
import Header from '../components/Header';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { colors, spacing, typography, textScale } = useAppTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loggingIn, setLoggingIn] = useState(false);
  const [serverError, setServerError] = useState('');
  const scrollRef = useRef(null);

  useResetScrollOnFocus(scrollRef);

  const onSubmit = async () => {
    const next = {};

    if (!emailRegex.test(email)) {
      next.email = 'Email invalido';
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
      await login(email, password);
      navigation.replace('Home');
    } catch (error) {
      setServerError(error.message || 'No se pudo iniciar sesion');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <ScreenGradient>
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
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="tu@email.com"
          keyboardType="email-address"
          error={errors.email}
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

        <AppButton title="Iniciar sesion" onPress={onSubmit} loading={loggingIn} style={{ marginTop: spacing.md }} />

        <View style={styles.footer}>
          <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale }}>No tienes cuenta?</Text>
          <Pressable onPress={() => navigation.navigate('Register')}>
            <Text style={{ color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm * textScale }}>
              Registrate
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
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
