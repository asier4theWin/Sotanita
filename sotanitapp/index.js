import { registerRootComponent } from 'expo';
import { Dimensions, Platform } from 'react-native';
import * as Device from 'expo-device';

import App from './App';

function getDeviceLabel() {
	const deviceType = Device.deviceType;

	if (Platform.OS === 'web') {
		const { width } = Dimensions.get('window');

		if (width >= 900) {
			return 'ORDENADOR';
		}

		if (width >= 600) {
			return 'TABLET';
		}

		return 'MOVIL';
	}

	switch (deviceType) {
		case Device.DeviceType.TABLET:
			return 'TABLET';
		case Device.DeviceType.PHONE:
			return 'MOVIL';
		case Device.DeviceType.DESKTOP:
			return 'ORDENADOR';
		default:
			return `DISPOSITIVO_${String(deviceType ?? 'DESCONOCIDO')}`;
	}
}

console.log(`DISPOSITIVO INICIAL: ${getDeviceLabel()}`);

if (Platform.OS === 'web' && typeof window !== 'undefined') {
	window.addEventListener('load', () => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch((error) => {
				console.warn('Service worker registration failed:', error);
			});
		}
	});
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
