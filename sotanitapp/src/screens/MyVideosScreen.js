import { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../hooks/useAppTheme';
import FifaCard from '../components/FifaCard';
import AppButton from '../components/AppButton';
import { feedVideos } from '../utils/mockData';
import { formatLikes } from '../utils/format';

export default function MyVideosScreen({ navigation, route }) {
  const { user } = useAuth();
  const { colors, gradients, spacing, typography, textScale } = useAppTheme();
  const [currentVideo, setCurrentVideo] = useState(route.params?.videoIndex || 0);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentText, setCommentText] = useState('');
  const commentsAnim = useRef(new Animated.Value(0)).current;

  const activeVideo = feedVideos[currentVideo] || feedVideos[0];

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
      }
    });
  };

  const commentsTranslateY = commentsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
  });

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.video} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.topBar, { padding: spacing.md }]}> 
          <Pressable onPress={() => navigation.goBack()} style={[styles.roundButton, { backgroundColor: `${colors.black}88` }]}> 
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>

          <Pressable onPress={() => setShowDeleteConfirm(true)} style={[styles.roundButton, { backgroundColor: `${colors.danger}CC` }]}> 
            <Ionicons name="trash" size={20} color={colors.white} />
          </Pressable>
        </View>

        <Pressable style={styles.videoCenter} onPress={() => setCurrentVideo((prev) => (prev + 1) % feedVideos.length)}>
          <Ionicons name="play-circle" size={90} color={`${colors.white}55`} />
          <Text style={{ color: `${colors.white}80`, marginTop: spacing.xs }}>Tu video</Text>
        </Pressable>

        <View style={[styles.sideActions, { right: spacing.md }]}> 
          <FifaCard
            size="small"
            username={user?.username || activeVideo.user}
            team={user?.team || activeVideo.team}
            position={user?.position || activeVideo.position}
            backgroundUrl={user?.teamImageUrl}
            frameUrl={user?.frameImageId}
          />

          <Pressable onPress={() => setLiked((prev) => !prev)} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? colors.danger : colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>{formatLikes(activeVideo.likes + (liked ? 1 : 0))}</Text>
          </Pressable>

          <Pressable onPress={openComments} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="chatbubble-outline" size={26} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: typography.sizes.xs * textScale }}>234</Text>
          </Pressable>

          <Pressable onPress={() => setShowShare(true)} style={styles.actionWrap}>
            <View style={[styles.actionCircle, { backgroundColor: `${colors.black}88` }]}> 
              <Ionicons name="share-social-outline" size={26} color={colors.white} />
            </View>
          </Pressable>
        </View>
      </SafeAreaView>

      {showComments ? (
        <View style={styles.commentsLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeComments}>
            <Animated.View style={[styles.commentsBackdrop, { backgroundColor: colors.overlay, opacity: commentsAnim }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: colors.surface,
                transform: [{ translateX: commentsTranslateY }],
                opacity: commentsAnim,
              },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}> 
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>
                Comentarios
              </Text>
              <Pressable onPress={closeComments}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>

            <FlatList
              data={[1, 2, 3, 4, 5]}
              keyExtractor={(item) => String(item)}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={[styles.commentAvatar, { backgroundColor: colors.surfaceElevated }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: typography.weights.semibold }}>Usuario{item}</Text>
                    <Text style={{ color: colors.textMuted }}>Que golazo! Increible jugada.</Text>
                  </View>
                </View>
              )}
            />

            <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}> 
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Anade un comentario..."
                placeholderTextColor={colors.textMuted}
                style={[styles.commentInput, { backgroundColor: colors.surfaceElevated, color: colors.text }]}
              />
              <Pressable style={[styles.actionCircle, { backgroundColor: colors.primary }]} onPress={() => setCommentText('')}>
                <Ionicons name="send" size={18} color={colors.black} />
              </Pressable>
              <Pressable style={[styles.actionCircle, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}}>
                <Ionicons name="mic" size={18} color={colors.text} />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}

      <Modal visible={showShare} transparent animationType="slide" onRequestClose={() => setShowShare(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setShowShare(false)}>
          <Pressable style={[styles.shareSheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale }}>
                Compartir
              </Text>
              <Pressable onPress={() => setShowShare(false)}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>

            <AppButton title="Compartir enlace" variant="secondary" style={{ marginBottom: spacing.sm }} />
            <AppButton title="Descargar video" variant="secondary" />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={[styles.dialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg * textScale, marginBottom: 8 }}>
              Eliminar video?
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: 16 }}>Esta accion no se puede deshacer.</Text>
            <View style={styles.dialogActions}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1 }} />
              <AppButton title="Eliminar" variant="danger" onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
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
  videoCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
  commentsBackdrop: {
    ...StyleSheet.absoluteFillObject,
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
  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  commentInputRow: {
    borderTopWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
