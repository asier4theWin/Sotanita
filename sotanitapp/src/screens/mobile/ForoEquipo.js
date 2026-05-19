import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getTeamById, getForumMessages, postForumMessage, uploadCommentAudio, deleteForumMessage } from '../../api/backend';
import LoadingOverlay from '../../components/LoadingOverlay';
import { Audio, ResizeMode, Video, getStreamingVideoSource } from '../../utils/media';
import { Ionicons } from '@expo/vector-icons';

const isProbablyVideoUrl = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes('.mp4') || normalized.includes('.mov') || normalized.includes('.m4v');
};

const formatTime = (ms) => {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const normalizeTeamData = (value) => {
  const source = value?.teamDoc && typeof value.teamDoc === 'object' ? value.teamDoc : value;
  if (!source || typeof source !== 'object') {
    return null;
  }

  return {
    ...source,
    escudoUrl: source.teamEscudoUrl || source.escudoUrl || source.teamEscudo || source.crest || source.logoUrl || source.imageUrl || null,
    name: source.teamName || source.name || source.Name || source.title || source.nombre || source.team || '',
    lastTitle: source.lastTitle || source.last_title || source.lastTitleWon || source.ultimoTitulo || source.tituloUltimo || '',
    year: source.year || source.founded || source.lastYear || source.foundationYear || source.anio || source.ano || source.foundation || '',
    stadium: source.stadium || source.stadio || source.stadiumName || source.estadio || source.ground || source.venue || '',
  };
};

export default function ForoEquipo({ route, navigation }) {
  const { teamId } = route.params || {};
  const { user, isLoggedIn } = useAuth();
  const { colors, spacing, typography, textScale, darkMode, highContrast } = useAppTheme();

  const [team, setTeam] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const recordingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const [showLoadingBack, setShowLoadingBack] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPositionMs, setAudioPositionMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const audioRef = useRef(null);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const fetchTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const t = await getTeamById(teamId);
      const normalized = normalizeTeamData(t);
      setTeam(normalized);
    } catch (err) {
      console.error('Error cargando equipo foro', err.message);
      setTeam(null);
    }
  }, [teamId]);

  const fetchMessages = useCallback(async () => {
    if (!teamId) return;
    try {
      const msgs = await getForumMessages(teamId);
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch (err) {
      console.error('Error cargando mensajes foro', err.message);
    }
  }, [teamId]);

  const scrollRef = useRef(null);
  const scrollOnNextUpdateRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const autoScrollOnEntryRef = useRef(true);
  const entryScrollDoneRef = useRef(false);
  const isFocusedRef = useRef(false);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const socketRef = useRef(null);

  const scrollToBottom = useCallback((animated = true) => {
    try {
      scrollRef.current?.scrollToEnd({ animated });
    } catch (e) {}
    setShowScrollToBottom(false);
  }, []);

  const updateScrollButtonVisibility = useCallback((offsetY, viewportHeight, contentHeight) => {
    const distanceToBottom = contentHeight - (offsetY + viewportHeight);
    const threshold = 120;
    const isNearBottom = distanceToBottom <= threshold;
    const canScroll = contentHeight > viewportHeight + 24;
    setShowScrollToBottom(canScroll && !isNearBottom);
  }, []);

  const handleScroll = useCallback((event) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    viewportHeightRef.current = layoutMeasurement.height;
    contentHeightRef.current = contentSize.height;
    updateScrollButtonVisibility(contentOffset.y, layoutMeasurement.height, contentSize.height);
  }, [updateScrollButtonVisibility]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchTeam();
      await fetchMessages();
      initialLoadedRef.current = true;
    })();

    // Configurar WebSocket para mensajes del foro
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

      // Escuchar nuevos mensajes del foro
      socketRef.current.on('forumMessage', (data) => {
        if (data.teamId === teamId && mounted) {
          console.log('📨 Nuevo mensaje del foro:', data.message);
          setMessages((prev) => [...prev, data.message]);
        }
      });

      // Escuchar eliminación de mensajes
      socketRef.current.on('forumMessageDeleted', (data) => {
        if (data.teamId === teamId && mounted) {
          console.log('🗑️ Mensaje eliminado:', data.messageId);
          setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        }
      });

      socketRef.current.on('error', (error) => {
        console.error('❌ Error en WebSocket del foro:', error);
      });
    }

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [teamId]);

  useEffect(() => {
    if (!isFocusedRef.current || messages.length === 0) return;

    if (autoScrollOnEntryRef.current && !entryScrollDoneRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
        entryScrollDoneRef.current = true;
        autoScrollOnEntryRef.current = false;
      });
    }
  }, [messages, scrollToBottom]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      autoScrollOnEntryRef.current = true;
      entryScrollDoneRef.current = false;
      if (!isLoggedIn || !user || !teamId) {
        navigation.goBack();
      }
      return () => {
        isFocusedRef.current = false;
        setShowScrollToBottom(false);
      };
    }, [isLoggedIn, user, teamId])
  );

  const sendText = async () => {
    if (!text || !text.trim()) return;
    if (!isLoggedIn || !user) return;
    const trimmed = String(text).slice(0, 500);
    setSending(true);
    try {
      // indicate that after the update we should scroll to bottom (because current user sent)
      scrollOnNextUpdateRef.current = true;
      // Always send the email as the identifier when possible
      await postForumMessage(teamId, { user: user?.email || user?.id || user?.username || '', type: 'text', text: trimmed });
      setText('');
      await fetchMessages();
      // If we flagged to scroll (because current user sent), do it now
      try {
        if (scrollOnNextUpdateRef.current && scrollRef.current) {
          scrollRef.current.scrollToEnd({ animated: true });
        }
      } catch (e) {}
      scrollOnNextUpdateRef.current = false;
    } catch (err) {
      console.error('Error enviando mensaje foro', err.message);
    } finally {
      setSending(false);
    }
  };

  const handleStopRecording = useCallback(async () => {
    if (!teamId) return;

    if (Platform.OS === 'web') {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') return;
      setIsUploadingAudio(true);

      const stopPromise = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);

      await stopPromise;

        try {
          scrollOnNextUpdateRef.current = true;
          const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
          const file = new File([blob], 'forum-audio.webm', { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', file);
          const uploadResult = await uploadCommentAudio(formData);
          await postForumMessage(teamId, { user: user?.email || user?.id || user?.username || '', type: 'audio', audioUrl: uploadResult.url });
          await fetchMessages();
          try {
            if (scrollOnNextUpdateRef.current && scrollRef.current) {
              scrollRef.current.scrollToEnd({ animated: true });
            }
          } catch (e) {}
          scrollOnNextUpdateRef.current = false;
        } catch (err) {
        Alert.alert('Error', err.message || 'No se pudo subir el audio.');
      } finally {
        setIsUploadingAudio(false);
      }

      return;
    }

      try {
        const recording = recordingRef.current;
        if (!recording) return;
        setIsRecording(false);
        setIsUploadingAudio(true);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;

        if (!uri) {
          setIsUploadingAudio(false);
          Alert.alert('Error', 'No se pudo obtener el audio.');
          return;
        }

        const formData = new FormData();
        formData.append('file', {
          uri,
          type: 'audio/m4a',
          name: 'forum-audio.m4a',
        });

        scrollOnNextUpdateRef.current = true;
        const uploadResult = await uploadCommentAudio(formData);
        await postForumMessage(teamId, { user: user?.email || user?.id || user?.username || '', type: 'audio', audioUrl: uploadResult.url });
        await fetchMessages();
        try {
          if (scrollOnNextUpdateRef.current && scrollRef.current) {
            scrollRef.current.scrollToEnd({ animated: true });
          }
        } catch (e) {}
        scrollOnNextUpdateRef.current = false;
      } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo subir el audio.');
    } finally {
      setIsUploadingAudio(false);
    }
  }, [teamId, user, fetchMessages]);

  const handleToggleRecording = useCallback(async () => {
    if (!teamId) return;
    if (!isLoggedIn || !user) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para publicar en el foro.');
      return;
    }

    if (isUploadingAudio || isRecording) return;

    if (Platform.OS === 'web') {
      if (!navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
        Alert.alert('No disponible', 'Tu navegador no soporta grabacion de audio.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        mediaChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) mediaChunksRef.current.push(event.data);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setText('');
        setIsRecording(true);
      } catch (err) {
        Alert.alert('Permisos', 'Necesitas permisos de microfono.');
      }
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permisos requeridos', 'Necesitas permisos de microfono.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setText('');
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'No se puede iniciar la grabacion.');
    }
  }, [teamId, isLoggedIn, user, isUploadingAudio, isRecording]);

  const handleToggleAudio = useCallback(async (message) => {
    const audioUrl = message?.audioUrl || message?.audio_url;
    if (!audioUrl || audioUrl === 'pending') {
      Alert.alert('Audio no disponible', 'Este mensaje aun no tiene audio.');
      return;
    }

    try {
      if (activeAudioId === message.id && audioRef.current) {
        const status = await audioRef.current.getStatusAsync();
        if (status.isPlaying) {
          await audioRef.current.pauseAsync();
          setIsAudioPlaying(false);
        } else {
          await audioRef.current.playAsync();
          setIsAudioPlaying(true);
        }
        return;
      }

      if (audioRef.current) {
        await audioRef.current.unloadAsync();
        audioRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setAudioPositionMs(status.positionMillis || 0);
          setAudioDurationMs(status.durationMillis || 0);
          setIsAudioPlaying(Boolean(status.isPlaying));
          if (status.didJustFinish) {
            setIsAudioPlaying(false);
            setAudioPositionMs(0);
          }
        }
      );

      audioRef.current = sound;
      setActiveAudioId(message.id);
      setIsAudioPlaying(true);
    } catch (error) {
      Alert.alert('Error', 'No se pudo reproducir el audio.');
    }
  }, [activeAudioId]);

  const handleDeleteForumMessage = useCallback((message) => {
    if (!message) return;
    setPendingDeleteMessage(message);
  }, []);

  const confirmDeleteForumMessage = useCallback(async () => {
    if (!pendingDeleteMessage || !teamId) {
      setPendingDeleteMessage(null);
      return;
    }

    try {
      await deleteForumMessage(teamId, pendingDeleteMessage.id, user?.email || user?.username);
      setMessages((prev) => prev.filter((m) => m.id !== pendingDeleteMessage.id));
      setPendingDeleteMessage(null);
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo eliminar el mensaje.');
      setPendingDeleteMessage(null);
    }
  }, [pendingDeleteMessage, teamId, user?.email, user?.username]);

  const renderItem = ({ item }) => {
    const itemEmail = String(item.userEmail || '').trim().toLowerCase();
    const itemUserKey = itemEmail || String(item.user || '').trim().toLowerCase();
    const myKeys = [user?.email, user?.username, user?.id].filter(Boolean).map((v) => String(v).trim().toLowerCase());
    const isMine = itemEmail ? myKeys.includes(itemEmail) : myKeys.includes(itemUserKey);
    const containerStyle = isMine ? styles.messageRight : styles.messageLeft;
    const bubbleStyle = isMine ? { backgroundColor: colors.primary, alignSelf: 'flex-end' } : { backgroundColor: colors.surfaceElevated, alignSelf: 'flex-start' };
    const userDisplay = isMine ? 'Tú' : `@${item.user}`;
    const userTextAlign = isMine ? 'right' : 'left';

    const shareVideoId = item.share?.videoId || item.share?.video_id || item.videoId || item.video_id;
    const parsedCarouselIndex = Number.parseInt(
      String(item.share?.carouselIndex ?? item.share?.carousel_index ?? item.share?.mediaIndex ?? item.share?.media_index ?? ''),
      10
    );
    const shareMediaIndex = Number.isFinite(parsedCarouselIndex) && parsedCarouselIndex >= 0
      ? parsedCarouselIndex
      : undefined;
    const shareThumbnailUrl = item.share?.thumbnailUrl || '';
    const shareStreamUrl = isProbablyVideoUrl(shareThumbnailUrl)
      ? getStreamingVideoSource({ videoId: shareVideoId, url: shareThumbnailUrl, mediaIndex: shareMediaIndex })
      : shareThumbnailUrl;

    return (
      <View style={[containerStyle]}>
        <Text style={{ color: colors.textMuted, marginBottom: 4, textAlign: userTextAlign }}>{userDisplay}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: isMine ? 8 : 0 }}>
          {isMine ? (
            <Pressable
              onPress={() => handleDeleteForumMessage(item)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
              hitSlop={8}
            >
              <Ionicons name="trash" size={14} color={colors.white} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            {item.type === 'share' || item.share ? (
              <Pressable onPress={() => {
                const carouselIndex = shareMediaIndex ?? null;
                if (!shareVideoId) return;
                try {
                  navigation.navigate('MainTabs', {
                    screen: 'Home',
                    params: carouselIndex != null
                      ? { videoId: String(shareVideoId), carouselIndex }
                      : { videoId: String(shareVideoId) },
                  });
                } catch (e) {
                  console.error('Error navegando al post desde foro', e);
                }
              }} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start' }}>
                <View style={{ width: 112 * (textScale || 1), height: 178 * (textScale || 1), borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceElevated }}>
                  {shareThumbnailUrl ? (
                    isProbablyVideoUrl(shareThumbnailUrl) ? (
                      <Video
                        source={{ uri: shareStreamUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={false}
                        isLooping={false}
                        isMuted
                      />
                    ) : (
                      <Image source={{ uri: item.share.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    )
                  ) : (
                    <Image source={require('../../../assets/perfil/teamChange_light.png')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  )}
                  <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.14)' }}>
                    <Ionicons
                      name={item.share?.mediaType === 'image' ? 'image' : item.share?.mediaType === 'carousel' ? 'images' : 'play'}
                      size={34 * (textScale || 1)}
                      color={colors.white}
                    />
                  </View>
                </View>
              </Pressable>
            ) : item.type === 'audio' ? (
              <View style={{ flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
                <Pressable onPress={() => handleToggleAudio(item)}>
                  <View style={{
                    width: 64 * (textScale || 1),
                    height: 64 * (textScale || 1),
                    borderRadius: 32 * (textScale || 1),
                    backgroundColor: bubbleStyle.backgroundColor || colors.surfaceElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons
                      name={activeAudioId === item.id && isAudioPlaying ? 'pause' : 'play'}
                      size={32 * (textScale || 1)}
                      color={colors.white}
                    />
                  </View>
                </Pressable>

                <Text style={{ color: isMine ? colors.white : colors.text, fontSize: typography.sizes.lg * (textScale || 1), fontWeight: '700' }}>
                  {activeAudioId === item.id ? formatTime(audioPositionMs) : '0:00'}
                </Text>
              </View>
            ) : (
              <View style={[styles.bubble, bubbleStyle]}>
                <Text numberOfLines={undefined} style={{ color: isMine ? colors.white : colors.text, fontSize: 13 }}>{item.text}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };
  


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}> 
        {team ? (
          <View style={styles.headerInner}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 8 }}>
              <Image source={team.escudoUrl ? { uri: team.escudoUrl } : require('../../../assets/perfil/teamChange_light.png')} style={styles.crest} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                {/* Fila 1: Nombre del foro */}
                <Text style={{ fontFamily: typography.families.nougat, fontSize: 18 * textScale, color: colors.text, fontWeight: '700' }}>
                  Foro del {team.name || teamId || 'equipo'}
                </Text>
                {!!team.year && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                    📅 Año de fundación: <Text style={{ fontWeight: '700', color: colors.textMuted }}>{team.year}</Text>
                  </Text>
                )}
                {!!team.stadium && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    🏟️ Estadio: <Text style={{ fontWeight: '700', color: colors.textMuted }}>{team.stadium}</Text>
                  </Text>
                )}
                {!!team.lastTitle && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    🏆 Último título: <Text style={{ fontWeight: '700', color: colors.textMuted }}>{team.lastTitle}</Text>
                  </Text>
                )}
              </View>
            </View>

            <Pressable
              onPress={async () => {
                // show intentional loading gif + blur for 1s then navigate back to Profile tab
                setShowLoadingBack(true);
                setTimeout(() => {
                  setShowLoadingBack(false);
                  // navigate to nested Tab Navigator's Profile screen
                  navigation.navigate('MainTabs', { screen: 'Profile' });
                }, 1000);
              }}
              style={{ padding: 8, alignSelf: 'flex-start' }}
            >
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: colors.text }}>Foro de equipo</Text>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(width, height) => {
          contentHeightRef.current = height;
          updateScrollButtonVisibility(0, viewportHeightRef.current, height);
        }}
        onLayout={(event) => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
          updateScrollButtonVisibility(0, viewportHeightRef.current, contentHeightRef.current);
        }}
        contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
      >
        {messages.map((m) => (
          <View key={m.id || String(m._id)}>{renderItem({ item: m })}</View>
        ))}
      </ScrollView>

      {showScrollToBottom ? (
        <View style={styles.scrollToBottomWrap} pointerEvents="box-none">
          <Pressable
            onPress={() => scrollToBottom(true)}
            style={[styles.scrollToBottomBtn, { backgroundColor: colors.primary }]}
            hitSlop={10}
          >
            <Ionicons name="chevron-down" size={24} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

      {pendingDeleteMessage ? (
        <View style={styles.deleteConfirmOverlay}>
          <View style={[styles.deleteConfirmCard, { backgroundColor: colors.surface }]}> 
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
              ¿Desea borrar el mensaje?
            </Text>
            <View style={styles.deleteConfirmActions}>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => setPendingDeleteMessage(null)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.danger }]}
                onPress={confirmDeleteForumMessage}
              >
                <Text style={{ color: colors.white, fontWeight: '700' }}>Borrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}> 
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribe un mensaje (max 500)"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
            maxLength={500}
            multiline
          />
          <Pressable onPress={handleToggleRecording} style={[styles.sendBtn, { marginRight: 8 }]}>
            <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={22} color={isRecording ? colors.danger : colors.primary} />
          </Pressable>
          <Pressable onPress={isRecording ? handleStopRecording : sendText} style={styles.sendBtn} disabled={sending || (!text.trim() && !isRecording)}>
            <Ionicons name="send" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={showLoadingBack} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, borderBottomWidth: 1 },
  headerInner: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  crest: { width: 72, height: 72, borderRadius: 10 },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', padding: 8, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, padding: 8, borderRadius: 8, backgroundColor: 'transparent' },
  sendBtn: { padding: 8, marginLeft: 8 },
  messageLeft: { alignSelf: 'flex-start', marginVertical: 6, maxWidth: '75%', marginHorizontal: 12 },
  messageRight: { alignSelf: 'flex-end', marginVertical: 6, maxWidth: '75%', marginHorizontal: 12 },
  bubble: { padding: 10, borderRadius: 10 },
  audioBubble: { padding: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  scrollToBottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 84, alignItems: 'center' },
  scrollToBottomBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  deleteConfirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  deleteConfirmCard: { width: '80%', borderRadius: 16, padding: 16, alignItems: 'center' },
  deleteConfirmActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  deleteConfirmButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
});
