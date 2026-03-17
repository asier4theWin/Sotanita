import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';
import FifaCard from '../components/FifaCard';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import VideoTile from '../components/VideoTile';
import { likedVideos, positions, teams, userVideos } from '../utils/mockData';

export default function ProfileScreen({ navigation }) {
  const { user, isLoggedIn, guestMode, logout, updateUser } = useAuth();
  const { colors, spacing, typography, textScale } = useAppTheme();

  const [activeTab, setActiveTab] = useState('uploaded');
  const [editingField, setEditingField] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [focusedPicker, setFocusedPicker] = useState(false);

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

  const openEdit = (field) => {
    setEditingField(field);
    setTempValue(profile[field] || '');
  };

  const saveEdit = () => {
    if (editingField && tempValue) {
      updateUser({ [editingField]: tempValue });
    }
    setEditingField(null);
  };

  const requireLogin = !isLoggedIn && guestMode;

  return (
    <ScreenGradient>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={[styles.topActions, { padding: spacing.md }]}> 
          <Pressable onPress={() => navigation.navigate('Settings')} style={[styles.iconBtn, { backgroundColor: colors.surface }]}> 
            <Ionicons name="settings" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={{ alignItems: 'center' }}>
          <FifaCard
            username={profile.username}
            team={profile.team}
            position={profile.position}
            rating={requireLogin ? 0 : 88}
            size="large"
            style={{ shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 }}
          />
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
              <AppInput value={tempValue} onChangeText={setTempValue} placeholder="Nuevo nombre" />
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
                  {(editingField === 'team' ? teams : positions).map((item) => (
                    <Picker.Item key={item} label={item} value={item} color="#111827" />
                  ))}
                </Picker>
              </View>
            )}

            <View style={styles.modalActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setEditingField(null)} style={{ flex: 1 }} />
              <AppButton title="Guardar" onPress={saveEdit} style={{ flex: 1 }} />
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
});
