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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { Eye, ReceiptText } from 'lucide-react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Input } from '../components/Input';
import { UserAvatar } from '../components/UserAvatar';
import {
  fetchOfficerApprovedLoans,
  fetchOfficerPayments,
  recordOfficerLoanDisbursement,
  recordOfficerPayment,
} from '../api/officer';
import {
  approveOfficerPaymentSubmission,
  fetchOfficerPaymentSubmissions,
  rejectOfficerPaymentSubmission,
} from '../api/paymentSubmissions';
import { Loan, Payment, PaymentSubmission } from '../../types';
import { colors, spacing, radii } from '../../constants/theme';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank' },
] as const;

const DISBURSEMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  gcash: 'GCash',
  maya: 'Maya',
  cash_pickup: 'Cash Pickup',
};

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

const formatDisbursementTarget = (loan: Loan) => {
  const label = loan.disbursementMethod ? DISBURSEMENT_LABELS[loan.disbursementMethod] : 'Not set';
  if (loan.disbursementMethod === 'cash_pickup') return label;
  if (loan.disbursementAccountNumber) return `${label} ending in ${loan.disbursementAccountNumber.slice(-4)}`;
  return label;
};

const getDisbursementLabel = (loan: Loan) => {
  switch (loan.disbursementStatus) {
    case 'processing':
      return 'Processing';
    case 'disbursed':
      return 'Disbursed';
    case 'failed':
      return 'Failed';
    case 'reversed':
      return 'Reversed';
    default:
      return 'Ready to Disburse';
  }
};

const getDisbursementStyle = (loan: Loan) => {
  switch (loan.disbursementStatus) {
    case 'disbursed':
      return { bg: '#DCFCE7', text: '#166534' };
    case 'processing':
      return { bg: '#DCE6FF', text: '#1D4ED8' };
    case 'failed':
    case 'reversed':
      return { bg: '#FEE2E2', text: '#B91C1C' };
    default:
      return { bg: '#FEF3C7', text: '#92400E' };
  }
};

