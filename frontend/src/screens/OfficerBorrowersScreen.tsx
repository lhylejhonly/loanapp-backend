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
import { Eye, FileCheck2, FileX2, Users } from 'lucide-react-native';
import { Card } from '../components/Card';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { UserAvatar } from '../components/UserAvatar';
import {
  fetchOfficerBorrowers,
  fetchOfficerBorrowerDocuments,
  verifyOfficerDocument,
  toggleOfficerBorrowerStatus,
  type OfficerBorrowerRecord,
  type OfficerDocument,
} from '../api/officer';
import { DOC_LABELS } from '../../constants/docTypes';
import { User } from '../../types';
import { colors, spacing, radii } from '../../constants/theme';

const formatVerificationStatus = (status: User['verificationStatus']) => {
  if (status === 'qualified') return 'Qualified';
  if (status === 'not_qualified') return 'Not Qualified';
  return 'Not Started';
};

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

export const OfficerBorrowersScreen = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [borrowers, setBorrowers] = useState<OfficerBorrowerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedBorrowerId, setExpandedBorrowerId] = useState<string | null>(null);
  const [documentsByBorrower, setDocumentsByBorrower] = useState<Record<string, OfficerDocument[]>>({});
  const [documentErrorByBorrower, setDocumentErrorByBorrower] = useState<Record<string, string>>({});
  const [documentLoadingByBorrower, setDocumentLoadingByBorrower] = useState<Record<string, boolean>>({});
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [togglingBorrowerId, setTogglingBorrowerId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<OfficerDocument | null>(null);

  const loadBorrowers = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await fetchOfficerBorrowers();
      setBorrowers(payload);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load borrowers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadBorrowers(); }, [loadBorrowers]));

  const stats = useMemo(() => ({
    total: borrowers.length,
    active: borrowers.filter((b) => b.user.active).length,
    inactive: borrowers.filter((b) => !b.user.active).length,
    qualified: borrowers.filter((b) => b.user.verificationStatus === 'qualified').length,
  }), [borrowers]);

  const loadDocuments = useCallback(async (borrowerId: string) => {
    setDocumentLoadingByBorrower((p) => ({ ...p, [borrowerId]: true }));
    try {
      const docs = await fetchOfficerBorrowerDocuments(borrowerId);
      setDocumentsByBorrower((p) => ({ ...p, [borrowerId]: docs }));
      setDocumentErrorByBorrower((p) => ({ ...p, [borrowerId]: '' }));
    } catch (e) {
      setDocumentErrorByBorrower((p) => ({ ...p, [borrowerId]: e instanceof Error ? e.message : 'Unable to load documents.' }));
    } finally {
      setDocumentLoadingByBorrower((p) => ({ ...p, [borrowerId]: false }));
    }
  }, []);

  const handleToggle = async (borrower: OfficerBorrowerRecord) => {
    setTogglingBorrowerId(borrower.user.id);
    try {
      const updated = await toggleOfficerBorrowerStatus(borrower.user.id);
      setBorrowers((cur) => cur.map((b) => (b.user.id === updated.id ? { ...b, user: updated } : b)));
      void loadBorrowers('refresh');
      Alert.alert('Updated', `Account is now ${updated.active ? 'active' : 'inactive'}.`);
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to update.');
    } finally {
      setTogglingBorrowerId(null);
    }
  };

  const handleExpandDocs = async (borrowerId: string) => {
    if (expandedBorrowerId === borrowerId) { setExpandedBorrowerId(null); return; }
    setExpandedBorrowerId(borrowerId);
    const alreadyLoaded = Object.prototype.hasOwnProperty.call(documentsByBorrower, borrowerId);
    if (alreadyLoaded && !documentErrorByBorrower[borrowerId]) return;
    await loadDocuments(borrowerId);
  };

  const handleVerifyDoc = async (doc: OfficerDocument) => {
    setVerifyingDocId(doc.id);
    try {
      await verifyOfficerDocument(doc.id);
      await loadDocuments(doc.borrowerId);
      Alert.alert('Verified ✓', 'Document marked as verified.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unable to verify.');
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

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading borrowers...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBorrowers('refresh')} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient colors={['#1E3A8A', '#2F56D4', '#4169E1']} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerIcon}>
          <Users size={22} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <Text style={styles.headerTitle}>Borrower Accounts</Text>
        <Text style={styles.headerSub}>Manage verification, documents, and account access</Text>
        <View style={styles.statsRow}>
          {[
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Inactive', value: stats.inactive },
            { label: 'Qualified', value: stats.qualified },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={styles.statBoxValue}>{s.value}</Text>
              <Text style={styles.statBoxLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.listWrap}>
        {borrowers.length === 0 ? (
          <Card><Text style={styles.emptyText}>No borrower accounts found.</Text></Card>
        ) : null}

        {borrowers.map((borrower) => (
          <Card key={borrower.user.id} style={styles.borrowerCard}>
            {/* Borrower header */}
            <View style={styles.borrowerHeader}>
              <UserAvatar
                name={borrower.user.name}
                photoUrl={borrower.user.profilePhotoUrl}
                size={44}
                containerStyle={styles.avatarCircle}
              />
              <View style={styles.borrowerInfo}>
                <Text style={styles.borrowerName}>{borrower.user.name}</Text>
                <Text style={styles.borrowerEmail}>{borrower.user.email}</Text>
              </View>
              <View style={[styles.statusBadge, borrower.user.active ? styles.activeBadge : styles.inactiveBadge]}>
                <Text style={[styles.statusText, borrower.user.active ? styles.activeText : styles.inactiveText]}>
                  {borrower.user.active ? 'ACTIVE' : 'INACTIVE'}
                </Text>
              </View>
            </View>

            {/* Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{borrower.metrics.pendingLoans}</Text>
                <Text style={styles.metricLabel}>Pending</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{borrower.metrics.approvedLoans}</Text>
                <Text style={styles.metricLabel}>Approved</Text>
              </View>
              <View style={[styles.metricBox, { flex: 2 }]}>
                <Text style={styles.metricValue}>{formatCurrency(borrower.metrics.outstandingBalance)}</Text>
                <Text style={styles.metricLabel}>Outstanding</Text>
              </View>
            </View>

            {/* Verification */}
            <View style={styles.verificationRow}>
              <View style={[
                styles.verificationBadge,
                borrower.user.verificationStatus === 'qualified' ? styles.qualifiedBadge
                  : borrower.user.verificationStatus === 'not_qualified' ? styles.notQualifiedBadge
                  : styles.notStartedBadge,
              ]}>
                <Text style={[
                  styles.verificationText,
                  borrower.user.verificationStatus === 'qualified' ? styles.qualifiedText
                    : borrower.user.verificationStatus === 'not_qualified' ? styles.notQualifiedText
                    : styles.notStartedText,
                ]}>
                  {formatVerificationStatus(borrower.user.verificationStatus)}
                </Text>
              </View>
            </View>

            {/* Documents toggle */}
            <TouchableOpacity style={styles.docsToggle} onPress={() => void handleExpandDocs(borrower.user.id)}>
              <Text style={styles.docsToggleText}>
                {expandedBorrowerId === borrower.user.id ? '▲ Hide Documents' : '▼ View Documents'}
              </Text>
            </TouchableOpacity>

            {expandedBorrowerId === borrower.user.id ? (
              <View style={styles.docsSection}>
                {documentLoadingByBorrower[borrower.user.id] ? (
                  <View style={styles.inlineRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.inlineText}>Loading documents...</Text>
                  </View>
                ) : documentErrorByBorrower[borrower.user.id] ? (
                  <View>
                    <Text style={styles.errorText}>{documentErrorByBorrower[borrower.user.id]}</Text>
                    <TouchableOpacity onPress={() => void loadDocuments(borrower.user.id)}>
                      <Text style={styles.docsToggleText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : (documentsByBorrower[borrower.user.id] ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>No documents uploaded.</Text>
                ) : (
                  (documentsByBorrower[borrower.user.id] ?? []).map((doc) => (
                    <View key={doc.id} style={styles.docRow}>
                      <View style={styles.docInfo}>
                        <Text style={styles.docName}>{doc.fileName}</Text>
                        <Text style={styles.docMeta}>
                          {(DOC_LABELS as Record<string, string>)[doc.type] ?? doc.type}
                        </Text>
                        <Text style={styles.docMeta}>Uploaded: {doc.uploadedAt.slice(0, 10)}</Text>
                      </View>
                      <View style={styles.docActions}>
                        {doc.fileUrl ? (
                          <TouchableOpacity style={styles.viewBtn} onPress={() => handlePreviewDoc(doc)}>
                            <Eye size={13} color={colors.primary} strokeWidth={2.4} />
                            <Text style={styles.viewBtnText}>View</Text>
                          </TouchableOpacity>
                        ) : null}
                        {doc.status === 'verified' ? (
                          <View style={styles.verifiedWrap}>
                            <View style={styles.verifiedBadge}>
                              <FileCheck2 size={12} color="#166534" strokeWidth={2.4} />
                              <Text style={styles.verifiedText}>VERIFIED</Text>
                            </View>
                            {doc.verifiedByName ? <Text style={styles.docMeta}>By: {doc.verifiedByName}</Text> : null}
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.verifyBtn, verifyingDocId === doc.id && styles.verifyBtnDisabled]}
                            onPress={() => void handleVerifyDoc(doc)}
                            disabled={verifyingDocId === doc.id}
                          >
                            <FileCheck2 size={13} color="#FFFFFF" strokeWidth={2.4} />
                            <Text style={styles.verifyBtnText}>{verifyingDocId === doc.id ? '...' : 'Verify'}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {/* Toggle account */}
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                borrower.user.active ? styles.deactivateBtn : styles.activateBtn,
                togglingBorrowerId === borrower.user.id && styles.btnDisabled,
              ]}
              onPress={() => void handleToggle(borrower)}
              disabled={togglingBorrowerId === borrower.user.id}
            >
              {togglingBorrowerId === borrower.user.id
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.toggleBtnText}>{borrower.user.active ? 'Deactivate Account' : 'Activate Account'}</Text>}
            </TouchableOpacity>
          </Card>
        ))}
      </View>
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
  content: {},
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
  emptyText: { color: colors.textLight, fontSize: 14 },
  listWrap: { padding: spacing.md, gap: spacing.sm },

  borrowerCard: { gap: spacing.sm },
  borrowerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  borrowerInfo: { flex: 1 },
  borrowerName: { fontSize: 16, fontWeight: '800', color: colors.text },
  borrowerEmail: { fontSize: 12, color: colors.textLight, marginTop: 1 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  activeBadge: { backgroundColor: '#DCFCE7' },
  inactiveBadge: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 10, fontWeight: '800' },
  activeText: { color: '#166534' },
  inactiveText: { color: '#B91C1C' },

  metricsRow: { flexDirection: 'row', gap: spacing.xs },
  metricBox: {
    flex: 1, backgroundColor: colors.primarySoft, borderRadius: radii.sm,
    padding: spacing.xs + 2, alignItems: 'center',
  },
  metricValue: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  metricLabel: { fontSize: 10, color: colors.textLight, marginTop: 2 },

  verificationRow: { flexDirection: 'row' },
  verificationBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  qualifiedBadge: { backgroundColor: '#DCFCE7' },
  notQualifiedBadge: { backgroundColor: '#FEE2E2' },
  notStartedBadge: { backgroundColor: '#F1F5F9' },
  verificationText: { fontSize: 11, fontWeight: '700' },
  qualifiedText: { color: '#166534' },
  notQualifiedText: { color: '#B91C1C' },
  notStartedText: { color: '#64748B' },

  docsToggle: { paddingVertical: spacing.xs },
  docsToggleText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  docsSection: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.sm, gap: spacing.sm,
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineText: { color: colors.textLight, fontSize: 12 },

  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  docInfo: { flex: 1 },
  docName: { fontSize: 13, fontWeight: '700', color: colors.text },
  docMeta: { fontSize: 11, color: colors.textLight, marginTop: 1 },
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
  viewBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  verifiedWrap: { alignItems: 'flex-end', gap: 2 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
  },
  verifiedText: { color: '#166534', fontSize: 10, fontWeight: '800' },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 6,
  },
  verifyBtnDisabled: { opacity: 0.6 },
  verifyBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  toggleBtn: {
    borderRadius: radii.md, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center', minHeight: 42,
  },
  activateBtn: { backgroundColor: colors.success },
  deactivateBtn: { backgroundColor: colors.danger },
  btnDisabled: { opacity: 0.6 },
  toggleBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
