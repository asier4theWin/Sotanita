import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, Video, ResizeMode, getStreamingVideoSourceFromVideo } from '../../utils/media';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import FifaCard from '../../components/FifaCard';
import AppButton from '../../components/AppButton';
import LoadingOverlay from '../../components/LoadingOverlay';
import StrokeText from '../../components/StrokeText';
import { deleteVideo, deleteVideoComment, getAllVideos, getTeamById, getVideoComments, likeVideo, postForumMessage, postVideoComment, unlikeVideo, uploadCommentAudio } from '../../api/backend';
import { formatLikes } from '../../utils/format';
import Pressable from '../../components/A11yPressable';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://sotanita.vercel.app';

const isLikelyVideoUrl = (url) => {
  const value = String(url || '').toLowerCase();
  return value.includes('/video/') || value.endsWith('.mp4') || value.endsWith('.mov') || value.endsWith('.m4v');
};

const normalizeMediaUrls = (video) => {
  const raw = video?.mediaUrls;
  const extractUrl = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return value.url || value.secure_url || value.uri || value.mediaUrl || value.imageUrl || value.src || '';
    return '';
  };

  if (Array.isArray(raw) && raw.length) {
    return raw.map(extractUrl).filter(Boolean);
  }

  if (raw && typeof raw === 'object') {
    const values = Object.values(raw).map(extractUrl).filter(Boolean);
    if (values.length) return values;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(extractUrl).filter(Boolean);
      }
    } catch (error) {
      // Not JSON, try comma-separated list.
      const splitUrls = raw.split(',').map((item) => item.trim()).filter(Boolean);
      if (splitUrls.length) return splitUrls;
    }
  }

  if (video?.url) return [video.url];
  return [];
};

