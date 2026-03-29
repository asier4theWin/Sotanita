import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export default function useResetScrollOnFocus(scrollRef) {
  useFocusEffect(
    useCallback(() => {
      const node = scrollRef?.current;

      if (!node) {
        return undefined;
      }

      const timer = setTimeout(() => {
        if (typeof node.scrollToOffset === 'function') {
          node.scrollToOffset({ offset: 0, animated: false });
          return;
        }

        if (typeof node.scrollTo === 'function') {
          node.scrollTo({ x: 0, y: 0, animated: false });
          return;
        }

        if (typeof node.scrollResponderScrollTo === 'function') {
          node.scrollResponderScrollTo({ x: 0, y: 0, animated: false });
        }
      }, 0);

      return () => clearTimeout(timer);
    }, [scrollRef])
  );
}