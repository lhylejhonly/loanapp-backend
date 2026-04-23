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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import {
  ArrowUpRight,
  Clock3,
  CreditCard,
  ReceiptText,
  Wallet,
} from 'lucide-react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Input } from '../components/Input';
import { fetchBorrowerLoans } from '../api/loans';
import { fetchBorrowerPayments } from '../api/payments';
import {
  fetchBorrowerPaymentSubmissions,
  submitBorrowerPaymentSubmission,
} from '../api/paymentSubmissions';
import { useAuth } from '../context/AuthContext';
import { useBorrowerStatus } from '../context/BorrowerStatusContext';
import { Loan, LoanStatus, Payment, PaymentMethod, PaymentSubmission } from '../../types';
import { colors, radii, spacing } from '../../constants/theme';

const STATUS_COLORS: Record<LoanStatus, string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

const formatCurrency = (value: number) =>
  `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatPaymentMethod = (value?: string) => {
  if (!value) {
    return 'Recorded payment';
  }

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const sortLoansByUpdatedAt = (a: Loan, b: Loan) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

const sortPaymentsByDate = (a: Payment, b: Payment) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

const sortPaymentSubmissionsByDate = (a: PaymentSubmission, b: PaymentSubmission) =>
  new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank' },
];

const PAYMENT_SUBMISSION_STATUS_META: Record<
  PaymentSubmission['status'],
  { label: string; background: string; text: string }
> = {
  pending: { label: 'Pending Review', background: '#FEF3C7', text: '#92400E' },
  approved: { label: 'Approved', background: '#DCFCE7', text: '#166534' },
  rejected: { label: 'Rejected', background: '#FEE2E2', text: '#B91C1C' },
};

type SelectedProof = { uri: string; name: string; mimeType?: string | null; file?: Blob };
type UploadSource = 'camera' | 'library' | 'files';

const DOCUMENT_PICKER_TYPES = ['image/*', 'application/pdf'];

const inferPhotoExtension = (mimeType: string) => {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
};

const inferMimeTypeFromName = (fileName?: string | null) => {
  const normalizedFileName = fileName?.trim().toLowerCase() ?? '';
  if (normalizedFileName.endsWith('.pdf')) return 'application/pdf';
  if (normalizedFileName.endsWith('.png')) return 'image/png';
  if (normalizedFileName.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

const buildDocumentPickerUpload = (
  asset: DocumentPicker.DocumentPickerAsset,
  fallbackPrefix: string
): SelectedProof => {
  const fileName = asset.name?.trim() || `${fallbackPrefix}-${Date.now()}`;
  const mimeType = asset.mimeType?.trim() || asset.file?.type || inferMimeTypeFromName(fileName);
  return {
    uri: asset.uri,
    name: fileName,
    mimeType,
    file: 'file' in asset ? asset.file ?? undefined : undefined,
  };
};

const buildImagePickerUpload = (
  asset: ImagePicker.ImagePickerAsset & { file?: Blob },
  fallbackPrefix: string
): SelectedProof => {
  const mimeType = asset.mimeType?.trim() || inferMimeTypeFromName(asset.fileName);
  const fileName =
    asset.fileName?.trim() || `${fallbackPrefix}-${Date.now()}.${inferPhotoExtension(mimeType)}`;
  return {
    uri: asset.uri,
    name: fileName,
    mimeType,
    file: asset.file,
  };
};

const chooseUploadSource = () =>
  new Promise<UploadSource | null>((resolve) => {
    let settled = false;
    const finish = (value: UploadSource | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    Alert.alert(
      'Attach Payment Proof',
      'Choose how you want to add the proof file.',
      [
        { text: 'Take Photo', onPress: () => finish('camera') },
        { text: 'Choose Photo', onPress: () => finish('library') },
        { text: 'Browse Files', onPress: () => finish('files') },
        { text: 'Cancel', style: 'cancel', onPress: () => finish(null) },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(null),
      }
    );
  });

export const BorrowerHistoryScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const { isOffline } = useBorrowerStatus();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const shellMaxWidth = 470;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSubmissions, setPaymentSubmissions] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [paymentAmountByLoan, setPaymentAmountByLoan] = useState<Record<string, string>>({});
  const [paymentMethodByLoan, setPaymentMethodByLoan] = useState<Record<string, PaymentMethod>>({});
  const [paymentReferenceByLoan, setPaymentReferenceByLoan] = useState<Record<string, string>>({});
  const [noteByLoan, setNoteByLoan] = useState<Record<string, string>>({});
  const [proofByLoan, setProofByLoan] = useState<Record<string, SelectedProof | undefined>>({});
  const [submittingLoanId, setSubmittingLoanId] = useState<string | null>(null);
  const [previewSubmission, setPreviewSubmission] = useState<PaymentSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionErrorByLoan, setSubmissionErrorByLoan] = useState<Record<string, string>>({});

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [loanPayload, paymentPayload, submissionPayload] = await Promise.all([
        fetchBorrowerLoans(),
        fetchBorrowerPayments(),
        fetchBorrowerPaymentSubmissions(),
      ]);
      setLoans([...loanPayload].sort(sortLoansByUpdatedAt));
      setPayments([...paymentPayload].sort(sortPaymentsByDate));
      setPaymentSubmissions([...submissionPayload].sort(sortPaymentSubmissionsByDate));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load your history right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLoans([]);
        setPayments([]);
        setPaymentSubmissions([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      void loadData();
    }, [loadData, user])
  );

  const totalPaid = useMemo(
    () => payments.reduce((sum, payment) => sum + payment.amount, 0),
    [payments]
  );

  const loanLookup = useMemo(
    () => new Map(loans.map((loan) => [loan.id, loan])),
    [loans]
  );
  const eligibleLoans = useMemo(
    () =>
      loans.filter(
        (loan) => loan.status === 'approved' && loan.disbursementStatus === 'disbursed' && loan.balance > 0
      ),
    [loans]
  );
  const submissionsByLoan = useMemo(
    () =>
      paymentSubmissions.reduce<Record<string, PaymentSubmission[]>>((acc, submission) => {
        if (!acc[submission.loanId]) acc[submission.loanId] = [];
        acc[submission.loanId].push(submission);
        return acc;
      }, {}),
    [paymentSubmissions]
  );
  const historyStats = useMemo(
    () => [
      { label: 'Loans', value: String(loans.length), icon: Wallet },
      { label: 'Payments', value: String(payments.length), icon: ReceiptText },
      { label: 'Total Paid', value: formatCurrency(totalPaid), icon: CreditCard },
    ],
    [loans.length, payments.length, totalPaid]
  );

  const pickProofUpload = useCallback(async (loanId: string) => {
    try {
      const source = await chooseUploadSource();
      if (!source) return;

      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Camera denied', 'Allow camera access to capture payment proof.');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.8,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
        if (result.canceled || !result.assets[0]) return;

        setProofByLoan((current) => ({
          ...current,
          [loanId]: buildImagePickerUpload(result.assets[0] as ImagePicker.ImagePickerAsset & { file?: Blob }, 'payment-proof'),
        }));
        return;
      }

      if (source === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Library denied', 'Allow photo library access to choose payment proof.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          quality: 0.8,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
        if (result.canceled || !result.assets[0]) return;

        setProofByLoan((current) => ({
          ...current,
          [loanId]: buildImagePickerUpload(result.assets[0] as ImagePicker.ImagePickerAsset & { file?: Blob }, 'payment-proof'),
        }));
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: DOCUMENT_PICKER_TYPES,
      });
      if (result.canceled || !result.assets[0]) return;

      setProofByLoan((current) => ({
        ...current,
        [loanId]: buildDocumentPickerUpload(result.assets[0], 'payment-proof'),
      }));
    } catch (uploadError) {
      Alert.alert('Failed', uploadError instanceof Error ? uploadError.message : 'Unable to prepare the selected proof.');
    }
  }, []);

  const onSubmitPaymentRequest = useCallback(
    async (loan: Loan) => {
      const amount = Number(paymentAmountByLoan[loan.id] ?? '');
      if (!Number.isFinite(amount) || amount <= 0) {
        Alert.alert('Invalid amount', 'Enter a valid payment amount.');
        return;
      }

      const paymentMethod = paymentMethodByLoan[loan.id] ?? 'cash';
      setSubmittingLoanId(loan.id);
      setSubmissionErrorByLoan((current) => ({ ...current, [loan.id]: '' }));
      try {
        const saved = await submitBorrowerPaymentSubmission({
          loanId: loan.id,
          amount,
          paymentMethod,
          paymentReference: paymentReferenceByLoan[loan.id],
          note: noteByLoan[loan.id],
          proof: proofByLoan[loan.id]
            ? {
                uri: proofByLoan[loan.id]!.uri,
                name: proofByLoan[loan.id]!.name,
                type: proofByLoan[loan.id]!.mimeType ?? undefined,
                file: proofByLoan[loan.id]!.file,
              }
            : undefined,
        });
        setPaymentSubmissions((current) => [saved, ...current].sort(sortPaymentSubmissionsByDate));
        setPaymentAmountByLoan((current) => ({ ...current, [loan.id]: '' }));
        setPaymentReferenceByLoan((current) => ({ ...current, [loan.id]: '' }));
        setNoteByLoan((current) => ({ ...current, [loan.id]: '' }));
        setProofByLoan((current) => ({ ...current, [loan.id]: undefined }));
        setSelectedLoanId(null);
        Alert.alert('Submitted', 'Your payment request was sent for officer review.');
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : 'Unable to submit payment request.';
        setSubmissionErrorByLoan((current) => ({ ...current, [loan.id]: message }));
        Alert.alert('Failed', message);
      } finally {
        setSubmittingLoanId(null);
      }
    },
    [noteByLoan, paymentAmountByLoan, paymentMethodByLoan, paymentReferenceByLoan, proofByLoan]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: tabBarHeight + spacing.xl,
        paddingHorizontal: spacing.md,
        width: '100%',
        maxWidth: shellMaxWidth,
        alignSelf: 'center',
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void loadData('refresh')} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['#1E3A8A', '#2F56D4', '#4169E1']}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroEyebrow}>Borrower Timeline</Text>
        <Text style={styles.heroTitle}>History</Text>
        <Text style={styles.heroSubtitle}>Review your applications, balances, and recorded payments in one place.</Text>

        <View style={styles.statsRow}>
          {historyStats.map((item, index) => {
            const StatIcon = item.icon;

            return (
              <View
                key={item.label}
                style={[
                  styles.statCard,
                  compact ? styles.statCardCompact : undefined,
                  compact && index === historyStats.length - 1 ? styles.statCardWide : undefined,
                ]}
              >
                <StatIcon size={18} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={[styles.statValue, compact ? styles.statValueCompact : undefined]}>{item.value}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            );
          })}
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Loan Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Stage')} activeOpacity={0.82}>
            <Text style={styles.sectionLink}>Open stage</Text>
          </TouchableOpacity>
        </View>

        {isOffline ? (
          <Card style={styles.networkCard}>
            <Text style={styles.networkTitle}>Offline mode</Text>
            <Text style={styles.networkText}>
              Borrower history stays visible, but submitting payment requests and refreshing balances
              needs the backend connection again.
            </Text>
          </Card>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <View style={styles.inlineState}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.inlineStateText}>Loading borrower history...</Text>
          </View>
        ) : loans.length === 0 ? (
          <Card>
            <Text style={styles.emptyTitle}>No loan records yet</Text>
            <Text style={styles.emptyText}>Your submitted applications will appear here once you start borrowing.</Text>
          </Card>
        ) : (
          loans.map((loan) => (
            <Card key={loan.id} style={styles.historyCard}>
              <View style={styles.historyTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{loan.loanTypeName}</Text>
                  <Text style={styles.historyMeta}>Created {loan.createdAt}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[loan.status] }]}>
                  <Text style={styles.statusText}>{loan.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount</Text>
                <Text style={styles.infoValue}>{formatCurrency(loan.amount)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Balance</Text>
                <Text style={styles.infoValue}>{formatCurrency(loan.balance)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Term</Text>
                <Text style={styles.infoValue}>{loan.termMonths} months</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Updated</Text>
                <Text style={styles.infoValue}>{loan.updatedAt}</Text>
              </View>

              <TouchableOpacity
                style={styles.inlineAction}
                onPress={() => navigation.navigate('Stage')}
                activeOpacity={0.84}
              >
                <Text style={styles.inlineActionText}>View stage</Text>
                <ArrowUpRight size={16} color={colors.primary} strokeWidth={2.3} />
              </TouchableOpacity>
            </Card>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Payment Requests</Text>
        </View>

        {loading ? null : eligibleLoans.length === 0 ? (
          <Card>
            <Text style={styles.emptyTitle}>No repayable loans yet</Text>
            <Text style={styles.emptyText}>
              Submit a payment request after your loan has been released and still has a remaining balance.
            </Text>
          </Card>
        ) : (
          eligibleLoans.map((loan) => (
            <Card key={`submission-${loan.id}`} style={styles.historyCard}>
              <View style={styles.historyTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{loan.loanTypeName}</Text>
                <Text style={styles.historyMeta}>Remaining balance {formatCurrency(loan.balance)}</Text>
              </View>
              <Text style={styles.paymentAmount}>{formatCurrency(loan.balance)}</Text>
            </View>

            <Text style={styles.requestHelperText}>
              Submit your payment details here first. The officer records the real repayment only after
              review.
            </Text>

            {selectedLoanId === loan.id ? (
              <View style={styles.requestForm}>
                  <Input
                    label="Payment amount"
                    value={paymentAmountByLoan[loan.id] ?? ''}
                    onChangeText={(value) => setPaymentAmountByLoan((current) => ({ ...current, [loan.id]: value }))}
                    keyboardType="numeric"
                    placeholder="Enter payment amount"
                    editable={submittingLoanId !== loan.id}
                  />
                  <Text style={styles.methodLabel}>Payment method</Text>
                  <View style={styles.methodRow}>
                    {PAYMENT_METHOD_OPTIONS.map((option) => {
                      const active = (paymentMethodByLoan[loan.id] ?? 'cash') === option.value;
                      return (
                        <TouchableOpacity
                          key={`${loan.id}-${option.value}`}
                          style={[styles.methodChip, active && styles.methodChipActive]}
                          onPress={() => setPaymentMethodByLoan((current) => ({ ...current, [loan.id]: option.value }))}
                          disabled={submittingLoanId === loan.id}
                        >
                          <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {(paymentMethodByLoan[loan.id] ?? 'cash') !== 'cash' ? (
                    <Input
                      label="Payment reference"
                      value={paymentReferenceByLoan[loan.id] ?? ''}
                      onChangeText={(value) =>
                        setPaymentReferenceByLoan((current) => ({ ...current, [loan.id]: value }))
                      }
                      placeholder="Transfer or wallet reference"
                      editable={submittingLoanId !== loan.id}
                    />
                  ) : null}
                  <Input
                    label="Note (optional)"
                    value={noteByLoan[loan.id] ?? ''}
                    onChangeText={(value) => setNoteByLoan((current) => ({ ...current, [loan.id]: value }))}
                    placeholder="Optional note for the officer"
                    editable={submittingLoanId !== loan.id}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.proofButton}
                    onPress={() => void pickProofUpload(loan.id)}
                    activeOpacity={0.86}
                    disabled={submittingLoanId === loan.id}
                  >
                    <Text style={styles.proofButtonText}>
                      {proofByLoan[loan.id] ? 'Change proof file' : 'Attach proof file'}
                    </Text>
                    <Text style={styles.proofButtonHint}>
                      {proofByLoan[loan.id]?.name ?? 'Optional image or PDF'}
                    </Text>
                  </TouchableOpacity>
                  {submissionErrorByLoan[loan.id] ? (
                    <Text style={styles.inlineErrorText}>{submissionErrorByLoan[loan.id]}</Text>
                  ) : null}
                  <Button
                    title={
                      submissionErrorByLoan[loan.id] ? 'Retry Payment Request' : 'Submit Payment Request'
                    }
                    onPress={() => void onSubmitPaymentRequest(loan)}
                    loading={submittingLoanId === loan.id}
                  />
                  <View style={styles.buttonGap} />
                  <Button
                    title="Cancel"
                    onPress={() => setSelectedLoanId(null)}
                    variant="secondary"
                    disabled={submittingLoanId === loan.id}
                  />
                </View>
              ) : (
                <Button title="Submit Payment Request" onPress={() => setSelectedLoanId(loan.id)} />
              )}

              <Text style={styles.subsectionTitle}>Request Status</Text>
              {(submissionsByLoan[loan.id] ?? []).length === 0 ? (
                <Text style={styles.emptyText}>No payment requests submitted for this loan yet.</Text>
              ) : (
                (submissionsByLoan[loan.id] ?? []).map((submission, index) => {
                  const statusMeta = PAYMENT_SUBMISSION_STATUS_META[submission.status];
                  return (
                    <View
                      key={submission.id}
                      style={[
                        styles.submissionRow,
                        index < (submissionsByLoan[loan.id] ?? []).length - 1 && styles.submissionRowBorder,
                      ]}
                    >
                      <View style={styles.submissionHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.submissionAmount}>{formatCurrency(submission.amount)}</Text>
                          <Text style={styles.historyMeta}>Submitted {submission.submittedAt}</Text>
                        </View>
                        <View style={[styles.submissionStatusBadge, { backgroundColor: statusMeta.background }]}>
                          <Text style={[styles.submissionStatusText, { color: statusMeta.text }]}>{statusMeta.label}</Text>
                        </View>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Method</Text>
                        <Text style={styles.infoValue}>{formatPaymentMethod(submission.paymentMethod)}</Text>
                      </View>
                      {submission.paymentReference ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Reference</Text>
                          <Text style={styles.infoValue}>{submission.paymentReference}</Text>
                        </View>
                      ) : null}
                      {submission.proofFileName ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Proof</Text>
                          <TouchableOpacity onPress={() => setPreviewSubmission(submission)} activeOpacity={0.82}>
                            <Text style={styles.linkText}>{submission.proofFileName}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {submission.rejectionReason ? (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteLabel}>Officer note</Text>
                          <Text style={styles.noteText}>{submission.rejectionReason}</Text>
                        </View>
                      ) : null}
                      {submission.reviewedAt || submission.reviewedByOfficerName ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Reviewed</Text>
                          <Text style={styles.infoValue}>
                            {submission.reviewedByOfficerName
                              ? `${submission.reviewedByOfficerName}${submission.reviewedAt ? ` on ${submission.reviewedAt}` : ''}`
                              : submission.reviewedAt}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </Card>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Payment History</Text>
        </View>

        {loading ? null : payments.length === 0 ? (
          <Card>
            <Text style={styles.emptyTitle}>No payments recorded yet</Text>
            <Text style={styles.emptyText}>Once a repayment is posted, you will be able to review it here.</Text>
          </Card>
        ) : (
          payments.map((payment) => {
            const relatedLoan = loanLookup.get(payment.loanId);

            return (
              <Card key={payment.id} style={styles.historyCard}>
                <View style={styles.historyTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>{relatedLoan?.loanTypeName ?? 'Loan payment'}</Text>
                    <Text style={styles.historyMeta}>{payment.date}</Text>
                  </View>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Method</Text>
                  <Text style={styles.infoValue}>{formatPaymentMethod(payment.paymentMethod)}</Text>
                </View>
                {payment.paymentReference ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Reference</Text>
                    <Text style={styles.infoValue}>{payment.paymentReference}</Text>
                  </View>
                ) : null}
                {payment.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Note</Text>
                    <Text style={styles.noteText}>{payment.note}</Text>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </View>
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    padding: 20,
    overflow: 'hidden',
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statCardCompact: {
    minWidth: '47%',
  },
  statCardWide: {
    minWidth: '100%',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  statValueCompact: {
    fontSize: 14,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  content: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  inlineStateText: {
    color: colors.textLight,
    fontSize: 13,
  },
  networkCard: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  networkTitle: {
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '800',
  },
  networkText: {
    color: '#C2410C',
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  historyCard: {
    gap: spacing.sm,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  historyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  historyMeta: {
    color: colors.textLight,
    fontSize: 12,
    marginTop: 3,
  },
  statusBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoLabel: {
    color: colors.textLight,
    fontSize: 13,
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  inlineAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inlineActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  requestForm: {
    marginTop: spacing.sm,
  },
  requestHelperText: {
    color: colors.textLight,
    fontSize: 12,
    lineHeight: 18,
  },
  methodLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  methodChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
  },
  methodChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodChipText: {
    color: colors.textLight,
    fontSize: 12,
    fontWeight: '700',
  },
  methodChipTextActive: {
    color: colors.primaryDark,
  },
  proofButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: '#F8FCFF',
  },
  proofButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  proofButtonHint: {
    color: colors.textLight,
    fontSize: 12,
    marginTop: 4,
  },
  inlineErrorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  buttonGap: {
    height: spacing.sm,
  },
  subsectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  submissionRow: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  submissionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  submissionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  submissionAmount: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  submissionStatusBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  submissionStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  paymentAmount: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '900',
  },
  noteBox: {
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  noteLabel: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  noteText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textLight,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
});
