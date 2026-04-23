import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { ArrowLeft, CheckCircle2, Clock3, FileX, ShieldAlert, Upload } from 'lucide-react-native';
import { fetchBorrowerDocuments } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import { BorrowerDocument } from '../../types';
import {
  DocType,
  DocTypes,
  DOC_DESCRIPTIONS,
  DOC_EMOJI,
  DOC_LABELS,
  LOAN_REQUIRED_DOCS,
} from '../../constants/docTypes';
import { colors, radii, spacing } from '../../constants/theme';

type DocStatus = 'missing' | 'pending' | 'verified' | 'rejected';

type DocRow = {
  key: DocType;
  label: string;
  description: string;
  emoji: string;
  status: DocStatus;
  rejectionReason?: string;
  uploadedAt?: string;
};

const STATUS_CONFIG: Record<
  DocStatus,
  { label: string; color: string; bg: string; icon: React.ComponentType<any> }
> = {
  missing: {
    label: 'Missing',
    color: '#64748B',
    bg: '#F1F5F9',
    icon: ShieldAlert,
  },
  pending: {
    label: 'Pending Review',
    color: '#92400E',
    bg: '#FEF3C7',
    icon: Clock3,
  },
  verified: {
    label: 'Verified',
    color: '#065F46',
    bg: '#D1FAE5',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    color: '#991B1B',
    bg: '#FEE2E2',
    icon: FileX,
  },
};

const getLoanCategory = (name: string): 'student' | 'business' | 'general' => {
  const n = name.toLowerCase();
  if (n.includes('student') || n.includes('education') || n.includes('school')) return 'student';
  if (n.includes('business') || n.includes('entrepreneur') || n.includes('micro') || n.includes('sme'))
    return 'business';
  return 'general';
};

const getDocStatus = (doc: BorrowerDocument | undefined): DocStatus => {
  if (!doc) return 'missing';
  if (doc.status === 'verified') return 'verified';
  return 'pending';
};

