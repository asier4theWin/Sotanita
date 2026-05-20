import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image, Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { AuthProvider } from './src/context/AuthContext';
import { SettingsProvider } from './src/context/SettingsContext';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppTheme } from './src/hooks/useAppTheme';

const webPrefix = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : null;
const APP_LANGUAGE = 'es-ES';

if (!Image.defaultProps) {
  Image.defaultProps = {};
}
if (!Image.defaultProps.accessibilityLabel) {
  Image.defaultProps.accessibilityLabel = 'Imagen';
}

const linking = {
  prefixes: ['sotanitapp://', ...(webPrefix ? [webPrefix] : [])],
  config: {
    screens: {
      Share: {
        path: 'share/:videoId?',
        parse: {
          videoId: (videoId) => videoId,
          carouselIndex: (carouselIndex) => carouselIndex,
        },
      },
      MainTabs: {
        screens: {
          Home: {
            path: 'feed/:videoId?',
            parse: {
              videoId: (videoId) => videoId,
              carouselIndex: (carouselIndex) => carouselIndex,
            },
          },
        },
      },
    },
  },
  async getInitialURL() {
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      return initialUrl;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const href = window.location.href;
      
      // Si la URL es raíz (sin /share/ o /feed/), normalizarla a /feed/
      if (href) {
        try {
          const url = new URL(href);
          const pathname = url.pathname || '/';
          
          // Si es raíz o no tiene ruta reconocida, ir a /feed/
          if (pathname === '/' || (pathname.length <= 1)) {
            return `${url.origin}/feed/`;
          }
          
          // Si ya tiene /share/ o /feed/, devolverlo como está
          if (pathname.includes('/share/') || pathname.includes('/feed/')) {
            return href;
          }
          
          // Si no es raíz pero tampoco es /share/ o /feed/, ir a /feed/
          return `${url.origin}/feed/`;
        } catch (e) {
          // Fallback si hay error parseando URL
          return `${webPrefix}/feed/`;
        }
      }
      
      return window.location.href;
    }

    return null;
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => listener(url));
    return () => subscription.remove();
  },
};

function RootNavigator() {
  const { darkMode } = useAppTheme();

  return (
    <>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <NavigationContainer linking={linking}>
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Nougat: require('./assets/Nougat-ExtraBlack.ttf'),
    Fontello: require('./assets/fontello-5f7d3d1a/font/fontello.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} accessibilityLanguage={APP_LANGUAGE}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
