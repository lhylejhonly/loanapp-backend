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
import { CheckCircle2, ClipboardList, Eye, FileCheck2, ShieldAlert, XCircle } from 'lucide-react-native';
import { Card } from '../components/Card';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Input } from '../components/Input';
import { UserAvatar } from '../components/UserAvatar';
import {
  fetchOfficerApplications,
  fetchOfficerBorrowerDocuments,
  OfficerDocument,
  submitOfficerLoanDecision,
  verifyOfficerDocument,
} from '../api/officer';
import { Loan } from '../../types';
import { DOC_LABELS } from '../../constants/docTypes';
import { colors, spacing, radii } from '../../constants/theme';

const DISBURSEMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  gcash: 'GCash',
  maya: 'Maya',
  cash_pickup: 'Cash Pickup',
};

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

const formatDisbursementTarget = (loan: Loan) => {
  const label = loan.disbursementMethod ? DISBURSEMENT_LABELS[loan.disbursementMethod] : 'Not set';
  if (loan.disbursementMethod === 'cash_pickup') return label;
  if (loan.disbursementAccountNumber) return `${label} ···${loan.disbursementAccountNumber.slice(-4)}`;
  return label;
};

export const OfficerApplicationsScreen = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [applications, setApplications] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [decisionLoadingLoanId, setDecisionLoadingLoanId] = useState<string | null>(null);
  const [interestByLoan, setInterestByLoan] = useState<Record<string, string>>({});
  const [rejectionByLoan, setRejectionByLoan] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  // document viewer state keyed by borrowerId
  const [docsByBorrower, setDocsByBorrower] = useState<Record<string, OfficerDocument[]>>({});
  const [docsLoadingId, setDocsLoadingId] = useState<string | null>(null);
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<OfficerDocument | null>(null);

  const loadApplications = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await fetchOfficerApplications();
      setApplications(payload);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load applications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadApplications(); }, [loadApplications]));

  const pendingApplications = useMemo(() => applications.filter((l) => l.status === 'pending'), [applications]);
  const reviewedApplications = useMemo(() => applications.filter((l) => l.status !== 'pending'), [applications]);

  const filteredApplications = useMemo(() => {
    if (activeFilter === 'all') return applications;
    return applications.filter((l) => l.status === activeFilter);
  }, [applications, activeFilter]);

  const stats = useMemo(() => ({
    total: applications.length,
    pending: pendingApplications.length,
    approved: applications.filter((l) => l.status === 'approved').length,
    rejected: applications.filter((l) => l.status === 'rejected').length,
  }), [applications, pendingApplications.length]);

  const openReview = (loan: Loan) => {
    const opening = selectedLoanId !== loan.id;
    setSelectedLoanId(opening ? loan.id : null);
    setInterestByLoan((cur) => ({ ...cur, [loan.id]: cur[loan.id] ?? String(loan.interestRate) }));
    setRejectionByLoan((cur) => ({ ...cur, [loan.id]: cur[loan.id] ?? loan.rejectionReason ?? '' }));
    // auto-load documents when opening
    if (opening && !docsByBorrower[loan.borrowerId]) {
      void loadDocs(loan.borrowerId);
    }
  };

  const loadDocs = async (borrowerId: string) => {
    setDocsLoadingId(borrowerId);
    try {
      const docs = await fetchOfficerBorrowerDocuments(borrowerId);
      setDocsByBorrower((prev) => ({ ...prev, [borrowerId]: docs }));
    } catch {
      setDocsByBorrower((prev) => ({ ...prev, [borrowerId]: [] }));
    } finally {
      setDocsLoadingId(null);
    }
  };

  const handleVerifyDoc = async (doc: OfficerDocument, borrowerId: string) => {
    if (doc.status === 'verified') return;
    setVerifyingDocId(doc.id);
    try {
      await verifyOfficerDocument(doc.id);
      setDocsByBorrower((prev) => ({
        ...prev,
        [borrowerId]: (prev[borrowerId] ?? []).map((d) =>
          d.id === doc.id ? { ...d, status: 'verified' as const } : d
        ),
      }));
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to verify document.');
    } finally {
      setVerifyingDocId(null);
    }
  };

  const handlePreviewDoc = (doc: OfficerDocument) => {
    if (!doc.fileUrl) {
      Alert.alert('Unavailable', 'This document does not have a file preview yet.');
      return;
    }

    setPreviewDocument(doc);
  };

  const handleApprove = async (loan: Loan) => {
    const rate = Number(interestByLoan[loan.id] ?? String(loan.interestRate));
    if (!Number.isFinite(rate) || rate <= 0) { Alert.alert('Invalid rate', 'Enter a valid interest rate.'); return; }
    setDecisionLoadingLoanId(loan.id);
    try {
      const updated = await submitOfficerLoanDecision(loan.id, { approve: true, interestRate: rate });
      setApplications((cur) => cur.map((l) => (l.id === updated.id ? updated : l)));
      setSelectedLoanId(null);
      void loadApplications('refresh');
      Alert.alert('Approved ✓', 'Loan application approved.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to approve.');
    } finally {
      setDecisionLoadingLoanId(null);
    }
  };

  const handleReject = async (loan: Loan) => {
    setDecisionLoadingLoanId(loan.id);
    try {
      const updated = await submitOfficerLoanDecision(loan.id, { approve: false, rejectionReason: rejectionByLoan[loan.id] });
      setApplications((cur) => cur.map((l) => (l.id === updated.id ? updated : l)));
      setSelectedLoanId(null);
      void loadApplications('refresh');
      Alert.alert('Rejected', 'Loan application rejected.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to reject.');
    } finally {
      setDecisionLoadingLoanId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading applications...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadApplications('refresh')} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient colors={['#1E3A8A', '#2F56D4', '#4169E1']} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerIcon}>
          <ClipboardList size={22} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <Text style={styles.headerTitle}>Loan Applications</Text>
        <Text style={styles.headerSub}>Review, approve, or reject pending applications</Text>

        <View style={styles.statsRow}>
          {[
            { label: 'Total', value: stats.total },
            { label: 'Pending', value: stats.pending },
            { label: 'Approved', value: stats.approved },
            { label: 'Rejected', value: stats.rejected },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={styles.statBoxValue}>{s.value}</Text>
              <Text style={styles.statBoxLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['pending', 'all', 'approved', 'rejected'] as const).map((f) => {
          const count =
            f === 'all' ? applications.length
            : applications.filter((l) => l.status === f).length;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
              onPress={() => { setActiveFilter(f); setSelectedLoanId(null); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterTabText, activeFilter === f && styles.filterTabTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
              <View style={[styles.filterBadge, activeFilter === f && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, activeFilter === f && styles.filterBadgeTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredApplications.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {activeFilter === 'pending' ? 'No pending applications right now.' :
             activeFilter === 'approved' ? 'No approved loans yet.' :
             activeFilter === 'rejected' ? 'No rejected applications.' :
             'No applications found.'}
          </Text>
        </Card>
      ) : (
        filteredApplications.map((loan) => {
          const isSelected = selectedLoanId === loan.id;
          const busy = decisionLoadingLoanId === loan.id;
          const isPending = loan.status === 'pending';
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
                  <Text style={styles.metaText}>{loan.borrowerEmail ?? 'No email'}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  loan.status === 'pending' ? styles.pendingBadge
                  : loan.status === 'approved' ? styles.approvedBadge
                  : styles.rejectedBadge,
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    loan.status === 'approved' ? styles.approvedText
                    : loan.status === 'rejected' ? styles.rejectedText
                    : styles.pendingBadgeText,
                  ]}>
                    {loan.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Loan Amount</Text>
                <Text style={styles.amountValue}>{formatCurrency(loan.amount)}</Text>
              </View>

              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>{loan.loanTypeName}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Term</Text>
                  <Text style={styles.detailValue}>{loan.termMonths} months</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Release via</Text>
                  <Text style={styles.detailValue}>{formatDisbursementTarget(loan)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Applied</Text>
                  <Text style={styles.detailValue}>{loan.createdAt}</Text>
                </View>
              </View>

              {loan.rejectionReason ? (
                <Text style={styles.rejectionText}>Reason: {loan.rejectionReason}</Text>
              ) : null}

              {isPending ? (
                isSelected ? (
                  <View style={styles.reviewPanel}>
                    {/* Document Viewer */}
                    <Text style={styles.docSectionTitle}>Borrower Documents</Text>
                    {docsLoadingId === loan.borrowerId ? (
                      <View style={styles.docLoadingRow}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.docLoadingText}>Loading documents...</Text>
                      </View>
                    ) : (docsByBorrower[loan.borrowerId] ?? []).length === 0 ? (
                      <View style={styles.docEmptyRow}>
                        <ShieldAlert size={16} color={colors.textMuted} strokeWidth={2.2} />
                        <Text style={styles.docEmptyText}>No documents uploaded yet.</Text>
                      </View>
                    ) : (
                      (docsByBorrower[loan.borrowerId] ?? []).map((doc) => {
                        const isVerified = doc.status === 'verified';
                        const verifying = verifyingDocId === doc.id;
                        return (
                          <View key={doc.id} style={styles.docRow}>
                            <View style={styles.docRowLeft}>
                              <View style={[styles.docStatusDot, isVerified ? styles.docStatusDotVerified : styles.docStatusDotPending]} />
                              <View style={styles.docRowInfo}>
                                <Text style={styles.docRowLabel}>
                                  {(DOC_LABELS as Record<string, string>)[doc.type] ?? doc.type}
                                </Text>
                                <Text style={styles.docRowFile} numberOfLines={1}>{doc.fileName}</Text>
                              </View>
                            </View>
                            <View style={styles.docActions}>
                              {doc.fileUrl ? (
                                <TouchableOpacity style={styles.viewBtn} onPress={() => handlePreviewDoc(doc)}>
                                  <Eye size={13} color={colors.primary} strokeWidth={2.4} />
                                  <Text style={styles.viewBtnText}>View</Text>
                                </TouchableOpacity>
                              ) : null}
                              {isVerified ? (
                                <View style={styles.verifiedBadge}>
                                  <CheckCircle2 size={13} color="#065F46" strokeWidth={2.5} />
                                  <Text style={styles.verifiedBadgeText}>Verified</Text>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={[styles.verifyBtn, verifying && styles.btnDisabled]}
                                  onPress={() => void handleVerifyDoc(doc, loan.borrowerId)}
                                  disabled={verifying || busy}
                                >
                                  {verifying ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                  ) : (
                                    <>
                                      <FileCheck2 size={13} color="#FFFFFF" strokeWidth={2.4} />
                                      <Text style={styles.verifyBtnText}>Verify</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })
                    )}

                    <View style={styles.divider} />

                    <Input
                      label="Interest Rate (%)"
                      value={interestByLoan[loan.id] ?? String(loan.interestRate)}
                      onChangeText={(v) => setInterestByLoan((p) => ({ ...p, [loan.id]: v }))}
                      keyboardType="numeric"
                      editable={!busy}
                    />
                    <Input
                      label="Rejection Reason (if rejecting)"
                      value={rejectionByLoan[loan.id] ?? ''}
                      onChangeText={(v) => setRejectionByLoan((p) => ({ ...p, [loan.id]: v }))}
                      placeholder="Leave blank if approving"
                      editable={!busy}
                    />
                    <View style={styles.decisionRow}>
                      <TouchableOpacity
                        style={[styles.approveBtn, busy && styles.btnDisabled]}
                        onPress={() => void handleApprove(loan)}
                        disabled={busy}
                      >
                        <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                        <Text style={styles.decisionBtnText}>{busy ? 'Saving...' : 'Approve'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.rejectBtn, busy && styles.btnDisabled]}
                        onPress={() => void handleReject(loan)}
                        disabled={busy}
                      >
                        <XCircle size={16} color="#FFFFFF" strokeWidth={2.4} />
                        <Text style={styles.decisionBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.cancelLink} onPress={() => setSelectedLoanId(null)}>
                      <Text style={styles.cancelLinkText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.reviewBtn} onPress={() => openReview(loan)}>
                    <Text style={styles.reviewBtnText}>Review Application</Text>
                  </TouchableOpacity>
                )
              ) : null}
            </Card>
          );
        })
      )}
      <DocumentPreviewModal
        visible={Boolean(previewDocument)}
        title={(previewDocument && (DOC_LABELS as Record<string, string>)[previewDocument.type]) || 'Borrower Document'}
        fileName={previewDocument?.fileName}
        fileUrl={previewDocument?.fileUrl}
        onClose={() => setPreviewDocument(null)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText: { marginTop: spacing.sm, color: colors.textLight, fontSize: 14, fontWeight: '600' },

  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  headerIcon: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14,
    paddingVertical: 10, alignItems: 'center',
  },
  statBoxValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  statBoxLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600', marginTop: 2 },

  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', margin: spacing.md },
  filterRow: {
    flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: radii.md,
    backgroundColor: '#F1F5F9',
  },
  filterTabActive: { backgroundColor: colors.primarySoft },
  filterTabText: { fontSize: 11, fontWeight: '700', color: colors.textLight },
  filterTabTextActive: { color: colors.primary },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeActive: { backgroundColor: colors.primary },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  filterBadgeTextActive: { color: '#FFFFFF' },
  emptyCard: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  countPillText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.textLight, fontSize: 14 },

  loanCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  loanHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  loanHeaderText: { flex: 1 },
  borrowerName: { fontSize: 16, fontWeight: '800', color: colors.text },
  metaText: { fontSize: 12, color: colors.textLight, marginTop: 1 },

  pendingBadge: { backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  pendingBadgeText: { color: '#92400E', fontSize: 10, fontWeight: '800' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  approvedBadge: { backgroundColor: '#DCFCE7' },
  rejectedBadge: { backgroundColor: '#FEE2E2' },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  approvedText: { color: '#166534' },
  rejectedText: { color: '#B91C1C' },

  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primarySoft, borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.sm,
  },
  amountLabel: { fontSize: 12, color: colors.primaryDark, fontWeight: '600' },
  amountValue: { fontSize: 20, fontWeight: '900', color: colors.primaryDark },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  detailItem: { width: '48%', backgroundColor: '#F8FCFF', borderRadius: radii.sm, padding: spacing.xs + 2 },
  detailLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginBottom: 2 },
  detailValue: { fontSize: 12, color: colors.text, fontWeight: '700' },

  reviewPanel: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  docSectionTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  docLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  docLoadingText: { fontSize: 12, color: colors.textLight },
  docEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  docEmptyText: { fontSize: 12, color: colors.textMuted },
  docRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FCFF', borderRadius: radii.sm, padding: spacing.sm,
    marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border,
  },
  docRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  docStatusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  docStatusDotVerified: { backgroundColor: colors.success },
  docStatusDotPending: { backgroundColor: colors.warning },
  docRowInfo: { flex: 1 },
  docRowLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  docRowFile: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  docActions: { alignItems: 'flex-end', gap: 6 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#D1FAE5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
  },
  verifiedBadgeText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  verifyBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  decisionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: colors.success, borderRadius: radii.md, paddingVertical: 12,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: colors.danger, borderRadius: radii.md, paddingVertical: 12,
  },
  btnDisabled: { opacity: 0.6 },
  decisionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cancelLink: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelLinkText: { color: colors.textLight, fontSize: 13, fontWeight: '600' },

  reviewBtn: {
    marginTop: spacing.sm, backgroundColor: colors.primary,
    borderRadius: radii.md, paddingVertical: 11, alignItems: 'center',
  },
  reviewBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  rejectionText: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: spacing.xs },
});
