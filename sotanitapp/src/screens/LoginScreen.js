import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
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

  const onSubmit = () => {
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

    login(email, password);
  };

  return (
    <ScreenGradient>
      <Header title="Iniciar sesion" onBack={() => navigation.goBack()} />
      <View style={[styles.content, { padding: spacing.xl }]}> 
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

        <AppButton title="Iniciar sesion" onPress={onSubmit} style={{ marginTop: spacing.md }} />

        <View style={styles.footer}>
          <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale }}>No tienes cuenta?</Text>
          <Pressable onPress={() => navigation.navigate('Register')}>
            <Text style={{ color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm * textScale }}>
              Registrate
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
});
