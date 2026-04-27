import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ArrowLeft } from 'lucide-react-native';
import { applyForLoan, fetchLoanTypes } from '../api/loans';
import { ApiError } from '../api/client';
import { updateCurrentUser } from '../api/profile';
import { useAuth } from '../context/AuthContext';
import {
  DisbursementMethod,
  LoanApplicationPurpose,
  LoanType,
} from '../../types';
import {
  LOAN_AMOUNT_CAPS,
} from '../../constants/docTypes';
import { spacing } from '../../constants/theme';

const palette = {
  background: '#F7F9FF',
  card: '#FFFFFF',
  primary: '#4169E1',
  primarySoft: '#E9EEFF',
  border: '#DCE6FF',
  text: '#0C1A2E',
  textMuted: '#4B6A8A',
  error: '#EF4444',
  warning: '#F59E0B',
  warningBg: '#FFFBEB',
  warningBorder: '#FCD34D',
  successBg: '#F0FDF4',
  successBorder: '#86EFAC',
  success: '#16A34A',
};

const DOC_CONFIG: Record<string, { label: string; description: string; emoji: string }> = {
  government_id: {
    label: 'Government-Issued ID',
    description: 'Passport, Driver\'s License, SSS, PhilHealth, UMID, or Postal ID — must show your photo and full name',
    emoji: '🪪',
  },
  student_id: {
    label: 'School / Student ID',
    description: 'Current school year student ID with your name and photo — expired IDs will be rejected',
    emoji: '🎓',
  },
  business_permit: {
    label: 'Business Permit',
    description: 'DTI / SEC registration or Mayor\'s Permit — must be valid, current, and show your business name',
    emoji: '📋',
  },
  business_owner_id: {
    label: 'Business Owner Government ID',
    description: 'Valid government ID of the registered business owner — must match the name on the business permit',
    emoji: '🪪',
  },
  proof_of_revenue: {
    label: 'Proof of Monthly Revenue',
    description: 'Bank statement, sales report, or audited financial statement (last 3 months)',
    emoji: '📊',
  },
  income_proof: {
    label: 'Proof of Income',
    description: 'Payslip, COE, or ITR showing your monthly income',
    emoji: '💰',
  },
  id: {
    label: 'Valid ID',
    description: 'Any government-issued photo ID',
    emoji: '🪪',
  },
};

void DOC_CONFIG;

const getLoanCategory = (name: string): 'student' | 'business' | 'general' => {
  const n = name.toLowerCase();
  if (n.includes('student') || n.includes('education') || n.includes('school')) return 'student';
  if (n.includes('business') || n.includes('entrepreneur') || n.includes('micro') || n.includes('sme')) return 'business';
  return 'general';
};

