import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import ScreenGradient from '../components/ScreenGradient';
import Header from '../components/Header';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';

const uploadCategories = ['Goles', 'Regates', 'Asistencias', 'Paradas', 'Faltas', 'Jugadas', 'Entrenamientos'];

export default function UploadScreen({ navigation }) {
  const { colors, spacing, typography, textScale } = useAppTheme();

  const [videoFile, setVideoFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [focusedPicker, setFocusedPicker] = useState(false);

  return (
    <ScreenGradient>
      <Header title="Subir video" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 30 }}>
        <View style={{ marginBottom: spacing.lg }}>
          {!videoFile ? (
            <Pressable
              onPress={() => setVideoFile('video_mock.mp4')}
              style={[styles.uploadArea, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="cloud-upload-outline" size={70} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: typography.weights.semibold, marginTop: spacing.sm }}>Selecciona un video</Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>MP4, MOV (max. 60 seg)</Text>
            </Pressable>
          ) : (
            <View style={[styles.previewArea, { backgroundColor: colors.surface }]}> 
              <View style={[styles.mockVideo, { backgroundColor: `${colors.secondary}22` }]}>
                <Ionicons name="play" size={68} color={colors.textMuted} />
              </View>
              <Pressable onPress={() => setVideoFile(null)} style={[styles.removeButton, { backgroundColor: `${colors.black}88` }]}> 
                <Ionicons name="close" size={20} color={colors.white} />
              </Pressable>
              <View style={[styles.fileTag, { backgroundColor: `${colors.black}88` }]}> 
                <Text style={{ color: colors.white, fontWeight: typography.weights.semibold }}>{videoFile}</Text>
              </View>
            </View>
          )}
        </View>

        <AppInput
          label="Titulo"
          value={title}
          onChangeText={setTitle}
          placeholder="Describe tu jugada..."
        />

        <Text style={{ color: colors.text, fontWeight: typography.weights.semibold, marginBottom: spacing.xs }}>Categoria</Text>
        <View style={[styles.pickerWrap, { backgroundColor: colors.surface, borderColor: focusedPicker ? colors.primary : colors.border }]}> 
          <Picker
            selectedValue={category}
            style={{ color: colors.text, backgroundColor: 'transparent' }}
            itemStyle={{ color: colors.text }}
            dropdownIconColor={colors.text}
            onFocus={() => setFocusedPicker(true)}
            onBlur={() => setFocusedPicker(false)}
            onValueChange={setCategory}
          >
            <Picker.Item label="Selecciona una categoria" value="" color={colors.textMuted} />
            {uploadCategories.map((item) => (
              <Picker.Item key={item} label={item} value={item} color="#111827" />
            ))}
          </Picker>
        </View>

        <AppInput
          label="Descripcion (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Anade mas detalles sobre tu video..."
          multiline
          numberOfLines={4}
        />

        <AppButton
          title="Publicar video"
          onPress={() => navigation.navigate('Home')}
          disabled={!videoFile || !title || !category}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  uploadArea: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewArea: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  mockVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTag: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
});
