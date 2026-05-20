import { Platform, Pressable as RNPressable } from 'react-native';

const activationKeys = new Set(['Enter', ' ', 'Spacebar']);

export default function A11yPressable({
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
  focusable,
  onKeyDown,
  ...rest
}) {
  const isInteractive = typeof onPress === 'function';
  const resolvedFocusable = focusable ?? isInteractive;

  const handleKeyDown = (event) => {
    if (disabled || !isInteractive) return;
    const key = event?.nativeEvent?.key || event?.key;
    if (!activationKeys.has(key)) return;
    event?.preventDefault?.();
    onPress?.(event);
  };

  return (
    <RNPressable
      {...rest}
      onPress={onPress}
      disabled={disabled}
      accessible={isInteractive ? true : rest.accessible}
      accessibilityRole={isInteractive ? accessibilityRole : rest.accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? rest.accessibilityLabel}
      focusable={resolvedFocusable}
      onKeyDown={Platform.OS === 'web' && isInteractive ? handleKeyDown : onKeyDown}
    />
  );
}