export const DocumentCenterScreen = ({ navigation, route }: any) => {
  const { user } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState<BorrowerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine which docs are required based on active loan type hint or default to general
  const loanTypeName = (route?.params?.loanTypeName as string | undefined) ?? '';
  const category = loanTypeName ? getLoanCategory(loanTypeName) : 'general';
  const requiredKeys: DocType[] = [
    ...LOAN_REQUIRED_DOCS[category],
    // Always show all uploaded docs even if not in required list
  ];

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      fetchBorrowerDocuments()
        .then((docs) => {
          if (!active) return;
          setDocuments(docs);
          setError(null);
        })
        .catch((e) => {
          if (!active) return;
          setError(e instanceof Error ? e.message : 'Unable to load documents.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [])
  );

  // Build all doc keys to show: required + any extra uploaded types
  const uploadedTypes = documents.map((d) => d.type as DocType);
  const allKeys = Array.from(new Set([...requiredKeys, ...uploadedTypes]));

  const docRows: DocRow[] = allKeys.map((key) => {
    const uploaded = documents.find((d) => d.type === key);
    return {
      key,
      label: DOC_LABELS[key] ?? key,
      description: DOC_DESCRIPTIONS[key] ?? '',
      emoji: DOC_EMOJI[key] ?? '📄',
      status: getDocStatus(uploaded),
      uploadedAt: uploaded?.uploadedAt,
    };
  });

  const verifiedCount = docRows.filter((r) => r.status === 'verified').length;
  const pendingCount = docRows.filter((r) => r.status === 'pending').length;
  const missingCount = docRows.filter((r) => r.status === 'missing').length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1E3A8A', '#2F56D4', '#4169E1']}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <ArrowLeft size={18} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Document Center</Text>
        <Text style={styles.headerSub}>
          Track the status of every document required for your loan application.
        </Text>

        {/* Summary pills */}
        {!loading ? (
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: 'rgba(16,185,129,0.22)' }]}>
              <CheckCircle2 size={12} color="#6EE7B7" strokeWidth={2.5} />
              <Text style={styles.pillText}>{verifiedCount} Verified</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: 'rgba(245,158,11,0.22)' }]}>
              <Clock3 size={12} color="#FCD34D" strokeWidth={2.5} />
              <Text style={styles.pillText}>{pendingCount} Pending</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: 'rgba(148,163,184,0.22)' }]}>
              <ShieldAlert size={12} color="#CBD5E1" strokeWidth={2.5} />
              <Text style={styles.pillText}>{missingCount} Missing</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>Loading your documents…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : docRows.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.emptyEmoji}>📂</Text>
            <Text style={styles.emptyTitle}>No Documents Yet</Text>
            <Text style={styles.stateText}>
              Upload your required documents from the loan application screen.
            </Text>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => navigation.navigate('LoanPrograms')}
              activeOpacity={0.88}
            >
              <Upload size={16} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.uploadBtnText}>Go to Loan Programs</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>
              {loanTypeName ? `Required for ${loanTypeName}` : 'Your Documents'}
            </Text>

            {docRows.map((row) => {
              const cfg = STATUS_CONFIG[row.status];
              const StatusIcon = cfg.icon;
              const isRequired = requiredKeys.includes(row.key);

              return (
                <View key={row.key} style={styles.docCard}>
                  <View style={styles.docCardTop}>
                    <Text style={styles.docEmoji}>{row.emoji}</Text>
                    <View style={styles.docInfo}>
                      <View style={styles.docTitleRow}>
                        <Text style={styles.docLabel}>{row.label}</Text>
                        {isRequired ? (
                          <View style={styles.requiredBadge}>
                            <Text style={styles.requiredBadgeText}>Required</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.docDesc}>{row.description}</Text>
                      {row.uploadedAt ? (
                        <Text style={styles.docDate}>Uploaded: {row.uploadedAt}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Status badge */}
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <StatusIcon size={13} color={cfg.color} strokeWidth={2.5} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>

                  {/* Rejection reason */}
                  {row.status === 'rejected' && row.rejectionReason ? (
                    <View style={styles.rejectionBox}>
                      <Text style={styles.rejectionTitle}>Reason for rejection:</Text>
                      <Text style={styles.rejectionText}>{row.rejectionReason}</Text>
                    </View>
                  ) : null}

                  {/* Missing action */}
                  {row.status === 'missing' ? (
                    <TouchableOpacity
                      style={styles.missingAction}
                      onPress={() => navigation.navigate('LoanPrograms')}
                      activeOpacity={0.88}
                    >
                      <Upload size={14} color={colors.primary} strokeWidth={2.4} />
                      <Text style={styles.missingActionText}>Upload this document</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            {/* Info note */}
            <View style={styles.infoNote}>
              <Text style={styles.infoNoteText}>
                📌 Documents must be verified by a loan officer before your application can be
                processed. Verification typically takes 1–2 business days.
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  body: { padding: spacing.md },
  centerState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  stateText: { color: colors.textLight, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  uploadBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  docCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2EAF4',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    gap: spacing.sm,
  },
  docCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  docEmoji: { fontSize: 26, lineHeight: 32 },
  docInfo: { flex: 1 },
  docTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', marginBottom: 3 },
  docLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  requiredBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  requiredBadgeText: { color: '#1D4ED8', fontSize: 10, fontWeight: '700' },
  docDesc: { fontSize: 12, color: colors.textLight, lineHeight: 17 },
  docDate: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  rejectionBox: {
    backgroundColor: '#FFF1F2',
    borderRadius: radii.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  rejectionTitle: { fontSize: 12, fontWeight: '700', color: '#991B1B', marginBottom: 3 },
  rejectionText: { fontSize: 12, color: '#7F1D1D', lineHeight: 17 },
  missingAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  missingActionText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  infoNote: {
    backgroundColor: '#FFF7ED',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: spacing.xs,
  },
  infoNoteText: { color: '#92400E', fontSize: 12, lineHeight: 18 },
});
