import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  CircleX,
  RefreshCcw,
  WalletCards,
} from 'lucide-react-native';
import { fetchAdminTransactions, submitAdminLoanDecision } from '../api/loans';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { UserAvatar } from '../components/UserAvatar';
import { Loan, Payment } from '../../types';
import { colors, radii, spacing } from '../../constants/theme';

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

const STATUS_STYLES: Record<
  Loan['status'],
  { backgroundColor: string; color: string; borderColor: string }
> = {
  pending: {
    backgroundColor: 'rgba(217,119,6,0.12)',
    color: colors.warning,
    borderColor: 'rgba(217,119,6,0.18)',
  },
  approved: {
    backgroundColor: 'rgba(15,157,88,0.12)',
    color: colors.success,
    borderColor: 'rgba(15,157,88,0.18)',
  },
  rejected: {
    backgroundColor: 'rgba(220,38,38,0.12)',
    color: colors.danger,
    borderColor: 'rgba(220,38,38,0.18)',
  },
};

export const AdminLoansScreen = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [decisionLoadingLoanId, setDecisionLoadingLoanId] = useState<string | null>(null);
  const [interestByLoan, setInterestByLoan] = useState<Record<string, string>>({});
  const [rejectionByLoan, setRejectionByLoan] = useState<Record<string, string>>({});

  const loadTransactions = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError('');
      const payload = await fetchAdminTransactions();
      setLoans(payload.loans);
      setPayments(payload.payments);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to load admin transactions right now.'
      );
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const stats = useMemo(() => {
    const pending = loans.filter((loan) => loan.status === 'pending').length;
    const approved = loans.filter((loan) => loan.status === 'approved');
    const rejected = loans.filter((loan) => loan.status === 'rejected').length;
    const totalDisbursed = approved.reduce((sum, loan) => sum + loan.amount, 0);
    const totalCollected = payments.reduce((sum, payment) => sum + payment.amount, 0);

    return {
      pending,
      approved: approved.length,
      rejected,
      totalDisbursed,
      totalCollected,
    };
  }, [loans, payments]);

  const pendingLoans = useMemo(() => loans.filter((loan) => loan.status === 'pending'), [loans]);
  const reviewedLoans = useMemo(
    () => loans.filter((loan) => loan.status !== 'pending').slice(0, 8),
    [loans]
  );
  const recentPayments = useMemo(() => payments.slice(0, 8), [payments]);
  const tabBarHeight = useBottomTabBarHeight();

  const syncUpdatedLoan = (updatedLoan: Loan) => {
    setLoans((currentLoans) =>
      currentLoans.map((loan) => (loan.id === updatedLoan.id ? updatedLoan : loan))
    );
  };

  const handleApprove = async (loan: Loan) => {
    const rateInput = interestByLoan[loan.id] ?? String(loan.interestRate);
    const interestRate = Number(rateInput);

    if (!Number.isFinite(interestRate) || interestRate <= 0) {
      Alert.alert('Invalid interest rate', 'Enter a valid interest rate before approving this application.');
      return;
    }

    setDecisionLoadingLoanId(loan.id);
    try {
      const updatedLoan = await submitAdminLoanDecision(loan.id, {
        approve: true,
        interestRate,
      });
      syncUpdatedLoan(updatedLoan);
      setSelectedLoanId(null);
      Alert.alert('Loan approved', `${loan.borrowerName}'s application was approved.`);
    } catch (requestError) {
      Alert.alert(
        'Approval failed',
        requestError instanceof Error ? requestError.message : 'Unable to approve this application right now.'
      );
    } finally {
      setDecisionLoadingLoanId(null);
    }
  };

  const handleReject = async (loan: Loan) => {
    setDecisionLoadingLoanId(loan.id);
    try {
      const updatedLoan = await submitAdminLoanDecision(loan.id, {
        approve: false,
        rejectionReason: rejectionByLoan[loan.id] ?? '',
      });
      syncUpdatedLoan(updatedLoan);
      setSelectedLoanId(null);
      Alert.alert('Loan rejected', `${loan.borrowerName}'s application was rejected.`);
    } catch (requestError) {
      Alert.alert(
        'Rejection failed',
        requestError instanceof Error ? requestError.message : 'Unable to reject this application right now.'
      );
    } finally {
      setDecisionLoadingLoanId(null);
    }
  };

  const openReview = (loan: Loan) => {
    setSelectedLoanId((currentLoanId) => (currentLoanId === loan.id ? null : loan.id));
    setInterestByLoan((currentRates) => ({
      ...currentRates,
      [loan.id]: currentRates[loan.id] ?? String(loan.interestRate),
    }));
  };

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading loan reviews...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadTransactions(true)} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Loan Review Center</Text>
          <Text style={styles.subtitle}>Approve or reject pending borrower applications after your review.</Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={() => void loadTransactions(true)}>
          <RefreshCcw size={16} color={colors.primaryDark} strokeWidth={2.4} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Unable to load transactions</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Button title="Try again" onPress={() => void loadTransactions()} />
        </Card>
      ) : null}

      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, styles.pendingIcon]}>
            <Clock3 size={18} color={colors.warning} strokeWidth={2.3} />
          </View>
          <Text style={styles.statValue}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending Review</Text>
        </Card>

        <Card style={styles.statCard}>
          <View style={[styles.statIcon, styles.approvedIcon]}>
            <BadgeCheck size={18} color={colors.success} strokeWidth={2.3} />
          </View>
          <Text style={styles.statValue}>{stats.approved}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </Card>

        <Card style={styles.statCard}>
          <View style={[styles.statIcon, styles.rejectedIcon]}>
            <CircleX size={18} color={colors.danger} strokeWidth={2.3} />
          </View>
          <Text style={styles.statValue}>{stats.rejected}</Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </Card>

        <Card style={styles.statCard}>
          <View style={[styles.statIcon, styles.walletIcon]}>
            <CircleDollarSign size={18} color={colors.primaryDark} strokeWidth={2.3} />
          </View>
          <Text style={styles.statValue}>{formatCurrency(stats.totalCollected)}</Text>
          <Text style={styles.statLabel}>Collected</Text>
        </Card>
      </View>

      <Card style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <View>
            <Text style={styles.featureTitle}>Pending applications</Text>
            <Text style={styles.featureCaption}>
              {pendingLoans.length === 0
                ? 'All loan applications have already been reviewed.'
                : `${pendingLoans.length} application${pendingLoans.length > 1 ? 's' : ''} waiting for decision.`}
            </Text>
          </View>
          <View style={styles.disbursedChip}>
            <WalletCards size={16} color={colors.primaryDark} strokeWidth={2.2} />
            <Text style={styles.disbursedChipText}>{formatCurrency(stats.totalDisbursed)} disbursed</Text>
          </View>
        </View>

        {pendingLoans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No pending applications</Text>
            <Text style={styles.emptyText}>New borrower requests will appear here as soon as they are submitted.</Text>
          </View>
        ) : (
          pendingLoans.map((loan) => {
            const selected = selectedLoanId === loan.id;
            const decisionLoading = decisionLoadingLoanId === loan.id;

            return (
              <View key={loan.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewIdentityGroup}>
                    <UserAvatar
                      name={loan.borrowerName}
                      photoUrl={loan.borrowerPhotoUrl}
                      size={44}
                      containerStyle={styles.reviewAvatar}
                    />
                    <View style={styles.reviewIdentity}>
                      <Text style={styles.borrowerName}>{loan.borrowerName}</Text>
                      <Text style={styles.reviewMeta}>
                        {loan.loanTypeName} • {loan.termMonths} months • Applied {loan.createdAt}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: STATUS_STYLES[loan.status].backgroundColor,
                        borderColor: STATUS_STYLES[loan.status].borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: STATUS_STYLES[loan.status].color }]}>
                      {loan.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewMetrics}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Requested amount</Text>
                    <Text style={styles.metricValue}>{formatCurrency(loan.amount)}</Text>
                  </View>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Base interest</Text>
                    <Text style={styles.metricValue}>{loan.interestRate}%</Text>
                  </View>
                </View>

                {!selected ? (
                  <Pressable style={styles.primaryAction} onPress={() => openReview(loan)}>
                    <Text style={styles.primaryActionText}>Review application</Text>
                  </Pressable>
                ) : (
                  <View style={styles.decisionPanel}>
                    <Input
                      label="Interest rate when approved (%)"
                      value={interestByLoan[loan.id] ?? String(loan.interestRate)}
                      onChangeText={(value) =>
                        setInterestByLoan((currentRates) => ({
                          ...currentRates,
                          [loan.id]: value,
                        }))
                      }
                      keyboardType="numeric"
                      editable={!decisionLoading}
                    />
                    <Input
                      label="Reason when rejected"
                      value={rejectionByLoan[loan.id] ?? ''}
                      onChangeText={(value) =>
                        setRejectionByLoan((currentReasons) => ({
                          ...currentReasons,
                          [loan.id]: value,
                        }))
                      }
                      placeholder="Optional reason shown to the borrower"
                      editable={!decisionLoading}
                    />

                    <View style={styles.decisionActions}>
                      <Pressable
                        style={[
                          styles.actionButton,
                          styles.approveButton,
                          decisionLoading ? styles.actionButtonDisabled : undefined,
                        ]}
                        onPress={() => void handleApprove(loan)}
                        disabled={decisionLoading}
                      >
                        <Text style={styles.actionButtonText}>
                          {decisionLoading ? 'Saving...' : 'Approve'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.actionButton,
                          styles.rejectButton,
                          decisionLoading ? styles.actionButtonDisabled : undefined,
                        ]}
                        onPress={() => void handleReject(loan)}
                        disabled={decisionLoading}
                      >
                        <Text style={[styles.actionButtonText, styles.rejectButtonText]}>Reject</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => setSelectedLoanId(null)}
                      disabled={decisionLoading}
                    >
                      <Text style={styles.secondaryActionText}>Close review</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </Card>

      <Text style={styles.sectionTitle}>Recent decisions</Text>
      {reviewedLoans.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No approved or rejected loans yet.</Text>
        </Card>
      ) : (
        reviewedLoans.map((loan) => (
          <Card key={loan.id} style={styles.historyCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewIdentityGroup}>
                <UserAvatar
                  name={loan.borrowerName}
                  photoUrl={loan.borrowerPhotoUrl}
                  size={44}
                  containerStyle={styles.reviewAvatar}
                />
                <View style={styles.reviewIdentity}>
                  <Text style={styles.borrowerName}>{loan.borrowerName}</Text>
                  <Text style={styles.reviewMeta}>
                    {loan.loanTypeName} • {formatCurrency(loan.amount)} • Updated {loan.updatedAt}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: STATUS_STYLES[loan.status].backgroundColor,
                    borderColor: STATUS_STYLES[loan.status].borderColor,
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: STATUS_STYLES[loan.status].color }]}>
                  {loan.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.historyMeta}>Interest: {loan.interestRate}%</Text>
            <Text style={styles.historyMeta}>Balance: {formatCurrency(loan.balance)}</Text>
            {loan.reviewedByName ? <Text style={styles.historyMeta}>Reviewed by: {loan.reviewedByName}</Text> : null}
            {loan.rejectionReason ? <Text style={styles.rejectionReason}>Reason: {loan.rejectionReason}</Text> : null}
          </Card>
        ))
      )}

      <Text style={styles.sectionTitle}>Payment ledger</Text>
      {recentPayments.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No payments recorded yet.</Text>
        </Card>
      ) : (
        recentPayments.map((payment) => (
          <Card key={payment.id} style={styles.historyCard}>
            <View style={styles.paymentHeader}>
              <View style={styles.paymentIdentity}>
                <UserAvatar
                  name={payment.borrowerName ?? 'Borrower'}
                  photoUrl={payment.borrowerPhotoUrl}
                  size={40}
                  containerStyle={styles.paymentAvatar}
                />
                <View>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                  <Text style={styles.historyMeta}>Borrower: {payment.borrowerName ?? payment.borrowerId}</Text>
                </View>
              </View>
              <Text style={styles.paymentDate}>{payment.date}</Text>
            </View>
            <Text style={styles.historyMeta}>Loan ID: {payment.loanId}</Text>
            {payment.recordedByOfficerName ? (
              <Text style={styles.historyMeta}>Recorded by: {payment.recordedByOfficerName}</Text>
            ) : null}
            {payment.note ? <Text style={styles.historyMeta}>Note: {payment.note}</Text> : null}
          </Card>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textLight,
    maxWidth: 520,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(212,166,58,0.16)',
  },
  refreshText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  errorCard: {
    marginBottom: spacing.md,
    borderColor: 'rgba(220,38,38,0.18)',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  errorMessage: {
    color: colors.textLight,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 120,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  pendingIcon: {
    backgroundColor: 'rgba(217,119,6,0.12)',
  },
  approvedIcon: {
    backgroundColor: 'rgba(15,157,88,0.12)',
  },
  rejectedIcon: {
    backgroundColor: 'rgba(220,38,38,0.12)',
  },
  walletIcon: {
    backgroundColor: 'rgba(23,56,181,0.12)',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginBottom: spacing.xs,
    flexShrink: 1,
  },
  statLabel: {
    color: colors.textLight,
    fontSize: 13,
    fontWeight: '700',
  },
  featureCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  featureHeader: {
    flexDirection: 'column',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  featureCaption: {
    marginTop: spacing.xs,
    color: colors.textLight,
    fontSize: 13,
    lineHeight: 19,
  },
  disbursedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(232,238,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(23,56,181,0.1)',
  },
  disbursedChipText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    borderRadius: 18,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: colors.textLight,
    fontSize: 14,
    lineHeight: 20,
  },
  reviewCard: {
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FBFDFF',
    marginTop: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  reviewIdentityGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  reviewAvatar: {
    backgroundColor: colors.primarySoft,
  },
  reviewIdentity: {
    flex: 1,
    minWidth: 0,
  },
  borrowerName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    flexShrink: 1,
  },
  reviewMeta: {
    marginTop: spacing.xs,
    color: colors.textLight,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  reviewMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  metricBox: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: spacing.sm + 2,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    color: colors.textLight,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(212,166,58,0.32)',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  decisionPanel: {
    marginTop: spacing.xs,
  },
  decisionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  approveButton: {
    backgroundColor: colors.success,
  },
  rejectButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  rejectButtonText: {
    color: colors.danger,
  },
  secondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryActionText: {
    color: colors.textLight,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  historyCard: {
    marginBottom: spacing.sm,
  },
  historyMeta: {
    color: colors.textLight,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  rejectionReason: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    flexWrap: 'wrap',
  },
  paymentIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  paymentAvatar: {
    backgroundColor: colors.primarySoft,
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  paymentDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textLight,
  },
});
