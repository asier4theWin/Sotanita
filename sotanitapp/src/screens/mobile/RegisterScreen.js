import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, FlatList, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import useResetScrollOnFocus from '../../hooks/useResetScrollOnFocus';
import { getPositions, getTeamsListWithEscudo, isUsernameAvailable } from '../../api/backend';
import { emailRegex } from '../../utils/format';
import AppButton from '../../components/AppButton';
import AppInput from '../../components/AppInput';
import ScreenGradient from '../../components/ScreenGradient';
import Header from '../../components/Header';
import LoadingOverlay from '../../components/LoadingOverlay';

const REMOVE_BG_API_KEY = process.env.EXPO_PUBLIC_REMOVE_BG_API_KEY;

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }

  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(binary, 'binary').toString('base64');
  }

  throw new Error('No se pudo convertir la imagen a base64');
}

function passwordStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[$&%_#]/.test(password)) score += 1;
  
  // Bonus point if has all required components
  if (/[a-zA-Z]/.test(password) && /\d/.test(password) && /[$&%_#]/.test(password)) {
    score += 1;
  }
  
  return Math.min(score, 5);
}

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();

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
  const [teamOptions, setTeamOptions] = useState([]);
  const [fullTeamList, setFullTeamList] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [positionOptions, setPositionOptions] = useState([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [photoUri, setPhotoUri] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [serverError, setServerError] = useState('');
  const [positionsError, setPositionsError] = useState('');
  const scrollRef = useRef(null);

  useResetScrollOnFocus(scrollRef);

  const strength = useMemo(() => passwordStrength(form.password), [form.password]);
  const selectFontSize = 26 * textScale;
  const selectItemFontSize = 22 * textScale;
  const selectTeamItemFontSize = 16 * textScale;
  const selectTextColor = highContrast ? colors.primary : darkMode ? colors.white : colors.text;
  const selectBackground = `${colors.surface}99`;
  const teamColumnHighlight = highContrast ? `${colors.primary}22` : darkMode ? `${colors.white}08` : `${colors.black}08`;
  const positionLabel = form.position || 'Selecciona tu posicion';
  const teamLabel = form.team || 'Selecciona tu equipo';

  const pickAndProcessPhoto = async () => {
    if (!REMOVE_BG_API_KEY) {
      throw new Error('Falta configurar EXPO_PUBLIC_REMOVE_BG_API_KEY');
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permiso de galeria denegado');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      throw new Error('No se pudo leer la imagen seleccionada');
    }

    const formData = new FormData();
    formData.append('size', 'auto');
    formData.append('format', 'png');

    const fileName = asset.fileName || `upload-${Date.now()}.jpg`;
    const fileType = asset.mimeType || 'image/jpeg';

    if (Platform.OS === 'web') {
      const fileResponse = await fetch(asset.uri);
      const imageBlob = await fileResponse.blob();
      formData.append('image_file', imageBlob, fileName);
    } else {
      formData.append('image_file', {
        uri: asset.uri,
        name: fileName,
        type: fileType,
      });
    }

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': REMOVE_BG_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`remove.bg error ${response.status}: ${errorBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);

    return {
      uri: `data:image/png;base64,${base64Data}`,
      dataUrl: `data:image/png;base64,${base64Data}`,
    };
  };

  const handleSelectPhoto = async () => {
    setPhotoError('');
    setServerError('');

    try {
      setPhotoLoading(true);
      const processed = await pickAndProcessPhoto();

      if (!processed) {
        return;
      }

      setPhotoUri(processed.uri);
      setPhotoDataUrl(processed.dataUrl);
    } catch (error) {
      const message = error.message || 'No se pudo procesar la foto';
      setPhotoError(message);
      Alert.alert('Foto', message);
    } finally {
      setPhotoLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadTeams = async () => {
      setLoadingTeams(true);
      setServerError('');

      try {
        const teams = await getTeamsListWithEscudo();
        if (isMounted) {
          setFullTeamList(Array.isArray(teams) ? teams : []);
          setTeamOptions(Array.isArray(teams) ? teams.map(t => t.name) : []);
        }
      } catch (error) {
        if (isMounted) {
          setServerError(error.message || 'No se pudieron cargar los equipos');
        }
      } finally {
        if (isMounted) {
          setLoadingTeams(false);
        }
      }
    };

    const loadPositions = async () => {
      setLoadingPositions(true);
      setPositionsError('');

      try {
        const data = await getPositions();
        if (isMounted) {
          setPositionOptions(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (isMounted) {
          setPositionsError(error.message || 'No se pudieron cargar las posiciones');
        }
      } finally {
        if (isMounted) {
          setLoadingPositions(false);
        }
      }
    };

    loadTeams();
    loadPositions();

    return () => {
      isMounted = false;
    };
  }, []);

  const submit = async () => {
    const next = {};

    // Validación Username
    if (!form.username) {
      next.username = 'Username es obligatorio';
    } else if (form.username.length < 3) {
      next.username = 'Username debe tener al menos 3 caracteres';
    } else if (form.username.length > 10) {
      next.username = 'Username no puede superar 10 caracteres';
    } else if (!/^[a-zA-Z0-9.\-]+$/.test(form.username)) {
      next.username = 'Solo letras, numeros, "." y "-"';
    } else if (!/[a-zA-Z]/.test(form.username)) {
      next.username = 'Debe contener al menos una letra';
    }

    // Validación Email
    if (!emailRegex.test(form.email)) next.email = 'Email invalido';

    // Validación Position
    if (!form.position) next.position = 'Selecciona una posicion';

    // Validación Team
    if (!form.team) next.team = 'Selecciona un equipo';

    // Validación Password
    if (!form.password) {
      next.password = 'Contrasena es obligatoria';
    } else if (form.password.length < 8) {
      next.password = 'Minimo 8 caracteres';
    } else if (!/[a-zA-Z]/.test(form.password)) {
      next.password = 'Debe contener una letra';
    } else if (!/\d/.test(form.password)) {
      next.password = 'Debe contener un numero';
    } else if (!/[$&%_#]/.test(form.password)) {
      next.password = 'Debe contener un caracter especial ($, &, %, _, #)';
    } else if (!/^[a-zA-Z0-9$&%_#]+$/.test(form.password)) {
      next.password = 'Contiene caracteres no permitidos';
    }

    // Validación Confirm Password
    if (form.confirmPassword !== form.password) {
      next.confirmPassword = 'Las contrasenas no coinciden';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    setRegistering(true);
    setServerError('');

    try {
      // Check username availability on server
      if (form.username) {
        const avail = await isUsernameAvailable(form.username);
        if (avail && avail.available === false) {
          setErrors({ ...next, username: 'Ese nombre de usuario no está disponible' });
          setRegistering(false);
          return;
        }
      }
      await register({
        ...form,
        profileImageUrl: photoDataUrl || undefined,
      });
    } catch (error) {
      setServerError(error.message || 'No se pudo completar el registro');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <ScreenGradient>
      <Header
        title="Crear cuenta"
        titleSize="xxl"
        titleScale={1.3}
        titleStyle={{ transform: [{ scaleY: 1.12 }], letterSpacing: -0.8 }}
        onBack={() => navigation.goBack()}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scrollContent, { padding: spacing.xl }]}>
        <Pressable
          onPress={handleSelectPhoto}
          disabled={photoLoading}
          accessibilityLabel="Seleccionar foto de perfil"
          style={[
            styles.photoPicker,
            {
              backgroundColor: colors.surface,
              borderColor: photoError ? colors.danger : photoUri ? colors.success : colors.border,
            },
          ]}
        >
          {photoLoading ? (
            <View style={styles.photoPlaceholder}>
              <Text style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Procesando foto...</Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale, marginTop: 4 }}>
                Espera un momento
              </Text>
            </View>
          ) : photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.photoPreview}
              resizeMode="cover"
              accessibilityLabel="Vista previa de foto de perfil"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Toca para subir tu foto</Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale, marginTop: 4 }}>
                ¡Esta foto irá en tu propia Player Card!
              </Text>
            </View>
          )}
        </Pressable>
        {photoError ? <Text style={[styles.error, { color: colors.danger }]}>{photoError}</Text> : null}

        <AppInput
          label="Nombre de usuario"
          value={form.username}
          onChangeText={(username) => setForm((prev) => ({ ...prev, username }))}
          placeholder="Nombre de usuario"
          error={errors.username}
        />
        <View
          style={{
            height: 1,
            backgroundColor: colors.border, // o el color que quieras
            marginBottom: spacing.md,
          }}
        />
        <View
          style={[
            styles.selectWrap,
            { backgroundColor: selectBackground },
          ]}
        >
          <Pressable style={styles.selectButton} onPress={() => setShowPositionPicker(true)}>
            <Text
              style={{
                color: selectTextColor,
                fontFamily: typography.families.nougat,
                fontSize: selectFontSize,
                textAlign: 'center',
                flex: 1,
              }}
              numberOfLines={1}
            >
              {positionLabel}
            </Text>
            <Ionicons name="chevron-down" size={20} color={selectTextColor} />
          </Pressable>
        </View>
        {errors.position ? <Text style={[styles.error, { color: colors.danger }]}>{errors.position}</Text> : null}
        {loadingPositions ? <Text style={[styles.hint, { color: colors.textMuted }]}>Cargando posiciones...</Text> : null}
        {positionsError ? <Text style={[styles.error, { color: colors.danger }]}>{positionsError}</Text> : null}
        <View
          style={{
            height: 1,
            backgroundColor: colors.transparent, // o el color que quieras
            marginBottom: spacing.md,
          }}
        />
        <View
          style={[
            styles.selectWrap,
            { backgroundColor: selectBackground },
          ]}
        >
          <Pressable style={styles.selectButton} onPress={() => setShowTeamPicker(true)}>
            <Text
              style={{
                color: selectTextColor,
                fontFamily: typography.families.nougat,
                fontSize: selectFontSize,
                textAlign: 'center',
                flex: 1,
              }}
              numberOfLines={1}
            >
              {teamLabel}
            </Text>
            <Ionicons name="chevron-down" size={20} color={selectTextColor} />
          </Pressable>
        </View>
        {errors.team ? <Text style={[styles.error, { color: colors.danger }]}>{errors.team}</Text> : null}
        {loadingTeams ? <Text style={[styles.hint, { color: colors.textMuted }]}>Cargando equipos...</Text> : null}
        {serverError ? <Text style={[styles.error, { color: colors.danger }]}>{serverError}</Text> : null}
        <View
          style={{
            height: 1,
            backgroundColor: colors.border, // o el color que quieras
            marginTop: spacing.md/2,
            marginBottom: spacing.md,
          }}
        />
        <AppInput
          label="Email"
          value={form.email}
          onChangeText={(email) => setForm((prev) => ({ ...prev, email }))}
          keyboardType="email-address"
          placeholder="Introduce un email válido"
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
                          ? strength <= 2
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
            <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale, marginTop: 4 }}>
              Fortaleza: {strength <= 2 ? 'Debil' : strength <= 3 ? 'Media' : 'Fuerte'}
            </Text>
            
            <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale, marginTop: 8, marginBottom: 4 }}>
              Requisitos:
            </Text>
            <View style={{ marginLeft: spacing.sm }}>
              <Text style={{ color: /[a-zA-Z]/.test(form.password) ? colors.success : colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
                {/[a-zA-Z]/.test(form.password) ? '✓' : '○'} Al menos una letra
              </Text>
              <Text style={{ color: /\d/.test(form.password) ? colors.success : colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
                {/\d/.test(form.password) ? '✓' : '○'} Al menos un numero
              </Text>
              <Text style={{ color: /[$&%_#]/.test(form.password) ? colors.success : colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
                {/[$&%_#]/.test(form.password) ? '✓' : '○'} Al menos un caracter especial ($, &, %, _, #)
              </Text>
              <Text style={{ color: form.password.length >= 8 ? colors.success : colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
                {form.password.length >= 8 ? '✓' : '○'} Minimo 8 caracteres ({form.password.length}/8)
              </Text>
            </View>
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

        <AppButton 
          title="REGISTRARSE" 
          onPress={submit} 
          loading={registering} 
          strokeText={true}
          strokeColor="black"
           strokeWidth={3}
          style={{ marginTop: spacing.md, paddingVertical: spacing.lg/1.5 }} 
          textStyle={{ color: colors.white, fontSize: typography.sizes.xxl * textScale, fontFamily: typography.families.nougat }}
        />

        <View style={styles.footer}>
          <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale }}>Ya tienes cuenta?</Text>
          <Pressable onPress={() => navigation.navigate('Login')}>
            <Text style={{ color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm * textScale }}>
              Inicia sesion
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={showPositionPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPositionPicker(false)}
      >
        <Pressable
          style={[styles.selectOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowPositionPicker(false)}
        >
          <View style={[styles.selectMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Pressable
              onPress={() => {
                setForm((prev) => ({ ...prev, position: '' }));
                setShowPositionPicker(false);
              }}
              style={[styles.selectMenuItem, form.position === '' && { backgroundColor: `${colors.primary}22` }]}
            >
              <Text
                style={{
                  color: selectTextColor,
                  fontFamily: typography.families.nougat,
                  fontSize: selectItemFontSize,
                  textAlign: 'center',
                }}
              >
                Selecciona tu posicion
              </Text>
            </Pressable>
            {positionOptions.map((position) => (
              <Pressable
                key={position}
                onPress={() => {
                  setForm((prev) => ({ ...prev, position }));
                  setShowPositionPicker(false);
                }}
                style={[styles.selectMenuItem, position === form.position && { backgroundColor: `${colors.primary}22` }]}
              >
                <Text
                  style={{
                    color: selectTextColor,
                    fontFamily: typography.families.nougat,
                    fontSize: selectItemFontSize,
                    textAlign: 'center',
                  }}
                >
                  {position}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showTeamPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTeamPicker(false)}
      >
        <Pressable
          style={[styles.selectOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowTeamPicker(false)}
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 0 }}>
            <FlatList
              style={{ width: '100%' }}
              data={fullTeamList}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setForm((prev) => ({ ...prev, team: item.name }));
                    setShowTeamPicker(false);
                  }}
                  style={{
                    width: Dimensions.get('window').width / 2,
                    height: Dimensions.get('window').height / 3,
                    padding: 8,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceElevated,
                      borderWidth: item.name === form.team ? 3 : 1,
                      borderColor: item.name === form.team ? colors.primary : colors.border,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 8,
                    }}
                  >
                    {item.escudoUrl ? (
                      <Image
                        source={{ uri: item.escudoUrl }}
                        style={{
                          width: '70%',
                          height: '50%',
                          resizeMode: 'contain',
                          marginBottom: 12,
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: '80%',
                          height: '60%',
                          backgroundColor: colors.border,
                          borderRadius: 8,
                          marginBottom: 8,
                        }}
                      />
                    )}
                    <Text
                      style={{
                        color: selectTextColor,
                        fontSize: 16,
                        fontWeight: '700',
                        textAlign: 'center',
                        flexWrap: 'wrap',
                        fontFamily: typography.families.nougat,
                      }}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                  </View>
                </Pressable>
              )}
              keyExtractor={(item, index) => item.id || index.toString()}
              horizontal
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24 }}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={true}
            />
          </View>
        </Pressable>
      </Modal>
      <LoadingOverlay visible={registering || photoLoading} />
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
  selectWrap: {
    borderWidth: 0,
    borderRadius: 18,
    marginBottom: 8,
    minHeight: 52,
    justifyContent: 'center',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  selectOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  selectMenu: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  selectMenuItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  selectMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  selectMenuItemHalf: {
    width: '33.3333%',
  },
  error: {
    fontSize: 12,
    marginBottom: 12,
  },
  hint: {
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
  photoPicker: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    overflow: 'hidden',
    minHeight: 136,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  photoPreview: {
    width: '100%',
    height: 120,
    borderRadius: 12,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