export default function MyVideosScreen({ navigation, route, embedded = false, onRequestClose, onVideoDeleted }) {
  const { user, isLoggedIn } = useAuth();
  const { colors, gradients, spacing, typography, textScale } = useAppTheme();
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [currentVideo, setCurrentVideo] = useState(0);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareVideoId, setShareVideoId] = useState(null);
  const [fanZoneShieldUri, setFanZoneShieldUri] = useState('');
  const [pendingDeleteVideo, setPendingDeleteVideo] = useState(null);
  const [deletingVideo, setDeletingVideo] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isBlocking = loadingVideos || deletingVideo;
  const [commentText, setCommentText] = useState('');
  const [commentsByVideo, setCommentsByVideo] = useState({});
  const [pendingDeleteComment, setPendingDeleteComment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [loadingNewComment, setLoadingNewComment] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [embeddedStageWidth, setEmbeddedStageWidth] = useState(0);
  const [embeddedStageHeight, setEmbeddedStageHeight] = useState(0);
  const [likingVideoId, setLikingVideoId] = useState(null);
  const carouselListRef = useRef(null);
  const audioRef = useRef(null);
  const recordingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const [activeAudioId, setActiveAudioId] = useState(null);
  const [audioPositionMs, setAudioPositionMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const commentsAnim = useRef(new Animated.Value(0)).current;
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    const firstVisible = viewableItems?.[0];
    if (firstVisible?.index != null) {
      setCarouselIndex(firstVisible.index);
    }
  });
  const selectedVideoId = route.params?.videoId;
  const sourceTab = route.params?.sourceTab || 'uploaded';
  const currentUserId = String(user?.email || '').trim().toLowerCase();
  const handleClose = useCallback(() => {
    if (embedded && typeof onRequestClose === 'function') {
      onRequestClose();
      return;
    }

    navigation.goBack();
  }, [embedded, navigation, onRequestClose]);

  const mapComment = useCallback((comment) => ({
    id: comment.id || comment._id,
    author: comment.username || comment.authorUsername,
    authorUsername: comment.authorUsername || comment.username,
    userId: comment.userId || comment.id_usuario,
    authorProfileImageUrl: comment.authorProfileImageUrl,
    authorTeamName: comment.authorTeamName,
    authorTeamImageUrl: comment.authorTeamImageUrl,
    authorFrameImageId: comment.authorFrameImageId,
    type: comment.type,
    content: comment.type === 'audio' ? null : comment.text,
    audioUrl: comment.audioUrl,
    audioDurationMs: comment.audioDurationMs || comment.audio_duration_ms || comment.audioDuration || 0,
  }), []);

  useEffect(() => {
    const loadVideos = async () => {
      const hasViewer = Boolean(user?.email);
      if (!hasViewer && sourceTab !== 'ranking') {
        setVideos([]);
        setLoadingVideos(false);
        return;
      }

      setLoadingVideos(true);
      try {
        const currentUserId = hasViewer ? String(user.email).trim().toLowerCase() : '';
        const allVideos = await getAllVideos(20, 50);
        const normalized = allVideos.map((video) => {
          const uploader = String(video.id_usuario || '').trim().toLowerCase();
          const likedBy = Array.isArray(video.likedBy)
            ? video.likedBy.map((value) => String(value).trim().toLowerCase())
            : [];

          return {
            ...video,
            user: uploader ? uploader.split('@')[0] : 'usuario',
            uploader,
            hasLiked: hasViewer ? likedBy.includes(currentUserId) : false,
          };
        });

        const filtered = sourceTab === 'liked'
          ? normalized.filter((video) => video.hasLiked)
          : sourceTab === 'ranking'
            ? normalized
            : normalized.filter((video) => video.uploader === currentUserId);

        setVideos(filtered);

        if (selectedVideoId) {
          const selectedIndex = filtered.findIndex((video) => String(video.id) === String(selectedVideoId));
          setCurrentVideo(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          setCurrentVideo(0);
        }
      } catch (error) {
        console.error('Error cargando videos en MyVideos:', error);
        setVideos([]);
      } finally {
        setLoadingVideos(false);
      }
    };

    loadVideos();
  }, [sourceTab, selectedVideoId, user?.email]);

  const activeVideo = videos[currentVideo] || null;
  const mediaUrls = normalizeMediaUrls(activeVideo);
  const normalizedType = String(activeVideo?.mediaType || '').trim().toLowerCase();
  const mediaType = normalizedType
    || (mediaUrls.length > 1
      ? 'carousel'
      : isLikelyVideoUrl(mediaUrls[0] || activeVideo?.url)
        ? 'video'
        : 'image');
  const isCarousel = ['carousel', 'carrusel'].includes(mediaType) || mediaUrls.length > 1;
  const streamingVideoUrl = useMemo(
    () => (mediaType === 'video' ? getStreamingVideoSourceFromVideo(activeVideo, 0, activeVideo?.url) : activeVideo?.url),
    [activeVideo, mediaType]
  );
  const uploaderCard = activeVideo?.uploaderCard || null;
  const uploaderName = uploaderCard?.username || (activeVideo?.id_usuario ? String(activeVideo.id_usuario).split('@')[0] : 'usuario');
  const canCycleVideos = videos.length > 1;
  const isLikedView = sourceTab === 'liked';
  const canDeleteVideo = Boolean(activeVideo) && String(activeVideo.uploader || '').trim().toLowerCase() === currentUserId;
  const carouselItemWidth = carouselWidth || embeddedStageWidth || Math.max(1, Math.round(windowWidth * 0.335));
  const embeddedStageHeightPx = embeddedStageHeight || Math.max(1, Math.round(windowHeight * 0.95));
  const shareVideo = useMemo(
    () => videos.find((item) => String(item.id) === String(shareVideoId)),
    [shareVideoId, videos]
  );
  const shareMediaUrls = normalizeMediaUrls(shareVideo);
  const normalizedShareMediaType = String(shareVideo?.mediaType || '').trim().toLowerCase();
  const isShareCarousel = normalizedShareMediaType === 'carousel' || normalizedShareMediaType === 'carrusel' || shareMediaUrls.length > 1;
  const isShareImage = normalizedShareMediaType === 'image' || (shareMediaUrls.length > 0 && !isLikelyVideoUrl(shareMediaUrls[0]));
  const shareCarouselIndex = isShareCarousel
    ? Math.max(0, Math.min(Number(carouselIndex || 0), Math.max(shareMediaUrls.length - 1, 0)))
    : 0;
  const shareModalTitle = isShareCarousel
    ? 'COMPARTIR CARRUSEL'
    : isShareImage
      ? 'COMPARTIR FOTO'
      : 'COMPARTIR VIDEO';

  const formatTime = useCallback((ms) => {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleToggleAudio = useCallback(async (comment) => {
    const audioUrl = comment?.audioUrl || comment?.audio_url;
    if (!audioUrl || audioUrl === 'pending') {
      Alert.alert('Audio no disponible', 'Este comentario aun no tiene audio.');
      return;
    }

    try {
      if (activeAudioId === comment.id && audioRef.current) {
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
      setActiveAudioId(comment.id);
      setIsAudioPlaying(true);
    } catch (error) {
      Alert.alert('Error', 'No se pudo reproducir el audio.');
    }
  }, [activeAudioId]);

  const openComments = () => {
    setShowComments(true);
    Animated.timing(commentsAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeComments = () => {
    Animated.timing(commentsAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowComments(false);
        setPendingDeleteComment(null);
      }
    });
  };

  const commentsTranslateY = commentsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
  });

  const headerTitle = useMemo(
    () => (sourceTab === 'liked' ? 'Video que te gusta' : sourceTab === 'ranking' ? 'Video del ranking' : 'Tu video'),
    [sourceTab]
  );

  useEffect(() => {
    setCarouselIndex(0);
  }, [activeVideo?.id]);

  useEffect(() => {
    const loadFanZoneEscudo = async () => {
      if (!showShare) {
        if (fanZoneShieldUri) {
          setFanZoneShieldUri('');
        }
        return;
      }

      try {
        const teamId = user?.teamId || user?.team || null;
        if (!teamId) {
          setFanZoneShieldUri(user?.teamImageUrl || '');
          return;
        }

        const team = await getTeamById(teamId);
        setFanZoneShieldUri(team?.escudoUrl || team?.imageUrl || user?.teamImageUrl || '');
      } catch (error) {
        setFanZoneShieldUri(user?.teamImageUrl || '');
      }
    };

    loadFanZoneEscudo();
  }, [fanZoneShieldUri, showShare, user?.team, user?.teamId, user?.teamImageUrl]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.unloadAsync().catch(() => {});
        audioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadComments = async () => {
      if (!activeVideo?.id) return;

      try {
        const data = await getVideoComments(activeVideo.id);
        if (cancelled) return;

        const mapped = Array.isArray(data) ? data.map(mapComment) : [];
        setCommentsByVideo((prev) => ({
          ...prev,
          [activeVideo.id]: mapped,
        }));
      } catch (error) {
        console.error('Error cargando comentarios del popup:', error);
      }
    };

    loadComments();

    return () => {
      cancelled = true;
    };
  }, [activeVideo?.id, mapComment]);

  const handleStopRecording = useCallback(async () => {
    if (!activeVideo?.id) return;

    if (Platform.OS === 'web') {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') return;
      setIsUploadingAudio(true);
      setLoadingNewComment(true);

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
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'comment-audio.webm', { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);
        const uploadResult = await uploadCommentAudio(formData);
        const payload = {
          id_usuario: user?.email || 'usuario',
          type: 'audio',
          text: null,
          audioUrl: uploadResult.url,
        };
        await postVideoComment(activeVideo.id, payload);

        const updatedComments = await getVideoComments(activeVideo.id);
        const mapped = updatedComments.map(mapComment);
        setCommentsByVideo((prev) => ({
          ...prev,
          [activeVideo.id]: mapped,
        }));
        setVideos((prev) => prev.map((item) => (
          item.id === activeVideo.id
            ? { ...item, commentsCount: mapped.length || 0 }
            : item
        )));
      } catch (error) {
        Alert.alert('Error', error.message || 'No se pudo subir el audio.');
      } finally {
        setIsUploadingAudio(false);
        setLoadingNewComment(false);
      }

      return;
    }

    try {
      const recording = recordingRef.current;
      if (!recording) return;
      setIsRecording(false);
      setIsUploadingAudio(true);
      setLoadingNewComment(true);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsUploadingAudio(false);
        setLoadingNewComment(false);
        Alert.alert('Error', 'No se pudo obtener el audio.');
        return;
      }

      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'comment-audio.m4a',
      });

      const uploadResult = await uploadCommentAudio(formData);
      const payload = {
        id_usuario: user?.email || 'usuario',
        type: 'audio',
        text: null,
        audioUrl: uploadResult.url,
      };

      await postVideoComment(activeVideo.id, payload);

      const updatedComments = await getVideoComments(activeVideo.id);
      const mapped = updatedComments.map(mapComment);
      setCommentsByVideo((prev) => ({
        ...prev,
        [activeVideo.id]: mapped,
      }));
      setVideos((prev) => prev.map((item) => (
        item.id === activeVideo.id
          ? { ...item, commentsCount: mapped.length || 0 }
          : item
      )));
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo subir el audio.');
    } finally {
      setIsUploadingAudio(false);
      setLoadingNewComment(false);
    }
  }, [activeVideo?.id, mapComment, user?.email]);

  const handleSendComment = useCallback(async () => {
    if (!activeVideo?.id) return;
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para comentar.');
      return;
    }
    if (isUploadingAudio) {
      Alert.alert('Espera', 'Se esta subiendo el audio.');
      return;
    }

    if (isRecording) {
      await handleStopRecording();
      return;
    }

    if (!commentText.trim()) {
      Alert.alert('Vacio', 'Escribe un comentario o graba un audio.');
      return;
    }

    setLoadingNewComment(true);
    try {
      const payload = {
        id_usuario: user?.email || 'usuario',
        type: 'text',
        text: commentText.trim(),
        audioUrl: null,
      };

      await postVideoComment(activeVideo.id, payload);

      const updatedComments = await getVideoComments(activeVideo.id);
      const mapped = updatedComments.map(mapComment);
      setCommentsByVideo((prev) => ({
        ...prev,
        [activeVideo.id]: mapped,
      }));
      setVideos((prev) => prev.map((item) => (
        item.id === activeVideo.id
          ? { ...item, commentsCount: mapped.length || 0 }
          : item
      )));
      setCommentText('');
      setIsRecording(false);
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo enviar el comentario.');
    } finally {
      setLoadingNewComment(false);
    }
  }, [activeVideo?.id, commentText, handleStopRecording, isLoggedIn, isRecording, isUploadingAudio, mapComment, user?.email]);

  const handleToggleRecording = useCallback(async () => {
    if (!activeVideo?.id) return;
    if (!isLoggedIn || !user?.email) {
      Alert.alert('Inicia sesion', 'Debes iniciar sesion para comentar.');
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
          if (event.data && event.data.size > 0) {
            mediaChunksRef.current.push(event.data);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setCommentText('');
        setIsRecording(true);
      } catch (error) {
        Alert.alert('Permisos requeridos', 'Necesitas permisos de microfono.');
      }
      return;
    }

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
    setCommentText('');
    setIsRecording(true);
  }, [activeVideo?.id, isLoggedIn, isRecording, isUploadingAudio, user?.email]);

  const updateCarouselIndex = (offsetX) => {
    if (!carouselWidth) return;
    const nextIndex = Math.round(offsetX / carouselWidth);
    setCarouselIndex(Math.max(0, Math.min(nextIndex, mediaUrls.length - 1)));
  };

  const moveCarousel = useCallback((direction) => {
    if (!isCarousel || !mediaUrls.length) return;

    const nextIndex = Math.max(0, Math.min(carouselIndex + direction, mediaUrls.length - 1));
    carouselListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    setCarouselIndex(nextIndex);
  }, [carouselIndex, isCarousel, mediaUrls.length]);

  const handleLike = useCallback(async () => {
    if (!activeVideo?.id || !user?.email || likingVideoId === activeVideo.id) return;

    const wasLiked = Boolean(activeVideo.hasLiked);
    setLikingVideoId(activeVideo.id);

    setVideos((prev) => prev.map((item) => (
      String(item.id) === String(activeVideo.id)
        ? {
            ...item,
            likes: wasLiked ? Math.max(0, Number(item.likes || 0) - 1) : Number(item.likes || 0) + 1,
            hasLiked: !wasLiked,
          }
        : item
    )));

    try {
      const response = wasLiked
        ? await unlikeVideo(activeVideo.id, user.email)
        : await likeVideo(activeVideo.id, user.email);

      setVideos((prev) => prev.map((item) => (
        String(item.id) === String(activeVideo.id)
          ? {
              ...item,
              likes: Number(response.likes ?? item.likes ?? 0),
              hasLiked: Boolean(response.liked),
            }
          : item
      )));
    } catch (error) {
      setVideos((prev) => prev.map((item) => (
        String(item.id) === String(activeVideo.id)
          ? {
              ...item,
              likes: wasLiked ? Number(item.likes || 0) + 1 : Math.max(0, Number(item.likes || 0) - 1),
              hasLiked: wasLiked,
            }
          : item
      )));
      Alert.alert('Error', error.message || 'No se pudo actualizar el like.');
    } finally {
      setLikingVideoId(null);
    }
  }, [activeVideo?.id, activeVideo?.hasLiked, likingVideoId, user?.email]);

  const handleSharePress = useCallback(() => {
    if (!activeVideo?.id) return;
    setShareVideoId(activeVideo.id);
    setShowShare(true);
  }, [activeVideo?.id]);

  const closeShareModal = useCallback(() => {
    setShowShare(false);
    setShareVideoId(null);
  }, []);

  const buildShareUrl = useCallback((videoId, selectedCarouselIndex = null) => {
    const encodedVideoId = encodeURIComponent(String(videoId || ''));
    const baseUrl = `${FRONTEND_URL}/share/${encodedVideoId}`;
    if (Number.isInteger(selectedCarouselIndex) && selectedCarouselIndex >= 0) {
      return `${baseUrl}?carouselIndex=${selectedCarouselIndex}`;
    }
    return baseUrl;
  }, []);

  const writeToClipboard = useCallback(async (value) => {
    if (Platform.OS !== 'web') {
      try {
        const clipboardModule = require('react-native/Libraries/Components/Clipboard/Clipboard');
        const clipboard = clipboardModule?.default || clipboardModule;

        if (clipboard?.setString) {
          clipboard.setString(value);
          return true;
        }
      } catch (error) {
        // Fall through to other strategies.
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      return copied;
    }

    return false;
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareVideoId) return;

    const shareUrl = buildShareUrl(shareVideoId, isShareCarousel ? shareCarouselIndex : null);

    try {
      const copied = await writeToClipboard(shareUrl);
      if (!copied) {
        Alert.alert('No se pudo copiar', 'No fue posible copiar el enlace en este dispositivo.');
        return;
      }

      closeShareModal();
      Alert.alert('Listo', 'Enlace copiado al portapapeles.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo copiar el enlace.');
    }
  }, [buildShareUrl, closeShareModal, isShareCarousel, shareCarouselIndex, shareVideoId, writeToClipboard]);

  const handleDownloadVideo = useCallback(async () => {
    if (!shareVideoId) {
      Alert.alert('Error', 'No se ha seleccionado ningun video.');
      return;
    }

    closeShareModal();

    const videoToDownload = videos.find((item) => String(item.id) === String(shareVideoId));
    const mediaToDownload = normalizeMediaUrls(videoToDownload);
    const normalizedMediaType = String(videoToDownload?.mediaType || '').toLowerCase();
    const isCarouselMedia = normalizedMediaType === 'carousel' || normalizedMediaType === 'carrusel' || mediaToDownload.length > 1;
    const selectedMediaIndex = isCarouselMedia
      ? Math.max(0, Math.min(shareCarouselIndex, Math.max(mediaToDownload.length - 1, 0)))
      : 0;
    const primaryMediaUrl = mediaToDownload[selectedMediaIndex] || videoToDownload?.url;
    const isImageMedia = normalizedMediaType === 'image'
      || (normalizedMediaType === 'carousel' && !isLikelyVideoUrl(primaryMediaUrl))
      || (!normalizedMediaType && !isLikelyVideoUrl(primaryMediaUrl));
    const outputExtension = isImageMedia ? 'jpg' : 'mp4';
    const targetWidth = Math.max(1, Math.round(windowWidth || 1080));
    const targetHeight = Math.max(1, Math.round(windowHeight || Math.round(targetWidth * 16 / 9)));
    const downloadUrl = `${BACKEND_URL}/api/videos/${encodeURIComponent(String(shareVideoId))}/download-watermarked?targetWidth=${targetWidth}&targetHeight=${targetHeight}&mediaIndex=${selectedMediaIndex}`;
    const downloadFileName = `video_${shareVideoId}_watermarked.${outputExtension}`;
    const webDownloadUrl = `${BACKEND_URL}/api/videos/${encodeURIComponent(String(shareVideoId))}/download?mediaIndex=${selectedMediaIndex}`;
    const webDownloadFileName = `media_${shareVideoId}.${outputExtension}`;
    const isHostedBackend = !/localhost|127\.0\.0\.1/.test(String(BACKEND_URL || ''));
    const shouldUseDirectDownload = Platform.OS === 'web' || isHostedBackend;
    const resolvedDownloadUrl = shouldUseDirectDownload ? webDownloadUrl : downloadUrl;
    const resolvedFileName = shouldUseDirectDownload ? webDownloadFileName : downloadFileName;

    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = resolvedDownloadUrl;
        a.download = resolvedFileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        Alert.alert('Listo', 'Descarga iniciada.');
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permisos', 'Se necesitan permisos para guardar en el dispositivo.');
        return;
      }

      const localUri = FileSystem.documentDirectory + `sotanita_media_${shareVideoId}.${outputExtension}`;
      const downloadResumable = FileSystem.createDownloadResumable(resolvedDownloadUrl, localUri);

      const { uri } = await downloadResumable.downloadAsync();
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('Sotanita', asset, false).catch(() => {});
      Alert.alert('Listo', shouldUseDirectDownload ? 'Video guardado en la galeria.' : 'Video guardado en la galeria con marca de agua.');
    } catch (error) {
      console.error('Download error', error);
      Alert.alert('Error', 'No se pudo descargar el video.');
    }
  }, [closeShareModal, shareCarouselIndex, shareVideoId, videos, windowHeight, windowWidth]);

  const handleShareToFanZone = useCallback(() => {
    if (!shareVideoId) {
      Alert.alert('Error', 'No se ha seleccionado ningun video.');
      return;
    }

    try {
      closeShareModal();
    } catch (error) {
      // ignore
    }

    (async () => {
      try {
        const teamId = user?.teamId || user?.team || null;
        const videoObj = videos.find((videoItem) => String(videoItem.id) === String(shareVideoId));
        const mediaForShare = normalizeMediaUrls(videoObj);
        const normalizedVideoType = String(videoObj?.mediaType || '').trim().toLowerCase();
        const isCarouselMedia = normalizedVideoType === 'carousel' || normalizedVideoType === 'carrusel' || mediaForShare.length > 1;
        const selectedMediaIndex = isCarouselMedia
          ? Math.max(0, Math.min(shareCarouselIndex, Math.max(mediaForShare.length - 1, 0)))
          : 0;
        const thumbnail = mediaForShare[selectedMediaIndex] || videoObj?.url || null;
        const title = videoObj?.title || videoObj?.name || videoObj?.caption || '';

        if (!teamId) {
          Alert.alert('Compartido', 'Video enviado a Fan Zone.');
          return;
        }

        const payload = {
          user: user?.email || user?.id || user?.username || '',
          type: 'share',
          text: title || '',
          share: {
            videoId: String(shareVideoId),
            thumbnailUrl: thumbnail || null,
            title: title || '',
            mediaType: videoObj?.mediaType || (Array.isArray(videoObj?.mediaUrls) && videoObj.mediaUrls.length > 1 ? 'carousel' : 'video'),
            carouselIndex: isCarouselMedia ? selectedMediaIndex : null,
          },
        };

        await postForumMessage(teamId, payload);
        Alert.alert('Compartido', 'Video enviado a Fan Zone.');
      } catch (error) {
        console.error('Error compartiendo en Fan Zone', error?.message || error);
        Alert.alert('Error', error?.message || 'No se pudo compartir en Fan Zone.');
      }
    })();
  }, [closeShareModal, shareCarouselIndex, shareVideoId, user?.email, user?.id, user?.team, user?.teamId, user?.username, videos]);

  const handleDeleteVideo = async () => {
    const videoToDelete = pendingDeleteVideo || activeVideo;
    if (!videoToDelete?.id || !user?.email || deletingVideo) return;

    setDeletingVideo(true);
    try {
      await deleteVideo(videoToDelete.id, user.email);

      setVideos((prev) => {
        const filtered = prev.filter((video) => String(video.id) !== String(videoToDelete.id));

        if (filtered.length === 0) {
          setCurrentVideo(0);
          handleClose();
          return filtered;
        }

        setCurrentVideo((prevIndex) => Math.min(prevIndex, filtered.length - 1));
        return filtered;
      });

      setPendingDeleteVideo(null);
      if (embedded && typeof onVideoDeleted === 'function') {
        await onVideoDeleted();
      }
      Alert.alert('Listo', 'Publicacion eliminada correctamente.');
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo eliminar la publicacion.');
    } finally {
      setDeletingVideo(false);
    }
  };

  const handleDeleteComment = useCallback((comment) => {
    if (!comment) return;
    setPendingDeleteComment(comment);
  }, []);

  const confirmDeleteComment = useCallback(async () => {
    if (!activeVideo?.id || !pendingDeleteComment || !user?.email) {
      setPendingDeleteComment(null);
      return;
    }

    const commentId = pendingDeleteComment.id || pendingDeleteComment._id;
    if (!commentId) {
      setPendingDeleteComment(null);
      return;
    }

    try {
      await deleteVideoComment(commentId, user.email);
      setCommentsByVideo((prev) => ({
        ...prev,
        [activeVideo.id]: (prev[activeVideo.id] || []).filter((c) => (c.id || c._id) !== commentId),
      }));
      setVideos((prev) => prev.map((item) => (
        item.id === activeVideo.id
          ? { ...item, commentsCount: Math.max(0, (item.commentsCount || 0) - 1) }
          : item
      )));
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo eliminar el comentario.');
    } finally {
      setPendingDeleteComment(null);
    }
  }, [activeVideo?.id, pendingDeleteComment, user?.email]);

  const activeComments = activeVideo?.id ? (commentsByVideo[activeVideo.id] || []) : [];
  const embeddedActions = (
    <View style={styles.embeddedActionColumn}>
      <Pressable style={styles.actionWrap} onPress={handleLike} disabled={likingVideoId === activeVideo?.id}>
        <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
          <Ionicons name={activeVideo?.hasLiked ? 'heart' : 'heart-outline'} size={28} color={activeVideo?.hasLiked ? colors.danger : colors.white} />
        </View>
        <Text style={styles.actionText}>{formatLikes(activeVideo?.likes || 0)}</Text>
      </Pressable>

      <Pressable style={styles.actionWrap} onPress={handleSharePress}>
        <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
          <Ionicons name="share-social-outline" size={26} color={colors.white} />
        </View>
      </Pressable>

      {embedded && canDeleteVideo ? (
        <Pressable
          style={styles.actionWrap}
          onPressIn={(event) => event?.stopPropagation?.()}
          onPress={() => setPendingDeleteVideo(activeVideo)}
          disabled={deletingVideo}
        >
          <View style={[styles.actionCircle, { backgroundColor: `${colors.danger}CC` }]}> 
            <Ionicons name="trash-outline" size={24} color={colors.white} />
          </View>
          <Text style={[styles.actionText, { color: colors.danger }]}>Eliminar</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderEmbeddedVideoStage = () => {
    if (loadingVideos) {
      return (
        <View style={styles.videoCenter}>
          <Text style={{ color: `${colors.white}80` }}>Cargando videos...</Text>
        </View>
      );
    }

    if (!activeVideo) {
      return (
        <View style={styles.videoCenter}>
          <Text style={{ color: `${colors.white}80` }}>
            {sourceTab === 'liked'
              ? 'No tienes videos con like'
              : sourceTab === 'ranking'
                ? 'No se pudo cargar el video del ranking'
                : 'No tienes videos subidos'}
          </Text>
        </View>
      );
    }

    const stageHeight = embeddedStageHeightPx;

    if (mediaType === 'video') {
      return (
        <Pressable
          style={styles.videoCenter}
          onPress={() => {
            if (!canCycleVideos) return;
            setCurrentVideo((prev) => (prev + 1) % videos.length);
            setLiked(false);
            setCarouselIndex(0);
          }}
        >
          {Platform.OS === 'web' ? (
            <video
              src={streamingVideoUrl}
              autoPlay
              loop
              playsInline
              preload="metadata"
              style={styles.webVideo}
            />
          ) : (
            <Video
              style={[StyleSheet.absoluteFillObject, styles.videoFill]}
              source={{ uri: streamingVideoUrl }}
              resizeMode={ResizeMode.STRETCH}
              isLooping
              shouldPlay
              isMuted={false}
              volume={1.0}
            />
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.infoWrapper}>
            {uploaderCard ? (
              <View style={styles.uploaderCardWrap}>
                <FifaCard
                  username={uploaderCard.username || uploaderName}
                  position={uploaderCard.position}
                  team={uploaderCard.teamName}
                  backgroundUrl={uploaderCard.teamImageUrl}
                  frameUrl={uploaderCard.frameImageId}
                  frameId={uploaderCard.frameId}
                  photoUrl={uploaderCard.profileImageUrl}
                  size="small"
                  disableShadow
                />
              </View>
            ) : null}
            <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
              {activeVideo?.user || uploaderName}
            </Text>
            {activeVideo?.title ? (
              <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}>
                {activeVideo.title}
              </Text>
            ) : null}
            {activeVideo?.description ? (
              <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}>
                {activeVideo.description}
              </Text>
            ) : null}
            {activeVideo?.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}>
                  {activeVideo.category}
                </Text>
              </View>
            ) : null}
          </View>
          {embeddedActions}
        </Pressable>
      );
    }

    if (isCarousel) {
      return (
        <View
          style={[styles.videoCenter, { height: stageHeight }]}
          onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
        >
          <FlatList
            ref={carouselListRef}
            key={activeVideo?.id || 'carousel'}
            data={mediaUrls}
            horizontal
            pagingEnabled
            scrollEnabled
            extraData={mediaUrls.length}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item }) => (
              <View style={{ width: carouselItemWidth, height: stageHeight }}>
                <Image
                  source={{ uri: item }}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
            )}
            getItemLayout={(_, index) => ({
              length: carouselItemWidth,
              offset: carouselItemWidth * index,
              index,
            })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => updateCarouselIndex(event.nativeEvent.contentOffset.x)}
            onScroll={(event) => updateCarouselIndex(event.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewableItemsChangedRef.current}
            viewabilityConfig={viewabilityConfigRef.current}
            style={styles.carouselScroll}
            contentContainerStyle={[styles.carouselContent, { height: stageHeight }]}
            snapToInterval={Platform.OS === 'web' ? carouselItemWidth : undefined}
            snapToAlignment={Platform.OS === 'web' ? 'start' : undefined}
            decelerationRate={Platform.OS === 'web' ? 'fast' : undefined}
            initialNumToRender={2}
            windowSize={3}
            removeClippedSubviews={false}
          />
          {mediaUrls.length > 1 ? (
            <>
              <Pressable
                onPress={() => moveCarousel(-1)}
                style={({ pressed }) => [
                  styles.carouselArrow,
                  styles.carouselArrowLeft,
                  { opacity: pressed ? 0.85 : 1, backgroundColor: `${colors.black}88` },
                ]}
              >
                <Ionicons name="chevron-back" size={28} color={colors.white} />
              </Pressable>
              <Pressable
                onPress={() => moveCarousel(1)}
                style={({ pressed }) => [
                  styles.carouselArrow,
                  styles.carouselArrowRight,
                  { opacity: pressed ? 0.85 : 1, backgroundColor: `${colors.black}88` },
                ]}
              >
                <Ionicons name="chevron-forward" size={28} color={colors.white} />
              </Pressable>
            </>
          ) : null}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.2)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.infoWrapper}>
            {uploaderCard ? (
              <View style={styles.uploaderCardWrap}>
                <FifaCard
                  username={uploaderCard.username || uploaderName}
                  position={uploaderCard.position}
                  team={uploaderCard.teamName}
                  backgroundUrl={uploaderCard.teamImageUrl}
                  frameUrl={uploaderCard.frameImageId}
                  frameId={uploaderCard.frameId}
                  photoUrl={uploaderCard.profileImageUrl}
                  size="small"
                  disableShadow
                />
              </View>
            ) : null}
            <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
              {activeVideo?.user || uploaderName}
            </Text>
            {activeVideo?.title ? (
              <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}>
                {activeVideo.title}
              </Text>
            ) : null}
            {activeVideo?.description ? (
              <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}>
                {activeVideo.description}
              </Text>
            ) : null}
            {activeVideo?.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}>
                  {activeVideo.category}
                </Text>
              </View>
            ) : null}
          </View>
          {embeddedActions}
        </View>
      );
    }

    return (
      <Pressable
        style={styles.videoCenter}
        onPress={() => {
          if (!canCycleVideos) return;
          setCurrentVideo((prev) => (prev + 1) % videos.length);
          setLiked(false);
          setCarouselIndex(0);
        }}
      >
        <Image
          source={{ uri: streamingVideoUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.infoWrapper}>
          {uploaderCard ? (
            <View style={styles.uploaderCardWrap}>
              <FifaCard
                username={uploaderCard.username || uploaderName}
                position={uploaderCard.position}
                team={uploaderCard.teamName}
                backgroundUrl={uploaderCard.teamImageUrl}
                frameUrl={uploaderCard.frameImageId}
                frameId={uploaderCard.frameId}
                photoUrl={uploaderCard.profileImageUrl}
                size="small"
                disableShadow
              />
            </View>
          ) : null}
          <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
            {activeVideo?.user || uploaderName}
          </Text>
          {activeVideo?.title ? (
            <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}>
              {activeVideo.title}
            </Text>
          ) : null}
          {activeVideo?.description ? (
            <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}>
              {activeVideo.description}
            </Text>
          ) : null}
          {activeVideo?.category ? (
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}>
                {activeVideo.category}
              </Text>
            </View>
          ) : null}
        </View>
        {embeddedActions}
      </Pressable>
    );
  };

  const renderEmbeddedCommentsPanel = () => (
    <View style={[styles.embeddedCommentsPanel, { backgroundColor: colors.surface, borderLeftColor: colors.border }]}> 
      <View style={[styles.embeddedCommentsHeader, { borderBottomColor: colors.border }]}> 
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontFamily: typography.families.nougat, fontSize: typography.sizes.lg * textScale }}>
            Comentarios
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 4 }} numberOfLines={1}>
            {activeVideo?.title || 'Video actual'}
          </Text>
        </View>
      </View>

      {activeVideo?.id && commentsByVideo[activeVideo.id] === undefined ? (
        <View style={styles.embeddedCommentsEmpty}>
          <Text style={{ color: colors.textMuted }}>Cargando comentarios...</Text>
        </View>
      ) : activeComments.length === 0 ? (
        <View style={styles.embeddedCommentsEmpty}>
          <Text style={{ color: colors.textMuted }}>Este post aun no tiene comentarios.</Text>
        </View>
      ) : (
        <FlatList
          data={activeComments}
          keyExtractor={(item, index) => String(item.id || item._id || index)}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <View style={styles.commentRow}>
              <FifaCard
                username={item.author || item.authorUsername || 'Usuario'}
                team={item.authorTeamName || 'Sin equipo'}
                position="---"
                photoUrl={item.authorProfileImageUrl}
                backgroundUrl={item.authorTeamImageUrl}
                frameUrl={item.authorFrameImageId}
                size="small"
                disableShadow
              />
              <View style={{ flex: 1 }}>
                      <View style={styles.commentHeaderRow} pointerEvents="box-none">
                        <Text
                          style={[styles.commentHeaderText, { color: colors.text, fontWeight: typography.weights.semibold }]}
                          pointerEvents="none"
                        >
                          @{item.author || item.authorUsername || 'Usuario'}
                          {(item.type || item?.type) === 'audio' ? '  -  Mensaje de Audio' : ''}
                        </Text>
                        {String(item.userId || '').trim().toLowerCase() === String(user?.email || '').trim().toLowerCase() ? (
                          <Pressable
                            onPress={() => handleDeleteComment(item)}
                            onMouseDown={() => handleDeleteComment(item)}
                            onTouchStart={() => handleDeleteComment(item)}
                            style={[styles.commentDelete, { backgroundColor: colors.danger }]}
                            hitSlop={12}
                            pointerEvents="auto"
                          >
                            <Ionicons name="trash" size={14} color={colors.white} />
                          </Pressable>
                        ) : null}
                      </View>
                <Text style={{ color: colors.textMuted }}>
                  {(item.type || item?.type) === 'audio' ? 'Mensaje de Audio' : (item.content || 'Comentario sin texto')}
                </Text>
                {(item.type || item?.type) === 'audio' ? (
                  <Pressable
                    onPress={() => handleToggleAudio(item)}
                    style={[styles.audioBubble, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  >
                    <Ionicons
                      name={activeAudioId === item.id && isAudioPlaying ? 'pause' : 'play'}
                      size={20}
                      color={colors.text}
                    />
                    <Text style={{ color: colors.text, marginLeft: 10, fontWeight: '700' }}>
                      {activeAudioId === item.id ? formatTime(audioPositionMs) : '0:00'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}> 
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Anade un comentario..."
          placeholderTextColor={colors.textMuted}
          style={[styles.commentInput, { backgroundColor: colors.surfaceElevated, color: colors.text }]}
        />
        <Pressable style={[styles.actionCircle, { backgroundColor: colors.primary }]} onPress={handleSendComment} disabled={loadingNewComment}>
          <Ionicons name="send" size={18} color={colors.black} />
        </Pressable>
        <Pressable style={[styles.actionCircle, { backgroundColor: colors.surfaceElevated }]} onPress={handleToggleRecording} disabled={loadingNewComment}>
          <Ionicons name="mic" size={18} color={colors.text} />
        </Pressable>
      </View>
      {isRecording || isUploadingAudio ? (
        <View style={styles.recordingBar}>
          <View style={styles.recordingDot} />
          <Text style={{ color: colors.text }}>{isUploadingAudio ? 'Subiendo audio...' : 'Grabando audio...'}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    embedded ? (
      <>
        <View style={[styles.embeddedRoot, { backgroundColor: colors.surface }]}> 
          <View
            style={styles.embeddedVideoPane}
            onLayout={(event) => {
              setEmbeddedStageWidth(event.nativeEvent.layout.width);
              setEmbeddedStageHeight(event.nativeEvent.layout.height);
            }}
          >
            <View style={[styles.embeddedTopBar, { padding: spacing.md }]}> 
              <Pressable onPress={handleClose} style={[styles.roundButton, { backgroundColor: `${colors.black}88` }]}> 
                <Ionicons name="arrow-back" size={20} color={colors.white} />
              </Pressable>
            </View>

            {renderEmbeddedVideoStage()}
          </View>

          {renderEmbeddedCommentsPanel()}
        </View>

        <Modal
          visible={Boolean(pendingDeleteComment)}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingDeleteComment(null)}
        >
          <View style={[styles.deleteConfirmOverlay, { backgroundColor: colors.overlay }]}> 
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDeleteComment(null)} />
            <View style={[styles.deleteConfirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
                Desea borrar el comentario
              </Text>
              <View style={styles.deleteConfirmActions}>
                <Pressable
                  style={[styles.deleteConfirmButton, { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => setPendingDeleteComment(null)}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.deleteConfirmButton, { backgroundColor: colors.danger }]}
                  onPress={confirmDeleteComment}
                >
                  <Text style={{ color: colors.white, fontWeight: '700' }}>Borrar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showShare} transparent animationType="fade" onRequestClose={closeShareModal}>
          <Pressable style={styles.shareOverlay} onPress={closeShareModal}>
            <Pressable style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: typography.sizes.xl * textScale * 1.5, textAlign: 'center', marginBottom: 8, fontFamily: typography.families.nougat }}>
                {shareModalTitle}
              </Text>

              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale, textAlign: 'center', marginBottom: 12 }}>
                Comparte este contenido en un toque
              </Text>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <Pressable onPress={handleCopyShareLink} style={[styles.shareRectButton, { backgroundColor: colors.primary }]}>
                    <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <View style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="copy" size={62} color="#000" style={{ position: 'absolute' }} />
                        <Ionicons name="copy" size={56} color={colors.white} />
                      </View>
                      <StrokeText
                        strokeColor="#000"
                        strokeWidth={3}
                        style={{
                          color: colors.white,
                          fontWeight: '700',
                          textAlign: 'center',
                        }}
                      >
                        Copiar enlace
                      </StrokeText>
                    </View>
                  </Pressable>

                <Pressable onPress={handleShareToFanZone} style={[styles.shareRectButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Image source={fanZoneShieldUri ? { uri: fanZoneShieldUri } : require('../../../assets/perfil/teamChange_light.png')} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="contain" />
                    <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>Compartir en Fan Zone</Text>
                  </View>
                </Pressable>
              </View>


              <Text style={{ color: colors.textMuted, fontSize: typography.sizes.sm * textScale, marginBottom: 8, textAlign: 'center' }}>O si lo prefieres...</Text>

              <Pressable onPress={handleDownloadVideo} style={[styles.downloadButton, { backgroundColor: colors.primary }]}> 
                <StrokeText
                  strokeColor="#000"
                  strokeWidth={2}
                  style={{
                    color: colors.white,
                    fontWeight: '700',
                    textAlign: 'center',
                    fontFamily: typography.families.nougat,
                    textTransform: 'uppercase',
                    fontSize: typography.sizes.xl * textScale * 1.2,
                    lineHeight: typography.sizes.xl * textScale * 1.25,
                  }}
                >
                  DESCARGAR
                </StrokeText>
              </Pressable>

            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={Boolean(pendingDeleteVideo)} transparent animationType="fade" onRequestClose={() => setPendingDeleteVideo(null)}>
          <Pressable
            style={[
              styles.overlay,
              { backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' },
            ]}
            onPress={() => setPendingDeleteVideo(null)}
          >
            <Pressable style={[styles.dialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale, marginBottom: 8 }}>
                Eliminar video?
              </Text>
              <Text style={{ color: colors.textMuted, marginBottom: 16 }}>Esta accion no se puede deshacer.</Text>
              <View style={styles.dialogActions}>
                <AppButton title="Cancelar" variant="secondary" onPress={() => setPendingDeleteVideo(null)} style={{ flex: 1 }} />
                <AppButton title="Eliminar" variant="danger" loading={deletingVideo} onPress={handleDeleteVideo} style={{ flex: 1 }} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    ) : (
    <View style={styles.root}>
      <LinearGradient colors={gradients.video} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView style={embedded ? styles.embeddedSafeArea : [styles.safeArea, { minHeight: windowHeight }]}>
        <View style={[styles.topBar, { padding: spacing.md }]}> 
          <Pressable onPress={handleClose} style={[styles.roundButton, { backgroundColor: `${colors.black}88` }]}> 
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>

          {canDeleteVideo ? (
            <Pressable onPress={() => setPendingDeleteVideo(activeVideo)} style={[styles.roundButton, { backgroundColor: `${colors.danger}CC` }]}> 
              <Ionicons name="trash" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={styles.roundButtonSpacer} />
          )}
        </View>

        {isCarousel ? (
          <View style={styles.carouselDotsBar} pointerEvents="none"> 
            <View style={styles.carouselDotsRow}>
              {mediaUrls.map((_, index) => (
                <View
                  key={`carousel-dot-${index}`}
                  style={[
                    styles.dot,
                    {
                      width: index === carouselIndex ? 16 : 6,
                      backgroundColor: index === carouselIndex ? colors.primary : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {loadingVideos ? (
          <View style={styles.videoCenter}>
            <Text style={{ color: `${colors.white}80` }}>Cargando videos...</Text>
          </View>
        ) : !activeVideo ? (
          <View style={styles.videoCenter}>
            <Text style={{ color: `${colors.white}80` }}>
              {sourceTab === 'liked'
                ? 'No tienes videos con like'
                : sourceTab === 'ranking'
                  ? 'No se pudo cargar el video del ranking'
                  : 'No tienes videos subidos'}
            </Text>
          </View>
        ) : (
          mediaType === 'video' ? (
            <Pressable
              style={[styles.videoCenter, { height: windowHeight }]}
              onPress={() => {
                if (!canCycleVideos) return;
                setCurrentVideo((prev) => (prev + 1) % videos.length);
                setLiked(false);
                setCarouselIndex(0);
              }}
            >
              <Video
                style={StyleSheet.absoluteFillObject}
                source={{ uri: streamingVideoUrl }}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay
                isMuted={false}
                volume={1.0}
              />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.infoWrapper}>
                {uploaderCard ? (
                  <View style={styles.uploaderCardWrap}>
                    <FifaCard
                      username={uploaderCard.username || uploaderName}
                      position={uploaderCard.position}
                      team={uploaderCard.teamName}
                      backgroundUrl={uploaderCard.teamImageUrl}
                      frameUrl={uploaderCard.frameImageId}
                      frameId={uploaderCard.frameId}
                      photoUrl={uploaderCard.profileImageUrl}
                      size="small"
                      disableShadow
                    />
                  </View>
                ) : null}
                <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
                  {activeVideo?.user || uploaderName}
                </Text>
                {activeVideo?.title ? (
                  <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}> 
                    {activeVideo.title}
                  </Text>
                ) : null}
                {activeVideo?.description ? (
                  <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}> 
                    {activeVideo.description}
                  </Text>
                ) : null}
                {activeVideo?.category ? (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}> 
                    <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}> 
                      {activeVideo.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : isCarousel ? (
            <View
              style={[styles.videoCenter, { height: windowHeight }]}
              onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
            >
              <FlatList
                ref={carouselListRef}
                key={activeVideo?.id || 'carousel'}
                data={mediaUrls}
                horizontal
                pagingEnabled
                scrollEnabled
                extraData={mediaUrls.length}
                keyExtractor={(item, index) => `${item}-${index}`}
                renderItem={({ item }) => (
                  <View style={{ width: carouselItemWidth, height: windowHeight }}>
                    <Image
                      source={{ uri: item }}
                      resizeMode="cover"
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>
                )}
                getItemLayout={(_, index) => ({
                  length: carouselItemWidth,
                  offset: carouselItemWidth * index,
                  index,
                })}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => updateCarouselIndex(event.nativeEvent.contentOffset.x)}
                onScroll={(event) => updateCarouselIndex(event.nativeEvent.contentOffset.x)}
                scrollEventThrottle={16}
                onViewableItemsChanged={onViewableItemsChangedRef.current}
                viewabilityConfig={viewabilityConfigRef.current}
                style={styles.carouselScroll}
                contentContainerStyle={[styles.carouselContent, { height: windowHeight }]}
                snapToInterval={Platform.OS === 'web' ? carouselItemWidth : undefined}
                snapToAlignment={Platform.OS === 'web' ? 'start' : undefined}
                decelerationRate={Platform.OS === 'web' ? 'fast' : undefined}
                initialNumToRender={2}
                windowSize={3}
                removeClippedSubviews={false}
              />
              {mediaUrls.length > 1 ? (
                <>
                  <Pressable
                    onPress={() => moveCarousel(-1)}
                    style={({ pressed }) => [
                      styles.carouselArrow,
                      styles.carouselArrowLeft,
                      { opacity: pressed ? 0.85 : 1, backgroundColor: `${colors.black}88` },
                    ]}
                  >
                    <Ionicons name="chevron-back" size={28} color={colors.white} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveCarousel(1)}
                    style={({ pressed }) => [
                      styles.carouselArrow,
                      styles.carouselArrowRight,
                      { opacity: pressed ? 0.85 : 1, backgroundColor: `${colors.black}88` },
                    ]}
                  >
                    <Ionicons name="chevron-forward" size={28} color={colors.white} />
                  </Pressable>
                </>
              ) : null}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.2)']}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={styles.infoWrapper}>
                {uploaderCard ? (
                  <View style={styles.uploaderCardWrap}>
                    <FifaCard
                      username={uploaderCard.username || uploaderName}
                      position={uploaderCard.position}
                      team={uploaderCard.teamName}
                      backgroundUrl={uploaderCard.teamImageUrl}
                      frameUrl={uploaderCard.frameImageId}
                      frameId={uploaderCard.frameId}
                      photoUrl={uploaderCard.profileImageUrl}
                      size="small"
                      disableShadow
                    />
                  </View>
                ) : null}
                <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
                  {activeVideo?.user || uploaderName}
                </Text>
                {activeVideo?.title ? (
                  <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}> 
                    {activeVideo.title}
                  </Text>
                ) : null}
                {activeVideo?.description ? (
                  <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}> 
                    {activeVideo.description}
                  </Text>
                ) : null}
                {activeVideo?.category ? (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}> 
                    <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}> 
                      {activeVideo.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <Pressable
              style={[styles.videoCenter, { height: windowHeight }]}
              onPress={() => {
                if (!canCycleVideos) return;
                setCurrentVideo((prev) => (prev + 1) % videos.length);
                setLiked(false);
                setCarouselIndex(0);
              }}
            >
              <Image
                source={{ uri: streamingVideoUrl }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.infoWrapper}>
                {uploaderCard ? (
                  <View style={styles.uploaderCardWrap}>
                    <FifaCard
                      username={uploaderCard.username || uploaderName}
                      position={uploaderCard.position}
                      team={uploaderCard.teamName}
                      backgroundUrl={uploaderCard.teamImageUrl}
                      frameUrl={uploaderCard.frameImageId}
                      frameId={uploaderCard.frameId}
                      photoUrl={uploaderCard.profileImageUrl}
                      size="small"
                      disableShadow
                    />
                  </View>
                ) : null}
                <Text style={[styles.title, { color: colors.white, fontSize: typography.sizes.lg * textScale, fontWeight: '700' }]}>@
                  {activeVideo?.user || uploaderName}
                </Text>
                {activeVideo?.title ? (
                  <Text style={[styles.description, { color: colors.white, fontSize: typography.sizes.md * textScale }]}> 
                    {activeVideo.title}
                  </Text>
                ) : null}
                {activeVideo?.description ? (
                  <Text style={[styles.descriptionText, { color: '#DDD', fontSize: typography.sizes.sm * textScale }]}> 
                    {activeVideo.description}
                  </Text>
                ) : null}
                {activeVideo?.category ? (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}> 
                    <Text style={[styles.categoryText, { color: colors.black, fontWeight: '700', fontSize: typography.sizes.xs * textScale }]}> 
                      {activeVideo.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )
        )}

        <View style={[styles.sideActions, { right: spacing.md }]}> 
          <Pressable onPress={() => setLiked((prev) => !prev)} style={styles.actionWrap} disabled={!activeVideo}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? colors.danger : colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>
              {formatLikes((activeVideo?.likes || 0) + (liked ? 1 : 0))}
            </Text>
          </Pressable>

          <Pressable onPress={openComments} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="chatbubble-outline" size={26} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>
              {activeVideo?.commentsCount || 0}
            </Text>
          </Pressable>

          <Pressable onPress={() => setShowShare(true)} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="share-social-outline" size={26} color={colors.white} />
            </View>
          </Pressable>
        </View>
      </SafeAreaView>

      {showComments ? (
        <View style={styles.commentsLayer} pointerEvents="box-none">
          <Pressable style={[StyleSheet.absoluteFill, styles.commentsBackdropPressable]} onPress={closeComments}>
            <Animated.View style={[styles.commentsBackdrop, { backgroundColor: colors.overlay, opacity: commentsAnim }]} pointerEvents="none" />
          </Pressable>
          <Animated.View
            style={[
              styles.bottomSheet,
              styles.commentsPanel,
              {
                backgroundColor: colors.surface,
                transform: [{ translateX: commentsTranslateY }],
                opacity: commentsAnim,
              },
            ]}
            pointerEvents="auto"
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}> 
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontFamily: typography.families.nougat, fontSize: typography.sizes.xl * textScale, textAlign: 'left', flex: 1 }}>
                Comentarios
              </Text>
              <Pressable onPress={closeComments}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>

            {activeVideo?.id && commentsByVideo[activeVideo.id] === undefined ? (
              <View style={styles.embeddedCommentsEmpty}>
                <Text style={{ color: colors.textMuted }}>Cargando comentarios...</Text>
              </View>
            ) : activeComments.length === 0 ? (
              <View style={styles.embeddedCommentsEmpty}>
                <Text style={{ color: colors.textMuted }}>Este post aun no tiene comentarios.</Text>
              </View>
            ) : (
              <FlatList
                data={activeComments}
                keyExtractor={(item, index) => String(item.id || item._id || index)}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <FifaCard
                      username={item.author || item.authorUsername || 'Usuario'}
                      team={item.authorTeamName || 'Sin equipo'}
                      position="---"
                      photoUrl={item.authorProfileImageUrl}
                      backgroundUrl={item.authorTeamImageUrl}
                      frameUrl={item.authorFrameImageId}
                      size="small"
                      disableShadow
                    />
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentHeaderRow} pointerEvents="box-none">
                        <Text
                          style={[styles.commentHeaderText, { color: colors.text, fontWeight: typography.weights.semibold }]}
                          pointerEvents="none"
                        >
                          @{item.author || item.authorUsername || 'Usuario'}
                          {(item.type || item?.type) === 'audio' ? '  -  Mensaje de Audio' : ''}
                        </Text>
                        {String(item.userId || '').trim().toLowerCase() === String(user?.email || '').trim().toLowerCase() ? (
                          <Pressable
                            onPress={() => handleDeleteComment(item)}
                            onMouseDown={() => handleDeleteComment(item)}
                            onTouchStart={() => handleDeleteComment(item)}
                            style={[styles.commentDelete, { backgroundColor: colors.danger }]}
                            hitSlop={12}
                            pointerEvents="auto"
                          >
                            <Ionicons name="trash" size={14} color={colors.white} />
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={{ color: colors.textMuted }}>
                        {(item.type || item?.type) === 'audio' ? 'Mensaje de Audio' : (item.content || 'Comentario sin texto')}
                      </Text>
                      {(item.type || item?.type) === 'audio' ? (
                        <Pressable
                          onPress={() => handleToggleAudio(item)}
                          style={[styles.audioBubble, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                        >
                          <Ionicons
                            name={activeAudioId === item.id && isAudioPlaying ? 'pause' : 'play'}
                            size={20}
                            color={colors.text}
                          />
                          <Text style={{ color: colors.text, marginLeft: 10, fontWeight: '700' }}>
                            {activeAudioId === item.id ? formatTime(audioPositionMs) : '0:00'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )}
              />
            )}

            <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}> 
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Anade un comentario..."
                placeholderTextColor={colors.textMuted}
                style={[styles.commentInput, { backgroundColor: colors.surfaceElevated, color: colors.text }]}
              />
              <Pressable style={[styles.actionCircle, { backgroundColor: colors.primary }]} onPress={handleSendComment} disabled={loadingNewComment}>
                <Ionicons name="send" size={18} color={colors.black} />
              </Pressable>
              <Pressable style={[styles.actionCircle, { backgroundColor: colors.surfaceElevated }]} onPress={handleToggleRecording} disabled={loadingNewComment}>
                <Ionicons name="mic" size={18} color={colors.text} />
              </Pressable>
            </View>
            {isRecording || isUploadingAudio ? (
              <View style={styles.recordingBar}>
                <View style={styles.recordingDot} />
                <Text style={{ color: colors.text }}>{isUploadingAudio ? 'Subiendo audio...' : 'Grabando audio...'}</Text>
              </View>
            ) : null}
          </Animated.View>
        </View>
      ) : null}

      <Modal
        visible={Boolean(pendingDeleteComment)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDeleteComment(null)}
      >
        <View style={[styles.deleteConfirmOverlay, { backgroundColor: colors.overlay }]}> 
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDeleteComment(null)} />
          <View style={[styles.deleteConfirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
              Desea borrar el comentario
            </Text>
            <View style={styles.deleteConfirmActions}>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => setPendingDeleteComment(null)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.danger }]}
                onPress={confirmDeleteComment}
              >
                <Text style={{ color: colors.white, fontWeight: '700' }}>Borrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showShare} transparent animationType="fade" onRequestClose={closeShareModal}>
        <Pressable style={styles.shareOverlay} onPress={closeShareModal}>
          <Pressable style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontFamily: typography.families.nougat, fontSize: typography.sizes.xl * textScale, marginBottom: spacing.md }}>
              {shareModalTitle}
            </Text>

            <View style={{ width: '100%', flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
              <Pressable onPress={handleCopyShareLink} style={[styles.shareRectButton, { backgroundColor: colors.primary }]}>
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Ionicons name="link" size={28} color={colors.white} />
                </View>
                <Text style={{ color: colors.white, fontWeight: '700', textAlign: 'center' }}>
                  Copiar enlace
                </Text>
              </Pressable>

              <Pressable onPress={handleShareToFanZone} style={[styles.shareRectButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' }}>
                  <Image source={fanZoneShieldUri ? { uri: fanZoneShieldUri } : require('../../../assets/perfil/teamChange_light.png')} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="contain" />
                </View>
                <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>Compartir en Fan Zone</Text>
              </Pressable>
            </View>

            <Pressable onPress={handleDownloadVideo} style={[styles.downloadButton, { backgroundColor: colors.primary }]}> 
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Ionicons name="download-outline" size={22} color={colors.white} />
                <Text style={{ color: colors.white, fontWeight: '800', letterSpacing: 0.8 }}>
                  DESCARGAR
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(pendingDeleteVideo)} transparent animationType="fade" onRequestClose={() => setPendingDeleteVideo(null)}>
        <Pressable
          style={[
            styles.overlay,
            { backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' },
          ]}
          onPress={() => setPendingDeleteVideo(null)}
        >
          <Pressable style={[styles.dialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale, marginBottom: 8 }}>
              Eliminar video?
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: 16 }}>Esta accion no se puede deshacer.</Text>
            <View style={styles.dialogActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setPendingDeleteVideo(null)} style={{ flex: 1 }} />
              <AppButton title="Eliminar" variant="danger" loading={deletingVideo} onPress={handleDeleteVideo} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <LoadingOverlay visible={isBlocking} />
    </View>
    )
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  embeddedRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  embeddedVideoPane: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  embeddedTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
  },
  embeddedCommentsPanel: {
    flex: 1,
    borderLeftWidth: 1,
  },
  embeddedCommentsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  embeddedCommentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  safeArea: {
    flex: 1,
  },
  embeddedSafeArea: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 5,
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonSpacer: {
    width: 42,
    height: 42,
  },
  videoCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  videoFill: {
    width: '100%',
    height: '100%',
  },
  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
  },
  embeddedActionColumn: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    alignItems: 'center',
    gap: 20,
    zIndex: 7,
  },
  carouselScroll: {
    flex: 1,
    width: '100%',
  },
  carouselContent: {
    flexGrow: 1,
  },
  sideActions: {
    position: 'absolute',
    bottom: 118,
    alignItems: 'center',
    gap: 20,
  },
  actionWrap: {
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.72)' },
  shareCard: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 24, paddingHorizontal: 30, paddingVertical: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  shareRectButton: { flex: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  circleIconButton: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  downloadButton: { width: '100%', paddingVertical: 18, paddingHorizontal: 18, borderRadius: 28 },
  infoWrapper: {
    position: 'absolute',
    left: 16,
    right: 90,
    bottom: 24,
    zIndex: 4,
  },
  title: {
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  description: {
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  descriptionText: {
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  uploaderCardWrap: {
    marginBottom: 6,
  },
  categoryBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    textTransform: 'uppercase',
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  carouselDotsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 72,
    paddingTop: 2,
    paddingBottom: 8,
    alignItems: 'center',
    zIndex: 6,
  },
  carouselDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'stretch',
    alignItems: 'flex-end',
    zIndex: 20,
  },
  commentsBackdropPressable: {
    zIndex: 1,
  },
  commentsBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  commentsPanel: {
    position: 'relative',
    zIndex: 2,
  },
  bottomSheet: {
    width: '92%',
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
  },
  shareSheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
    paddingBottom: 40,
  },
  shareOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  shareCard: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 30,
    paddingVertical: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  shareRectButton: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  downloadButton: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 28,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentHeaderText: {
    flex: 1,
    marginRight: 8,
    flexShrink: 1,
  },
  commentDelete: {
    position: 'relative',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    zIndex: 5,
  },
  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  deleteConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 10,
  },
  deleteConfirmCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  deleteConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  commentInputRow: {
    borderTopWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  audioBubble: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  commentInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  dialog: {
    margin: 20,
    borderRadius: 18,
    padding: 18,
    width: '40%',
    alignSelf: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 8,
  },
  carouselArrow: {
    position: 'absolute',
    top: '50%',
    width: 52,
    height: 52,
    marginTop: -26,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  carouselArrowLeft: {
    left: 72,
  },
  carouselArrowRight: {
    right: 72,
  },
});
