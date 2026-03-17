import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

export default function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  rightIcon,
  onRightPress,
  error,
  multiline = false,
  numberOfLines = 1,
}) {
  const { colors, spacing, typography, textScale } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const styleId = 'sotanita-input-fixes';
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      input:focus, textarea:focus {
        outline: none !important;
        box-shadow: none !important;
      }
      input::-ms-reveal,
      input::-ms-clear {
        display: none !important;
        width: 0;
        height: 0;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <Text
          style={{
            color: colors.text,
            marginBottom: spacing.xs,
            fontWeight: typography.weights.semibold,
            fontSize: typography.sizes.sm * textScale,
          }}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : isFocused ? colors.primary : colors.border,
            paddingHorizontal: spacing.md,
            borderRadius: 14,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          autoComplete={secureTextEntry ? 'off' : undefined}
          textContentType={secureTextEntry ? 'none' : undefined}
          importantForAutofill={secureTextEntry ? 'no' : 'auto'}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          multiline={multiline}
          numberOfLines={numberOfLines}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: typography.sizes.md * textScale,
            minHeight: multiline ? 96 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
            paddingVertical: multiline ? spacing.sm : 0,
            outlineWidth: 0,
            outlineColor: 'transparent',
          }}
        />

        {rightIcon ? (
          <Pressable onPress={onRightPress} style={styles.iconButton}>
            <Ionicons name={rightIcon} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          style={{
            color: colors.danger,
            marginTop: spacing.xs,
            fontSize: typography.sizes.xs * textScale,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
