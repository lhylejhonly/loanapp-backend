import React, { useCallback, useState } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  createAdminLoanType,
  fetchAdminLoanTypes,
  updateAdminLoanType,
} from '../api/loans';
import { ApiError } from '../api/client';
import { DocumentType, LoanType } from '../../types';
import { colors, spacing } from '../../constants/theme';

const formatCurrency = (value: number) =>
  `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const DOCUMENT_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'id', label: 'Valid ID' },
  { value: 'income_proof', label: 'Proof of Income' },
  { value: 'government_id', label: 'Government ID' },
  { value: 'student_id', label: 'Student ID' },
  { value: 'business_permit', label: 'Business Permit' },
  { value: 'business_owner_id', label: 'Business Owner ID' },
  { value: 'proof_of_revenue', label: 'Proof of Revenue' },
];

const formatRequiredDocuments = (documents: DocumentType[]) => {
  if (documents.length === 0) {
    return 'None';
  }

  const labels = documents
    .map((documentType) => DOCUMENT_OPTIONS.find((option) => option.value === documentType)?.label ?? documentType);

  return labels.join(', ');
};

const sameDocuments = (left: DocumentType[], right: DocumentType[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
};

export const AdminLoanTypesScreen = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const bottomClearance = tabBarHeight + spacing.lg;
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingDocumentsId, setSavingDocumentsId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [terms, setTerms] = useState('6,12,24');
  const [requiredDocuments, setRequiredDocuments] = useState<DocumentType[]>([]);
  const [documentDraftsByLoanTypeId, setDocumentDraftsByLoanTypeId] = useState<Record<string, DocumentType[]>>({});

  const loadLoanTypes = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const payload = await fetchAdminLoanTypes();
      setLoanTypes(payload);
      setDocumentDraftsByLoanTypeId({});
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load loan types.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLoanTypes();
    }, [loadLoanTypes])
  );

  const resetForm = () => {
    setName('');
    setMinAmount('');
    setMaxAmount('');
    setBaseRate('');
    setTerms('6,12,24');
    setRequiredDocuments([]);
  };

  const parseTerms = () =>
    Array.from(
      new Set(
        terms
          .split(',')
          .map((term) => Number(term.trim()))
          .filter((term) => Number.isInteger(term) && term > 0)
      )
    ).sort((left, right) => left - right);

  const toggleDocumentSelection = (
    currentDocuments: DocumentType[],
    documentType: DocumentType
  ): DocumentType[] =>
    currentDocuments.includes(documentType)
      ? currentDocuments.filter((item) => item !== documentType)
      : [...currentDocuments, documentType];

  const getDraftDocuments = (loanType: LoanType): DocumentType[] =>
    documentDraftsByLoanTypeId[loanType.id] ?? loanType.requiredDocuments;

  const handleToggleDraftDocument = (loanType: LoanType, documentType: DocumentType) => {
    setDocumentDraftsByLoanTypeId((prev) => {
      const currentDocuments = prev[loanType.id] ?? loanType.requiredDocuments;
      return {
        ...prev,
        [loanType.id]: toggleDocumentSelection(currentDocuments, documentType),
      };
    });
  };

  const handleAddLoanType = async () => {
    const parsedMinAmount = Number(minAmount);
    const parsedMaxAmount = Number(maxAmount);
    const parsedBaseRate = Number(baseRate);
    const parsedTerms = parseTerms();

    if (!name.trim()) {
      Alert.alert('Missing name', 'Loan type name is required.');
      return;
    }
    if (!Number.isFinite(parsedMinAmount) || !Number.isFinite(parsedMaxAmount)) {
      Alert.alert('Invalid amount', 'Minimum and maximum amounts must be valid numbers.');
      return;
    }
    if (parsedMinAmount <= 0 || parsedMaxAmount < parsedMinAmount) {
      Alert.alert('Invalid range', 'Maximum amount must be greater than or equal to minimum amount.');
      return;
    }
    if (!Number.isFinite(parsedBaseRate) || parsedBaseRate <= 0) {
      Alert.alert('Invalid rate', 'Base interest rate must be a positive number.');
      return;
    }
    if (parsedTerms.length === 0) {
      Alert.alert('Invalid terms', 'Enter at least one positive loan term.');
      return;
    }

    setSubmitting(true);
    try {
      const createdLoanType = await createAdminLoanType({
        name,
        minAmount: parsedMinAmount,
        maxAmount: parsedMaxAmount,
        baseInterestRate: parsedBaseRate,
        termsInMonths: parsedTerms,
        requiredDocuments,
      });

      setLoanTypes((prev) =>
        [...prev, createdLoanType].sort((left, right) => left.name.localeCompare(right.name))
      );
      resetForm();
      setError(null);
      Alert.alert('Success', `${createdLoanType.name} created.`);
    } catch (submitError) {
      Alert.alert(
        'Failed',
        submitError instanceof ApiError ? submitError.message : 'Unable to create loan type.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLoanType = async (loanType: LoanType) => {
    setTogglingId(loanType.id);
    try {
      const updatedLoanType = await updateAdminLoanType(loanType.id, {
        active: !loanType.active,
      });

      setLoanTypes((prev) =>
        prev.map((item) => (item.id === updatedLoanType.id ? updatedLoanType : item))
      );
      Alert.alert(
        'Status Updated',
        `${updatedLoanType.name} is now ${updatedLoanType.active ? 'active' : 'inactive'}.`
      );
    } catch (toggleError) {
      Alert.alert(
        'Failed',
        toggleError instanceof ApiError ? toggleError.message : 'Unable to update loan type.'
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveRequiredDocuments = async (loanType: LoanType) => {
    const draftDocuments = getDraftDocuments(loanType);
    setSavingDocumentsId(loanType.id);

    try {
      const updatedLoanType = await updateAdminLoanType(loanType.id, {
        requiredDocuments: draftDocuments,
      });

      setLoanTypes((prev) =>
        prev.map((item) => (item.id === updatedLoanType.id ? updatedLoanType : item))
      );
      setDocumentDraftsByLoanTypeId((prev) => {
        const next = { ...prev };
        delete next[loanType.id];
        return next;
      });
      Alert.alert('Required documents updated', `${updatedLoanType.name} document rules were saved.`);
    } catch (saveError) {
      Alert.alert(
        'Failed',
        saveError instanceof ApiError ? saveError.message : 'Unable to update required documents.'
      );
    } finally {
      setSavingDocumentsId(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomClearance }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadLoanTypes('refresh')}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
        <Text style={styles.title}>Manage Loan Types</Text>
        <Text style={styles.subtitle}>
          Admins can add loan programs here and control whether they are visible in borrower applications.
        </Text>

        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Add New Loan Type</Text>
          <Input label="Name" value={name} onChangeText={setName} placeholder="e.g., Entrepreneur Loan" />
          <Input
            label="Minimum Amount"
            value={minAmount}
            onChangeText={setMinAmount}
            keyboardType="numeric"
            placeholder="20000"
          />
          <Input
            label="Maximum Amount"
            value={maxAmount}
            onChangeText={setMaxAmount}
            keyboardType="numeric"
            placeholder="150000"
          />
          <Input
            label="Base Interest Rate (%)"
            value={baseRate}
            onChangeText={setBaseRate}
            keyboardType="numeric"
            placeholder="6.2"
          />
          <Input
            label="Terms in Months (comma separated)"
            value={terms}
            onChangeText={setTerms}
            placeholder="12,24,36"
          />
          <Text style={styles.sectionLabel}>Required Documents</Text>
          <View style={styles.documentChipRow}>
            {DOCUMENT_OPTIONS.map((option) => {
              const active = requiredDocuments.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.documentChip, active && styles.documentChipActive]}
                  onPress={() => setRequiredDocuments((prev) => toggleDocumentSelection(prev, option.value))}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.documentChipText, active && styles.documentChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Button title="Add Loan Type" onPress={handleAddLoanType} loading={submitting} />
        </Card>

        {loading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.stateText}>Loading loan types...</Text>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card style={styles.stateCard}>
            <Text style={styles.errorTitle}>Unable to load loan types</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Button title="Try again" onPress={() => void loadLoanTypes()} />
          </Card>
        ) : null}

        {!loading && !error && loanTypes.length === 0 ? (
          <Card style={styles.stateCard}>
            <Text style={styles.stateText}>No loan types created yet.</Text>
          </Card>
        ) : null}

        {!loading && !error
          ? loanTypes.map((loanType) => (
              <Card key={loanType.id} style={styles.loanTypeCard}>
                {(() => {
                  const draftDocuments = getDraftDocuments(loanType);
                  const hasDocumentChanges = !sameDocuments(draftDocuments, loanType.requiredDocuments);

                  return (
                    <>
                      <View style={styles.headerRow}>
                        <Text style={styles.name}>{loanType.name}</Text>
                        <View style={[styles.statusBadge, loanType.active ? styles.activeBadge : styles.inactiveBadge]}>
                          <Text style={styles.statusText}>{loanType.active ? 'ACTIVE' : 'INACTIVE'}</Text>
                        </View>
                      </View>
                      <Text style={styles.meta}>
                        Range: {formatCurrency(loanType.minAmount)} - {formatCurrency(loanType.maxAmount)}
                      </Text>
                      <Text style={styles.meta}>Base Interest: {loanType.baseInterestRate}%</Text>
                      <Text style={styles.meta}>Terms: {loanType.termsInMonths.join(', ')} months</Text>
                      <Text style={styles.meta}>
                        Required documents: {formatRequiredDocuments(loanType.requiredDocuments)}
                      </Text>

                      <Text style={styles.sectionLabel}>Edit Required Documents</Text>
                      <View style={styles.documentChipRow}>
                        {DOCUMENT_OPTIONS.map((option) => {
                          const active = draftDocuments.includes(option.value);
                          return (
                            <TouchableOpacity
                              key={`${loanType.id}-${option.value}`}
                              style={[styles.documentChip, active && styles.documentChipActive]}
                              onPress={() => handleToggleDraftDocument(loanType, option.value)}
                              activeOpacity={0.9}
                            >
                              <Text style={[styles.documentChipText, active && styles.documentChipTextActive]}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.saveDocumentsButton,
                          (!hasDocumentChanges || savingDocumentsId === loanType.id) && styles.disabledButton,
                        ]}
                        onPress={() => void handleSaveRequiredDocuments(loanType)}
                        disabled={!hasDocumentChanges || savingDocumentsId === loanType.id}
                        activeOpacity={0.88}
                      >
                        {savingDocumentsId === loanType.id ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.toggleText}>Save Document Rules</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.toggleButton,
                          loanType.active ? styles.deactivateButton : styles.activateButton,
                          togglingId === loanType.id ? styles.disabledButton : undefined,
                        ]}
                        onPress={() => void handleToggleLoanType(loanType)}
                        disabled={togglingId === loanType.id}
                      >
                        {togglingId === loanType.id ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.toggleText}>{loanType.active ? 'Deactivate' : 'Activate'}</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </Card>
            ))
          : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textLight,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  formCard: {
    marginBottom: spacing.lg,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  documentChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  documentChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  documentChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#E9EEFF',
  },
  documentChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textLight,
  },
  documentChipTextActive: {
    color: colors.primary,
  },
  stateCard: {
    marginBottom: spacing.md,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stateText: {
    fontSize: 14,
    color: colors.textLight,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  loanTypeCard: {
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    paddingRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
  },
  inactiveBadge: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 2,
  },
  toggleButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  saveDocumentsButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  activateButton: {
    backgroundColor: colors.success,
  },
  deactivateButton: {
    backgroundColor: colors.danger,
  },
  disabledButton: {
    opacity: 0.8,
  },
  toggleText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
