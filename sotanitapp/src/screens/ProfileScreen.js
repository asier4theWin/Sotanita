import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import useResetScrollOnFocus from '../hooks/useResetScrollOnFocus';
import { getTeamNames } from '../api/backend';
import ScreenGradient from '../components/ScreenGradient';
import FifaCard from '../components/FifaCard';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import VideoTile from '../components/VideoTile';
import { likedVideos, positions, userVideos } from '../utils/mockData';

export default function ProfileScreen({ navigation, hideProfileCard = false }) {
  const { user, isLoggedIn, guestMode, logout, updateUser } = useAuth();
  const { colors, spacing, typography, textScale } = useAppTheme();

  const [activeTab, setActiveTab] = useState('uploaded');
  const [editingField, setEditingField] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [focusedPicker, setFocusedPicker] = useState(false);
  const [teamOptions, setTeamOptions] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [editError, setEditError] = useState('');
  const scrollRef = useRef(null);

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

  const openEdit = async (field) => {
    setEditError('');
    setEditingField(field);
    setTempValue(profile[field] || '');

    if (field === 'team') {
      setLoadingTeams(true);
      try {
        const names = await getTeamNames();
        setTeamOptions(names);
      } catch (error) {
        console.error('Error cargando equipos:', error);
      } finally {
        setLoadingTeams(false);
      }
    }
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

    if (editingField === 'username' && normalizedValue.length < 3) {
      setEditError('El nombre de usuario debe tener al menos 3 caracteres');
      return;
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

  return (
    <ScreenGradient>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={[styles.topActions, { padding: spacing.md }]}> 
          <Pressable onPress={() => navigation.navigate('Settings')} style={[styles.iconBtn, { backgroundColor: colors.surface }]}> 
            <Ionicons name="settings" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', minHeight: 246 }}>
          {!hideProfileCard ? (
            <FifaCard
              username={profile.username}
              team={profile.team}
              position={profile.position}
              rating={requireLogin ? 0 : 88}
              backgroundUrl={profile.teamImageUrl}
              frameUrl={profile.frameImageId}
              size="xlarge"
              disableShadow
            />
          ) : null}
        </View>

        {requireLogin ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
            <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>Inicia sesion para ver tu perfil completo</Text>
            <AppButton title="Iniciar sesion" onPress={logout} style={{ width: 200 }} />
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.sm }}>
              {[
                { key: 'username', label: 'Usuario' },
                { key: 'team', label: 'Equipo' },
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
            </View>

            <Pressable
              onPress={logout}
              style={[styles.logoutButton, { backgroundColor: `${colors.danger}22`, borderColor: `${colors.danger}77`, marginTop: spacing.lg }]}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: typography.weights.semibold }}>Cerrar sesion</Text>
            </Pressable>

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
              {(activeTab === 'uploaded' ? userVideos : likedVideos).map((video, index) => (
                <VideoTile
                  key={video.id}
                  item={video}
                  variant={activeTab === 'uploaded' ? 'uploaded' : 'liked'}
                  onPress={() => {
                    if (activeTab === 'uploaded') {
                      navigation.navigate('MyVideos', { videoIndex: index });
                    }
                  }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={Boolean(editingField)} transparent animationType="fade" onRequestClose={() => setEditingField(null)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setEditingField(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg * textScale, fontWeight: typography.weights.bold, marginBottom: spacing.md }}>
              Editar {editingField === 'username' ? 'usuario' : editingField === 'team' ? 'equipo' : 'posicion'}
            </Text>

            {editingField === 'username' ? (
              <>
                <AppInput value={tempValue} onChangeText={setTempValue} placeholder="Nuevo nombre" />
                {editError ? <Text style={[styles.error, { color: colors.danger }]}>{editError}</Text> : null}
              </>
            ) : editingField === 'team' ? (
              <>
                <View
                  style={[
                    styles.pickerWrap,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: focusedPicker ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Picker
                    selectedValue={tempValue}
                    style={{ color: colors.text, backgroundColor: 'transparent' }}
                    itemStyle={{ color: colors.text }}
                    dropdownIconColor={colors.text}
                    onFocus={() => setFocusedPicker(true)}
                    onBlur={() => setFocusedPicker(false)}
                    onValueChange={setTempValue}
                  >
                    <Picker.Item label="Selecciona un equipo" value="" color={colors.textMuted} />
                    {teamOptions.map((team) => (
                      <Picker.Item key={team} label={team} value={team} color="#111827" />
                    ))}
                  </Picker>
                </View>
                {loadingTeams ? <Text style={[styles.hint, { color: colors.textMuted }]}>Cargando equipos...</Text> : null}
              </>
            ) : (
              <View
                style={[
                  styles.pickerWrap,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: focusedPicker ? colors.primary : colors.border,
                  },
                ]}
              >
                <Picker
                  selectedValue={tempValue}
                  style={{ color: colors.text, backgroundColor: 'transparent' }}
                  itemStyle={{ color: colors.text }}
                  dropdownIconColor={colors.text}
                  onFocus={() => setFocusedPicker(true)}
                  onBlur={() => setFocusedPicker(false)}
                  onValueChange={setTempValue}
                >
                  {positions.map((item) => (
                    <Picker.Item key={item} label={item} value={item} color="#111827" />
                  ))}
                </Picker>
              </View>
            )}

            {editingField !== 'username' && editError ? <Text style={[styles.error, { color: colors.danger }]}>{editError}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setEditingField(null)} style={{ flex: 1 }} />
              <AppButton title="Guardar" onPress={saveEdit} loading={savingChanges} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  topActions: {
    alignItems: 'flex-end',
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
    justifyContent: 'space-between',
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
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 12,
    minHeight: 52,
    justifyContent: 'center',
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
});
