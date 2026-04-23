import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import {
  ArrowUpRight,
  Bell,
  Calculator,
  ChevronRight,
  Clock3,
  FileText,
  History,
  MapPin,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { UserAvatar } from '../components/UserAvatar';
import { fetchPublicOverview, PublicOverviewData } from '../api/public';
import { fetchBorrowerLoans, fetchLoanTypes } from '../api/loans';
import { fetchBorrowerPayments } from '../api/payments';
import { fetchBorrowerDocuments } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import { useBorrowerStatus } from '../context/BorrowerStatusContext';
import { Loan, LoanStatus, LoanType, Payment, BorrowerDocument } from '../../types';
import { DocTypes } from '../../constants/docTypes';
import { colors, radii, spacing } from '../../constants/theme';
import { ApiError } from '../api/client';

const STATUS_COLORS: Record<LoanStatus, string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

const DISBURSEMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  gcash: 'GCash',
  maya: 'Maya',
  cash_pickup: 'Cash Pickup',
  cash: 'Cash',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatCurrency = (value: number) =>
  `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatDisbursementTarget = (loan: Loan) => {
  const methodLabel = loan.disbursementMethod ? DISBURSEMENT_LABELS[loan.disbursementMethod] : 'Not set';
  if (loan.disbursementMethod === 'cash_pickup') {
    return methodLabel;
  }

  if (loan.disbursementAccountNumber) {
    return `${methodLabel} ending in ${loan.disbursementAccountNumber.slice(-4)}`;
  }

  return methodLabel;
};

const getBorrowerDisbursementStatusLabel = (loan: Loan) => {
  switch (loan.disbursementStatus) {
    case 'processing':
      return 'Payout processing';
    case 'disbursed':
      return 'Released';
    case 'failed':
      return 'Release failed';
    case 'reversed':
      return 'Release reversed';
    default:
      return 'Pending release';
  }
};

const getMemberLabel = (approvedLoanCount: number, qualified: boolean) => {
  if (approvedLoanCount >= 3) return 'Gold Member';
  if (approvedLoanCount >= 1 || qualified) return 'Silver Member';
  return 'Starter Member';
};

const formatDaysLabel = (days: number) => `${days} day${days === 1 ? '' : 's'}`;

const getRepaymentNextDueLabel = (loan: Loan) => {
  const repayment = loan.repaymentSummary;
  if (!repayment) {
    return 'Schedule pending';
  }
  if (loan.balance <= 0) {
    return 'Completed';
  }
  if (repayment.nextDueDate) {
    return repayment.nextDueDate;
  }
  return loan.disbursementStatus === 'disbursed' ? 'Schedule pending' : 'Starts after release';
};

const getRepaymentStatusLabel = (loan: Loan) => {
  const repayment = loan.repaymentSummary;
  if (!repayment) {
    return undefined;
  }
  if (loan.balance <= 0) {
    return 'Paid in full';
  }
  if (repayment.isOverdue && typeof repayment.daysUntilDue === 'number' && repayment.daysUntilDue < 0) {
    return `Overdue by ${formatDaysLabel(Math.abs(repayment.daysUntilDue))}`;
  }
  if (typeof repayment.daysUntilDue === 'number') {
    if (repayment.daysUntilDue === 0) {
      return 'Due today';
    }
    if (repayment.daysUntilDue > 0) {
      return `Due in ${formatDaysLabel(repayment.daysUntilDue)}`;
    }
  }
  if (!repayment.nextDueDate) {
    return loan.disbursementStatus === 'disbursed' ? 'Awaiting first due date' : 'Repayment begins after release';
  }
  return undefined;
};

type DashboardAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
};

export const BorrowerHomeScreen = ({ navigation, route }: any) => {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const narrowLayout = width < 430;
  const shellMaxWidth = 470;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useAuth();
  const { unreadNotificationCount } = useBorrowerStatus();
  const isGuest = !user;

  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [documents, setDocuments] = useState<BorrowerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [guestOverview, setGuestOverview] = useState<PublicOverviewData | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [selectedLoanTypeId, setSelectedLoanTypeId] = useState('');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState(0);
  const [applySectionY, setApplySectionY] = useState(0);
  const [loanSectionY, setLoanSectionY] = useState(0);
  const [paymentSectionY, setPaymentSectionY] = useState(0);

  const loadUserData = useCallback(async () => {
    setLoading(true);
    try {
      const [loansData, paymentsData, loanTypesData, docsData] = await Promise.all([
        fetchBorrowerLoans(),
        fetchBorrowerPayments(),
        fetchLoanTypes(),
        fetchBorrowerDocuments(),
      ]);
      setLoans(loansData);
      setPayments(paymentsData);
      setLoanTypes(loanTypesData);
      setDocuments(docsData);
    } catch (error) {
      if (error instanceof ApiError) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGuestData = useCallback(async () => {
    setGuestLoading(true);
    setGuestError(null);
    try {
      const overview = await fetchPublicOverview();
      setGuestOverview(overview);
      setLoanTypes(overview.loanTypes);
    } catch (error) {
      setGuestOverview(null);
      setGuestError(
        error instanceof Error ? error.message : 'Unable to reach backend. Please try again.'
      );
    } finally {
      setGuestLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isGuest) {
        void loadGuestData();
      } else {
        void loadUserData();
      }
    }, [isGuest, loadGuestData, loadUserData])
  );

  const hasGovernmentIdDocument = documents.some(
    (d) => d.type === DocTypes.GOVERNMENT_ID || d.type === DocTypes.ID
  );
  const hasSupportingEligibilityDocument =
    user?.employmentStatus === 'student'
      ? documents.some((d) => d.type === DocTypes.STUDENT_ID)
      : user?.employmentStatus === 'self_employed'
      ? documents.some((d) => d.type === DocTypes.PROOF_OF_REVENUE)
      : documents.some((d) => d.type === DocTypes.INCOME_PROOF);
  const supportingEligibilityDocumentLabel =
    user?.employmentStatus === 'student'
      ? 'student ID'
      : user?.employmentStatus === 'self_employed'
      ? 'proof of monthly revenue'
      : 'proof of income';
  const isVerificationQualified = user?.verificationStatus === 'qualified';
  const canSubmitApplication = isGuest || isVerificationQualified;

  const missingRequirements = useMemo(() => {
    if (isGuest || canSubmitApplication) return [];
    const missing: string[] = [];
    if (!isVerificationQualified) missing.push('Pass the strict eligibility check in Settings');
    if (!hasGovernmentIdDocument) missing.push('Upload your government ID');
    if (!hasSupportingEligibilityDocument) missing.push(`Upload your ${supportingEligibilityDocumentLabel}`);
    return missing;
  }, [
    canSubmitApplication,
    hasGovernmentIdDocument,
    hasSupportingEligibilityDocument,
    isGuest,
    isVerificationQualified,
    supportingEligibilityDocumentLabel,
  ]);

  const activeLoanTypes = useMemo(
    () => loanTypes.filter((loanType) => loanType.active),
    [loanTypes]
  );
  const selectedLoanType = activeLoanTypes.find((loanType) => loanType.id === selectedLoanTypeId);

  useEffect(() => {
    if (activeLoanTypes.length === 0) {
      setSelectedLoanTypeId('');
      setAmount('');
      setTermMonths(0);
      return;
    }

    const match = activeLoanTypes.find((loanType) => loanType.id === selectedLoanTypeId);
    if (match) {
      return;
    }

    const first = activeLoanTypes[0];
    setSelectedLoanTypeId(first.id);
    setAmount(String(first.minAmount));
    setTermMonths(first.termsInMonths[0] ?? 0);
  }, [activeLoanTypes, selectedLoanTypeId]);

  const visibleLoans = isGuest ? guestOverview?.recentLoans ?? [] : loans;
  const visiblePayments = isGuest ? guestOverview?.recentPayments ?? [] : payments;
  const approvedBalance = isGuest
    ? guestOverview?.stats.totalDisbursed ?? 0
    : visibleLoans
        .filter((loan) => loan.status === 'approved')
        .reduce((sum, loan) => sum + loan.balance, 0);
  const maxBorrowAmount = useMemo(
    () => activeLoanTypes.reduce((max, type) => Math.max(max, type.maxAmount), 0),
    [activeLoanTypes]
  );
  const quickTerms = useMemo(
    () =>
      Array.from(new Set(activeLoanTypes.flatMap((type) => type.termsInMonths)))
        .sort((a, b) => a - b)
        .slice(0, 4),
    [activeLoanTypes]
  );

  const numericAmount = Number(amount);
  const resolvedAmount = Number.isFinite(numericAmount)
    ? numericAmount
    : selectedLoanType?.minAmount ?? 0;
  const amountStep = selectedLoanType
    ? Math.max(100, Math.round((selectedLoanType.maxAmount - selectedLoanType.minAmount) / 20))
    : 100;
  const estimatedInterest = selectedLoanType
    ? resolvedAmount * (selectedLoanType.baseInterestRate / 100) * (termMonths / 12)
    : 0;
  const monthlyInstallment = termMonths > 0 ? (resolvedAmount + estimatedInterest) / termMonths : 0;
  const topContentPadding = insets.top + (compact ? spacing.sm : spacing.md);

  const scrollToY = useCallback((sectionY: number) => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, sectionY - spacing.md),
      animated: true,
    });
  }, []);

  const focusApplySection = useCallback(() => {
    scrollToY(applySectionY);
  }, [applySectionY, scrollToY]);

  const openLoanPrograms = useCallback(() => {
    if (isGuest) {
      focusApplySection();
      return;
    }

    navigation.navigate('LoanPrograms', {
      loanPrograms: activeLoanTypes,
    });
  }, [activeLoanTypes, focusApplySection, isGuest, navigation]);

  const chooseLoanType = (loanType: LoanType) => {
    if (isGuest) {
      setSelectedLoanTypeId(loanType.id);
      setAmount(String(loanType.minAmount));
      setTermMonths(loanType.termsInMonths[0] ?? 0);
      setTimeout(() => {
        focusApplySection();
      }, 0);
      return;
    }

    navigation.navigate('Documents', {
      selectedLoanTypeId: loanType.id,
      loanPrograms: activeLoanTypes,
      returnTo: 'Home',
    });
  };

  useEffect(() => {
    const requestedLoanTypeId = route?.params?.selectedLoanTypeId as string | undefined;
    const shouldFocusApply = Boolean(route?.params?.shouldFocusApply);
    const selectionNonce = route?.params?.selectionNonce as number | undefined;

    if (!selectionNonce) {
      return;
    }

    if (requestedLoanTypeId) {
      const requestedLoanType = activeLoanTypes.find((loanType) => loanType.id === requestedLoanTypeId);
      if (!requestedLoanType) {
        return;
      }

      setSelectedLoanTypeId(requestedLoanType.id);
      setAmount(String(requestedLoanType.minAmount));
      setTermMonths(requestedLoanType.termsInMonths[0] ?? 0);
    }

    const focusTimer = shouldFocusApply
      ? setTimeout(() => {
          focusApplySection();
        }, 180)
      : undefined;

    navigation.setParams({
      selectedLoanTypeId: undefined,
      shouldFocusApply: undefined,
      selectionNonce: undefined,
    });

    return () => {
      if (focusTimer) {
        clearTimeout(focusTimer);
      }
    };
  }, [
    activeLoanTypes,
    focusApplySection,
    navigation,
    route?.params?.selectedLoanTypeId,
    route?.params?.selectionNonce,
    route?.params?.shouldFocusApply,
  ]);

  const adjustAmount = (direction: -1 | 1) => {
    if (!selectedLoanType) return;
    const current = Number(amount) || selectedLoanType.minAmount;
    const nextAmount = clamp(
      current + direction * amountStep,
      selectedLoanType.minAmount,
      selectedLoanType.maxAmount
    );
    setAmount(String(Math.round(nextAmount)));
  };

  const submitLoanApplication = async () => {
    if (!selectedLoanType) return;

    if (!user) {
      Alert.alert(
        'Login required',
        'Please login or create an account to submit a loan application.',
        [
          { text: 'Create Account', onPress: () => navigation.navigate('Register') },
          { text: 'Login', onPress: () => navigation.navigate('Login') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    if (!isVerificationQualified) {
      Alert.alert(
        'Verification required',
        'Complete borrower verification in your Settings tab before applying.'
      );
      return;
    }

    if (!Number.isFinite(numericAmount)) {
      Alert.alert('Invalid amount', 'Please enter a valid loan amount.');
      return;
    }

    navigation.navigate('Documents', {
      selectedLoanTypeId: selectedLoanType.id,
      requestedAmount: numericAmount,
      requestedTermMonths: termMonths,
      loanPrograms: activeLoanTypes,
      returnTo: 'Home',
    });
  };

  const openDocumentsScreen = useCallback(
    (params?: {
      selectedLoanTypeId?: string;
      requestedAmount?: number;
      requestedTermMonths?: number;
    }) => {
      navigation.navigate('Documents', {
        selectedLoanTypeId: params?.selectedLoanTypeId ?? selectedLoanType?.id ?? activeLoanTypes[0]?.id,
        requestedAmount: params?.requestedAmount,
        requestedTermMonths: params?.requestedTermMonths,
        loanPrograms: activeLoanTypes,
        returnTo: 'Home',
      });
    },
    [activeLoanTypes, navigation, selectedLoanType?.id]
  );

  const pendingLoanCount = loans.filter((loan) => loan.status === 'pending').length;
  const approvedLoanCount = loans.filter((loan) => loan.status === 'approved').length;
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const borrowerStatusLabel = isVerificationQualified
    ? 'Qualified'
    : missingRequirements.length > 0
      ? `${missingRequirements.length} step${missingRequirements.length === 1 ? '' : 's'} left`
      : 'Profile setup';
  const borrowerStatusMessage = isVerificationQualified
    ? 'Your account is ready for a faster application flow.'
    : 'Finish the remaining requirements to unlock smoother borrowing.';

  const quickActions = useMemo<DashboardAction[]>(
    () =>
      isVerificationQualified
        ? []
        : [
            { id: 'apply', label: 'Apply', icon: ArrowUpRight, onPress: focusApplySection },
            { id: 'upload', label: 'Upload', icon: Upload, onPress: () => openDocumentsScreen() },
          ],
    [focusApplySection, isVerificationQualified, openDocumentsScreen]
  );

  const serviceItems = useMemo<DashboardAction[]>(
    () => [
      { id: 'loan-center', label: 'Loan Center', icon: Wallet, onPress: focusApplySection },
      { id: 'loan-history', label: 'Loan History', icon: History, onPress: () => scrollToY(loanSectionY) },
      { id: 'payment-history', label: 'Payment History', icon: Clock3, onPress: () => scrollToY(paymentSectionY) },
      { id: 'calculator', label: 'Calculator', icon: Calculator, onPress: focusApplySection },
      { id: 'documents', label: 'Documents', icon: FileText, onPress: () => openDocumentsScreen() },
      { id: 'verification', label: 'Verification', icon: ShieldCheck, onPress: () => navigation.navigate('Settings') },
      { id: 'alerts', label: 'Alerts', icon: Bell, onPress: () => navigation.navigate('Notifications') },
        {
          id: 'find-us',
          label: 'Find Us',
          icon: MapPin,
          onPress: () => navigation.navigate('FindUs'),
        },
      ],
    [focusApplySection, loanSectionY, navigation, openDocumentsScreen, paymentSectionY, scrollToY]
  );

  const hasActiveLoans = approvedLoanCount > 0;
  const summaryBalance = hasActiveLoans ? approvedBalance : 0;
  const summaryBalanceLabel = hasActiveLoans ? 'Outstanding Balance' : 'My Balance';
  const heroSubtitle = pendingLoanCount > 0
    ? `You have ${pendingLoanCount} application${pendingLoanCount > 1 ? 's' : ''} under review.`
    : approvedLoanCount > 0
    ? `Track ${approvedLoanCount} active loan${approvedLoanCount > 1 ? 's' : ''} and manage your next request.`
    : 'We are ready to help with your next application. Start with your preferred loan amount below.';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FB" />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topContentPadding,
            paddingHorizontal: compact ? spacing.sm : spacing.md,
            paddingBottom: spacing.xxl + tabBarHeight + spacing.sm,
            width: '100%',
            maxWidth: shellMaxWidth,
            alignSelf: 'center',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isGuest ? (
          <>
            <Text style={styles.pageTitle}>Borrow money</Text>
            <Text style={styles.pageSubtitle}>
              Browse loan products and check potential amounts before signing in.
            </Text>

            <Card style={styles.heroCard}>
              <LinearGradient
                colors={['#1E3A8A', '#2F56D4', '#6F8FFF']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.heroGradient}
              >
                <Text style={styles.heroCaption}>Maximum amount</Text>
                <Text style={styles.heroAmount}>{formatCurrency(maxBorrowAmount)}</Text>
                <View style={styles.quickTermsRow}>
                  {quickTerms.map((term) => (
                    <View key={term} style={styles.quickTermPill}>
                      <Text style={styles.quickTermText}>{term} months</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.heroApplyButton} onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.heroApplyText}>Login to Apply</Text>
                </TouchableOpacity>
              </LinearGradient>
            </Card>
          </>
        ) : (
          <>
            <View style={styles.userRow}>
              <UserAvatar
                name={user?.name}
                photoUrl={user?.profilePhotoUrl}
                size={50}
                borderWidth={2}
                borderColor="#4169E1"
                backgroundColor="#E9EEFF"
                textColor="#4169E1"
                containerStyle={styles.avatarCircle}
              />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user?.name ?? 'Borrower'}</Text>
                <Text style={styles.userMembership}>
                  {getMemberLabel(approvedLoanCount, Boolean(isVerificationQualified))}
                </Text>
                <Text style={styles.userMeta}>{user?.username ? `@${user.username}` : user?.email}</Text>
              </View>
              <TouchableOpacity style={styles.bellWrap} onPress={() => navigation.navigate('Notifications')}>
                <Bell size={20} color="#1A1A2E" strokeWidth={2.1} />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {unreadNotificationCount > 9 ? '9+' : String(unreadNotificationCount)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>

            <LinearGradient
              colors={['#1E3A8A', '#2F56D4', '#4169E1']}
              start={{ x: 0, y: 0.45 }}
              end={{ x: 1, y: 0.8 }}
              style={styles.dashboardCard}
            >
              <View style={styles.cardGlowLarge} />
              <View style={styles.cardGlowSmall} />
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardEyebrow}>Borrower wallet</Text>
                  <Text style={styles.cardName}>{user?.name ?? 'Borrower'}</Text>
                  <Text style={styles.cardNumber}>Member ID {String(user?.id ?? '0').padStart(4, '0')}</Text>
                </View>
                <View
                  style={[
                    styles.cardStatusPill,
                    isVerificationQualified ? styles.cardStatusPillQualified : styles.cardStatusPillPending,
                  ]}
                >
                  <Text style={styles.cardStatusText}>{borrowerStatusLabel}</Text>
                </View>
              </View>
              <Text style={styles.cardHint}>{borrowerStatusMessage}</Text>
              <Text style={styles.cardBalanceLabel}>{summaryBalanceLabel}</Text>
              <Text style={styles.cardBalance}>{formatCurrency(summaryBalance)}</Text>

              <View style={styles.dashboardStatsRow}>
                <View style={styles.dashboardStat}>
                  <Text style={styles.dashboardStatValue}>{approvedLoanCount}</Text>
                  <Text style={styles.dashboardStatLabel}>Active Loans</Text>
                </View>
                <View style={styles.dashboardStat}>
                  <Text style={styles.dashboardStatValue}>{documents.length}</Text>
                  <Text style={styles.dashboardStatLabel}>Files Sent</Text>
                </View>
                <View style={styles.dashboardStat}>
                  <Text style={styles.dashboardStatValue}>{formatCurrency(totalPaid)}</Text>
                  <Text style={styles.dashboardStatLabel}>Paid</Text>
                </View>
              </View>

              {quickActions.length > 0 ? (
                <View style={styles.dashboardQuickActions}>
                  {quickActions.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <TouchableOpacity
                      key={action.id}
                      style={styles.actionBtn}
                      activeOpacity={0.82}
                      onPress={action.onPress}
                    >
                      <View style={[styles.actionIconWrap, compact ? styles.actionIconWrapCompact : undefined]}>
                        <ActionIcon size={18} color="#4169E1" strokeWidth={2.2} />
                      </View>
                      <Text style={styles.actionLabel}>{action.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </LinearGradient>

            <LinearGradient
              colors={['#FFFFFF', '#F7F9FF', '#E9EEFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.loanBanner}
            >
              <View style={styles.loanBannerHeader}>
                <View style={styles.loanBannerCopy}>
                  <Text style={styles.loanTitle}>Make a loan</Text>
                  <Text style={styles.loanSubtitle}>{heroSubtitle}</Text>
                </View>
                <View style={styles.loanBannerPill}>
                  <Text style={styles.loanBannerPillText}>
                    {isVerificationQualified ? 'Qualified' : 'Verify first'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.loanBtn} activeOpacity={0.85} onPress={openLoanPrograms}>
                <Text style={styles.loanBtnText}>Create Application</Text>
                <ChevronRight size={16} color={colors.primary} strokeWidth={2.4} />
              </TouchableOpacity>
            </LinearGradient>

            <View style={styles.servicesHeader}>
              <Text style={styles.dashboardSectionTitle}>Services</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                <Text style={styles.dashboardSectionLink}>Open settings</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.serviceGrid}>
              {serviceItems.map((item) => {
                const ServiceIcon = item.icon;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.serviceItem, narrowLayout ? styles.serviceItemCompact : undefined]}
                    activeOpacity={0.8}
                    onPress={item.onPress}
                  >
                    <View style={[styles.serviceIconWrap, narrowLayout ? styles.serviceIconWrapCompact : undefined]}>
                      <ServiceIcon size={22} color="#FFFFFF" strokeWidth={2.2} />
                    </View>
                    <Text style={styles.serviceLabel}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {loading ? (
              <View style={styles.inlineState}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.inlineStateText}>Refreshing your borrower dashboard...</Text>
              </View>
            ) : null}
          </>
        )}

        {isGuest && guestLoading ? (
          <View style={styles.inlineState}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.inlineStateText}>Loading live loan data...</Text>
          </View>
        ) : null}
        {isGuest && guestError ? <Text style={styles.errorText}>{guestError}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, narrowLayout ? styles.sectionTitleCompact : undefined]}>
            {isGuest ? 'Recommend loan' : 'Recommended loan'}
          </Text>
          <TouchableOpacity onPress={isGuest ? loadGuestData : focusApplySection} disabled={guestLoading}>
            <Text style={[styles.sectionLink, narrowLayout ? styles.sectionLinkCompact : undefined]}>
              {isGuest ? (guestLoading ? 'Refreshing...' : 'Refresh') : 'Apply now'}
            </Text>
          </TouchableOpacity>
        </View>

        {activeLoanTypes.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No active loan products available right now.</Text>
          </Card>
        ) : (
          activeLoanTypes.map((loanType) => (
          <Card key={loanType.id} style={[styles.recommendCard, narrowLayout ? styles.recommendCardCompact : undefined]}>
              <View style={styles.recommendAccent} />
              <View style={[styles.recommendTopRow, narrowLayout ? styles.recommendTopRowCompact : undefined]}>
                <Text
                  style={[styles.recommendTitle, narrowLayout ? styles.recommendTitleCompact : undefined]}
                  numberOfLines={1}
                >
                  {loanType.name}
                </Text>
                <View style={[styles.rateBadge, narrowLayout ? styles.rateBadgeCompact : undefined]}>
                  <Text style={styles.rateBadgeText}>{loanType.baseInterestRate.toFixed(2)}%</Text>
                </View>
              </View>
              <View style={[styles.recommendBottomRow, narrowLayout ? styles.recommendBottomRowCompact : undefined]}>
                <View style={styles.recommendInfoBlock}>
                  <Text
                    style={[styles.recommendAmount, narrowLayout ? styles.recommendAmountCompact : undefined]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.76}
                  >
                    {formatCurrency(loanType.maxAmount)}
                  </Text>
                  <Text style={[styles.recommendMeta, narrowLayout ? styles.recommendMetaCompact : undefined]}>
                    maximum amount
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.applyChip, narrowLayout ? styles.applyChipCompact : undefined]}
                  onPress={() => chooseLoanType(loanType)}
                >
                  <Text style={[styles.applyChipText, narrowLayout ? styles.applyChipTextCompact : undefined]}>
                    {isGuest ? 'View' : 'Apply'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}

        <View onLayout={(event) => setApplySectionY(event.nativeEvent.layout.y)}>
          <Card style={styles.applyCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Loan apply</Text>
              <Text style={styles.sectionHint}>Details</Text>
            </View>

            {!selectedLoanType ? (
              <Text style={styles.emptyText}>Select a loan type above to continue.</Text>
            ) : (
              <>
                <Text style={styles.blockTitle}>Select your loan amount</Text>
                <Text style={styles.blockSubTitle}>
                  You can apply up to {formatCurrency(selectedLoanType.maxAmount)}
                </Text>

                <View style={styles.amountControlRow}>
                  <TouchableOpacity style={styles.amountAdjustButton} onPress={() => adjustAmount(-1)}>
                    <Text style={styles.amountAdjustText}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.amountControlValue, compact ? styles.amountControlValueCompact : undefined]}>
                    {resolvedAmount.toLocaleString()}
                  </Text>
                  <TouchableOpacity style={styles.amountAdjustButton} onPress={() => adjustAmount(1)}>
                    <Text style={styles.amountAdjustText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.blockTitle}>Life of loan</Text>
                <View style={styles.termRow}>
                  {selectedLoanType.termsInMonths.map((term) => (
                    <TouchableOpacity
                      key={term}
                      style={[styles.termChip, termMonths === term ? styles.termChipActive : undefined]}
                      onPress={() => setTermMonths(term)}
                    >
                      <Text
                        style={[
                          styles.termChipText,
                          termMonths === term ? styles.termChipTextActive : undefined,
                        ]}
                      >
                        {term} month
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!isGuest && missingRequirements.length > 0 ? (
                  <View style={styles.requirementsCard}>
                    <Text style={styles.requirementsTitle}>Complete these first:</Text>
                    {missingRequirements.map((item) => (
                      <Text key={item} style={styles.requirementItem}>
                        - {item}
                      </Text>
                    ))}
                    <View style={styles.requirementsActions}>
                      <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                        <Text style={styles.requirementLink}>Settings</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openDocumentsScreen()}>
                        <Text style={styles.requirementLink}>Documents</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                <View style={styles.reckoningCard}>
                  <Text style={styles.reckoningTitle}>Reckoning</Text>
                  <View style={styles.reckoningRow}>
                    <Text style={styles.reckoningLabel}>Estimated interest</Text>
                    <Text style={styles.reckoningValue}>{formatCurrency(estimatedInterest)}</Text>
                  </View>
                  <View style={styles.reckoningRow}>
                    <Text style={styles.reckoningLabel}>Monthly installment</Text>
                    <Text style={styles.reckoningValue}>{formatCurrency(monthlyInstallment)}</Text>
                  </View>
                  <View style={styles.reckoningRow}>
                    <Text style={styles.reckoningLabel}>Outstanding balance</Text>
                    <Text style={styles.reckoningValue}>{formatCurrency(approvedBalance)}</Text>
                  </View>
                </View>

                <Button
                  title={
                    isGuest
                      ? 'Login to Apply'
                      : isVerificationQualified
                      ? 'Continue Application'
                      : 'Complete Verification First'
                  }
                  onPress={submitLoanApplication}
                  disabled={!isGuest && !isVerificationQualified}
                />
              </>
            )}
          </Card>
        </View>

        {/* ── Repayment Calculator ── */}
        <Card style={styles.calcCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Repayment Calculator</Text>
            <Text style={styles.sectionHint}>Estimate</Text>
          </View>
          <Text style={styles.calcHint}>Adjust amount and term to preview your monthly payment.</Text>

          <Text style={styles.calcLabel}>Loan Amount</Text>
          <View style={styles.calcSliderRow}>
            <TouchableOpacity
              style={styles.calcStepBtn}
              onPress={() => {
                if (!selectedLoanType) return;
                const next = Math.max(selectedLoanType.minAmount, (Number(amount) || selectedLoanType.minAmount) - amountStep);
                setAmount(String(Math.round(next)));
              }}
            >
              <Text style={styles.calcStepText}>−</Text>
            </TouchableOpacity>
            <View style={styles.calcValueWrap}>
              <Text style={styles.calcValue}>{formatCurrency(resolvedAmount)}</Text>
              {selectedLoanType ? (
                <Text style={styles.calcRange}>
                  {formatCurrency(selectedLoanType.minAmount)} – {formatCurrency(selectedLoanType.maxAmount)}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.calcStepBtn,
                selectedLoanType && resolvedAmount >= selectedLoanType.maxAmount
                  ? styles.calcStepBtnDisabled
                  : undefined,
              ]}
              onPress={() => {
                if (!selectedLoanType) return;
                const next = Math.min(selectedLoanType.maxAmount, (Number(amount) || selectedLoanType.minAmount) + amountStep);
                setAmount(String(Math.round(next)));
              }}
              disabled={!!selectedLoanType && resolvedAmount >= selectedLoanType.maxAmount}
            >
              <Text style={styles.calcStepText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.calcLabel}>Repayment Term</Text>
          <View style={styles.termRow}>
            {(selectedLoanType?.termsInMonths ?? [6, 12, 24]).map((term) => (
              <TouchableOpacity
                key={term}
                style={[styles.termChip, termMonths === term ? styles.termChipActive : undefined]}
                onPress={() => setTermMonths(term)}
              >
                <Text style={[styles.termChipText, termMonths === term ? styles.termChipTextActive : undefined]}>
                  {term} mo
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.calcResultGrid}>
            <View style={styles.calcResultBox}>
              <Text style={styles.calcResultLabel}>Monthly Payment</Text>
              <Text style={styles.calcResultValue}>{formatCurrency(Math.round(monthlyInstallment))}</Text>
            </View>
            <View style={styles.calcResultBox}>
              <Text style={styles.calcResultLabel}>Total Interest</Text>
              <Text style={[styles.calcResultValue, { color: '#F59E0B' }]}>{formatCurrency(Math.round(estimatedInterest))}</Text>
            </View>
            <View style={styles.calcResultBox}>
              <Text style={styles.calcResultLabel}>Total Repayment</Text>
              <Text style={[styles.calcResultValue, { color: '#2F56D4' }]}>{formatCurrency(Math.round(resolvedAmount + estimatedInterest))}</Text>
            </View>
          </View>
        </Card>

        <View onLayout={(event) => setLoanSectionY(event.nativeEvent.layout.y)}>
          <Text style={styles.sectionTitle}>{isGuest ? 'Recent loan status' : 'My loan status'}</Text>
          {visibleLoans.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No loan records yet.</Text>
            </Card>
          ) : (
            visibleLoans.map((loan) => (
              <Card key={loan.id} style={styles.loanCard}>
                <View style={styles.loanHeader}>
                  <Text style={styles.loanType}>{loan.loanTypeName}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[loan.status] }]}>
                    <Text style={styles.statusText}>{loan.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.loanAmount}>{formatCurrency(loan.amount)}</Text>
                <Text style={styles.loanMeta}>Balance: {formatCurrency(loan.balance)}</Text>
                <Text style={styles.loanMeta}>Term: {loan.termMonths} months</Text>
                <Text style={styles.loanMeta}>Created: {loan.createdAt}</Text>
                {loan.disbursementMethod ? (
                  <Text style={styles.loanMeta}>Receive via: {formatDisbursementTarget(loan)}</Text>
                ) : null}
                {loan.status === 'approved' ? (
                  <Text style={styles.loanMeta}>
                    Release status: {getBorrowerDisbursementStatusLabel(loan)}
                  </Text>
                ) : null}
                {loan.disbursementStatus === 'processing' && loan.disbursementRequestedAt ? (
                  <Text style={styles.loanMeta}>Payout requested: {loan.disbursementRequestedAt}</Text>
                ) : null}
                {loan.disbursementReference ? (
                  <Text style={styles.loanMeta}>Release ref: {loan.disbursementReference}</Text>
                ) : null}
                {loan.disbursementFailureMessage ? (
                  <Text style={styles.rejectedText}>Payout issue: {loan.disbursementFailureMessage}</Text>
                ) : null}
                {loan.status === 'rejected' && loan.rejectionReason ? (
                  <Text style={styles.rejectedText}>Reason: {loan.rejectionReason}</Text>
                ) : null}
                {loan.status === 'approved' && loan.repaymentSummary ? (() => {
                  const repayment = loan.repaymentSummary;
                  const repaymentStatus = getRepaymentStatusLabel(loan);
                  return (
                    <View style={styles.scheduleCard}>
                      <Text style={styles.scheduleTitle}>Repayment Schedule</Text>
                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleLbl}>Monthly payment</Text>
                        <Text style={styles.scheduleVal}>{formatCurrency(repayment.scheduledInstallmentAmount)}</Text>
                      </View>
                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleLbl}>Installments remaining</Text>
                        <Text style={styles.scheduleVal}>
                          {repayment.remainingInstallments} / {repayment.totalInstallments}
                        </Text>
                      </View>
                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleLbl}>Next due date</Text>
                        <Text style={styles.scheduleVal}>{getRepaymentNextDueLabel(loan)}</Text>
                      </View>
                      {repaymentStatus ? (
                        <View style={styles.scheduleRow}>
                          <Text style={styles.scheduleLbl}>Status</Text>
                          <Text
                            style={[
                              styles.scheduleVal,
                              repayment.isOverdue ? styles.scheduleValDanger : undefined,
                            ]}
                          >
                            {repaymentStatus}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleLbl}>Payments posted</Text>
                        <Text style={styles.scheduleVal}>
                          {repayment.paidInstallments} / {repayment.totalInstallments}
                        </Text>
                      </View>
                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleLbl}>Remaining balance</Text>
                        <Text style={[styles.scheduleVal, { color: '#1E3A8A' }]}>{formatCurrency(loan.balance)}</Text>
                      </View>
                    </View>
                  );
                })() : null}
              </Card>
            ))
          )}
        </View>

        <View onLayout={(event) => setPaymentSectionY(event.nativeEvent.layout.y)}>
          <Text style={styles.sectionTitle}>{isGuest ? 'Recent payments' : 'Payment history'}</Text>
          {visiblePayments.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No payments recorded yet.</Text>
            </Card>
          ) : (
            visiblePayments.map((payment) => (
              <Card key={payment.id} style={styles.paymentCard}>
                <View>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                  <Text style={styles.paymentMeta}>
                    {payment.date}
                    {payment.paymentMethod
                      ? ` • ${DISBURSEMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod}`
                      : ''}
                  </Text>
                  {payment.paymentReference ? (
                    <Text style={styles.paymentMeta}>Reference: {payment.paymentReference}</Text>
                  ) : null}
                </View>
                <View style={styles.paymentIconWrap}>
                  <Wallet size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FF' },
  container: { flex: 1, backgroundColor: '#F7F9FF' },
  content: {},
  pageTitle: { fontSize: 31, fontWeight: '800', color: '#0B1F4D' },
  pageSubtitle: { marginTop: spacing.xs, marginBottom: spacing.md, color: '#4A607F', fontSize: 13, lineHeight: 18 },
  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E9EEFF', borderWidth: 2, borderColor: '#4169E1', alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1, marginLeft: 12 },
  userName: { fontSize: 16, fontWeight: '800', color: '#1A1A2E' },
  userMembership: { fontSize: 13, color: '#667085', marginTop: 2 },
  userMeta: { fontSize: 12, color: '#8A93A5', marginTop: 2 },
  bellWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#12204A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#FF4D6D',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  dashboardCard: { borderRadius: 24, padding: 20, marginBottom: 18, overflow: 'hidden', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 10 },
  cardGlowLarge: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.14)', top: -60, right: -45 },
  cardGlowSmall: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.12)', bottom: 24, right: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  cardEyebrow: { color: 'rgba(255,255,255,0.74)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  cardName: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', marginBottom: 4 },
  cardNumber: { color: 'rgba(255,255,255,0.82)', fontSize: 12, letterSpacing: 1, marginBottom: 4 },
  cardStatusPill: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 7, alignSelf: 'flex-start', borderWidth: 1 },
  cardStatusPillQualified: { backgroundColor: 'rgba(16,185,129,0.16)', borderColor: 'rgba(167,243,208,0.52)' },
  cardStatusPillPending: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.26)' },
  cardStatusText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  cardHint: { color: 'rgba(255,255,255,0.84)', fontSize: 12, lineHeight: 18, marginBottom: 14, maxWidth: 280 },
  cardBalanceLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginBottom: 4 },
  cardBalance: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginBottom: 18 },
  dashboardStatsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 16 },
  dashboardStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  dashboardStatValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  dashboardStatLabel: { color: 'rgba(255,255,255,0.74)', fontSize: 11, marginTop: 3 },
  dashboardQuickActions: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  actionBtn: { alignItems: 'center', flex: 1 },
  actionIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  actionIconWrapCompact: { width: 38, height: 38, borderRadius: 12 },
  actionLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  loanBanner: { borderRadius: 20, padding: 18, marginBottom: 18, shadowColor: '#C0C8FF', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 4, borderWidth: 1, borderColor: '#DCE6FF' },
  loanBannerHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 14 },
  loanBannerCopy: { flex: 1 },
  loanTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A2E', marginBottom: 5 },
  loanSubtitle: { fontSize: 12, color: '#6B7280', lineHeight: 18 },
  loanBannerPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E9EEFF', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#DCE6FF' },
  loanBannerPillText: { color: '#2F56D4', fontSize: 11, fontWeight: '700' },
  loanBtn: { minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderColor: '#DCE6FF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: '#FFFFFF' },
  loanBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  servicesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  dashboardSectionTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A2E' },
  dashboardSectionLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16, marginBottom: spacing.lg },
  serviceItem: { width: '22%', alignItems: 'center' },
  serviceItemCompact: { width: '30.5%' },
  serviceIconWrap: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#2F56D4', alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  serviceIconWrapCompact: { width: 48, height: 48, borderRadius: 15, marginBottom: 6 },
  serviceLabel: { fontSize: 10, color: '#555C6D', textAlign: 'center', fontWeight: '600', lineHeight: 13 },
  heroCard: { padding: 0, overflow: 'hidden', marginBottom: spacing.md },
  heroGradient: { padding: spacing.md },
  heroCaption: { color: 'rgba(255,255,255,0.78)', fontSize: 12, textAlign: 'center' },
  heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  quickTermsRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  quickTermPill: { borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.10)' },
  quickTermText: { color: 'rgba(255,255,255,0.88)', fontSize: 10, fontWeight: '600' },
  heroApplyButton: { marginTop: spacing.sm, alignSelf: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: radii.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroApplyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  inlineState: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  inlineStateText: { color: colors.textLight, fontSize: 12 },
  errorText: { color: colors.danger, marginBottom: spacing.sm, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: spacing.sm },
  sectionTitleCompact: { fontSize: 18 },
  sectionHint: { color: '#8BA0C0', fontSize: 12, fontWeight: '600' },
  sectionLink: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  sectionLinkCompact: { fontSize: 11 },
  recommendCard: {
    marginBottom: spacing.sm,
    borderColor: '#DCE6FF',
    backgroundColor: '#FCFEFF',
    position: 'relative',
    overflow: 'hidden',
  },
  recommendCardCompact: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
  },
  recommendAccent: {
    position: 'absolute',
    top: -18,
    right: -10,
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(65,105,225,0.07)',
  },
  recommendTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  recommendTopRowCompact: { marginBottom: 6 },
  recommendTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, paddingRight: spacing.sm },
  recommendTitleCompact: { fontSize: 14 },
  rateBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: '#E9EEFF' },
  rateBadgeCompact: { paddingHorizontal: 7, paddingVertical: 1 },
  rateBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  recommendBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recommendBottomRowCompact: { alignItems: 'flex-end' },
  recommendInfoBlock: { flex: 1, paddingRight: spacing.sm },
  recommendAmount: { fontSize: 30, fontWeight: '900', color: '#1E3A8A' },
  recommendAmountCompact: { fontSize: 22 },
  recommendMeta: { color: colors.textLight, fontSize: 11, marginTop: 1 },
  recommendMetaCompact: { fontSize: 10 },
  applyChip: {
    backgroundColor: '#4169E1',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyChipCompact: { minWidth: 72, paddingHorizontal: 14, paddingVertical: 6 },
  applyChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  applyChipTextCompact: { fontSize: 11 },
  applyCard: { marginTop: spacing.xs, marginBottom: spacing.md },
  blockTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 2 },
  blockSubTitle: { color: colors.textLight, fontSize: 12, marginBottom: spacing.sm },
  amountControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  amountAdjustButton: { width: 42, height: 42, borderRadius: radii.md, borderWidth: 1, borderColor: '#D5E0F1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFE' },
  amountAdjustText: { fontSize: 20, color: '#6B7E9D', fontWeight: '700' },
  amountControlValue: { fontSize: 42, fontWeight: '900', color: '#1E3A8A' },
  amountControlValueCompact: { fontSize: 34 },
  termRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  termChip: { borderWidth: 1, borderColor: '#CCD8EC', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: '#FFFFFF' },
  termChipActive: { borderColor: colors.primary, backgroundColor: '#E9EEFF' },
  termChipText: { color: '#6B7E9D', fontSize: 12, fontWeight: '600' },
  termChipTextActive: { color: colors.primary },
  requirementsCard: { marginBottom: spacing.md, borderWidth: 1, borderColor: '#FED7AA', borderRadius: radii.md, backgroundColor: '#FFF7ED', padding: spacing.sm, gap: spacing.xs },
  requirementsTitle: { fontSize: 13, fontWeight: '700', color: '#9A3412' },
  requirementItem: { fontSize: 12, color: '#7C2D12' },
  requirementsActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  requirementLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  reckoningCard: { borderWidth: 1, borderColor: '#DCE6FF', borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.md, backgroundColor: '#F9FBFF' },
  reckoningTitle: { color: '#0F172A', fontSize: 15, fontWeight: '700', marginBottom: spacing.xs },
  reckoningRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  reckoningLabel: { color: colors.textLight, fontSize: 12 },
  reckoningValue: { color: '#1D4E9B', fontSize: 13, fontWeight: '700' },
  loanCard: { marginBottom: spacing.sm },
  loanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  loanType: { fontSize: 16, fontWeight: '700', color: colors.text },
  statusBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { color: '#FFFFFF', fontWeight: '700', fontSize: 10 },
  loanAmount: { fontSize: 26, fontWeight: '900', color: '#1E3A8A' },
  loanMeta: { fontSize: 13, color: colors.textLight, marginTop: 2 },
  rejectedText: { color: colors.danger, marginTop: spacing.xs, fontWeight: '600' },
  scheduleCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    borderRadius: 12,
    padding: spacing.sm,
    backgroundColor: '#F7F9FF',
  },
  scheduleTitle: { fontSize: 13, fontWeight: '800', color: '#1E3A8A', marginBottom: spacing.xs },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  scheduleLbl: { fontSize: 12, color: colors.textLight },
  scheduleVal: { fontSize: 12, fontWeight: '700', color: colors.text },
  scheduleValDanger: { color: colors.danger },
  paymentCard: { marginBottom: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentAmount: { fontSize: 17, fontWeight: '800', color: '#1E3A8A' },
  paymentMeta: { color: colors.textLight, fontSize: 12, marginTop: 2 },
  paymentIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E9EEFF', alignItems: 'center', justifyContent: 'center' },
  featurePanel: { marginBottom: spacing.md },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  featureRowDivider: { borderBottomWidth: 1, borderBottomColor: '#E7EEFF' },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E9EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: { flex: 1 },
  featureTitle: { fontSize: 13, fontWeight: '800', color: '#102042' },
  featureDescription: { fontSize: 11, lineHeight: 16, color: '#64748B', marginTop: 2 },
  featureActionPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: '#E9EEFF',
  },
  featureActionText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  emptyText: { color: colors.textLight, fontSize: 14 },
  calcCard: { marginBottom: spacing.md },
  calcHint: { color: colors.textLight, fontSize: 12, marginBottom: spacing.md, lineHeight: 18 },
  calcLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: spacing.xs },
  calcSliderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  calcStepBtn: {
    width: 40, height: 40, borderRadius: radii.md,
    borderWidth: 1, borderColor: '#D5E0F1',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFE',
  },
  calcStepBtnDisabled: {
    opacity: 0.35,
  },
  calcStepText: { fontSize: 22, color: '#6B7E9D', fontWeight: '700', lineHeight: 26 },
  calcValueWrap: { flex: 1, alignItems: 'center' },
  calcValue: { fontSize: 22, fontWeight: '900', color: '#1E3A8A' },
  calcRange: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  calcResultGrid: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  calcResultBox: {
    flex: 1, backgroundColor: '#F7F9FF',
    borderRadius: radii.md, padding: spacing.sm,
    alignItems: 'center',
  },
  calcResultLabel: { fontSize: 10, color: colors.textLight, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  calcResultValue: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
