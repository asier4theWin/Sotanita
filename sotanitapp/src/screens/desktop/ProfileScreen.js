import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, View, FlatList, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import useResetScrollOnFocus from '../../hooks/useResetScrollOnFocus';
import { getAllVideos, getPositions, getTeamById, getTeamNames, getTeamsListWithEscudo, isUsernameAvailable } from '../../api/backend';
import ScreenGradient from '../../components/ScreenGradient';
import FifaCard from '../../components/FifaCard';
import AppButton from '../../components/AppButton';
import AppInput from '../../components/AppInput';
import VideoTile from '../../components/VideoTile';
import LoadingOverlay from '../../components/LoadingOverlay';
import ForoEquipo from './ForoEquipo';
import Pressable from '../../components/A11yPressable';

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

function normalizeRemoteUri(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('file:')) return raw;
  return null;
}

const FRAME_TIERS = [
  { minPoints: 0, label: 'Bronce' },
  { minPoints: 10, label: 'Plata' },
  { minPoints: 50, label: 'Oro' },
  { minPoints: 100, label: 'Platino' },
  { minPoints: 250, label: null },
];

function getRankProgress(points = 0) {
  const totalPoints = Number(points) || 0;
  const tierIndex = FRAME_TIERS.reduce((accumulator, tier, index) => (
    totalPoints >= tier.minPoints ? index : accumulator
  ), 0);
  const currentTier = FRAME_TIERS[tierIndex] || FRAME_TIERS[0];
  const nextTier = FRAME_TIERS[tierIndex + 1] || null;
  const nextMin = nextTier?.minPoints ?? currentTier.minPoints;
  const progress = nextTier && nextMin > currentTier.minPoints
    ? Math.min(1, Math.max(0, (totalPoints - currentTier.minPoints) / (nextMin - currentTier.minPoints)))
    : 1;

  return {
    points: totalPoints,
    currentTier,
    nextTier,
    progress,
    pointsToNext: nextTier ? Math.max(0, nextMin - totalPoints) : 0,
  };
}