export const OfficerPaymentsScreen = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [paymentAmountByLoan, setPaymentAmountByLoan] = useState<Record<string, string>>({});
  const [paymentMethodByLoan, setPaymentMethodByLoan] = useState<
    Record<string, 'cash' | 'gcash' | 'maya' | 'bank_transfer'>
  >({});
  const [paymentReferenceByLoan, setPaymentReferenceByLoan] = useState<Record<string, string>>({});
  const [noteByLoan, setNoteByLoan] = useState<Record<string, string>>({});
  const [disbursementReferenceByLoan, setDisbursementReferenceByLoan] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);
  const [previewSubmission, setPreviewSubmission] = useState<PaymentSubmission | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const [approvedLoans, paymentHistory, submissionHistory] = await Promise.all([
        fetchOfficerApprovedLoans(),
        fetchOfficerPayments(),
        fetchOfficerPaymentSubmissions({ status: 'pending' }),
      ]);
      setLoans(approvedLoans);
      setPayments(paymentHistory);
      setPendingSubmissions(submissionHistory);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const approvedLoans = useMemo(
    () => loans.filter((l) => l.status === 'approved' && l.balance > 0),
    [loans]
  );

  const paymentsByLoan = useMemo(
    () =>
      payments.reduce<Record<string, Payment[]>>((acc, p) => {
        if (!acc[p.loanId]) acc[p.loanId] = [];
        acc[p.loanId].push(p);
        return acc;
      }, {}),
    [payments]
  );

  const stats = useMemo(
    () => ({
      loans: approvedLoans.length,
      totalBalance: approvedLoans.reduce((s, l) => s + l.balance, 0),
      released: approvedLoans.filter((l) => l.disbursementStatus === 'disbursed').length,
      payments: payments.length,
      pendingRequests: pendingSubmissions.length,
    }),
    [approvedLoans, payments.length, pendingSubmissions.length]
  );

  const onRecordDisbursement = async (loan: Loan) => {
    setSaving(true);
    try {
      const updated = await recordOfficerLoanDisbursement({
        loanId: loan.id,
        disbursementReference: disbursementReferenceByLoan[loan.id] ?? '',
      });
      setLoans((cur) => cur.map((l) => (l.id === updated.id ? updated : l)));
      setDisbursementReferenceByLoan((c) => ({ ...c, [loan.id]: '' }));
      setSelectedLoanId(null);
      void loadData('refresh');

      if (updated.disbursementStatus === 'processing') {
        Alert.alert('Disbursement started', 'Waiting for provider confirmation.');
      } else if (updated.disbursementStatus === 'disbursed') {
        Alert.alert('Disbursed', 'Loan release recorded.');
      } else if (updated.disbursementStatus === 'failed') {
        Alert.alert('Failed', updated.disbursementFailureMessage || 'Provider rejected the payout.');
      } else {
        Alert.alert('Updated', 'Disbursement status updated.');
      }
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to record disbursement.');
    } finally {
      setSaving(false);
    }
  };

  const onRecordPayment = async () => {
    if (!selectedLoanId) return;
    const amount = Number(paymentAmountByLoan[selectedLoanId] ?? '');
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid payment amount.');
      return;
    }
    const paymentMethod = paymentMethodByLoan[selectedLoanId] ?? 'cash';
    setSaving(true);
    try {
      const saved = await recordOfficerPayment({
        loanId: selectedLoanId,
        amount,
        paymentMethod,
        paymentReference: paymentReferenceByLoan[selectedLoanId],
        note: noteByLoan[selectedLoanId],
      });
      setPayments((cur) => [saved, ...cur]);
      setLoans((cur) =>
        cur.map((l) =>
          l.id === selectedLoanId
            ? {
                ...l,
                balance: Math.max(0, Number((l.balance - saved.amount).toFixed(2))),
                paymentsCount: (l.paymentsCount ?? 0) + 1,
              }
            : l
        )
      );
      setPaymentAmountByLoan((c) => ({ ...c, [selectedLoanId]: '' }));
      setNoteByLoan((c) => ({ ...c, [selectedLoanId]: '' }));
      setPaymentReferenceByLoan((c) => ({ ...c, [selectedLoanId]: '' }));
      setSelectedLoanId(null);
      void loadData('refresh');
      Alert.alert('Saved', 'Repayment recorded successfully.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to record repayment.');
    } finally {
      setSaving(false);
    }
  };

  const onApproveSubmission = async (submission: PaymentSubmission) => {
    setReviewingSubmissionId(submission.id);
    try {
      await approveOfficerPaymentSubmission(submission.id);
      await loadData('refresh');
      Alert.alert('Approved', 'Payment request approved and recorded.');
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to approve payment request.');
    } finally {
      setReviewingSubmissionId(null);
    }
  };

  const onRejectSubmission = (submission: PaymentSubmission) => {
    Alert.alert(
      'Reject payment request?',
      'This keeps the loan balance unchanged until the borrower submits a new request.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setReviewingSubmissionId(submission.id);
            try {
              await rejectOfficerPaymentSubmission(submission.id);
              await loadData('refresh');
              Alert.alert('Rejected', 'Payment request rejected.');
            } catch (error) {
              Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to reject payment request.');
            } finally {
              setReviewingSubmissionId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading disbursements and repayments...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadData('refresh')}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['#1E3A8A', '#2F56D4', '#4169E1']}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerIcon}>
          <ReceiptText size={22} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <Text style={styles.headerTitle}>Disbursements & Repayments</Text>
        <Text style={styles.headerSub}>Release approved loans and record borrower repayments</Text>
        <View style={styles.statsRow}>
          {[
            { label: 'Open Loans', value: stats.loans },
            { label: 'Disbursed', value: stats.released },
            { label: 'Pending', value: stats.pendingRequests },
            { label: 'Outstanding', value: formatCurrency(stats.totalBalance) },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={styles.statBoxValue} numberOfLines={1}>
                {s.value}
              </Text>
              <Text style={styles.statBoxLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pending Payment Requests</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{pendingSubmissions.length}</Text>
        </View>
      </View>

      {pendingSubmissions.length === 0 ? (
        <Card style={styles.mx}>
          <Text style={styles.emptyText}>No borrower payment requests are waiting for review.</Text>
        </Card>
      ) : (
        pendingSubmissions.map((submission) => (
          <Card key={submission.id} style={styles.loanCard}>
            <View style={styles.loanHeader}>
              <UserAvatar
                name={submission.borrowerName ?? 'Borrower'}
                photoUrl={submission.borrowerPhotoUrl}
                size={42}
                containerStyle={styles.avatarCircle}
              />
              <View style={styles.loanHeaderText}>
                <Text style={styles.borrowerName}>{submission.borrowerName ?? 'Borrower'}</Text>
                <Text style={styles.loanType}>
                  {submission.loanTypeName ?? 'Loan'} • Loan #{submission.loanId}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.statusPillText, { color: '#92400E' }]}>Pending</Text>
              </View>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Requested Repayment</Text>
              <Text style={styles.balanceValue}>{formatCurrency(submission.amount)}</Text>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Method</Text>
                <Text style={styles.detailValue}>
                  {submission.paymentMethod ? DISBURSEMENT_LABELS[submission.paymentMethod] ?? submission.paymentMethod : 'Cash'}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Submitted</Text>
                <Text style={styles.detailValue}>{submission.submittedAt}</Text>
              </View>
              {submission.paymentReference ? (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Reference</Text>
                  <Text style={styles.detailValue}>{submission.paymentReference}</Text>
                </View>
              ) : null}
              {submission.proofFileName ? (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Proof</Text>
                  <Text style={styles.detailValue}>{submission.proofFileName}</Text>
                </View>
              ) : null}
            </View>

            {submission.note ? <Text style={styles.processingText}>{submission.note}</Text> : null}

            <View style={styles.submissionActions}>
              {submission.proofFileUrl ? (
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => setPreviewSubmission(submission)}
                  activeOpacity={0.85}
                  disabled={reviewingSubmissionId === submission.id}
                >
                  <Eye size={16} color={colors.primary} strokeWidth={2.4} />
                  <Text style={styles.viewBtnText}>View Proof</Text>
                </TouchableOpacity>
              ) : null}
              <Button
                title="Approve"
                onPress={() => void onApproveSubmission(submission)}
                loading={reviewingSubmissionId === submission.id}
                disabled={Boolean(reviewingSubmissionId && reviewingSubmissionId !== submission.id)}
              />
              <View style={styles.btnGap} />
              <Button
                title="Reject"
                onPress={() => onRejectSubmission(submission)}
                variant="secondary"
                disabled={Boolean(reviewingSubmissionId)}
              />
            </View>
          </Card>
        ))
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Repayments</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{payments.length}</Text>
        </View>
      </View>

      {payments.length === 0 ? (
        <Card style={styles.mx}>
          <Text style={styles.emptyText}>No recorded repayments yet.</Text>
        </Card>
      ) : (
        <Card style={styles.mx}>
          {payments.slice(0, 8).map((payment, i) => (
            <View
              key={payment.id}
              style={[
                styles.paymentRow,
                i < Math.min(payments.length, 8) - 1 && styles.paymentRowBorder,
              ]}
            >
              <View style={styles.paymentLeft}>
                <UserAvatar
                  name={payment.borrowerName ?? 'Borrower'}
                  photoUrl={payment.borrowerPhotoUrl}
                  size={34}
                  containerStyle={styles.paymentAvatar}
                />
                <View>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                  <Text style={styles.paymentMeta}>
                    {payment.borrowerName ?? 'Borrower'} - Loan #{payment.loanId}
                  </Text>
                  {payment.paymentMethod ? (
                    <Text style={styles.paymentMeta}>
                      {DISBURSEMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                      {payment.paymentReference ? ` - ${payment.paymentReference}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.paymentDate}>{payment.date}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Approved Loans</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{approvedLoans.length}</Text>
        </View>
      </View>

      {approvedLoans.length === 0 ? (
        <Card style={styles.mx}>
          <Text style={styles.emptyText}>No approved loans with remaining balance.</Text>
        </Card>
      ) : null}

      {approvedLoans.map((loan) => {
        const disbStyle = getDisbursementStyle(loan);
        return (
          <Card key={loan.id} style={styles.loanCard}>
            <View style={styles.loanHeader}>
              <UserAvatar
                name={loan.borrowerName}
                photoUrl={loan.borrowerPhotoUrl}
                size={42}
                containerStyle={styles.avatarCircle}
              />
              <View style={styles.loanHeaderText}>
                <Text style={styles.borrowerName}>{loan.borrowerName}</Text>
                <Text style={styles.loanType}>{loan.loanTypeName}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: disbStyle.bg }]}>
                <Text style={[styles.statusPillText, { color: disbStyle.text }]}>
                  {getDisbursementLabel(loan)}
                </Text>
              </View>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Remaining Balance</Text>
              <Text style={styles.balanceValue}>{formatCurrency(loan.balance)}</Text>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Disburse via</Text>
                <Text style={styles.detailValue}>{formatDisbursementTarget(loan)}</Text>
              </View>
              {loan.disbursementAccountName ? (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Receiver</Text>
                  <Text style={styles.detailValue}>{loan.disbursementAccountName}</Text>
                </View>
              ) : null}
              {loan.disbursementStatus === 'disbursed' && loan.disbursedAt ? (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Released on</Text>
                  <Text style={styles.detailValue}>{loan.disbursedAt}</Text>
                </View>
              ) : null}
              {loan.disbursementReference ? (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Reference</Text>
                  <Text style={styles.detailValue}>{loan.disbursementReference}</Text>
                </View>
              ) : null}
            </View>

            {loan.disbursementFailureMessage ? (
              <Text style={styles.failureText}>{loan.disbursementFailureMessage}</Text>
            ) : null}

            {selectedLoanId === loan.id ? (
              loan.disbursementStatus !== 'disbursed' && loan.disbursementStatus !== 'processing' ? (
                <View style={styles.form}>
                  <Input
                    label={loan.disbursementMethod === 'cash_pickup' ? 'Disbursement note (optional)' : 'Disbursement reference'}
                    value={disbursementReferenceByLoan[loan.id] ?? ''}
                    onChangeText={(v) =>
                      setDisbursementReferenceByLoan((c) => ({ ...c, [loan.id]: v }))
                    }
                    placeholder={
                      loan.disbursementMethod === 'cash_pickup'
                        ? 'Cash payout note'
                        : 'Bank or wallet reference'
                    }
                    editable={!saving}
                  />
                  <Button
                    title={
                      loan.disbursementStatus === 'failed' || loan.disbursementStatus === 'reversed'
                        ? 'Retry Disbursement'
                        : 'Confirm Disbursement'
                    }
                    onPress={() => void onRecordDisbursement(loan)}
                    loading={saving}
                  />
                  <View style={styles.btnGap} />
                  <Button
                    title="Cancel"
                    onPress={() => setSelectedLoanId(null)}
                    variant="secondary"
                    disabled={saving}
                  />
                </View>
              ) : loan.disbursementStatus === 'processing' ? (
                <View style={styles.form}>
                  <Text style={styles.processingText}>
                    Waiting for payout provider confirmation. Refresh after a few seconds.
                  </Text>
                  <Button
                    title="Refresh Status"
                    onPress={() => void loadData('refresh')}
                    disabled={saving}
                  />
                  <View style={styles.btnGap} />
                  <Button
                    title="Close"
                    onPress={() => setSelectedLoanId(null)}
                    variant="secondary"
                    disabled={saving}
                  />
                </View>
              ) : (
                <View style={styles.form}>
                  <Input
                    label="Repayment Amount"
                    value={paymentAmountByLoan[loan.id] ?? ''}
                    onChangeText={(v) => setPaymentAmountByLoan((c) => ({ ...c, [loan.id]: v }))}
                    keyboardType="numeric"
                    placeholder="Enter amount"
                    editable={!saving}
                  />
                  <Text style={styles.methodLabel}>Repayment method</Text>
                  <View style={styles.methodRow}>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => {
                      const active = (paymentMethodByLoan[loan.id] ?? 'cash') === opt.value;
                      return (
                        <TouchableOpacity
                          key={`${loan.id}-${opt.value}`}
                          style={[styles.methodChip, active && styles.methodChipActive]}
                          onPress={() =>
                            setPaymentMethodByLoan((c) => ({ ...c, [loan.id]: opt.value }))
                          }
                          disabled={saving}
                        >
                          <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {(paymentMethodByLoan[loan.id] ?? 'cash') !== 'cash' ? (
                    <Input
                      label="Repayment reference"
                      value={paymentReferenceByLoan[loan.id] ?? ''}
                      onChangeText={(v) =>
                        setPaymentReferenceByLoan((c) => ({ ...c, [loan.id]: v }))
                      }
                      placeholder="Transfer or wallet reference"
                      editable={!saving}
                    />
                  ) : null}
                  <Input
                    label="Note (optional)"
                    value={noteByLoan[loan.id] ?? ''}
                    onChangeText={(v) => setNoteByLoan((c) => ({ ...c, [loan.id]: v }))}
                    placeholder="Optional note"
                    editable={!saving}
                  />
                  <Button title="Save Repayment" onPress={() => void onRecordPayment()} loading={saving} />
                  <View style={styles.btnGap} />
                  <Button
                    title="Cancel"
                    onPress={() => setSelectedLoanId(null)}
                    variant="secondary"
                    disabled={saving}
                  />
                </View>
              )
            ) : loan.disbursementStatus === 'disbursed' ? (
              <Button title="Record Repayment" onPress={() => setSelectedLoanId(loan.id)} />
            ) : loan.disbursementStatus === 'processing' ? (
              <Button title="View Disbursement Status" onPress={() => setSelectedLoanId(loan.id)} />
            ) : (
              <Button
                title={
                  loan.disbursementStatus === 'failed' || loan.disbursementStatus === 'reversed'
                    ? 'Retry Disbursement'
                    : 'Disburse Loan'
                }
                onPress={() => setSelectedLoanId(loan.id)}
              />
            )}

            <Text style={styles.historyTitle}>Repayment History</Text>
            {(paymentsByLoan[loan.id] ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No repayments yet.</Text>
            ) : (
              (paymentsByLoan[loan.id] ?? []).map((p, i) => (
                <View
                  key={p.id}
                  style={[
                    styles.paymentRow,
                    i < (paymentsByLoan[loan.id] ?? []).length - 1 && styles.paymentRowBorder,
                  ]}
                >
                  <View>
                    <Text style={styles.paymentAmount}>{formatCurrency(p.amount)}</Text>
                    {p.paymentMethod ? (
                      <Text style={styles.paymentMeta}>
                        {DISBURSEMENT_LABELS[p.paymentMethod] ?? p.paymentMethod}
                        {p.paymentReference ? ` - ${p.paymentReference}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.paymentDate}>{p.date}</Text>
                </View>
              ))
            )}
          </Card>
        );
      })}
      <DocumentPreviewModal
        visible={Boolean(previewSubmission)}
        title="Payment Proof"
        fileName={previewSubmission?.proofFileName}
        fileUrl={previewSubmission?.proofFileUrl}
        onClose={() => setPreviewSubmission(null)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {},
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: { marginTop: spacing.sm, color: colors.textLight, fontSize: 14, fontWeight: '600' },

  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  statBoxValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  statBoxLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },

  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', margin: spacing.md },
  emptyText: { color: colors.textLight, fontSize: 14 },
  mx: { marginHorizontal: spacing.md, marginBottom: spacing.sm },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  countPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillText: { color: colors.primary, fontSize: 12, fontWeight: '800' },

  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  paymentRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  paymentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
  paymentMeta: { fontSize: 11, color: colors.textLight, marginTop: 1 },
  paymentDate: { fontSize: 12, color: colors.textLight },

  loanCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  loanHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanHeaderText: { flex: 1 },
  borrowerName: { fontSize: 16, fontWeight: '800', color: colors.text },
  loanType: { fontSize: 12, color: colors.textLight, marginTop: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  balanceLabel: { fontSize: 12, color: colors.primaryDark, fontWeight: '600' },
  balanceValue: { fontSize: 18, fontWeight: '900', color: colors.primaryDark },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  detailItem: {
    width: '48%',
    backgroundColor: '#F8FCFF',
    borderRadius: radii.sm,
    padding: spacing.xs + 2,
  },
  detailLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginBottom: 2 },
  detailValue: { fontSize: 12, color: colors.text, fontWeight: '700' },

  failureText: { color: colors.danger, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  form: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  btnGap: { height: spacing.xs },
  submissionActions: {
    marginTop: spacing.sm,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  viewBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  methodLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  methodChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: '#FFFFFF',
  },
  methodChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  methodChipText: { color: colors.textLight, fontSize: 12, fontWeight: '600' },
  methodChipTextActive: { color: colors.primary },
  processingText: { color: colors.textLight, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  historyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
});
