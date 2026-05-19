import { useEffect, useRef, useState, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, Alert } from 'react-native';
import { io } from 'socket.io-client';
import { getScreenComponent } from '../screens/index';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import { getAllNotifications, getUnreadNotificationsCount, markNotificationsRead, deleteAllNotifications } from '../api/backend';
import NotificationItem from '../components/NotificationItem';
import FifaCard from '../components/FifaCard';
import LoadingOverlay from '../components/LoadingOverlay';

const Stack = createNativeStackNavigator();
const closeButtonDark = require('../../assets/botonX/dark.png');
const closeButtonLight = require('../../assets/botonX/light.png');
const closeButtonContrast = require('../../assets/botonX/contrast.png');

const DESKTOP_NAV_HEIGHT = 100;

function formatRelativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'ahora';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'ahora';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function DesktopNavBar({ navigation }) {
  const { user, isLoggedIn } = useAuth();
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();
  const { width, height } = useWindowDimensions();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [modalNotifications, setModalNotifications] = useState([]);
  const [loadingModalNotifications, setLoadingModalNotifications] = useState(false);
  const [loadingDeleteNotifications, setLoadingDeleteNotifications] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Hover states for nav items
  const [hoverItem, setHoverItem] = useState(null);
  const homeScale = useRef(new Animated.Value(1)).current;
  const rankingScale = useRef(new Animated.Value(1)).current;
  const profileScale = useRef(new Animated.Value(1)).current;
  const uploadScale = useRef(new Animated.Value(1)).current;
  const notificationsScale = useRef(new Animated.Value(1)).current;
  const settingsScale = useRef(new Animated.Value(1)).current;
  
  const notificationsAnim = useRef(new Animated.Value(0)).current;
  const socketRef = useRef(null);

  // Handle hover animations
  useEffect(() => {
    const animateScale = (scaleAnim, isHovered) => {
      Animated.timing(scaleAnim, {
        toValue: isHovered ? 1.12 : 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    const animateIconScale = (scaleAnim, isHovered) => {
      Animated.timing(scaleAnim, {
        toValue: isHovered ? 1.2 : 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    if (hoverItem === 'home') animateScale(homeScale, true);
    else animateScale(homeScale, false);

    if (hoverItem === 'ranking') animateScale(rankingScale, true);
    else animateScale(rankingScale, false);

    if (hoverItem === 'profile') animateScale(profileScale, true);
    else animateScale(profileScale, false);

    if (hoverItem === 'upload') animateScale(uploadScale, true);
    else animateScale(uploadScale, false);

    if (hoverItem === 'notifications') animateIconScale(notificationsScale, true);
    else animateIconScale(notificationsScale, false);

    if (hoverItem === 'settings') animateIconScale(settingsScale, true);
    else animateIconScale(settingsScale, false);
  }, [hoverItem, homeScale, rankingScale, profileScale, uploadScale, notificationsScale, settingsScale]);

  const profileCloseButtonSource = highContrast
    ? closeButtonContrast
    : darkMode
      ? closeButtonDark
      : closeButtonLight;
  
  // Navigation bar colors - light mode: green background, white text
  const navBarBackground = darkMode ? colors.surface : colors.primary;
  const navTextColor = darkMode ? colors.white : colors.white;
  const navIconColor = darkMode ? colors.white : colors.white;
  const navHoverColor = darkMode ? colors.primary : '#1e40af'; // Verde (oscuro) -> Azul oscuro (claro)
  const navHoverColorContrast = highContrast ? '#22c55e' : navHoverColor;

  const navigateToMainTab = useCallback((screenName) => {
    setShowNotifications(false);
    navigation.navigate('MainTabs', { screen: screenName });
  }, [navigation]);

  const profilePreview = {
    username: isLoggedIn && user?.username ? user.username : 'Invitado',
    team: isLoggedIn && user?.team ? user.team : 'Sin equipo',
    position: isLoggedIn && user?.position ? user.position : '---',
    rating: isLoggedIn ? 88 : 0,
    photoUrl: isLoggedIn ? user?.profileImageUrl : null,
    backgroundUrl: isLoggedIn ? user?.teamImageUrl : null,
    frameUrl: isLoggedIn ? user?.frameImageId : null,
    frameId: isLoggedIn ? user?.frameId : null,
  };
  const visibleNotifications = modalNotifications.filter(Boolean);

  // Cargar notificaciones iniciales y conteo
  useEffect(() => {
    const loadUnreadCount = async () => {
      if (!isLoggedIn || !user?.email) {
        setUnreadCount(0);
        return;
      }

      try {
        const email = String(user.email).trim().toLowerCase();
        const count = await getUnreadNotificationsCount(email);
        setUnreadCount(count);
      } catch (error) {
        console.error('Error cargando conteo de notificaciones:', error);
      }
    };

    loadUnreadCount();
  }, [isLoggedIn, user?.email]);

  // Conectar a socket para actualizaciones en tiempo real (misma logica que en mobile)
  useEffect(() => {
    if (!isLoggedIn || !user?.email) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setUnreadCount(0);
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

      socketRef.current.on('connect', () => {
        socketRef.current.emit('userConnect', String(user.email).trim().toLowerCase());
      });

      socketRef.current.on('newNotification', () => {
        setUnreadCount((prev) => prev + 1);
      });

      socketRef.current.on('error', (error) => {
        console.error('❌ Error en WebSocket:', error);
      });
    }

    const loadInitialCount = async () => {
      try {
        const count = await getUnreadNotificationsCount(String(user.email).trim().toLowerCase());
        setUnreadCount(count);
      } catch (error) {
        console.error('Error cargando conteo de notificaciones:', error);
      }
    };

    loadInitialCount();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isLoggedIn, user?.email]);

  // Cargar notificaciones del modal
  useEffect(() => {
    const loadModalNotifications = async () => {
      if (!showNotifications) return;

      if (!isLoggedIn || !user?.email) {
        setModalNotifications([]);
        return;
      }

      setLoadingModalNotifications(true);
      try {
        const currentUserEmail = String(user.email).trim().toLowerCase();
        const data = await getAllNotifications(currentUserEmail, 50, 50);
        const filtered = data.filter(
          (item) => String(item.recipientUserId || '').trim().toLowerCase() === currentUserEmail
        );

        const mapped = filtered.map((item) => ({
          id: item.id,
          user: String(item.actorUsername || item.actorUserId || 'Usuario').split('@')[0],
          actorUsername: item.actorUsername,
          action: 'le ha dado me gusta a tu video',
          videoId: item.videoId,
          videoTitle: item.videoTitle || '',
          time: formatRelativeTime(item.createdAt),
          actorProfileImageUrl: item.actorProfileImageUrl,
          actorTeamName: item.actorTeamName,
          actorTeamImageUrl: item.actorTeamImageUrl,
          actorFrameImageId: item.actorFrameImageId,
        }));

        setModalNotifications(mapped);
        await markNotificationsRead(currentUserEmail);
        setUnreadCount(0);
      } catch (error) {
        console.error('Error cargando notificaciones del modal:', error);
        setModalNotifications([]);
      } finally {
        setLoadingModalNotifications(false);
      }
    };

    loadModalNotifications();
  }, [showNotifications, isLoggedIn, user?.email]);

  // Animación de apertura/cierre del modal de notificaciones
  useEffect(() => {
    if (showNotifications) {
      setShowNotificationsModal(true);
      notificationsAnim.setValue(0);
      Animated.timing(notificationsAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (showNotificationsModal) {
      Animated.timing(notificationsAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShowNotificationsModal(false);
        }
      });
    }
  }, [notificationsAnim, showNotifications, showNotificationsModal]);

  const handleDeleteAllNotifications = useCallback(async () => {
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Error', 'Debes estar logueado para eliminar notificaciones.');
      return;
    }

    setLoadingDeleteNotifications(true);
    try {
      await deleteAllNotifications(user.email);
      setModalNotifications([]);
      setUnreadCount(0);
      setShowDeleteConfirmModal(false);
      Alert.alert('Éxito', 'Notificaciones eliminadas correctamente.');
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudieron eliminar las notificaciones.');
    } finally {
      setLoadingDeleteNotifications(false);
    }
  }, [isLoggedIn, user?.email]);

  const cardSize = { width: 60, height: 86 };
  const navItemGap = width > 1400 ? 80 : width > 1000 ? 60 : 40;

  return (
    <View style={styles.navBarContainer}>
      <View style={[styles.navBar, { backgroundColor: navBarBackground, height: DESKTOP_NAV_HEIGHT, paddingHorizontal: spacing.lg }]}>
        <View style={[styles.navContent, { gap: navItemGap * 1.35 }]}>
          {/* INICIO */}
          <Pressable
            onPress={() => navigateToMainTab('Home')}
            onMouseEnter={() => setHoverItem('home')}
            onMouseLeave={() => setHoverItem(null)}
            style={({ pressed }) => [
              styles.navItem,
              { 
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Animated.Text
              style={{
                color: hoverItem === 'home' ? (highContrast ? '#22c55e' : (darkMode ? colors.primary : '#1e40af')) : navTextColor,
                fontSize: typography.sizes.xl * textScale * 1.08,
                fontWeight: typography.weights.bold,
                fontFamily: typography.families.nougat,
                transform: [{ scale: homeScale }],
              }}
            >
              INICIO
            </Animated.Text>
          </Pressable>

          {/* RANKING */}
          <Pressable
            onPress={() => navigateToMainTab('Ranking')}
            onMouseEnter={() => setHoverItem('ranking')}
            onMouseLeave={() => setHoverItem(null)}
            style={({ pressed }) => [
              styles.navItem,
              { 
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Animated.Text
              style={{
                color: hoverItem === 'ranking' ? (highContrast ? '#22c55e' : (darkMode ? colors.primary : '#1e40af')) : navTextColor,
                fontSize: typography.sizes.xl * textScale * 1.08,
                fontWeight: typography.weights.bold,
                fontFamily: typography.families.nougat,
                transform: [{ scale: rankingScale }],
              }}
            >
              RANKING
            </Animated.Text>
          </Pressable>

          {/* PROFILE CARD (CENTER) */}
          <Animated.View
            style={{
              transform: [{ scale: profileScale }],
            }}
          >
            <Pressable
              onPress={() => navigateToMainTab('Profile')}
              onMouseEnter={() => setHoverItem('profile')}
              onMouseLeave={() => setHoverItem(null)}
              style={({ pressed }) => [
                styles.profileCardWrapper,
                {
                  opacity: pressed ? 0.8 : 1,
                  width: cardSize.width,
                  height: cardSize.height,
                },
              ]}
            >
              <FifaCard
                username={profilePreview.username}
                team={profilePreview.team}
                position={profilePreview.position}
                rating={profilePreview.rating}
                photoUrl={profilePreview.photoUrl}
                backgroundUrl={profilePreview.backgroundUrl}
                frameUrl={profilePreview.frameUrl}
                frameId={profilePreview.frameId}
                size="small"
              />
            </Pressable>
          </Animated.View>

          {/* PUBLICAR */}
          <Pressable
            onPress={() => navigateToMainTab('Upload')}
            onMouseEnter={() => setHoverItem('upload')}
            onMouseLeave={() => setHoverItem(null)}
            style={({ pressed }) => [
              styles.navItem,
              { 
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Animated.Text
              style={{
                color: hoverItem === 'upload' ? (highContrast ? '#22c55e' : (darkMode ? colors.primary : '#1e40af')) : navTextColor,
                fontSize: typography.sizes.xl * textScale * 1.08,
                fontWeight: typography.weights.bold,
                fontFamily: typography.families.nougat,
                transform: [{ scale: uploadScale }],
              }}
            >
              PUBLICAR
            </Animated.Text>
          </Pressable>

          {/* NOTIFICACIONES + SETTINGS */}
          <View style={[styles.navItem, { flexDirection: 'row', gap: spacing.md }]}>
            {/* NOTIFICACIONES */}
            <Animated.View
              style={{
                transform: [{ scale: notificationsScale }],
              }}
            >
              <Pressable
                onPress={() => setShowNotifications(!showNotifications)}
                onMouseEnter={() => setHoverItem('notifications')}
                onMouseLeave={() => setHoverItem(null)}
                style={({ pressed }) => [
                  styles.iconButton,
                  { 
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons 
                  name="notifications" 
                  size={24} 
                  color={hoverItem === 'notifications' ? (highContrast ? '#22c55e' : (darkMode ? colors.primary : '#1e40af')) : navIconColor}
                />
                {unreadCount > 0 && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.white,
                        fontSize: typography.sizes.xs * textScale,
                        fontWeight: typography.weights.bold,
                        textAlign: 'center',
                      }}
                      numberOfLines={1}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>

            {/* SETTINGS */}
            <Animated.View
              style={{
                transform: [{ scale: settingsScale }],
              }}
            >
              <Pressable
                onPress={() => navigation.navigate('Settings')}
                onMouseEnter={() => setHoverItem('settings')}
                onMouseLeave={() => setHoverItem(null)}
                style={({ pressed }) => [
                  styles.iconButton,
                  { 
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons 
                  name="settings" 
                  size={24} 
                  color={hoverItem === 'settings' ? (highContrast ? '#22c55e' : (darkMode ? colors.primary : '#1e40af')) : navIconColor}
                />
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </View>

      {/* NOTIFICACIONES MODAL */}
      {showNotificationsModal && (
        <Modal transparent animationType="fade" visible={showNotificationsModal}>
          <Pressable
            style={[styles.notificationsOverlay, { backgroundColor: colors.overlay }]}
            onPress={() => setShowNotifications(false)}
          >
            <Animated.View
              style={[
                styles.notificationsPanel,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: notificationsAnim,
                  height: Math.min(height * 0.78, 700),
                  transform: [
                    {
                      translateY: notificationsAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-20, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={[styles.notificationsHeader, { paddingHorizontal: spacing.md }]}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: typography.sizes.lg * textScale,
                    fontWeight: typography.weights.bold,
                  }}
                >
                  Notificaciones
                </Text>
                <Pressable
                  onPress={() => setShowNotifications(false)}
                  style={styles.closeButton}
                >
                  <Image source={profileCloseButtonSource} style={styles.closeButtonImage} />
                </Pressable>
              </View>

              {loadingModalNotifications ? (
                <View style={styles.loadingContainer}>
                  <Text style={{ color: colors.textMuted }}>Cargando notificaciones...</Text>
                </View>
              ) : visibleNotifications.length === 0 ? (
                <View style={styles.loadingContainer}>
                  <Text style={{ color: colors.textMuted }}>No tienes notificaciones nuevas</Text>
                </View>
              ) : (
                <FlatList
                  data={visibleNotifications}
                  renderItem={({ item }) => (
                    <NotificationItem
                      item={item}
                      onOpenVideo={(videoId) => {
                        if (!videoId) return;
                        setShowNotifications(false);
                        navigation.navigate('MainTabs', {
                          screen: 'Home',
                          params: { videoId },
                        });
                      }}
                    />
                  )}
                  keyExtractor={(item) => String(item.id)}
                  style={styles.notificationsContent}
                  contentContainerStyle={{ paddingHorizontal: spacing.md }}
                  scrollEventThrottle={16}
                />
              )}

              {visibleNotifications.length > 0 && (
                <Pressable
                  onPress={() => setShowDeleteConfirmModal(true)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    {
                      backgroundColor: colors.danger,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.white,
                      fontSize: typography.sizes.sm * textScale,
                      fontWeight: typography.weights.bold,
                    }}
                  >
                    Eliminar todas
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          </Pressable>

          <Modal
            visible={showDeleteConfirmModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowDeleteConfirmModal(false)}
          >
            <Pressable
              style={[styles.confirmOverlay, { backgroundColor: colors.overlay }]}
              onPress={() => setShowDeleteConfirmModal(false)}
            >
              <View style={[styles.confirmBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: typography.sizes.md * textScale,
                    fontWeight: typography.weights.bold,
                    marginBottom: spacing.md,
                  }}
                >
                  Eliminar todas las notificaciones?
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setShowDeleteConfirmModal(false)}
                    style={({ pressed }) => [
                      styles.confirmButton,
                      {
                        backgroundColor: colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteAllNotifications}
                    disabled={loadingDeleteNotifications}
                    style={({ pressed }) => [
                      styles.confirmButton,
                      {
                        backgroundColor: colors.danger,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.white }}>
                      {loadingDeleteNotifications ? 'Eliminando...' : 'Eliminar'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Modal>
        </Modal>
      )}

      <LoadingOverlay visible={loadingDeleteNotifications} />
    </View>
  );
}

export default function DesktopNavigatorScreen({ navigation }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <DesktopNavBar navigation={navigation} />
      <View style={{ flex: 1, marginTop: DESKTOP_NAV_HEIGHT }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={getScreenComponent('HomeScreen')} />
          <Stack.Screen name="Ranking" component={getScreenComponent('RankingScreen')} />
          <Stack.Screen name="Profile" component={getScreenComponent('ProfileScreen')} />
          <Stack.Screen name="Upload" component={getScreenComponent('UploadScreen')} />
          <Stack.Screen name="Settings" component={getScreenComponent('SettingsScreen')} />
        </Stack.Navigator>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  navBar: {
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationsOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 0,
  },
  notificationsPanel: {
    width: '90%',
    maxWidth: 500,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonImage: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    margin: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationsContent: {
    flex: 1,
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBox: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
});
