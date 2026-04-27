import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import {
  BadgePercent,
  Banknote,
  CircleDollarSign,
  Coins,
  Handshake,
  Landmark,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react-native';

type Slide = {
  id: 'onboarding-1' | 'onboarding-2' | 'onboarding-3';
  subtitle: string;
  cta?: boolean;
};

const slides: Slide[] = [
  { id: 'onboarding-1', subtitle: 'Smart Loans, Transparent Terms.\nInstant Approval' },
  { id: 'onboarding-2', subtitle: 'Secure & Fast Processing\nTrusted by Thousands' },
  { id: 'onboarding-3', subtitle: 'Unlock Your Financial Freedom\nStart Your Journey Today', cta: true },
];

const brandLogo = require('../../assets/images/android-icon-foreground.png');

const MoneyIllustration = () => (
  <View style={styles.illustrationShell}>
    <LinearGradient colors={['#DCE6FF', '#B9C8FF']} style={styles.illustrationBackdrop} />
    <View style={styles.iconBadge}>
      <Zap size={48} color="#2F56D4" strokeWidth={2.5} />
    </View>
    <View style={[styles.floatingIcon, { top: 18, left: 28 }]}>
      <TrendingUp size={28} color="#4169E1" strokeWidth={2} />
    </View>
    <View style={[styles.floatingIcon, { top: 18, right: 28 }]}>
      <CircleDollarSign size={28} color="#10B981" strokeWidth={2} />
    </View>
    <View style={[styles.floatingIcon, { bottom: 28, left: 38 }]}>
      <Coins size={24} color="#F59E0B" strokeWidth={2} />
    </View>
    <View style={[styles.floatingIcon, { bottom: 28, right: 38 }]}>
      <Shield size={24} color="#6366F1" strokeWidth={2} />
    </View>
  </View>
);

const LoanIllustration = () => (
  <View style={styles.illustrationShell}>
    <LinearGradient colors={['#E9EEFF', '#DCE6FF']} style={styles.illustrationBackdrop} />
    <View style={styles.iconBadge}>
      <Handshake size={48} color="#2F56D4" strokeWidth={2.5} />
    </View>
    <View style={[styles.floatingIcon, { top: 22, left: 32 }]}>
      <BadgePercent size={30} color="#EC4899" strokeWidth={2} />
    </View>
    <View style={[styles.floatingIcon, { top: 22, right: 32 }]}>
      <Banknote size={30} color="#4169E1" strokeWidth={2} />
    </View>
    <View style={[styles.floatingIcon, { bottom: 32, alignSelf: 'center' }]}>
      <CircleDollarSign size={28} color="#10B981" strokeWidth={2} />
    </View>
  </View>
);

const FreedomIllustration = () => (
  <View style={styles.illustrationShell}>
    <LinearGradient colors={['#DCE6FF', '#B9C8FF']} style={styles.illustrationBackdrop} />
    <View style={styles.iconBadge}>
      <Landmark size={52} color="#2F56D4" strokeWidth={2.5} />
    </View>
    <View style={[styles.floatingIcon, { top: 28, left: 28 }]}>
      <Banknote size={28} color="#10B981" strokeWidth={2} />
    </View>
    <View style={[styles.floatingIcon, { top: 28, right: 28 }]}>
      <TrendingUp size={28} color="#4169E1" strokeWidth={2} />
    </View>
  </View>
);

const renderIllustration = (id: Slide['id']) => {
  if (id === 'onboarding-1') return <MoneyIllustration />;
  if (id === 'onboarding-2') return <LoanIllustration />;
  return <FreedomIllustration />;
};

export const LandingScreen = ({ navigation }: any) => {
  const { width } = useWindowDimensions();
  const [showSplash, setShowSplash] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1400);
    return () => clearTimeout(t);
  }, []);

  const goToSlide = (index: number) => {
    const clamped = Math.max(0, Math.min(index, slides.length - 1));
    setActiveIndex(clamped);
    scrollRef.current?.scrollTo({ x: width * clamped, animated: true });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.x / width), slides.length - 1));
    setActiveIndex((prev) => (prev === idx ? prev : idx));
  };

  if (showSplash) {
    return (
      <LinearGradient colors={['#1E3A8A', '#2F56D4', '#4169E1']} style={styles.splash}>
        <SafeAreaView style={styles.splashInner}>
          <View style={styles.splashGlowTop} />
          <View style={styles.splashGlowBottom} />
          <View style={styles.splashContent}>
            <View style={styles.splashLogoHalo}>
              <View style={styles.splashLogoPlate}>
                <Image source={brandLogo} style={styles.splashLogo} resizeMode="contain" />
              </View>
            </View>
            <Text style={styles.splashBrand}>ElevateFunds</Text>
            <Text style={styles.splashTagline}>Your Financial Partner</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.carouselWrap}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            decelerationRate={0.98}
            disableIntervalMomentum
            snapToInterval={width}
            snapToAlignment="center"
            directionalLockEnabled
            overScrollMode="never"
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onMomentumScrollEnd={handleScroll}
            showsHorizontalScrollIndicator={false}
          >
            {slides.map((slide) => (
              <View key={slide.id} style={[styles.slide, { width }]}>
                <View style={styles.slideContent}>
                  {/* Brand */}
                  <View style={styles.brandRow}>
                    <View style={styles.brandDot} />
                    <Text style={styles.brand}>ElevateFunds</Text>
                  </View>
                  <Text style={styles.subtitle}>{slide.subtitle}</Text>

                  <View style={styles.illustrationWrap}>{renderIllustration(slide.id)}</View>

                  {slide.cta ? (
                    <View style={styles.ctaContainer}>
                      <Pressable style={styles.ctaButton} onPress={() => navigation.navigate('Login')}>
                        <LinearGradient
                          colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.ctaGradient}
                        >
                          <Text style={styles.ctaText}>Log in</Text>
                        </LinearGradient>
                      </Pressable>
                      <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Register')}>
                        <Text style={styles.secondaryButtonText}>Create Account</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.skipBtn} onPress={() => goToSlide(slides.length - 1)}>
                      <Text style={styles.skipText}>Skip {'>'}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((slide, i) => (
            <Pressable
              key={slide.id}
              onPress={() => goToSlide(i)}
              style={[styles.dot, activeIndex === i ? styles.dotActive : styles.dotIdle]}
            />
          ))}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  splash: { flex: 1 },
  splashInner: { flex: 1, overflow: 'hidden' },
  splashContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashGlowTop: {
    position: 'absolute',
    top: -90,
    right: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  splashGlowBottom: {
    position: 'absolute',
    bottom: -110,
    left: -55,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(184,231,255,0.16)',
  },
  splashLogoHalo: {
    width: 172,
    height: 172,
    borderRadius: 86,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  splashLogoPlate: {
    width: 132,
    height: 132,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0C1A2E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
  },
  splashLogo: { width: 88, height: 88 },
  splashBrand: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', letterSpacing: -0.5, marginBottom: 8 },
  splashTagline: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '500' },

  container: { flex: 1 },
  safeArea: { flex: 1 },
  carouselWrap: { flex: 1 },
  slide: { flex: 1 },
  slideContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 36,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4169E1' },
  brand: { color: '#2F56D4', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#4B6A8A', textAlign: 'center', fontSize: 16, fontWeight: '600', lineHeight: 24 },
  illustrationWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  illustrationShell: { width: 240, height: 190, alignItems: 'center', justifyContent: 'center' },
  illustrationBackdrop: { position: 'absolute', width: 190, height: 150, borderRadius: 95 },
  iconBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 100,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  floatingIcon: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    padding: 7,
    borderWidth: 1,
    borderColor: '#E9EEFF',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaContainer: { width: '100%', gap: 10 },
  ctaButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaGradient: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  secondaryButton: {
    width: '100%',
    paddingVertical: 17,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#B9C8FF',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#2F56D4', fontSize: 17, fontWeight: '700' },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  skipText: { color: '#4169E1', fontSize: 14, fontWeight: '700' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 16 },
  dot: { height: 8, borderRadius: 4 },
  dotIdle: { width: 8, backgroundColor: '#DCE6FF' },
  dotActive: { width: 28, backgroundColor: '#4169E1' },
});
