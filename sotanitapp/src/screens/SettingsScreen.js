import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { useAppTheme } from '../hooks/useAppTheme';
import useResetScrollOnFocus from '../hooks/useResetScrollOnFocus';
import ScreenGradient from '../components/ScreenGradient';
import Header from '../components/Header';

export default function SettingsScreen({ navigation }) {
  const { highContrast, darkMode, fontSize, toggleHighContrast, toggleDarkMode, setFontSize } = useSettings();
  const { colors, spacing, typography, textScale } = useAppTheme();
  const scrollRef = useRef(null);

  useResetScrollOnFocus(scrollRef);

  return (
    <ScreenGradient>
      <Header title="Configuracion" onBack={() => navigation.goBack()} />

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 30 }}>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={{ color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale, marginBottom: spacing.md }}>
            Apariencia
          </Text>

          <View style={[styles.row, { borderBottomColor: colors.border }]}> 
            <View style={styles.rowLeft}>
              <Ionicons name={darkMode ? 'moon' : 'sunny'} size={22} color={colors.primary} />
              <View>
                <Text style={{ color: colors.text, fontWeight: typography.weights.semibold }}>Modo {darkMode ? 'Oscuro' : 'Claro'}</Text>
                <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
                  {darkMode ? 'Tema oscuro activado' : 'Tema claro activado'}
                </Text>
              </View>
            </View>
            <Switch value={darkMode} onValueChange={toggleDarkMode} thumbColor={colors.white} trackColor={{ false: '#6B7280', true: colors.primary }} />
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="contrast" size={22} color={colors.primary} />
              <View>
                <Text style={{ color: colors.text, fontWeight: typography.weights.semibold }}>{highContrast ? 'Alto' : 'Bajo'} Contraste</Text>
                <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>
                  {highContrast ? 'Contraste aumentado' : 'Contraste normal'}
                </Text>
              </View>
            </View>
            <Switch value={highContrast} onValueChange={toggleHighContrast} thumbColor={colors.white} trackColor={{ false: '#6B7280', true: colors.primary }} />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <View style={[styles.rowLeft, { marginBottom: spacing.md }]}>
            <Ionicons name="text" size={22} color={colors.primary} />
            <View>
              <Text style={{ color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>
                Tamano de Letra
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>Ajusta el tamano del texto</Text>
            </View>
          </View>

          <View style={[styles.previewBox, { backgroundColor: colors.surfaceElevated }]}> 
            <Text style={{ color: colors.text, fontSize, fontWeight: typography.weights.semibold }}>Texto de ejemplo</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize * 0.875, marginTop: 8 }}>Asi se vera el texto en la aplicacion</Text>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <View style={styles.labelsRow}>
              <Text style={{ color: colors.textMuted }}>Pequeno</Text>
              <Text style={{ color: colors.primary, fontWeight: typography.weights.semibold }}>{fontSize}px</Text>
              <Text style={{ color: colors.textMuted }}>Grande</Text>
            </View>

            <Slider
              minimumValue={12}
              maximumValue={24}
              value={fontSize}
              step={1}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              onValueChange={setFontSize}
            />

            <View style={styles.presetRow}>
              {[12, 16, 20].map((size) => (
                <Pressable
                  key={size}
                  onPress={() => setFontSize(size)}
                  style={[
                    styles.preset,
                    {
                      backgroundColor: fontSize === size ? colors.primary : colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: fontSize === size ? colors.black : colors.textMuted,
                      fontWeight: fontSize === size ? typography.weights.bold : typography.weights.medium,
                    }}
                  >
                    {size === 12 ? 'Pequeno' : size === 16 ? 'Normal' : 'Grande'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
            Los cambios se aplican inmediatamente en toda la aplicacion
          </Text>
        </View>
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewBox: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  preset: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
