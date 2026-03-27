import { useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import UploadScreen from '../screens/UploadScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import { notifications } from '../utils/mockData';
import NotificationItem from '../components/NotificationItem';
import FifaCard from '../components/FifaCard';

const Tab = createBottomTabNavigator();
const tabCardBackground = require('../../assets/fondo.png');
const tabCardFrame = require('../../assets/marco.png');
const closeButtonDark = require('../../assets/botonX/dark.png');
const closeButtonLight = require('../../assets/botonX/light.png');
const closeButtonContrast = require('../../assets/botonX/contrast.png');
const TAB_BAR_HEIGHT = 68;
const TAB_BAR_VERTICAL_PADDING = 8;
const TAB_CARD_TRANSLATE_Y = -34;
const TAB_CARD_SIZE = { width: 84, height: 120 };
const PROFILE_CARD_SIZE = { width: 174, height: 246 };
const PROFILE_CARD_TARGET_TOP = 74;

export default function TabNavigator() {
  const { user, isLoggedIn } = useAuth();
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileTransition, setShowProfileTransition] = useState(false);
  const [isProfileAnimating, setIsProfileAnimating] = useState(false);
  const profileTransition = useRef(new Animated.Value(0)).current;
  const profileCloseButtonSource = highContrast
    ? closeButtonContrast
    : darkMode
      ? closeButtonDark
      : closeButtonLight;

  const profilePreview = {
    username: isLoggedIn && user?.username ? user.username : 'Invitado',
    team: isLoggedIn && user?.team ? user.team : 'Sin equipo',
    position: isLoggedIn && user?.position ? user.position : '---',
    rating: isLoggedIn ? 88 : 0,
  };

  const startAnimationFromProfileTab = (navigation) => {
    if (isProfileAnimating) {
      return;
    }

    setIsProfileAnimating(true);
    setShowProfileTransition(true);
    profileTransition.setValue(0);

    Animated.sequence([
      Animated.timing(profileTransition, {
        toValue: 0.92,
        duration: 620,
        easing: Easing.bezier(0.2, 0.9, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(profileTransition, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.back(1.8)),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      setShowProfileTransition(false);
      setIsProfileAnimating(false);
      if (finished) {
        navigation.navigate('Profile');
      }
    });
  };

  const startAnimationToFeedFromProfile = (navigation) => {
    if (isProfileAnimating) {
      return;
    }

    setIsProfileAnimating(true);
    setShowProfileTransition(true);
    profileTransition.setValue(1);

    Animated.sequence([
      Animated.timing(profileTransition, {
        toValue: 0.08,
        duration: 620,
        easing: Easing.bezier(0.2, 0.9, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(profileTransition, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.back(1.8)),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      setShowProfileTransition(false);
      setIsProfileAnimating(false);
      if (finished) {
        navigation.navigate('Home');
      }
    });
  };

  const initialScale = TAB_CARD_SIZE.width / PROFILE_CARD_SIZE.width;
  const tabStartLeft = width / 2 - TAB_CARD_SIZE.width / 2;
  const tabContentHeight = TAB_BAR_HEIGHT - TAB_BAR_VERTICAL_PADDING * 2;
  const tabStartTop =
    height -
    TAB_BAR_HEIGHT +
    TAB_BAR_VERTICAL_PADDING +
    (tabContentHeight - TAB_CARD_SIZE.height) / 2 +
    TAB_CARD_TRANSLATE_Y;
  const startX = tabStartLeft - (PROFILE_CARD_SIZE.width * (1 - initialScale)) / 2;
  const startY = tabStartTop - (PROFILE_CARD_SIZE.height * (1 - initialScale)) / 2;
  const targetX = width / 2 - PROFILE_CARD_SIZE.width / 2;
  const targetY = PROFILE_CARD_TARGET_TOP;
  const moveToX = targetX - startX;
  const moveToY = targetY - startY;

  const transitionTranslateY = profileTransition.interpolate({
    inputRange: [0, 0.3, 0.68, 0.9, 1],
    outputRange: [0, moveToY * 0.18, moveToY * 0.66, moveToY * 0.95, moveToY],
  });

  const transitionTranslateX = profileTransition.interpolate({
    inputRange: [0, 0.3, 0.62, 0.9, 1],
    outputRange: [0, moveToX - 28, moveToX + 24, moveToX - 6, moveToX],
  });

  const transitionScale = profileTransition.interpolate({
    inputRange: [0, 0.55, 0.9, 1],
    outputRange: [initialScale, initialScale * 1.22, 1.04, 1],
  });

  const transitionRotateZ = profileTransition.interpolate({
    inputRange: [0, 0.64, 1],
    outputRange: ['0deg', '540deg', '720deg'],
  });

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            height: TAB_BAR_HEIGHT,
            paddingTop: 8,
            paddingBottom: 8,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            overflow: 'visible',
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, focused }) => {
            if (route.name === 'Profile') {
              if (isProfileAnimating) {
                return <View style={[styles.profileCardTab, { opacity: 0 }]} />;
              }

              if (focused) {
                return (
                  <View style={styles.profileCardTab}>
                    <Image source={profileCloseButtonSource} style={styles.profileCardAsset} resizeMode="stretch" />
                  </View>
                );
              }

              return (
                <View
                  style={[
                    styles.profileCardTab,
                    { opacity: focused ? 1 : 0.78 },
                  ]}
                >
                  <Image source={tabCardBackground} style={styles.profileCardAsset} resizeMode="stretch" />
                  <Image source={tabCardFrame} style={styles.profileCardAsset} resizeMode="stretch" />
                </View>
              );
            }

            let icon = 'ellipse';

            if (route.name === 'Home') icon = focused ? 'home' : 'home-outline';
            if (route.name === 'Ranking') icon = focused ? 'trophy' : 'trophy-outline';
            if (route.name === 'Notifications') icon = focused ? 'notifications' : 'notifications-outline';
            if (route.name === 'Upload') icon = focused ? 'add-circle' : 'add-circle-outline';

            return <Ionicons name={icon} color={color} size={24} />;
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          listeners={{ tabPress: () => setShowNotifications(false) }}
        />
        <Tab.Screen
          name="Ranking"
          component={RankingScreen}
          listeners={{ tabPress: () => setShowNotifications(false) }}
        />
        <Tab.Screen
          name="Profile"
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              setShowNotifications(false);

              const state = navigation.getState();
              const activeRoute = state.routes[state.index]?.name;
              const isOnProfile = activeRoute === 'Profile';

              if (!isOnProfile) {
                e.preventDefault();
                startAnimationFromProfileTab(navigation);
                return;
              }

              e.preventDefault();
              startAnimationToFeedFromProfile(navigation);
            },
          })}
        >
          {(screenProps) => (
            <ProfileScreen
              {...screenProps}
              hideProfileCard={showProfileTransition && isProfileAnimating}
            />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="Notifications"
          component={NotificationsScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setShowNotifications((prev) => !prev);
            },
          }}
        />
        <Tab.Screen
          name="Upload"
          component={UploadScreen}
          listeners={{ tabPress: () => setShowNotifications(false) }}
        />
      </Tab.Navigator>

      {showProfileTransition ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.profileTransitionCard,
            {
              left: startX,
              top: startY,
              transform: [
                { translateX: transitionTranslateX },
                { translateY: transitionTranslateY },
                { rotateZ: transitionRotateZ },
                { scale: transitionScale },
              ],
            },
          ]}
        >
          <FifaCard
            size="xlarge"
            username={profilePreview.username}
            team={profilePreview.team}
            position={profilePreview.position}
            rating={profilePreview.rating}
            disableShadow
          />
        </Animated.View>
      ) : null}

      <Modal
        visible={showNotifications}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowNotifications(false)}>
          <Pressable
            style={[
              styles.bottomSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}> 
              <Text
                style={{
                  color: colors.text,
                  fontWeight: typography.weights.bold,
                  fontSize: typography.sizes.md * textScale,
                }}
              >
                Notificaciones
              </Text>
              <Pressable onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <FlatList
              data={notifications}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: spacing.sm, paddingBottom: spacing.md }}
              renderItem={({ item }) => <NotificationItem item={item} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    width: '100%',
    maxHeight: '72%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: {
    minHeight: 48,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  profileCardTab: {
    width: 84,
    height: 120,
    borderRadius: 9,
    overflow: 'hidden',
    transform: [{ translateY: TAB_CARD_TRANSLATE_Y }],
  },
  profileTransitionCard: {
    position: 'absolute',
    zIndex: 999,
  },
  profileCardAsset: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
