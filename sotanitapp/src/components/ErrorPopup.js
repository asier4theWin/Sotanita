import { Modal, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../hooks/useAppTheme';
import Pressable from './A11yPressable';

export default function ErrorPopup({ visible = false, title, message, onClose }) {
  const { typography, textScale } = useAppTheme();
  const handleClose = typeof onClose === 'function' ? onClose : () => {};

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <LinearGradient colors={['#052e16', '#166534', '#22c55e']} style={styles.popup}>
          <Text
            style={[
              styles.title,
              {
                fontSize: typography.sizes.lg * textScale,
                fontWeight: typography.weights.bold,
              },
            ]}
          >
            <Text style={styles.titleIcon}>X</Text>
            {` ${String(title || '').replace(/^X\s*/i, '')}`}
          </Text>
          <Text
            style={[
              styles.message,
              {
                fontSize: typography.sizes.sm * textScale,
              },
            ]}
          >
            {message}
          </Text>

          <Pressable onPress={handleClose} style={styles.primaryButton} accessibilityLabel="Cerrar mensaje">
            <Text style={styles.primaryButtonText}>ENTENDIDO</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  popup: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  title: {
    color: '#ECFDF5',
    textAlign: 'center',
  },
  titleIcon: {
    color: '#EF4444',
  },
  message: {
    color: '#ECFDF5',
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#D1FAE5',
  },
  primaryButtonText: {
    color: '#064E3B',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
