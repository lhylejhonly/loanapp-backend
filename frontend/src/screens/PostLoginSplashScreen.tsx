import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { colors, spacing } from '../../constants/theme';

export const PostLoginSplashScreen = () => {
  const { width } = useWindowDimensions();
  const compact = width < 380;

  return (
    <LinearGradient colors={[colors.primaryDeep, colors.primaryDark, colors.primary]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        <View style={styles.content}>
          <View style={[styles.brandBlock, compact ? styles.brandBlockCompact : undefined]}>
            <Text style={[styles.brand, compact ? styles.brandCompact : undefined]}>ElevateFunds</Text>
            <Text style={styles.subtitle}>Please wait a moment</Text>
          </View>

          <View style={styles.loaderWrap}>
            <View style={styles.loaderRing}>
              <ActivityIndicator color="#FFFFFF" size="large" />
            </View>
            <Text style={styles.loadingLabel}>Preparing your dashboard</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 64,
    minHeight: 220,
  },
  brandBlockCompact: {
    minHeight: 180,
    marginBottom: 48,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  brandCompact: {
    fontSize: 30,
  },
  subtitle: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loaderRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  loadingLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -90,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(184,231,255,0.16)',
  },
});
