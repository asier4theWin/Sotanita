import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Alert, ActivityIndicator, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../hooks/useAppTheme';
import useResetScrollOnFocus from '../hooks/useResetScrollOnFocus';
import ScreenGradient from '../components/ScreenGradient';
import Header from '../components/Header';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';
import { uploadVideo } from '../api/backend';
import { useAuth } from '../context/AuthContext';

const uploadCategories = ['Goles', 'Regates', 'Asistencias', 'Paradas', 'Faltas', 'Jugadas', 'Entrenamientos'];

export default function UploadScreen({ navigation }) {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const { user } = useAuth();

  const [videoFile, setVideoFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [focusedPicker, setFocusedPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useResetScrollOnFocus(scrollRef);

  const pickVideo = async () => {
    // Pedir permisos si es necesario
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Permisos requeridos", "Necesitas permisos para acceder a tus archivos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], // Actualizado para quitar el warning de deprecación
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setVideoFile({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
        name: asset.uri.split('/').pop() || 'archivo_subido',
        // En web, Expo ImagePicker expone un objeto `file` literal que FormData necesita
        file: Platform.OS === 'web' ? asset.file : undefined, 
      });
    }
  };

  const checkAndUpload = async () => {
    if (!videoFile || !title || !category) {
      Alert.alert('Error', 'Debes completar el título, categoría y seleccionar un archivo.');
      return;
    }

    if (!user || !user.email) {
      Alert.alert('Error', 'Necesitas iniciar sesión para subir un video.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      
      // Adjuntar archivo (diferente en Web vs Móvil Nativo)
      if (Platform.OS === 'web' && videoFile.file) {
        formData.append('file', videoFile.file);
      } else {
        formData.append('file', {
          uri: videoFile.uri,
          type: videoFile.type,
          name: videoFile.name,
        });
      }

      // Adjuntar datos adicionales
      formData.append('title', title);
      formData.append('category', category);
      formData.append('description', description);
      formData.append('id_usuario', user.email);

      await uploadVideo(formData);

      Alert.alert('Éxito', 'Video subido con éxito a Cloudinary y base de datos.');
      
      // Limpiar formulario y navigar
      setVideoFile(null);
      setTitle('');
      setCategory('');
      setDescription('');
      navigation.navigate('Home');

    } catch (error) {
      console.error(error);
      Alert.alert('Error de Subida', error.message || 'Ocurrió un problema en el proceso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenGradient>
      <Header
        title="Subir video"
        titleSize="xxl"
        titleScale={1.3}
        titleStyle={{ transform: [{ scaleY: 1.12 }], letterSpacing: -0.8 }}
        onBack={() => navigation.goBack()}
      />

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 30 }}>
        <View style={{ marginBottom: spacing.lg }}>
          {!videoFile ? (
            <Pressable
              onPress={pickVideo}
              style={[styles.uploadArea, { backgroundColor: colors.surface, borderColor: colors.border }]}
              disabled={loading}
            >
              <Ionicons name="cloud-upload-outline" size={70} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: typography.weights.semibold, marginTop: spacing.sm }}>Selecciona un archivo</Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.xs * textScale }}>Videos/Imágenes (max. 60 seg)</Text>
            </Pressable>
          ) : (
            <View style={[styles.previewArea, { backgroundColor: colors.surface }]}> 
              <View style={[styles.mockVideo, { backgroundColor: `${colors.secondary}22` }]}>
                {videoFile.type === 'video/mp4' ? (
                  <Ionicons name="play" size={68} color={colors.textMuted} />
                ) : (
                  <Ionicons name="image" size={68} color={colors.textMuted} />
                )}
              </View>
              <Pressable onPress={() => setVideoFile(null)} style={[styles.removeButton, { backgroundColor: `${colors.black}88` }]} disabled={loading}> 
                <Ionicons name="close" size={20} color={colors.white} />
              </Pressable>
              <View style={[styles.fileTag, { backgroundColor: `${colors.black}88` }]}> 
                <Text style={{ color: colors.white, fontWeight: typography.weights.semibold }} numberOfLines={1}>{videoFile.name}</Text>
              </View>
            </View>
          )}
        </View>

        <AppInput
          label="Título"
          value={title}
          onChangeText={setTitle}
          placeholder="Describe tu jugada..."
        />

        <Text style={{ color: colors.text, fontWeight: typography.weights.semibold, marginBottom: spacing.xs }}>Categoría</Text>
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
            <Picker.Item label="Selecciona una categoría" value="" color={colors.textMuted} />
            {uploadCategories.map((item) => (
              <Picker.Item key={item} label={item} value={item} color="#111827" />
            ))}
          </Picker>
        </View>

        <AppInput
          label="Descripción (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Añade más detalles sobre tu video..."
          multiline
          numberOfLines={4}
        />

        {loading ? (
           <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : (
          <AppButton
            title="Publicar video"
            onPress={checkAndUpload}
            disabled={!videoFile || !title || !category}
            style={{ marginTop: spacing.md }}
          />
        )}
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
