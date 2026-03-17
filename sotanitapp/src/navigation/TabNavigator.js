import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import UploadScreen from '../screens/UploadScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useAppTheme } from '../hooks/useAppTheme';
import { notifications } from '../utils/mockData';
import NotificationItem from '../components/NotificationItem';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            height: 64,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, focused }) => {
            let icon = 'ellipse';

            if (route.name === 'Home') icon = focused ? 'home' : 'home-outline';
            if (route.name === 'Ranking') icon = focused ? 'trophy' : 'trophy-outline';
            if (route.name === 'Profile') icon = focused ? 'card' : 'card-outline';
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
          component={ProfileScreen}
          listeners={{ tabPress: () => setShowNotifications(false) }}
        />
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
});
