import React, { useCallback, useMemo, useState } from 'react';
import {
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CarFront,
  ChevronRight,
  GraduationCap,
  House,
  Wallet,
} from 'lucide-react-native';
import { fetchLoanTypes } from '../api/loans';
import { ApiError } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { LoanType } from '../../types';
import { colors, spacing } from '../../constants/theme';

type ProgramTheme = {
  colors: [string, string, string];
  iconBg: string;
  iconColor: string;
  accent: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  image?: string;
};

const formatCurrency = (value: number) =>
  `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const getProgramTheme = (loanType: LoanType, index: number): ProgramTheme => {
  const name = loanType.name.toLowerCase();

  if (name.includes('entrepreneur') || name.includes('business') || name.includes('micro')) {
    return {
      colors: ['#3249D8', '#5369F6', '#8B9AFF'],
      iconBg: 'rgba(255,255,255,0.18)',
      iconColor: '#FFFFFF',
      accent: '#C7D2FE',
      icon: BriefcaseBusiness,
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80',
    };
  }

  if (name.includes('home') || name.includes('housing') || name.includes('mortgage')) {
    return {
      colors: ['#155E75', '#0F9D9A', '#5DD6D0'],
      iconBg: 'rgba(255,255,255,0.18)',
      iconColor: '#FFFFFF',
      accent: '#DCE6FF',
      icon: House,
      image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=600&q=80',
    };
  }

  if (name.includes('car') || name.includes('auto') || name.includes('vehicle')) {
    return {
      colors: ['#7C2D12', '#C2410C', '#FB923C'],
      iconBg: 'rgba(255,255,255,0.18)',
      iconColor: '#FFFFFF',
      accent: '#FED7AA',
      icon: CarFront,
      image: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80',
    };
  }

  if (name.includes('student') || name.includes('education') || name.includes('school')) {
    return {
      colors: ['#1D4ED8', '#2563EB', '#60A5FA'],
      iconBg: 'rgba(255,255,255,0.18)',
      iconColor: '#FFFFFF',
      accent: '#B9C8FF',
      icon: GraduationCap,
      image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&q=80',
    };
  }

  if (index % 2 === 0) {
    return {
      colors: ['#5B21B6', '#7C3AED', '#A78BFA'],
      iconBg: 'rgba(255,255,255,0.18)',
      iconColor: '#FFFFFF',
      accent: '#DDD6FE',
      icon: Building2,
      image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&q=80',
    };
  }

  return {
    colors: ['#0F766E', '#0D9488', '#5EEAD4'],
    iconBg: 'rgba(255,255,255,0.18)',
    iconColor: '#FFFFFF',
    accent: '#99F6E4',
    icon: Wallet,
    image: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&q=80',
  };
};

export const LoanProgramsScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const narrow = width < 370;
  const shellMaxWidth = 470;
  const preloadedLoanTypes = useMemo<LoanType[]>(
    () => route?.params?.loanPrograms ?? [],
    [route?.params?.loanPrograms]
  );
  const [loanTypes, setLoanTypes] = useState<LoanType[]>(preloadedLoanTypes);
  const [loading, setLoading] = useState(preloadedLoanTypes.length === 0);
  const [error, setError] = useState<string | null>(null);

  const loadLoanPrograms = useCallback(async () => {
    if (loanTypes.length === 0) {
      setLoading(true);
    }
    setError(null);

    try {
      const loanTypeData = await fetchLoanTypes();
      setLoanTypes(loanTypeData.filter((loanType) => loanType.active));
    } catch (loadError) {
      if (loanTypes.length === 0) {
        setLoanTypes(preloadedLoanTypes);
        setError(loadError instanceof ApiError ? loadError.message : 'Unable to load loan programs right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [loanTypes.length, preloadedLoanTypes]);

  useFocusEffect(
    useCallback(() => {
      if (preloadedLoanTypes.length > 0) {
        setLoanTypes(preloadedLoanTypes);
        setLoading(false);
      }
    }, [preloadedLoanTypes])
  );

  useFocusEffect(
    useCallback(() => {
      void loadLoanPrograms();
    }, [loadLoanPrograms])
  );

  const activeLoanTypes = useMemo(
    () =>
      loanTypes.map((loanType, index) => ({
        loanType,
        theme: getProgramTheme(loanType, index),
      })),
    [loanTypes]
  );
  const lowestRate = useMemo(
    () =>
      activeLoanTypes.length > 0
        ? Math.min(...activeLoanTypes.map(({ loanType }) => loanType.baseInterestRate))
        : 0,
    [activeLoanTypes]
  );
  const highestAmount = useMemo(
    () =>
      activeLoanTypes.length > 0
        ? Math.max(...activeLoanTypes.map(({ loanType }) => loanType.maxAmount))
        : 0,
    [activeLoanTypes]
  );

  const goToSelectedProgram = (loanType: LoanType) => {
    navigation.navigate('Documents', {
      selectedLoanTypeId: loanType.id,
      loanPrograms: loanTypes,
      returnTo: 'LoanPrograms',
    });
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#E9EEFF" />
      <LinearGradient
        colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: narrow ? 14 : compact ? 18 : 22,
            paddingBottom: tabBarHeight + spacing.xl + (compact ? spacing.lg : spacing.md),
            width: '100%',
            maxWidth: shellMaxWidth,
            alignSelf: 'center',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Home')}
        >
          <ArrowLeft size={18} color="#102A5B" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Loan Programs</Text>
          <Text style={styles.title}>Choose the loan you want to apply for</Text>
          <Text style={styles.subtitle}>
            Select a program to continue with your application details and amount selection.
          </Text>
        </View>

        {!loading && !error && activeLoanTypes.length > 0 ? (
          <LinearGradient
            colors={['#1E3A8A', '#2F56D4', '#4169E1']}
            start={{ x: 0, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <Text style={styles.summaryEyebrow}>Mobile-first picks</Text>
            <Text style={styles.summaryTitle}>Borrow in a few taps with clearer choices</Text>
            <Text style={styles.summarySubtitle}>
              Compare active programs, review the limit, then continue straight to the document flow.
            </Text>
            <View style={[styles.summaryStatsRow, compact ? styles.summaryStatsRowCompact : undefined]}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{activeLoanTypes.length}</Text>
                <Text style={styles.summaryStatLabel}>Programs</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{formatCurrency(highestAmount)}</Text>
                <Text style={styles.summaryStatLabel}>Top limit</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{lowestRate.toFixed(2)}%</Text>
                <Text style={styles.summaryStatLabel}>Lowest rate</Text>
              </View>
            </View>
          </LinearGradient>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading available programs...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <Card style={styles.stateCard}>
            <Text style={styles.stateTitle}>Unable to load programs</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Button title="Try again" onPress={() => void loadLoanPrograms()} />
          </Card>
        ) : null}

        {!loading && !error && activeLoanTypes.length === 0 ? (
          <Card style={styles.stateCard}>
            <Text style={styles.stateTitle}>No programs available</Text>
            <Text style={styles.stateText}>There are no active loan programs available right now.</Text>
            <Button title="Back to home" onPress={() => navigation.navigate('Home')} variant="secondary" />
          </Card>
        ) : null}

        {!loading && !error
          ? activeLoanTypes.map(({ loanType, theme }) => {
              const ProgramIcon = theme.icon;
              return (
                <TouchableOpacity
                  key={loanType.id}
                  activeOpacity={0.9}
                  style={styles.programTouch}
                  onPress={() => goToSelectedProgram(loanType)}
                >
                  <LinearGradient
                    colors={theme.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.programCard,
                      compact ? styles.programCardCompact : undefined,
                      narrow ? styles.programCardNarrow : undefined,
                    ]}
                  >
                    {theme.image ? (
                      <Image
                        source={{ uri: theme.image }}
                        style={styles.programImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View style={[styles.blobLarge, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
                    <View style={[styles.blobSmall, { backgroundColor: 'rgba(255,255,255,0.14)' }]} />

                    <View
                      style={[
                        styles.programContent,
                        compact ? styles.programContentCompact : undefined,
                        narrow ? styles.programContentNarrow : undefined,
                      ]}
                    >
                      <View style={[styles.programIconWrap, { backgroundColor: theme.iconBg }]}>
                        <ProgramIcon size={22} color={theme.iconColor} strokeWidth={2.1} />
                      </View>

                      <View style={[styles.programBody, compact ? styles.programBodyCompact : undefined]}>
                        <Text
                          style={[styles.programName, compact ? styles.programNameCompact : undefined]}
                          numberOfLines={compact ? 2 : 3}
                        >
                          {loanType.name}
                        </Text>
                        <Text style={styles.programMeta}>
                          {formatCurrency(loanType.minAmount)} to {formatCurrency(loanType.maxAmount)}
                        </Text>
                        {compact ? (
                          <>
                            <Text style={styles.programMetaSecondary}>
                              Terms: {loanType.termsInMonths.join(', ')} months
                            </Text>
                            <Text style={styles.programMetaSecondary}>
                              Base rate: {loanType.baseInterestRate.toFixed(2)}%
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.programMetaSecondary}>
                            {loanType.termsInMonths.join(', ')} months | {loanType.baseInterestRate.toFixed(2)}% base rate
                          </Text>
                        )}
                      </View>

                      <View
                        style={[
                          styles.programArrow,
                          compact ? styles.programArrowCompact : undefined,
                          narrow ? styles.programArrowNarrow : undefined,
                        ]}
                      >
                        <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.6} />
                      </View>
                    </View>

                    <View style={[styles.programFooter, compact ? styles.programFooterCompact : undefined]}>
                      <Text style={[styles.programFooterText, { color: theme.accent }]}>
                        {compact ? 'Tap to continue' : 'Tap to continue your application'}
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E9EEFF',
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: '#4169E1',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: '#51627E',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 340,
  },
  summaryCard: {
    borderRadius: 28,
    padding: 20,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  summaryEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: spacing.xs,
  },
  summarySubtitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  summaryStatsRowCompact: {
    flexWrap: 'wrap',
  },
  summaryStat: {
    flex: 1,
    minWidth: 96,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  summaryStatValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  summaryStatLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    color: colors.textLight,
    fontSize: 13,
    fontWeight: '600',
  },
  stateCard: {
    gap: spacing.sm,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  stateText: {
    color: colors.textLight,
    fontSize: 14,
    lineHeight: 21,
  },
  programTouch: {
    borderRadius: 28,
  },
  programCard: {
    minHeight: 150,
    borderRadius: 28,
    padding: 18,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 7,
  },
  programCardCompact: {
    minHeight: 144,
    borderRadius: 24,
    padding: 16,
  },
  programCardNarrow: {
    minHeight: 0,
    padding: 14,
  },
  programImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '55%',
    height: '100%',
    opacity: 0.18,
  },
  blobLarge: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -72,
    right: -55,
  },
  blobSmall: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    bottom: -34,
    left: -18,
  },
  programContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  programContentCompact: {
    alignItems: 'flex-start',
  },
  programContentNarrow: {
    flexDirection: 'column',
    gap: 10,
  },
  programIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programBody: {
    flex: 1,
  },
  programBodyCompact: {
    minWidth: 0,
  },
  programName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  programNameCompact: {
    fontSize: 19,
    lineHeight: 23,
  },
  programMeta: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '700',
  },
  programMetaSecondary: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    marginTop: 4,
  },
  programArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  programArrowCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginTop: 2,
  },
  programArrowNarrow: {
    alignSelf: 'flex-end',
    marginTop: 0,
  },
  programFooter: {
    marginTop: 'auto',
    paddingTop: spacing.md,
  },
  programFooterCompact: {
    paddingTop: spacing.sm,
  },
  programFooterText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 15,
  },
});