export default function ProfileScreen({ navigation, hideProfileCard = false }) {
  const { user, isLoggedIn, guestMode, logout, updateUser, refreshUser } = useAuth();
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState('uploaded');
  const [editingField, setEditingField] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [teamOptions, setTeamOptions] = useState([]);
  const [fullTeamList, setFullTeamList] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [positionOptions, setPositionOptions] = useState([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [editError, setEditError] = useState('');
  const [positionsError, setPositionsError] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamEscudoUrl, setTeamEscudoUrl] = useState('');
  const [teamAnimationActive, setTeamAnimationActive] = useState(false);
  const [showLoadingGifOverlay, setShowLoadingGifOverlay] = useState(false);
  const [showCrestOverlay, setShowCrestOverlay] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [likedVideos, setLikedVideos] = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);

  const selectFontSize = 26 * textScale;
  const selectItemFontSize = 22 * textScale;
  const selectTeamItemFontSize = 16 * textScale;
  const selectTextColor = highContrast ? colors.primary : darkMode ? colors.white : colors.text;
  const selectBackground = `${colors.surface}99`;
  const teamColumnHighlight = highContrast ? `${colors.primary}22` : darkMode ? `${colors.white}08` : `${colors.black}08`;
  const positionLabel = tempValue || 'Selecciona una posicion';
  const teamLabel = tempValue || 'Selecciona un equipo';
  const teamChangeIcon = highContrast
    ? require('../../../assets/perfil/teamChange_contrast.png')
    : darkMode
      ? require('../../../assets/perfil/teamChange_dark.png')
      : require('../../../assets/perfil/teamChange_light.png');
  const teamImageSource = useMemo(() => {
    const normalizedTeamImage = normalizeRemoteUri(teamEscudoUrl || user?.teamImageUrl);
    return normalizedTeamImage ? { uri: normalizedTeamImage } : null;
  }, [teamEscudoUrl, user?.teamImageUrl]);
  const isBlocking = photoLoading || savingChanges;

  useResetScrollOnFocus(scrollRef);

  const profile = useMemo(() => {
    if (isLoggedIn && user) {
      return user;
    }
    return {
      username: 'Invitado',
      team: 'Sin equipo',
      position: '---',
      email: '',
    };
  }, [isLoggedIn, user]);

  useEffect(() => {
    let cancelled = false;

    const loadTeamEscudo = async () => {
      if (!isLoggedIn || !user?.teamId) {
        setTeamEscudoUrl('');
        return;
      }

      try {
        const team = await getTeamById(user.teamId);
        if (!cancelled) {
          setTeamEscudoUrl(team?.escudoUrl || team?.imageUrl || '');
        }
      } catch (error) {
        console.error('Error cargando escudo del equipo:', error);
        if (!cancelled) {
          setTeamEscudoUrl(user?.teamImageUrl || '');
        }
      }
    };

    loadTeamEscudo();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.teamId, user?.teamImageUrl]);

  const openEdit = async (field) => {
    setEditError('');
    setEditingField(field);
    setTempValue(profile[field] || '');

    if (field === 'team') {
      setLoadingTeams(true);
      try {
        const teams = await getTeamsListWithEscudo();
        setFullTeamList(teams);
        setTeamOptions(teams.map(t => t.name));
      } catch (error) {
        console.error('Error cargando equipos:', error);
      } finally {
        setLoadingTeams(false);
      }
    }

    if (field === 'position') {
      setLoadingPositions(true);
      setPositionsError('');
      try {
        const data = await getPositions();
        setPositionOptions(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error cargando posiciones:', error);
        setPositionsError(error.message || 'No se pudieron cargar las posiciones');
      } finally {
        setLoadingPositions(false);
      }
    }
  };

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

  const handleChangePhoto = async () => {
    setPhotoLoading(true);
    try {
      const processed = await pickAndProcessPhoto();
      if (!processed) {
        return;
      }
      await updateUser({ profileImageUrl: processed.dataUrl });
      Alert.alert('Éxito', 'Foto de perfil actualizada');
      setShowPhotoModal(false);
    } catch (error) {
      const message = error.message || 'No se pudo cambiar la foto';
      Alert.alert('Error', message);
      console.error('Error cambiando foto:', error);
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleCardPress = () => {
    if (!isLoggedIn) {
      return;
    }
    setShowPhotoModal(true);
  };

  const handleViewTeamPress = () => {
    if (!isLoggedIn) {
      Alert.alert('Acceso restringido', 'Debes iniciar sesion para ver el foro del equipo.');
      return;
    }

    if (!user?.teamId) {
      Alert.alert('Sin equipo', 'No tienes un equipo asignado.');
      return;
    }

    // Start the intentional animation: loading gif 1.5s, then crest 1s, then navigate
    setTeamAnimationActive(true);
    setShowLoadingGifOverlay(true);

    setTimeout(() => {
      setShowLoadingGifOverlay(false);
      setShowCrestOverlay(true);

      setTimeout(() => {
        setShowCrestOverlay(false);
        setTeamAnimationActive(false);
        // Navigate to ForoEquipo
        navigation.navigate('ForoEquipo', { teamId: user.teamId });
      }, 1000);
    }, 1500);
  };

  const handleChangeTeamPress = () => {
    if (!isLoggedIn) {
      return;
    }
    openEdit('team');
  };

  const saveEdit = async () => {
    if (!editingField) {
      return;
    }

    const normalizedValue = String(tempValue || '').trim();

    if (!normalizedValue) {
      setEditError('El valor no puede estar vacio');
      return;
    }

    if (editingField === 'username') {
      if (normalizedValue.length < 3) {
        setEditError('El nombre de usuario debe tener al menos 3 caracteres');
        return;
      }

      if (normalizedValue.length > 10) {
        setEditError('El nombre de usuario no puede superar 10 caracteres');
        return;
      }

      if (!/^[a-zA-Z0-9.\-]+$/.test(normalizedValue)) {
        setEditError('Solo letras, numeros, "." y "-"');
        return;
      }

      if (!/[a-zA-Z]/.test(normalizedValue)) {
        setEditError('El nombre de usuario debe contener al menos una letra');
        return;
      }

      // Check availability on server
      try {
        const avail = await isUsernameAvailable(normalizedValue);
        if (avail && avail.available === false) {
          setEditError('Ese nombre de usuario no está disponible');
          return;
        }
      } catch (err) {
        // If check fails, continue and let server-side update handle duplicates
      }
    }

    setSavingChanges(true);
    setEditError('');
    try {
      await updateUser({ [editingField]: normalizedValue });
      setEditingField(null);
    } catch (error) {
      setEditError(error.message || 'No se pudo guardar el cambio');
      console.error('Error guardando cambios:', error);
    } finally {
      setSavingChanges(false);
    }
  };

  const requireLogin = !isLoggedIn && guestMode;

  const loadProfileVideos = useCallback(async (emailOverride) => {
    const currentEmail = String(emailOverride || user?.email || '').trim().toLowerCase();

    if (!isLoggedIn || !currentEmail) {
      setUploadedVideos([]);
      setLikedVideos([]);
      return;
    }

    setLoadingVideos(true);
    try {
      const allVideos = await getAllVideos(20, 50);

      const normalized = allVideos.map((video) => {
        const uploader = String(video.id_usuario || '').trim().toLowerCase();
        const likedBy = Array.isArray(video.likedBy)
          ? video.likedBy.map((value) => String(value).trim().toLowerCase())
          : [];

        return {
          ...video,
          user: uploader ? uploader.split('@')[0] : 'usuario',
          uploader,
          hasLiked: likedBy.includes(currentEmail),
        };
      });

      setUploadedVideos(normalized.filter((video) => video.uploader === currentEmail));
      setLikedVideos(normalized.filter((video) => video.hasLiked));
    } catch (error) {
      console.error('Error cargando videos del perfil:', error);
    } finally {
      setLoadingVideos(false);
    }
  }, [isLoggedIn, user?.email]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const syncProfile = async () => {
        if (isLoggedIn && refreshUser) {
          try {
            const freshUser = await refreshUser();
            if (!cancelled) {
              await loadProfileVideos(freshUser?.email || user?.email);
            }
            return;
          } catch (error) {
            console.error('Error sincronizando perfil:', error);
          }
        }

        await loadProfileVideos();
      };

      syncProfile();

      return () => {
        cancelled = true;
      };
    }, [isLoggedIn, loadProfileVideos, refreshUser, user?.email])
  );

  // WebSocket para actualizar puntos en tiempo real
  useEffect(() => {
    if (!isLoggedIn || !user?.email) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000')
      .replace(/\/+$/, '')
      .replace(/\/api$/, '');

    if (!socketRef.current) {
      socketRef.current = io(apiBaseUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      // Escuchar actualizaciones de puntos
      socketRef.current.on('userPointsUpdated', (data) => {
        const userEmail = String(user?.email || '').trim().toLowerCase();
        const dataEmail = String(data?.email || '').trim().toLowerCase();
        
        if (dataEmail === userEmail) {
          console.log('🏆 Puntos actualizados:', data);
          // Actualizar el usuario en el contexto de autenticación
          if (refreshUser) {
            refreshUser();
          }
        }
      });

      socketRef.current.on('error', (error) => {
        console.error('❌ Error en WebSocket de perfil:', error);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isLoggedIn, user?.email, refreshUser]);

  const videosToShow = activeTab === 'uploaded' ? uploadedVideos : likedVideos;
  const forumTeamId = isLoggedIn ? user?.teamId : null;
  const desktopMainSectionWidth = (windowWidth * 2) / 3;
  const desktopSelectModalWidth = Math.max(320, Math.round(desktopMainSectionWidth * 0.9));
  const desktopPhotoModalWidth = Math.round(windowWidth * 0.35);
  const desktopTeamPickerItemWidth = Math.max(150, Math.min(240, Math.round((desktopSelectModalWidth - 48) / 3)));
  const desktopTeamPickerItemHeight = Math.round(desktopTeamPickerItemWidth * 1.18);

  return (
    <ScreenGradient>
      <View style={styles.desktopLayout}>
        <View style={styles.desktopLeftPane}>
          <ScrollView ref={scrollRef} contentContainerStyle={[styles.desktopScrollContent, { paddingBottom: spacing.xl * 2 }]}> 
            <View style={styles.desktopScrollInner}>
              <View style={[styles.desktopHeroRow, { gap: spacing.lg }]}> 
              {!hideProfileCard ? (
                <View style={styles.profileCardWrap}>
                  <FifaCard
                    username={profile.username}
                    team={profile.team}
                    position={profile.position}
                    rating={requireLogin ? 0 : 88}
                    photoUrl={profile.profileImageUrl}
                    backgroundUrl={profile.teamImageUrl}
                    frameUrl={profile.frameImageId}
                    frameId={profile.frameId}
                    size="xlarge"
                    disableShadow
                    onPress={handleCardPress}
                  />
                  {isLoggedIn ? (
                    <Pressable
                      style={[styles.editPhotoButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => setShowPhotoModal(true)}
                      disabled={photoLoading}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.desktopEditColumn, { gap: spacing.sm }]}> 
                {[
                  { key: 'username', label: 'Usuario' },
                  { key: 'position', label: 'Posicion' },
                ].map((field) => (
                  <View key={field.key} style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                    <View>
                      <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>{field.label}</Text>
                      <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.md * textScale }}>
                        {profile[field.key]}
                      </Text>
                    </View>
                    <Pressable onPress={() => openEdit(field.key)}>
                      <Ionicons name="create-outline" size={20} color={colors.primary} />
                    </Pressable>
                  </View>
                ))}

                {!requireLogin ? (
                  <Pressable
                    onPress={logout}
                    style={({ pressed }) => [
                      styles.desktopLogoutButton,
                      {
                        backgroundColor: `${colors.danger}22`,
                        borderColor: `${colors.danger}77`,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                    <Text style={{ color: colors.danger, fontWeight: typography.weights.semibold }}>Cerrar sesion</Text>
                  </Pressable>
                ) : null}
              </View>
              </View>

            {requireLogin ? (
              <View style={{ alignItems: 'flex-start', marginTop: spacing.xl }}>
                <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>Inicia sesion para ver tu perfil completo</Text>
                <AppButton title="Iniciar sesion" onPress={logout} style={{ width: 200 }} />
              </View>
            ) : (
              <>
                <View style={[styles.desktopPointsRow, { gap: spacing.md, marginTop: spacing.xl }]}> 
                  <View style={[styles.pointsCard, { flex: 3, backgroundColor: colors.surface, borderColor: colors.border }]}> 
                    <View style={styles.pointsHeader}>
                      <View>
                        <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>Puntos</Text>
                        <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.xl * textScale }}>
                          {getRankProgress(profile.points).points}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>Rango</Text>
                        <Text style={{ color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.md * textScale }}>
                          {getRankProgress(profile.points).currentTier?.label || 'Pendiente'}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.progressTrack, { backgroundColor: `${colors.border}80` }]}> 
                      <View style={[styles.progressFill, { width: `${Math.round(getRankProgress(profile.points).progress * 100)}%`, backgroundColor: colors.primary }]} />
                    </View>

                    <Text style={{ color: colors.textMuted, marginTop: spacing.sm, fontSize: typography.sizes.sm * textScale }}>
                      {getRankProgress(profile.points).nextTier?.label
                        ? `Te faltan ${getRankProgress(profile.points).pointsToNext} puntos para desbloquear ${getRankProgress(profile.points).nextTier.label}.`
                        : 'Has desbloqueado el rango más alto preparado. El siguiente marco queda pendiente de definir.'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleChangeTeamPress}
                    accessibilityLabel="Cambiar equipo"
                    style={({ pressed }) => [
                      styles.desktopTeamChangeButton,
                      {
                        flex: 1,
                        backgroundColor: darkMode ? colors.surfaceElevated : colors.surface,
                        borderColor: highContrast ? colors.primary : colors.border,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <View style={styles.desktopTeamChangeIconWrap}>
                      <Image
                        source={teamChangeIcon}
                        style={styles.teamChangeIcon}
                        resizeMode="contain"
                        accessibilityLabel="Icono cambiar equipo"
                      />
                    </View>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: typography.families.nougat,
                        fontSize: (typography.sizes.md + 8) * textScale,
                        textAlign: 'center',
                      }}
                      numberOfLines={2}
                    >
                      Cambiar de equipo
                    </Text>
                  </Pressable>
                </View>

                <View style={[styles.tabs, { borderBottomColor: colors.border, marginTop: spacing.xl }]}> 
                  <Pressable style={styles.tabBtn} onPress={() => setActiveTab('uploaded')}>
                    <Text style={{ color: activeTab === 'uploaded' ? colors.primary : colors.textMuted, fontWeight: typography.weights.semibold }}>
                      Tus videos
                    </Text>
                    {activeTab === 'uploaded' ? <View style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
                  </Pressable>
                  <Pressable style={styles.tabBtn} onPress={() => setActiveTab('liked')}>
                    <Text style={{ color: activeTab === 'liked' ? colors.primary : colors.textMuted, fontWeight: typography.weights.semibold }}>
                      Videos que te gustan
                    </Text>
                    {activeTab === 'liked' ? <View style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
                  </Pressable>
                </View>

                <View style={[styles.gridWrap, { paddingHorizontal: spacing.md }]}> 
                  {videosToShow.map((video) => (
                    <VideoTile
                      key={video.id}
                      item={video}
                      variant={activeTab === 'uploaded' ? 'uploaded' : 'liked'}
                      onPress={() => {
                        navigation.navigate('Home', {
                          videoId: video.id,
                        });
                      }}
                    />
                  ))}
                  {!loadingVideos && videosToShow.length === 0 ? (
                    <View style={[styles.emptyVideosWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
                      <Text style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>
                        {activeTab === 'uploaded' ? 'Aun no has subido videos' : 'Aun no has dado like a ningun video'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}
            </View>
          </ScrollView>
        </View>

        <View style={[styles.desktopForumPane, { borderLeftColor: colors.border }]}> 
          {forumTeamId ? (
            <ForoEquipo route={{ params: { teamId: forumTeamId } }} navigation={navigation} />
          ) : (
            <View style={[styles.desktopForumEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Text style={{ color: colors.textMuted, fontWeight: typography.weights.semibold, textAlign: 'center' }}>
                Asigna un equipo para ver el foro en esta columna.
              </Text>
            </View>
          )}
        </View>
      </View>

      <Modal visible={Boolean(editingField)} transparent animationType="fade" onRequestClose={() => setEditingField(null)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setEditingField(null)}>
          <Pressable style={[styles.selectModalCard, { width: desktopSelectModalWidth, backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg * textScale, fontWeight: typography.weights.bold, marginBottom: spacing.md }}>
              Editar {editingField === 'username' ? 'usuario' : editingField === 'team' ? 'equipo' : 'posicion'}
            </Text>

            {editingField === 'username' ? (
              <>
                <AppInput value={tempValue} onChangeText={setTempValue} placeholder="Nuevo nombre" />
                <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale, marginTop: spacing.sm }}>
                  3-10 caracteres. Solo letras, numeros, "." y "-". Debe contener al menos una letra.
                </Text>
                {editError ? <Text style={[styles.error, { color: colors.danger }]}>{editError}</Text> : null}
              </>
            ) : editingField === 'team' ? (
              <>
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
                {loadingTeams ? <Text style={[styles.hint, { color: colors.textMuted }]}>Cargando equipos...</Text> : null}
              </>
            ) : (
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
            )}

            {editingField !== 'username' && editError ? <Text style={[styles.error, { color: colors.danger }]}>{editError}</Text> : null}
            {editingField === 'position' && loadingPositions ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>Cargando posiciones...</Text>
            ) : null}
            {editingField === 'position' && positionsError ? (
              <Text style={[styles.error, { color: colors.danger }]}>{positionsError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setEditingField(null)} style={{ flex: 1 }} />
              <AppButton title="Guardar" onPress={saveEdit} loading={savingChanges} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Team animation overlays: loading gif then crest */}
      <LoadingOverlay visible={showLoadingGifOverlay} />

      <Modal visible={showCrestOverlay} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => {}}>
          <View style={[styles.crestOverlayCard, { backgroundColor: 'transparent' }]}> 
            {teamEscudoUrl ? (
              <Image
                source={{ uri: teamEscudoUrl }}
                style={styles.crestBig}
                resizeMode="contain"
                accessibilityLabel="Escudo del equipo"
              />
            ) : (
              <Ionicons name="shield-outline" size={120} color={colors.primary} />
            )}
          </View>
        </Pressable>
      </Modal>

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
          <View style={[styles.selectModalCard, { width: desktopSelectModalWidth, backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Pressable
              onPress={() => {
                setTempValue('');
                setShowPositionPicker(false);
              }}
              style={[styles.selectMenuItem, tempValue === '' && { backgroundColor: `${colors.primary}22` }]}
            >
              <Text
                style={{
                  color: selectTextColor,
                  fontFamily: typography.families.nougat,
                  fontSize: selectItemFontSize,
                  textAlign: 'center',
                }}
              >
                Selecciona una posicion
              </Text>
            </Pressable>
            {positionOptions.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setTempValue(item);
                  setShowPositionPicker(false);
                }}
                style={[styles.selectMenuItem, item === tempValue && { backgroundColor: `${colors.primary}22` }]}
              >
                <Text
                  style={{
                    color: selectTextColor,
                    fontFamily: typography.families.nougat,
                    fontSize: selectItemFontSize,
                    textAlign: 'center',
                  }}
                >
                  {item}
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
          <View style={[styles.selectModalCard, { width: desktopSelectModalWidth, backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <FlatList
              style={{ width: '100%' }}
              data={fullTeamList}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setTempValue(item.name);
                    setShowTeamPicker(false);
                  }}
                  style={{
                    width: desktopTeamPickerItemWidth,
                    height: desktopTeamPickerItemHeight,
                    padding: 8,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceElevated,
                      borderWidth: item.name === tempValue ? 3 : 1,
                      borderColor: item.name === tempValue ? colors.primary : colors.border,
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
                        accessibilityLabel={`Escudo de ${item.name}`}
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
                        color: colors.text,
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
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 12 }}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={true}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showPhotoModal} transparent animationType="fade" onRequestClose={() => setShowPhotoModal(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowPhotoModal(false)}>
          <Pressable style={[styles.modalCard, { width: desktopPhotoModalWidth, backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg * textScale, fontWeight: typography.weights.bold, marginBottom: spacing.sm }}>
              Cambiar foto de perfil
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale, marginBottom: spacing.md }}>
              Selecciona una nueva foto para actualizar tu carta.
            </Text>
            <View style={styles.modalActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setShowPhotoModal(false)} style={{ flex: 1 }} />
              <AppButton title="Cambiar" onPress={handleChangePhoto} loading={photoLoading} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showTeamModal} transparent animationType="fade" onRequestClose={() => setShowTeamModal(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowTeamModal(false)}>
          <Pressable style={[styles.teamModalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg * textScale, fontWeight: typography.weights.bold, marginBottom: spacing.sm }}>
              Tu equipo actual
            </Text>
            <View style={[styles.teamModalCrestWrap, { borderColor: colors.border, backgroundColor: darkMode ? colors.surfaceElevated : `${colors.primary}10` }]}> 
              {teamImageSource ? (
                <Image
                  source={teamImageSource}
                  style={styles.teamModalCrest}
                  resizeMode="contain"
                  accessibilityLabel="Escudo del equipo"
                />
              ) : (
                <Ionicons name="shield-outline" size={88} color={colors.primary} />
              )}
            </View>
            <Text
              style={{
                color: colors.text,
                fontSize: typography.sizes.xl * textScale,
                fontFamily: typography.families.nougat,
                textAlign: 'center',
                marginBottom: spacing.xs,
              }}
              numberOfLines={2}
            >
              {profile.team || 'Sin equipo'}
            </Text>
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md }}>
              Escudo vinculado al perfil actual.
            </Text>
            <AppButton title="Cerrar" onPress={() => setShowTeamModal(false)} style={{ alignSelf: 'stretch' }} />
          </Pressable>
        </Pressable>
      </Modal>
      <LoadingOverlay visible={isBlocking} />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100%',
  },
  desktopLeftPane: {
    flex: 2,
    position: 'relative',
  },
  desktopScrollContent: {
    paddingTop: 72,
    paddingHorizontal: 0,
  },
  desktopScrollInner: {
    width: '90%',
    alignSelf: 'center',
  },
  desktopLogoutButton: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    width: '50%',
    marginTop: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  desktopHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopEditColumn: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  desktopPointsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  desktopTeamChangeButton: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 180,
  },
  desktopTeamChangeIconWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopForumPane: {
    flex: 1,
    borderLeftWidth: 1,
  },
  desktopForumEmpty: {
    flex: 1,
    margin: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '50%',
  },
  logoutButton: {
    marginHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  tabs: {
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  tabLine: {
    position: 'absolute',
    height: 3,
    borderRadius: 3,
    bottom: 0,
    left: 0,
    right: 0,
  },
  gridWrap: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    padding: 16,
  },
  teamActionsWrap: {
    flexDirection: 'row',
    gap: 12,
  },
  squareAction: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  squareActionIconWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCrest: {
    width: '100%',
    height: '100%',
  },
  teamChangeIcon: {
    width: '100%',
    height: '100%',
  },
  teamModalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 18,
  },
  teamModalCrestWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  teamModalCrest: {
    width: '82%',
    height: '82%',
  },
  selectWrap: {
    borderWidth: 0,
    borderRadius: 18,
    marginBottom: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  selectModalCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
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
    alignItems: 'center',
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
  selectMenuItemThird: {
    width: '33.3333%',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
    marginBottom: 12,
  },
  error: {
    fontSize: 12,
    marginBottom: 12,
  },
  emptyVideosWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  profileCardWrap: {
    position: 'relative',
  },
  editPhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  pointsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  progressTrack: {
    marginTop: 14,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  crestOverlayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  crestBig: {
    width: 180,
    height: 180,
    alignSelf: 'center',
  },
});
