import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  XCircle,
} from 'lucide-react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { fetchBorrowerLoans, cancelBorrowerLoan } from '../api/loans';
import { useAuth } from '../context/AuthContext';
import { Loan } from '../../types';
import { colors, radii, spacing } from '../../constants/theme';

const DISBURSEMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  gcash: 'GCash',
  maya: 'Maya',
  cash_pickup: 'Cash Pickup',
};

const formatCurrency = (value: number) =>
  `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatDisbursementTarget = (loan: Loan) => {
  const label = loan.disbursementMethod
    ? DISBURSEMENT_LABELS[loan.disbursementMethod]
    : 'your chosen method';
  if (loan.disbursementMethod === 'cash_pickup') return label;
  if (loan.disbursementAccountNumber) {
    return `${label} ending in ${loan.disbursementAccountNumber.slice(-4)}`;
  }
  return label;
};

type StepKey = 'submitted' | 'review' | 'decision' | 'disbursed' | 'repayment';

const STEPS: { key: StepKey; emoji: string; title: string }[] = [
  { key: 'submitted', emoji: '📋', title: 'Application Sent' },
  { key: 'review', emoji: '🔍', title: 'Being Reviewed' },
  { key: 'decision', emoji: '✅', title: 'Decision Made' },
  { key: 'disbursed', emoji: '💸', title: 'Money Released' },
  { key: 'repayment', emoji: '🔄', title: 'Paying Back' },
];

const getProgressIndex = (loan: Loan): number => {
  if (loan.status === 'rejected') return 2;
  if (loan.status === 'approved') {
    if (loan.disbursementStatus === 'disbursed') {
      return (loan.paymentsCount ?? 0) > 0 || loan.balance < loan.amount ? 4 : 3;
    }
    if (loan.disbursementStatus === 'processing') return 3;
    return 2;
  }
  return 1;
};

type StatusInfo = {
  emoji: string;
  title: string;
  message: string;
  color: string;
  bg: string;
};

const getStatusInfo = (loan: Loan): StatusInfo => {
  if (loan.status === 'rejected') {
    const cancelled = loan.rejectionReason === 'Cancelled by borrower.';
    return {
      emoji: '❌',
      title: cancelled ? 'Application Cancelled' : 'Application Not Approved',
      message: cancelled
        ? 'You cancelled this application. You can apply again anytime.'
        : `Your application was not approved. Reason: ${loan.rejectionReason || 'No reason given.'}`,
      color: '#B91C1C',
      bg: '#FEE2E2',
    };
  }

  if (loan.disbursementStatus === 'disbursed') {
    return {
      emoji: '🎉',
      title: 'Money Sent',
      message: `Your ${formatCurrency(loan.amount)} loan has been sent to ${formatDisbursementTarget(loan)}. Check your account.`,
      color: '#166534',
      bg: '#DCFCE7',
    };
  }

  if (loan.disbursementStatus === 'processing') {
    return {
      emoji: '⏳',
      title: 'Sending Your Money',
      message: `We are sending ${formatCurrency(loan.amount)} to ${formatDisbursementTarget(loan)} right now. This usually takes a few minutes.`,
      color: '#1D4ED8',
      bg: '#DCE6FF',
    };
  }

  if (loan.disbursementStatus === 'failed') {
    return {
      emoji: '⚠️',
      title: 'Release Failed',
      message:
        loan.disbursementFailureMessage ||
        'Something went wrong sending your money. The officer will retry it.',
      color: '#92400E',
      bg: '#FEF3C7',
    };
  }

  if (loan.status === 'approved') {
    return {
      emoji: '✅',
      title: 'Loan Approved',
      message: `Great news. Your ${formatCurrency(loan.amount)} loan is approved. The officer will send the money to ${formatDisbursementTarget(loan)} soon.`,
      color: '#2F56D4',
      bg: '#E9EEFF',
    };
  }

  return {
    emoji: '🔍',
    title: 'Under Review',
    message: `Your application for ${formatCurrency(loan.amount)} is being reviewed by a loan officer. We will notify you once a decision is made.`,
    color: '#5B21B6',
    bg: '#EDE9FE',
  };
};

const sortLoansByDate = (a: Loan, b: Loan) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

export const StageScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const stackActions = width < 410;
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingLoanId, setCancellingLoanId] = useState<string | null>(null);

  const loadLoans = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);

    try {
      const payload = await fetchBorrowerLoans();
      setLoans(payload.sort(sortLoansByDate));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load your applications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLoading(false);
        setLoans([]);
        return;
      }
      void loadLoans();
    }, [loadLoans, user])
  );

  const activeLoans = useMemo(
    () => loans.filter((loan) => loan.status === 'pending' || loan.status === 'approved' || loan.status === 'rejected'),
    [loans]
  );

  const handleCancelLoan = useCallback((loan: Loan) => {
    Alert.alert(
      'Cancel Application?',
      'Are you sure you want to cancel this loan application? This cannot be undone.',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancellingLoanId(loan.id);
            try {
              const updated = await cancelBorrowerLoan(loan.id);
              setLoans((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
              Alert.alert('Cancelled', 'Your application has been cancelled.');
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to cancel.');
            } finally {
              setCancellingLoanId(null);
            }
          },
        },
      ]
    );
  }, []);

  if (!user) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#1E3A8A', '#2F56D4', '#4169E1']}
          style={[styles.header, { paddingTop: insets.top + spacing.md }]}
        >
          <Text style={styles.headerTitle}>My Applications</Text>
          <Text style={styles.headerSub}>Track where your loan is right now</Text>
        </LinearGradient>
        <View style={styles.centerState}>
          <Text style={styles.stateEmoji}>🔒</Text>
          <Text style={styles.stateTitle}>Please Log In</Text>
          <Text style={styles.stateText}>You need to be logged in to see your loan applications.</Text>
          <Button title="Go to Login" onPress={() => navigation.navigate('Login')} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadLoans('refresh')}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['#1E3A8A', '#2F56D4', '#4169E1']}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <Text style={styles.headerTitle}>My Applications</Text>
        <Text style={styles.headerSub}>See where your loan is right now</Text>

        {!loading && activeLoans.length > 0 ? (
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Clock3 size={13} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.summaryPillText}>
                {activeLoans.filter((loan) => loan.status === 'pending').length} Pending
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <CheckCircle2 size={13} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.summaryPillText}>
                {activeLoans.filter((loan) => loan.status === 'approved').length} Approved
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <XCircle size={13} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.summaryPillText}>
                {activeLoans.filter((loan) => loan.status === 'rejected').length} Closed
              </Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>Loading your applications...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.centerState}>
          <Text style={styles.stateEmoji}>😕</Text>
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Button title="Try Again" onPress={() => void loadLoans()} />
        </View>
      ) : null}

      {!loading && !error && activeLoans.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateEmoji}>📄</Text>
          <Text style={styles.stateTitle}>No Applications Yet</Text>
          <Text style={styles.stateText}>
            You have not applied for a loan yet. Tap the button below to get started.
          </Text>
          <Button title="Apply for a Loan" onPress={() => navigation.navigate('LoanPrograms')} />
        </View>
      ) : null}

      {!loading && !error
        ? activeLoans.map((loan) => {
            const progressIndex = getProgressIndex(loan);
            const statusInfo = getStatusInfo(loan);

            return (
              <View key={loan.id} style={styles.loanSection}>
                <View style={[styles.statusBanner, { backgroundColor: statusInfo.bg }]}>
                  <Text style={styles.statusEmoji}>{statusInfo.emoji}</Text>
                  <View style={styles.statusBannerText}>
                    <Text style={[styles.statusTitle, { color: statusInfo.color }]}>{statusInfo.title}</Text>
                    <Text style={styles.statusMessage}>{statusInfo.message}</Text>
                  </View>
                </View>

                <Card style={styles.loanCard}>
                  <View style={styles.loanTopRow}>
                    <View style={styles.loanIconWrap}>
                      <FileText size={20} color={colors.primary} strokeWidth={2.2} />
                    </View>
                    <View style={styles.loanTopText}>
                      <Text style={styles.loanTypeName}>{loan.loanTypeName}</Text>
                      <Text style={styles.loanAmount}>{formatCurrency(loan.amount)}</Text>
                    </View>
                    <Text style={styles.loanDate}>{loan.createdAt}</Text>
                  </View>

                  <View style={styles.infoRow}>
                    <View style={styles.infoBox}>
                      <Text style={styles.infoLabel}>Term</Text>
                      <Text style={styles.infoValue}>{loan.termMonths} months</Text>
                    </View>
                    <View style={styles.infoBox}>
                      <Text style={styles.infoLabel}>Balance</Text>
                      <Text style={styles.infoValue}>{formatCurrency(loan.balance)}</Text>
                    </View>
                    <View style={styles.infoBox}>
                      <Text style={styles.infoLabel}>Send to</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {loan.disbursementMethod ? DISBURSEMENT_LABELS[loan.disbursementMethod] : 'Not set'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.progressLabel}>Where is your loan right now?</Text>
                  <View style={styles.stepsWrap}>
                    {STEPS.map((step, index) => {
                      const isDone = index < progressIndex;
                      const isCurrent = index === progressIndex;
                      const isRejected = loan.status === 'rejected' && index === 2;

                      let dotBg = '#DCE6FF';
                      if (isRejected) dotBg = '#EF4444';
                      else if (isDone) dotBg = '#4169E1';
                      else if (isCurrent) dotBg = '#2F56D4';

                      return (
                        <View key={step.key} style={styles.stepWrap}>
                          {index > 0 ? (
                            <View
                              style={[
                                styles.connector,
                                index <= progressIndex && !isRejected ? styles.connectorDone : undefined,
                              ]}
                            />
                          ) : null}

                          <View style={styles.stepInner}>
                            <View
                              style={[
                                styles.stepDot,
                                { backgroundColor: dotBg },
                                isCurrent ? styles.stepDotCurrent : undefined,
                              ]}
                            >
                              {isDone && !isRejected ? (
                                <CheckCircle2 size={10} color="#FFFFFF" strokeWidth={3} />
                              ) : isRejected ? (
                                <XCircle size={10} color="#FFFFFF" strokeWidth={3} />
                              ) : isCurrent ? (
                                <View style={styles.stepDotInnerPulse} />
                              ) : null}
                            </View>

                            <Text style={styles.stepEmoji}>{step.emoji}</Text>
                            <Text
                              style={[
                                styles.stepTitle,
                                (isDone || isCurrent) && !isRejected ? styles.stepTitleActive : undefined,
                                isRejected ? styles.stepTitleRejected : undefined,
                              ]}
                            >
                              {step.title}
                            </Text>
                            {isCurrent ? <Text style={styles.stepCurrentLabel}>You are here</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {loan.disbursementStatus === 'disbursed' && loan.disbursementReference ? (
                    <View style={styles.refBox}>
                      <Banknote size={14} color={colors.primary} strokeWidth={2.2} />
                      <Text style={styles.refText}>Reference: {loan.disbursementReference}</Text>
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    {loan.status === 'pending' ? (
                      <TouchableOpacity
                        style={[
                          styles.cancelBtn,
                          styles.actionBtnFull,
                          cancellingLoanId === loan.id ? styles.btnDisabled : undefined,
                        ]}
                        onPress={() => handleCancelLoan(loan)}
                        disabled={cancellingLoanId === loan.id}
                        activeOpacity={0.86}
                      >
                        <XCircle size={15} color="#EF4444" strokeWidth={2.4} />
                        <Text style={styles.cancelBtnText}>
                          {cancellingLoanId === loan.id ? 'Cancelling...' : 'Cancel Application'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    {loan.status === 'approved' ? (
                      <TouchableOpacity
                        style={[styles.scheduleBtn, styles.actionBtnFull]}
                        onPress={() => navigation.navigate('RepaymentSchedule', { loan })}
                        activeOpacity={0.9}
                      >
                        <LinearGradient
                          colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.scheduleBtnGradient}
                        >
                          <Clock3 size={16} color="#FFFFFF" strokeWidth={2.3} />
                          <Text style={styles.scheduleBtnText}>View Schedule</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : null}

                    {loan.status === 'rejected' || loan.status === 'approved' ? (
                      <TouchableOpacity
                        style={[
                          styles.reapplyBtn,
                          loan.status === 'rejected' || stackActions ? styles.actionBtnFull : styles.actionBtnHalf,
                        ]}
                        onPress={() => navigation.navigate('LoanPrograms')}
                        activeOpacity={0.9}
                      >
                        <LinearGradient
                          colors={['#2F56D4', '#4169E1', '#6F8FFF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.reapplyBtnGradient}
                        >
                          <RefreshCw size={15} color="#FFFFFF" strokeWidth={2.4} />
                          <Text style={styles.reapplyBtnText}>Apply Again</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </Card>
              </View>
            );
          })
        : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },

  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  centerState: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  stateEmoji: { fontSize: 48, marginBottom: spacing.xs },
  stateTitle: { fontSize: 20, fontWeight: '800', color: '#0C1A2E', textAlign: 'center' },
  stateText: {
    fontSize: 14,
    color: '#4B6A8A',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },

  loanSection: { paddingHorizontal: spacing.md, marginTop: spacing.md },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  statusEmoji: { fontSize: 28, lineHeight: 34 },
  statusBannerText: { flex: 1 },
  statusTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  statusMessage: { fontSize: 13, color: '#374151', lineHeight: 19 },

  loanCard: { borderColor: '#DCE6FF' },
  loanTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  loanIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E9EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanTopText: { flex: 1 },
  loanTypeName: { fontSize: 15, fontWeight: '800', color: '#0C1A2E' },
  loanAmount: { fontSize: 13, color: '#2F56D4', fontWeight: '700', marginTop: 1 },
  loanDate: { fontSize: 11, color: '#94A3B8' },

  infoRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  infoBox: {
    flex: 1,
    backgroundColor: '#F7F9FF',
    borderRadius: radii.sm,
    padding: spacing.xs + 2,
    alignItems: 'center',
  },
  infoLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 12, color: '#0C1A2E', fontWeight: '700', textAlign: 'center' },

  progressLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B6A8A',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  stepsWrap: { gap: spacing.sm, marginBottom: spacing.md },
  stepWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  connector: {
    position: 'absolute',
    left: 11,
    top: -spacing.sm,
    width: 2,
    height: spacing.sm + 4,
    backgroundColor: '#DCE6FF',
    borderRadius: 1,
  },
  connectorDone: { backgroundColor: '#4169E1' },
  stepInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepDotCurrent: {
    shadowColor: '#2F56D4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  stepDotInnerPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  stepEmoji: { fontSize: 18, width: 26, textAlign: 'center' },
  stepTitle: { fontSize: 13, fontWeight: '600', color: '#94A3B8', flex: 1 },
  stepTitleActive: { color: '#0C1A2E', fontWeight: '800' },
  stepTitleRejected: { color: '#EF4444', fontWeight: '800' },
  stepCurrentLabel: {
    fontSize: 11,
    color: '#4169E1',
    fontWeight: '700',
  },

  refBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#E9EEFF',
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  refText: { fontSize: 12, color: '#2F56D4', fontWeight: '600' },

  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtnFull: { width: '100%' },
  actionBtnHalf: { width: '48.5%' },

  cancelBtn: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: radii.lg,
    backgroundColor: '#FFF1F1',
    paddingHorizontal: spacing.md,
  },
  cancelBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },

  scheduleBtn: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  scheduleBtnGradient: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  scheduleBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  reapplyBtn: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  reapplyBtnGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  reapplyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  btnDisabled: { opacity: 0.5 },
});
