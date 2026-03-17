import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import { teams, positions } from '../utils/mockData';
import { emailRegex } from '../utils/format';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import ScreenGradient from '../components/ScreenGradient';
import Header from '../components/Header';

function passwordStrength(password) {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z\d]/.test(password)) score += 1;
  return score;
}

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const { colors, spacing, typography, textScale } = useAppTheme();

  const [form, setForm] = useState({
    username: '',
    position: '',
    team: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [focusedPicker, setFocusedPicker] = useState(null);

  const strength = useMemo(() => passwordStrength(form.password), [form.password]);

  const submit = () => {
    const next = {};

    if (!form.username || form.username.length < 3) next.username = 'Minimo 3 caracteres';
    if (!emailRegex.test(form.email)) next.email = 'Email invalido';
    if (!form.position) next.position = 'Selecciona una posicion';
    if (!form.team) next.team = 'Selecciona un equipo';
    if (!form.password || form.password.length < 6) next.password = 'Minimo 6 caracteres';
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Las contrasenas no coinciden';

    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    register(form);
  };

  return (
    <ScreenGradient>
      <Header title="Crear cuenta" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.xl }]}>
        <Text style={{ color: colors.textMuted, fontSize: typography.sizes.md * textScale, marginBottom: spacing.xl }}>
          Unete a la comunidad
        </Text>

        <AppInput
          label="Nombre de usuario"
          value={form.username}
          onChangeText={(username) => setForm((prev) => ({ ...prev, username }))}
          placeholder="Ronaldo10"
          error={errors.username}
        />

        <Text style={[styles.label, { color: colors.text, fontSize: typography.sizes.sm * textScale }]}>Posicion</Text>
        <View
          style={[
            styles.pickerWrap,
            {
              backgroundColor: colors.surface,
              borderColor: errors.position ? colors.danger : focusedPicker === 'position' ? colors.primary : colors.border,
            },
          ]}
        >
          <Picker
            selectedValue={form.position}
            style={{ color: colors.text, backgroundColor: 'transparent' }}
            itemStyle={{ color: colors.text }}
            dropdownIconColor={colors.text}
            onFocus={() => setFocusedPicker('position')}
            onBlur={() => setFocusedPicker(null)}
            onValueChange={(position) => setForm((prev) => ({ ...prev, position }))}
          >
            <Picker.Item label="Selecciona tu posicion" value="" color={colors.textMuted} />
            {positions.map((position) => (
              <Picker.Item key={position} label={position} value={position} color="#111827" />
            ))}
          </Picker>
        </View>
        {errors.position ? <Text style={[styles.error, { color: colors.danger }]}>{errors.position}</Text> : null}

        <Text style={[styles.label, { color: colors.text, fontSize: typography.sizes.sm * textScale }]}>Equipo favorito</Text>
        <View
          style={[
            styles.pickerWrap,
            {
              backgroundColor: colors.surface,
              borderColor: errors.team ? colors.danger : focusedPicker === 'team' ? colors.primary : colors.border,
            },
          ]}
        >
          <Picker
            selectedValue={form.team}
            style={{ color: colors.text, backgroundColor: 'transparent' }}
            itemStyle={{ color: colors.text }}
            dropdownIconColor={colors.text}
            onFocus={() => setFocusedPicker('team')}
            onBlur={() => setFocusedPicker(null)}
            onValueChange={(team) => setForm((prev) => ({ ...prev, team }))}
          >
            <Picker.Item label="Selecciona tu equipo" value="" color={colors.textMuted} />
            {teams.map((team) => (
              <Picker.Item key={team} label={team} value={team} color="#111827" />
            ))}
          </Picker>
        </View>
        {errors.team ? <Text style={[styles.error, { color: colors.danger }]}>{errors.team}</Text> : null}

        <AppInput
          label="Email"
          value={form.email}
          onChangeText={(email) => setForm((prev) => ({ ...prev, email }))}
          keyboardType="email-address"
          placeholder="tu@email.com"
          error={errors.email}
        />

        <AppInput
          label="Contrasena"
          value={form.password}
          onChangeText={(password) => setForm((prev) => ({ ...prev, password }))}
          placeholder="........"
          secureTextEntry={!showPassword}
          rightIcon={showPassword ? 'eye-off' : 'eye'}
          onRightPress={() => setShowPassword((prev) => !prev)}
          error={errors.password}
        />

        {form.password.length > 0 ? (
          <View style={{ marginBottom: spacing.md }}>
            <View style={styles.strengthBar}>
              {[1, 2, 3, 4, 5].map((level) => (
                <View
                  key={level}
                  style={[
                    styles.segment,
                    {
                      backgroundColor:
                        level <= strength
                          ? strength <= 1
                            ? colors.danger
                            : strength <= 3
                            ? colors.primary
                            : colors.success
                          : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
              Fortaleza: {strength <= 1 ? 'Debil' : strength <= 3 ? 'Media' : 'Fuerte'}
            </Text>
          </View>
        ) : null}

        <AppInput
          label="Repetir contrasena"
          value={form.confirmPassword}
          onChangeText={(confirmPassword) => setForm((prev) => ({ ...prev, confirmPassword }))}
          placeholder="........"
          secureTextEntry={!showConfirm}
          rightIcon={showConfirm ? 'eye-off' : 'eye'}
          onRightPress={() => setShowConfirm((prev) => !prev)}
          error={errors.confirmPassword}
        />

        <AppButton title="Registrarse" onPress={submit} style={{ marginTop: spacing.md }} />

        <View style={styles.footer}>
          <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale }}>Ya tienes cuenta?</Text>
          <Pressable onPress={() => navigation.navigate('Login')}>
            <Text style={{ color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm * textScale }}>
              Inicia sesion
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
  },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 8,
    minHeight: 52,
    justifyContent: 'center',
  },
  error: {
    fontSize: 12,
    marginBottom: 12,
  },
  strengthBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 8,
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
});
