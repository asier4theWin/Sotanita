import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import SearchScreen from '../screens/SearchScreen';
import MyVideosScreen from '../screens/MyVideosScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isLoggedIn, guestMode, authLoading } = useAuth();
  const isAuthenticated = isLoggedIn || guestMode;

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#FFD600" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="MainTabs" component={TabNavigator} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="MyVideos" component={MyVideosScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}
