import { useEffect, useMemo, useRef, useState } from 'react';
import { useFirstVisit } from '../hooks/useFirstVisit';
import { Image, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Asset } from 'expo-asset';
import Pressable from './A11yPressable';

const tutorialPages = [
  {
    key: '1',
    image: require('../../assets/tutorial/mobile/1.png'),
  },
  {
    key: '2',
    image: require('../../assets/tutorial/mobile/2.png'),
  },
  {
    key: '3',
    image: require('../../assets/tutorial/mobile/3.png'),
  },
];

export default function PresentationPopup({ visible = true, onClose }) {
  const { width, height } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef(null);
  const handleClose = typeof onClose === 'function' ? onClose : () => {};

  const { isFirstVisit, loading, markFirstVisitSeen } = useFirstVisit();

  // Only show the popup when the hook determines this is the first visit
  const modalVisible = Boolean(visible) && !loading && isFirstVisit;

  const popupWidth = width * 0.95;
  const popupHeight = height * 0.8;

  const tutorialPagesWithRatio = useMemo(
    () => tutorialPages.map((page) => {
      const asset = Asset.fromModule(page.image);
      const assetWidth = Number(asset?.width || 1);
      const assetHeight = Number(asset?.height || 1);
      const aspectRatio = assetWidth > 0 && assetHeight > 0 ? assetWidth / assetHeight : 1;

      return {
        ...page,
        aspectRatio,
      };
    }),
    []
  );

  useEffect(() => {
    if (!modalVisible) return;
    setPageIndex(0);
  }, [modalVisible]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ x: popupWidth * pageIndex, y: 0, animated: false });
  }, [pageIndex, popupWidth]);

  const buttonConfig = useMemo(() => {
    if (pageIndex === 0) {
      return {
        backLabel: 'SALTAR',
        nextLabel: 'CONTINUAR',
        onBack: async () => {
          try { await markFirstVisitSeen(); } catch (e) {}
          handleClose();
        },
        onNext: () => setPageIndex(1),
      };
    }

    if (pageIndex === tutorialPages.length - 1) {
      return {
        backLabel: 'ATRAS',
        nextLabel: 'ENTENDIDO',
        onBack: () => setPageIndex((current) => Math.max(0, current - 1)),
        onNext: async () => {
          try { await markFirstVisitSeen(); } catch (e) {}
          handleClose();
        },
      };
    }

    return {
      backLabel: 'ATRAS',
      nextLabel: 'CONTINUAR',
      onBack: () => setPageIndex((current) => Math.max(0, current - 1)),
        onNext: () => setPageIndex((current) => Math.min(tutorialPagesWithRatio.length - 1, current + 1)),
    };
  }, [handleClose, pageIndex, tutorialPagesWithRatio.length]);

  return (
    <Modal visible={modalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={async () => { try { await markFirstVisitSeen(); } catch (e) {} handleClose(); }}>
      <View style={styles.backdrop}>
        <LinearGradient colors={['#052e16', '#166534', '#22c55e']} style={[styles.popup, { width: popupWidth, height: popupHeight }]}>
          <View style={styles.pageViewport}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ width: popupWidth * tutorialPagesWithRatio.length }}
            >
                {tutorialPagesWithRatio.map((page, index) => (
                <View key={page.key} style={[styles.page, { width: popupWidth }]}> 
                    <Image
                        source={page.image}
                        style={{
                            width: popupWidth,
                            height: '100%',
                        }}
                        resizeMode="contain"
                    accessibilityLabel={`Tutorial paso ${index + 1}`}
                    />
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.footerWrap}>
            <View style={styles.footer}>
              <Pressable
                onPress={buttonConfig.onBack}
                style={[styles.footerButton, styles.footerButtonSecondary]}
                accessibilityLabel={buttonConfig.backLabel}
              >
                <Text style={styles.footerButtonText}>{buttonConfig.backLabel}</Text>
              </Pressable>
              <Pressable
                onPress={buttonConfig.onNext}
                style={[styles.footerButton, styles.footerButtonPrimary]}
                accessibilityLabel={buttonConfig.nextLabel}
              >
                <Text style={[styles.footerButtonText, styles.footerButtonPrimaryText]}>{buttonConfig.nextLabel}</Text>
              </Pressable>
            </View>
          </View>
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
    padding: 12,
  },
  popup: {
    borderRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  pageViewport: {
    flex: 1,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  page: {
  width: '100%',
  height: '100%',
  alignItems: 'center',
  justifyContent: 'flex-start',
  },
  pageImage: {
    alignSelf: 'center',
  },
  footerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  footerButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  footerButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  footerButtonPrimary: {
    backgroundColor: '#D1FAE5',
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ECFDF5',
    letterSpacing: 0.2,
  },
  footerButtonPrimaryText: {
    color: '#064E3B',
  },
});