const formatCurrency = (value: number) =>
  `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const DocumentsScreen = ({ navigation, route }: any) => {
  const { user, applyAuthenticatedUserUpdate } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const contentPaddingBottom = spacing.xl + tabBarHeight + spacing.md;
  const requestedLoanTypeId = route?.params?.selectedLoanTypeId as string | undefined;
  const requestedAmount = route?.params?.requestedAmount as number | undefined;
  const requestedTermMonths = route?.params?.requestedTermMonths as number | undefined;
  const acceptedTermsAt = route?.params?.acceptedTermsAt as number | undefined;
  const returnTo = (route?.params?.returnTo as string | undefined) ?? 'LoanPrograms';
  const preloadedLoanTypes = useMemo<LoanType[]>(
    () => route?.params?.loanPrograms ?? [],
    [route?.params?.loanPrograms]
  );

  const [loanTypes, setLoanTypes] = useState<LoanType[]>(
    preloadedLoanTypes.filter((loanType) => loanType.active)
  );
  const [loanTypesLoading, setLoanTypesLoading] = useState(preloadedLoanTypes.length === 0);
  const [loanTypesError, setLoanTypesError] = useState<string | null>(null);
  const [loanPurpose, setLoanPurpose] = useState<LoanApplicationPurpose>('purchase');
  const [firstName, setFirstName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phoneNumber ?? '');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState(0);
  const [accountName, setAccountName] = useState(user?.gcashAccountName ?? user?.name ?? '');
  const [accountNumber, setAccountNumber] = useState(user?.gcashAccountNumber ?? '');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [selectedLoanTypeId, setSelectedLoanTypeId] = useState(
    requestedLoanTypeId ?? preloadedLoanTypes[0]?.id ?? ''
  );
  const disbursementMethod: DisbursementMethod = 'gcash';
  const hasSavedGcashProfile = Boolean(user?.gcashAccountName?.trim() && user?.gcashAccountNumber?.trim());

  useEffect(() => {
    setFirstName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPhone(user?.phoneNumber ?? '');
    setAccountName(user?.gcashAccountName ?? user?.name ?? '');
    setAccountNumber(user?.gcashAccountNumber ?? '');
  }, [user?.email, user?.gcashAccountName, user?.gcashAccountNumber, user?.name, user?.phoneNumber]);

  useEffect(() => {
    if (!acceptedTermsAt) {
      return;
    }

    setAccepted(true);
    navigation.setParams({ acceptedTermsAt: undefined });
  }, [acceptedTermsAt, navigation]);

  const loadLoanTypes = useCallback(async () => {
    if (loanTypes.length === 0) {
      setLoanTypesLoading(true);
    }

    try {
      const payload = await fetchLoanTypes();
      setLoanTypes(payload.filter((loanType) => loanType.active));
      setLoanTypesError(null);
    } catch (loadError) {
      if (loanTypes.length === 0) {
        setLoanTypes(preloadedLoanTypes.filter((loanType) => loanType.active));
        setLoanTypesError(
          loadError instanceof Error ? loadError.message : 'Unable to load loan programs.'
        );
      }
    } finally {
      setLoanTypesLoading(false);
    }
  }, [loanTypes.length, preloadedLoanTypes]);

  useFocusEffect(
    useCallback(() => {
      void loadLoanTypes();
    }, [loadLoanTypes])
  );

  const activeLoanTypes = useMemo(
    () => loanTypes.filter((loanType) => loanType.active),
    [loanTypes]
  );

  const selectedLoanType = useMemo(
    () =>
      activeLoanTypes.find((loanType) => loanType.id === selectedLoanTypeId) ?? activeLoanTypes[0],
    [activeLoanTypes, selectedLoanTypeId]
  );

  useEffect(() => {
    if (activeLoanTypes.length === 0) {
      setSelectedLoanTypeId('');
      setTermMonths(0);
      return;
    }

    const requestedLoanType = requestedLoanTypeId
      ? activeLoanTypes.find((loanType) => loanType.id === String(requestedLoanTypeId))
      : undefined;
    const currentLoanType = activeLoanTypes.find((loanType) => loanType.id === selectedLoanTypeId);
    const nextLoanType = requestedLoanType ?? currentLoanType ?? activeLoanTypes[0];

    if (nextLoanType.id !== selectedLoanTypeId) {
      setSelectedLoanTypeId(nextLoanType.id);
    }
  }, [activeLoanTypes, requestedLoanTypeId, selectedLoanTypeId]);

  useEffect(() => {
    if (!selectedLoanType) {
      setTermMonths(0);
      return;
    }

    setAmount((currentAmount) => {
      if (requestedAmount !== undefined) {
        return String(requestedAmount);
      }

      const parsedAmount = Number(currentAmount.replace(/,/g, ''));
      if (
        Number.isFinite(parsedAmount) &&
        parsedAmount >= selectedLoanType.minAmount &&
        parsedAmount <= selectedLoanType.maxAmount
      ) {
        return currentAmount;
      }

      return String(selectedLoanType.minAmount);
    });

    setTermMonths((currentTermMonths) => {
      if (
        requestedTermMonths !== undefined &&
        selectedLoanType.termsInMonths.includes(requestedTermMonths)
      ) {
        return requestedTermMonths;
      }

      if (selectedLoanType.termsInMonths.includes(currentTermMonths)) {
        return currentTermMonths;
      }

      return selectedLoanType.termsInMonths[0] ?? 0;
    });
  }, [requestedAmount, requestedTermMonths, selectedLoanType]);

  const loanCategory = useMemo(
    () => (selectedLoanType ? getLoanCategory(selectedLoanType.name) : 'general'),
    [selectedLoanType]
  );

  const numericAmount = Number(amount.replace(/,/g, ''));

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    const normalizedGcashNumber = accountNumber.replace(/\D/g, '');
    if (!selectedLoanType) next.loanType = 'Select a loan program first.';
    if (!firstName.trim()) next.firstName = 'Full name is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter a valid email.';
    if (!phone.trim() || phone.trim().length < 7) next.phone = 'Enter a valid phone number.';
    if (!accountName.trim()) next.accountName = 'GCash account name is required for fund release.';
    if (!normalizedGcashNumber) next.accountNumber = 'GCash number is required for fund release.';
    else if (normalizedGcashNumber.length !== 11 || !normalizedGcashNumber.startsWith('0')) {
      next.accountNumber = 'Enter a valid 11-digit GCash number.';
    }
    if (!Number.isFinite(numericAmount)) {
      next.amount = 'Enter a valid loan amount.';
    } else if (selectedLoanType && (numericAmount < selectedLoanType.minAmount || numericAmount > selectedLoanType.maxAmount)) {
      next.amount = `Amount must be between ${formatCurrency(selectedLoanType.minAmount)} and ${formatCurrency(selectedLoanType.maxAmount)}.`;
    }
    if (selectedLoanType && !termMonths) next.termMonths = 'Select a repayment term.';
    if (!accepted) next.accepted = 'Please accept the terms and conditions.';
    return next;
  }, [accepted, accountName, accountNumber, email, firstName, numericAmount, phone, selectedLoanType, termMonths]);

  const hasErrors = Object.values(errors).some(Boolean);
  const isVerificationQualified = user?.verificationStatus === 'qualified';
  const verificationPrompt =
    'Complete the strict eligibility check first. Your identity and supporting documents are now handled inside the Eligibility Check section before you can submit a loan application.';

  const resetForm = () => {
    setLoanPurpose('purchase');
    setAccountName(user?.gcashAccountName ?? user?.name ?? '');
    setAccountNumber(user?.gcashAccountNumber ?? '');
    setAccepted(false);
    setShowErrors(false);
  };

  const handleSubmit = async () => {
    setShowErrors(true);

    if (!selectedLoanType || !user) {
      Alert.alert('Missing information', 'Please complete all required fields.');
      return;
    }

    if (!isVerificationQualified) {
      navigation.navigate('Settings', { focusSection: 'verification' });
      return;
    }

    if (hasErrors) {
      Alert.alert('Missing information', 'Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      let payoutAccountName = accountName.trim();
      let payoutAccountNumber = accountNumber.trim();

      if (
        payoutAccountName !== (user.gcashAccountName ?? '').trim() ||
        payoutAccountNumber !== (user.gcashAccountNumber ?? '').trim()
      ) {
        const updatedUser = await updateCurrentUser({
          gcashAccountName: payoutAccountName,
          gcashAccountNumber: payoutAccountNumber,
        });
        applyAuthenticatedUserUpdate(updatedUser);
        payoutAccountName = updatedUser.gcashAccountName?.trim() || payoutAccountName;
        payoutAccountNumber = updatedUser.gcashAccountNumber?.trim() || payoutAccountNumber;
      }

      // Upload each required document — must complete before loan creation
      // so the backend document check passes
      await applyForLoan(
        selectedLoanType.id,
        numericAmount,
        termMonths,
        {
          applicantName: firstName.trim(),
          applicationPurpose: loanPurpose,
          contactEmail: email.trim(),
          contactPhoneNumber: phone.trim(),
        },
        {
          method: disbursementMethod,
          accountName: payoutAccountName,
          accountNumber: payoutAccountNumber,
        }
      );

      resetForm();
      Alert.alert(
        'Application Submitted',
        `Your ${selectedLoanType.name} application has been submitted.`,
        [{ text: 'Track Stage', onPress: () => navigation.navigate('Stage') }]
      );
    } catch (submitError) {
      const message =
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
          ? submitError.message
          : 'Unable to submit your application right now.';
      Alert.alert('Submission failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => navigation.navigate(returnTo)}
          activeOpacity={0.85}
        >
          <ArrowLeft size={16} color={palette.text} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{selectedLoanType?.name ?? 'Loan Application'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.headerSubtitle}>
        Let us get started. First tell us about your selected loan program needs.
      </Text>

      {loanTypesLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.loadingText}>Loading loan program...</Text>
        </View>
      ) : null}

      {loanTypesError ? <Text style={styles.errorText}>{loanTypesError}</Text> : null}
      {showErrors && errors.loanType ? <ErrorText text={errors.loanType} /> : null}

      <Text style={styles.sectionLabel}>Loan program (Required)</Text>
      {activeLoanTypes.length > 0 ? (
        <View style={styles.chipRow}>
          {activeLoanTypes.map((loanType) => (
            <OptionChip
              key={loanType.id}
              label={loanType.name}
              active={selectedLoanType?.id === loanType.id}
              onPress={() => {
                setSelectedLoanTypeId(loanType.id);
                setTermMonths(loanType.termsInMonths[0] ?? 0);
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.inlineInfoCard}>
          <Text style={styles.inlineInfoTitle}>No loan programs available</Text>
          <Text style={styles.inlineInfoText}>
            Ask the admin to activate at least one loan program before continuing.
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>What would you like to do? (Required)</Text>
      <View style={styles.chipRow}>
        <OptionChip
          label="Purchase a property"
          active={loanPurpose === 'purchase'}
          onPress={() => setLoanPurpose('purchase')}
        />
        <OptionChip
          label="Refinance my home loan"
          active={loanPurpose === 'refinance'}
          onPress={() => setLoanPurpose('refinance')}
        />
        <OptionChip label="Both" active={loanPurpose === 'both'} onPress={() => setLoanPurpose('both')} />
      </View>

      <InputField label="Full name (Required)" value={firstName} onChangeText={setFirstName} />
      {showErrors && errors.firstName ? <ErrorText text={errors.firstName} /> : null}

      <InputField
        label="Email address (Required)"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {showErrors && errors.email ? <ErrorText text={errors.email} /> : null}

      <InputField
        label="Mobile Phone (Required)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {showErrors && errors.phone ? <ErrorText text={errors.phone} /> : null}

      <Text style={styles.sectionLabel}>Where should we send your loan? (Required)</Text>
      <View style={styles.methodCard}>
        <Text style={styles.methodTitle}>GCash</Text>
        <Text style={styles.methodDescription}>
          Automated release is currently available only to GCash mobile numbers.
        </Text>
      </View>

      <Text style={styles.programHint}>
        {hasSavedGcashProfile
          ? 'Your saved GCash payout profile is loaded below. Changes here are saved to your account for future applications.'
          : 'The first GCash profile you use here will be saved to your account and reused on future applications.'}
      </Text>

      <InputField
        label="Receiver name (Required)"
        value={accountName}
        onChangeText={setAccountName}
        placeholder="Account holder / borrower name"
      />
      {showErrors && errors.accountName ? <ErrorText text={errors.accountName} /> : null}

      <InputField
        label="GCash number (Required)"
        keyboardType="phone-pad"
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="09XXXXXXXXX"
      />
      {showErrors && errors.accountNumber ? <ErrorText text={errors.accountNumber} /> : null}

      {!isVerificationQualified ? (
        <View style={styles.verificationCallout}>
          <Text style={styles.verificationCalloutTitle}>Verification required before submit</Text>
          <Text style={styles.verificationCalloutText}>{verificationPrompt}</Text>
        </View>
      ) : null}


      {/* ── Amount input with dynamic cap ── */}
      {(() => {
        const cap = selectedLoanType?.maxAmount
          ?? LOAN_AMOUNT_CAPS[loanCategory];
        const isOverCap = Number.isFinite(numericAmount) && numericAmount > cap;
        const isUnderMin = Number.isFinite(numericAmount) && selectedLoanType && numericAmount < selectedLoanType.minAmount;
        const amountBorderColor = isOverCap || isUnderMin ? palette.error : palette.border;
        return (
          <View style={styles.inputGroup}>
            <View style={styles.amountLabelRow}>
              <Text style={styles.inputLabel}>Amount you want to loan</Text>
              <View style={[styles.capBadge, isOverCap ? styles.capBadgeError : undefined]}>
                <Text style={[styles.capBadgeText, isOverCap ? styles.capBadgeTextError : undefined]}>
                  Max: {formatCurrency(cap)}
                </Text>
              </View>
            </View>
            <TextInput
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder={
                selectedLoanType
                  ? `${selectedLoanType.minAmount.toLocaleString()} – ${cap.toLocaleString()}`
                  : 'Enter amount'
              }
              placeholderTextColor={palette.textMuted}
              style={[styles.input, { borderColor: amountBorderColor }]}
            />
            {isOverCap ? (
              <Text style={styles.capErrorText}>
                ⚠ Amount exceeds the {formatCurrency(cap)} limit for this loan type.
              </Text>
            ) : isUnderMin && selectedLoanType ? (
              <Text style={styles.capErrorText}>
                ⚠ Minimum amount is {formatCurrency(selectedLoanType.minAmount)}.
              </Text>
            ) : (
              <Text style={styles.programHint}>
                Range: {formatCurrency(selectedLoanType?.minAmount ?? 0)} – {formatCurrency(cap)}
              </Text>
            )}
          </View>
        );
      })()}
      {showErrors && errors.amount ? <ErrorText text={errors.amount} /> : null}

      <Text style={styles.sectionLabel}>Monthly program</Text>
      {selectedLoanType ? (
        <View style={styles.chipRow}>
          {selectedLoanType.termsInMonths.map((term) => (
            <OptionChip
              key={term}
              label={`${term} Months`}
              active={termMonths === term}
              onPress={() => setTermMonths(term)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.inlineInfoCard}>
          <Text style={styles.inlineInfoTitle}>Choose a loan program first</Text>
          <Text style={styles.inlineInfoText}>
            Repayment terms will appear here after you select an active loan program.
          </Text>
        </View>
      )}
      {showErrors && errors.termMonths ? <ErrorText text={errors.termMonths} /> : null}

      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setAccepted((prev) => !prev)}
        activeOpacity={0.85}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxActive]} />
        <Text style={styles.termsText}>I have read and accept the{' '}</Text>
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('Terms', {
              returnTo: 'Documents',
            })
          }
          activeOpacity={0.8}
        >
          <Text style={styles.termsLink}>Terms & Conditions</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      {showErrors && errors.accepted ? <ErrorText text={errors.accepted} /> : null}

      <TouchableOpacity
        style={[styles.submitButton, submitting ? styles.submitButtonDisabled : undefined]}
        onPress={() => void handleSubmit()}
        activeOpacity={0.9}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.submitText}>{isVerificationQualified ? 'Submit' : 'Continue to Eligibility Check'}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const OptionChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.9}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const InputField = ({ label, ...props }: { label: string; [key: string]: any }) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput {...props} placeholderTextColor={palette.textMuted} style={styles.input} />
  </View>
);

const ErrorText = ({ text }: { text: string }) => <Text style={styles.errorText}>{text}</Text>;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  headerSpacer: {
    width: 34,
  },
  headerSubtitle: {
    color: palette.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  loadingText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.text,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: palette.card,
  },
  chipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  chipText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: palette.primary,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    color: palette.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: palette.text,
  },
  methodCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  methodTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  methodDescription: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  inlineInfoCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  inlineInfoTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  inlineInfoText: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  verificationCallout: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  verificationCalloutTitle: {
    color: '#9A3412',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  verificationCalloutText: {
    color: '#7C2D12',
    fontSize: 12,
    lineHeight: 18,
  },
  fraudNotice: {
    backgroundColor: palette.successBg,
    borderWidth: 1,
    borderColor: palette.successBorder,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  fraudNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fraudNoticeTitle: {
    color: palette.success,
    fontSize: 13,
    fontWeight: '700',
  },
  fraudNoticeText: {
    color: '#166534',
    fontSize: 12,
    lineHeight: 18,
  },
  docCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  docCardError: {
    borderColor: palette.error,
  },
  docCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  docEmoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  docCardInfo: {
    flex: 1,
  },
  docCardLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  docCardDesc: {
    color: palette.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  docUploaded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.successBg,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  docUploadedText: {
    color: palette.success,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  docRetakeText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  docCaptureBtn: {
    backgroundColor: palette.primarySoft,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  docCaptureBtnText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  programHint: {
    marginTop: 2,
    marginBottom: spacing.md,
    color: palette.textMuted,
    fontSize: 11,
  },
  amountLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  capBadge: {
    backgroundColor: palette.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  capBadgeError: {
    backgroundColor: '#FEE2E2',
  },
  capBadgeText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  capBadgeTextError: {
    color: palette.error,
  },
  capErrorText: {
    color: palette.error,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: spacing.md,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.md,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  checkboxActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  termsText: {
    color: palette.text,
    fontSize: 12,
  },
  termsLink: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  submitButton: {
    backgroundColor: palette.primary,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.82,
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  errorText: {
    color: palette.error,
    fontSize: 12,
    marginBottom: spacing.md,
  },
});
