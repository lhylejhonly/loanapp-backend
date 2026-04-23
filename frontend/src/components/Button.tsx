import React, { useRef } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from './LinearGradient';
import { colors, radii, spacing } from '../../constants/theme';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export const Button = ({ title, onPress, loading, disabled, variant = 'primary' }: Props) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = (toValue: number) => {
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 5, bounciness: 6 }).start();
  };

  if (variant === 'secondary') {
    return (
      <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, (loading || disabled) && styles.disabled]}
          onPress={onPress}
          disabled={loading || disabled}
          onPressIn={() => animateScale(0.97)}
          onPressOut={() => animateScale(1)}
        >
          {loading
            ? <ActivityIndicator color={colors.primary} />
            : <Text style={styles.secondaryText}>{title}</Text>}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        disabled={loading || disabled}
        onPressIn={() => animateScale(0.97)}
        onPressOut={() => animateScale(1)}
        style={({ pressed }) => [(loading || disabled) && styles.disabled, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={[colors.gradStart, colors.gradMid, colors.gradEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.primaryButton}
        >
          {loading
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.primaryText}>{title}</Text>}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  primaryButton: {
    minHeight: 52,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  secondaryText: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' },
});
