import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Appearance,
  ColorSchemeName,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from '../components/LinearGradient';
import {
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Fingerprint,
  Globe2,
  GraduationCap,
  HelpCircle,
  Info,
  LogOut,
  ShieldCheck,
  Upload,
  UserRoundPen,
  Users,
  XCircle,
} from 'lucide-react-native';
import { fetchBorrowerDocuments, uploadDocument as uploadBorrowerDocument } from '../api/documents';
import { updateCurrentUser } from '../api/profile';
import { useAuth } from '../context/AuthContext';
import { useBorrowerStatus } from '../context/BorrowerStatusContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  BorrowerDocument,
  DocumentType,
  EmploymentStatus,
  VerificationStatus,
} from '../../types';
import { DocTypes } from '../../constants/docTypes';
import { colors, spacing } from '../../constants/theme';

const LANGUAGES: Record<string, { label: string; hello: string; apply: string; settings: string }> = {
  English: { label: 'English', hello: 'Hello', apply: 'Apply', settings: 'Settings' },
  Filipino: { label: 'Filipino', hello: 'Kamusta', apply: 'Mag-apply', settings: 'Mga Setting' },
  Spanish: { label: 'Español', hello: 'Hola', apply: 'Aplicar', settings: 'Configuración' },
};

const EMPLOYMENT_OPTIONS: {
  label: string;
  value: EmploymentStatus;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  hint: string;
}[] = [
  { label: 'Employed', value: 'employed', icon: Briefcase, hint: 'Full-time or part-time job' },
  { label: 'Self-Employed', value: 'self_employed', icon: Building2, hint: 'Business owner or freelancer' },
  { label: 'Student', value: 'student', icon: GraduationCap, hint: 'Currently enrolled in school' },
  { label: 'Unemployed', value: 'unemployed', icon: Users, hint: 'Currently not working' },
];

const MIN_INCOME = 1200;
const MAX_DTI = 0.45;

const STATUS_LABEL: Record<VerificationStatus, string> = {
  not_started: 'NOT STARTED',
  qualified: 'QUALIFIED',
  not_qualified: 'NOT QUALIFIED',
};

const STATUS_COLOR: Record<VerificationStatus, string> = {
  not_started: '#64748B',
  qualified: colors.success,
  not_qualified: colors.danger,
};

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
type SelectedUpload = { uri: string; name: string; mimeType?: string | null; file?: Blob };
type UploadSource = 'camera' | 'library' | 'files';
type DocumentRequirementState = BorrowerDocument['status'] | 'missing';

const DOCUMENT_PICKER_TYPES = ['image/*', 'application/pdf'];

type SettingRowProps = {
  icon: IconType;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
};

const SettingRow = ({ icon: Icon, title, subtitle, value, trailing, isLast, onPress }: SettingRowProps) => (
  <TouchableOpacity
    style={[styles.settingRow, isLast && styles.settingRowLast]}
    activeOpacity={onPress ? 0.85 : 1}
    onPress={onPress}
    disabled={!onPress && !trailing}
  >
    <View style={styles.settingIconWrap}>
      <Icon size={18} color={colors.primary} strokeWidth={2.3} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.settingTitle}>{title}</Text>
      {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
    </View>
    {value ? <Text style={styles.settingValue}>{value}</Text> : null}
    {trailing}
    {onPress && !trailing ? <ChevronRight size={18} color={colors.textLight} /> : null}
  </TouchableOpacity>
);

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
  if (normalizedFileName.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (normalizedFileName.endsWith('.png')) {
    return 'image/png';
  }
  if (normalizedFileName.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
};

const buildDocumentPickerUpload = (
  asset: DocumentPicker.DocumentPickerAsset,
  fallbackPrefix: string
): SelectedUpload => {
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
): SelectedUpload => {
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

const chooseUploadSource = (label: string) =>
  new Promise<UploadSource | null>((resolve) => {
    let settled = false;
    const finish = (value: UploadSource | null) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    Alert.alert(
      `Upload ${label}`,
      'Choose how you want to add this document.',
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

const getLatestDocumentByTypes = (
  documents: BorrowerDocument[],
  documentTypes: DocumentType[]
) => documents.find((document) => documentTypes.includes(document.type));

const buildRequirementHint = (document: BorrowerDocument | undefined, missingHint: string) => {
  if (!document) {
    return missingHint;
  }

  if (document.status === 'verified') {
    return 'Verified by officer.';
  }

  if (document.status === 'rejected') {
    return document.rejectionReason?.trim()
      ? `Rejected: ${document.rejectionReason}`
      : 'Rejected by officer. Upload a clearer real document.';
  }

  return 'Uploaded. Waiting for officer verification.';
};

const toNumericValue = (value: string) => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export const SettingsScreen = ({ navigation, route }: any) => {
  const { user, logout, applyAuthenticatedUserUpdate } = useAuth();
  const { isOffline, unreadNotificationCount } = useBorrowerStatus();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const compactHeader = width < 390;
  const stackedHeader = width < 360;

  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>('employed');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyDebt, setMonthlyDebt] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsNotificationsEnabled, setSmsNotificationsEnabled] = useState(false);
  const [gcashAccountName, setGcashAccountName] = useState('');
  const [gcashAccountNumber, setGcashAccountNumber] = useState('');
  const [documents, setDocuments] = useState<BorrowerDocument[]>([]);
  const [documentsError, setDocumentsError] = useState('');
  const [language, setLanguage] = useState('English');
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [photoSaving, setPhotoSaving] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [uploadingDocumentType, setUploadingDocumentType] = useState<DocumentType | null>(null);
  const isDark = colorScheme === 'dark';
  const langStrings = LANGUAGES[language] ?? LANGUAGES.English;

  const scrollRef = useRef<ScrollView>(null);
  const contactCardY = useRef(0);
  const verificationCardY = useRef(0);

  const isBorrower = user?.role === 'borrower';

  const loadBorrowerDocuments = useCallback(async () => {
    if (!isBorrower) {
      setDocuments([]);
      setDocumentsError('');
      return;
    }

    try {
      const payload = await fetchBorrowerDocuments();
      setDocuments(payload);
      setDocumentsError('');
    } catch (requestError) {
      setDocumentsError(
        requestError instanceof Error ? requestError.message : 'Unable to load your uploaded documents.'
      );
    }
  }, [isBorrower]);

  useFocusEffect(
    useCallback(() => {
      void loadBorrowerDocuments();
    }, [loadBorrowerDocuments])
  );

  useEffect(() => {
    if (!user) return;

    setPhoneNumber(user.phoneNumber ?? '');
    setSmsNotificationsEnabled(Boolean(user.smsNotificationsEnabled));
    setGcashAccountName(user.gcashAccountName ?? user.name ?? '');
    setGcashAccountNumber(user.gcashAccountNumber ?? '');

    if (user.role !== 'borrower') return;

    setEmploymentStatus(user.employmentStatus ?? 'employed');
    setMonthlyIncome(user.monthlyIncome !== undefined ? String(user.monthlyIncome) : '');
    setMonthlyDebt(user.monthlyDebt !== undefined ? String(user.monthlyDebt) : '');
  }, [user]);

  const myDocuments = useMemo(() => documents, [documents]);

  // Check for all relevant document types using constants
  const hasGovId = myDocuments.some((d) => d.type === DocTypes.GOVERNMENT_ID);
  const hasStudentId = myDocuments.some((d) => d.type === DocTypes.STUDENT_ID);
  const hasBusinessPermit = myDocuments.some((d) => d.type === DocTypes.BUSINESS_PERMIT);
  const hasIncomeProof = myDocuments.some(
    (d) => d.type === DocTypes.INCOME_PROOF || d.type === DocTypes.ID
  );
  // Legacy check — any valid ID type uploaded
  const hasAnyId = myDocuments.some(
    (d) =>
      d.type === DocTypes.GOVERNMENT_ID ||
      d.type === DocTypes.STUDENT_ID ||
      d.type === DocTypes.ID
  );
  const hasAnyIncomeOrRevenue = myDocuments.some(
    (d) =>
      d.type === DocTypes.INCOME_PROOF ||
      d.type === DocTypes.PROOF_OF_REVENUE
  );
  const strictGovernmentIdDocument = useMemo(
    () =>
      myDocuments.find(
        (document) =>
          document.type === DocTypes.GOVERNMENT_ID || document.type === DocTypes.ID
      ),
    [myDocuments]
  );
  const studentIdDocument = useMemo(
    () => myDocuments.find((document) => document.type === DocTypes.STUDENT_ID),
    [myDocuments]
  );
  const strictIncomeOrRevenueDocument = useMemo(
    () =>
      myDocuments.find(
        (document) =>
          document.type === DocTypes.INCOME_PROOF || document.type === DocTypes.PROOF_OF_REVENUE
      ),
    [myDocuments]
  );
  const hasStrictGovernmentId = Boolean(strictGovernmentIdDocument);
  const hasStrictIncomeOrRevenue = Boolean(strictIncomeOrRevenueDocument);
  const supportingDocumentType =
    employmentStatus === 'student'
      ? DocTypes.STUDENT_ID
      : employmentStatus === 'self_employed'
      ? DocTypes.PROOF_OF_REVENUE
      : DocTypes.INCOME_PROOF;
  const supportingDocument =
    supportingDocumentType === DocTypes.STUDENT_ID ? studentIdDocument : strictIncomeOrRevenueDocument;
  const hasSupportingDocument = Boolean(supportingDocument);
  const supportingDocumentLabel =
    supportingDocumentType === DocTypes.STUDENT_ID ? 'School / Student ID' : 'Proof of Income or Revenue';
  const governmentIdHint = strictGovernmentIdDocument
    ? strictGovernmentIdDocument.status === 'verified'
      ? 'Verified by officer ✓'
      : 'Uploaded. Pending officer review.'
    : 'Passport, Driver\'s License, SSS, UMID, or PhilHealth';
  const supportingDocumentHint = supportingDocument
    ? supportingDocument.status === 'verified'
      ? 'Verified by officer ✓'
      : 'Uploaded. Pending officer review.'
    : supportingDocumentType === DocTypes.STUDENT_ID
    ? 'Current school year student ID with your name and photo'
    : employmentStatus === 'self_employed'
    ? 'Bank statement, sales report, or revenue summary'
    : 'Payslip, bank statement, or sales report';

  const verificationStatus: VerificationStatus = 'qualified';

  const debtToIncomeRatio = null;

  const readinessScore = useMemo(() => (isBorrower ? 100 : 0), [isBorrower]);
  const latestGovernmentIdDocument = useMemo(
    () => getLatestDocumentByTypes(myDocuments, [DocTypes.GOVERNMENT_ID, DocTypes.ID]),
    [myDocuments]
  );
  const latestStudentIdDocument = useMemo(
    () => getLatestDocumentByTypes(myDocuments, [DocTypes.STUDENT_ID]),
    [myDocuments]
  );
  const latestIncomeOrRevenueDocument = useMemo(
    () => getLatestDocumentByTypes(myDocuments, [DocTypes.INCOME_PROOF, DocTypes.PROOF_OF_REVENUE]),
    [myDocuments]
  );
  const requiredSupportingDocumentType =
    employmentStatus === 'student'
      ? DocTypes.STUDENT_ID
      : employmentStatus === 'self_employed'
      ? DocTypes.PROOF_OF_REVENUE
      : DocTypes.INCOME_PROOF;
  const requiredSupportingDocument =
    requiredSupportingDocumentType === DocTypes.STUDENT_ID
      ? latestStudentIdDocument
      : latestIncomeOrRevenueDocument;
  const requiredSupportingDocumentLabel =
    requiredSupportingDocumentType === DocTypes.STUDENT_ID
      ? 'School / Student ID'
      : requiredSupportingDocumentType === DocTypes.PROOF_OF_REVENUE
      ? 'Proof of Monthly Revenue'
      : 'Proof of Income';
  const strictHasVerifiedGovernmentId = latestGovernmentIdDocument?.status === 'verified';
  const strictHasVerifiedSupportingDocument = requiredSupportingDocument?.status === 'verified';
  const strictGovernmentIdState: DocumentRequirementState =
    latestGovernmentIdDocument?.status ?? 'missing';
  const strictSupportingDocumentState: DocumentRequirementState =
    requiredSupportingDocument?.status ?? 'missing';
  const strictGovernmentIdHint = buildRequirementHint(
    latestGovernmentIdDocument,
    'Passport, Driver\'s License, SSS, UMID, or PhilHealth'
  );
  const strictSupportingDocumentHint = buildRequirementHint(
    requiredSupportingDocument,
    requiredSupportingDocumentType === DocTypes.STUDENT_ID
      ? 'Current school year student ID with your name and photo'
      : employmentStatus === 'self_employed'
      ? 'Bank statement, sales report, or revenue summary'
      : 'Payslip, bank statement, or certificate of employment'
  );
  const strictIncomeValue = toNumericValue(monthlyIncome);
  const strictDebtValue = toNumericValue(monthlyDebt);
  const strictDebtToIncomeRatio = strictIncomeValue > 0 ? strictDebtValue / strictIncomeValue : null;
  const documentsStepComplete = Boolean(strictHasVerifiedGovernmentId && strictHasVerifiedSupportingDocument);
  const employmentStepComplete = employmentStatus !== 'unemployed';
  const financialStepComplete =
    strictIncomeValue >= MIN_INCOME &&
    (strictDebtToIncomeRatio === null || strictDebtToIncomeRatio <= MAX_DTI);
  const strictVerificationStarted =
    Boolean(user?.employmentStatus) ||
    monthlyIncome.trim().length > 0 ||
    monthlyDebt.trim().length > 0 ||
    Boolean(latestGovernmentIdDocument) ||
    Boolean(latestStudentIdDocument) ||
    Boolean(latestIncomeOrRevenueDocument);
  const strictVerificationStatus: VerificationStatus = !strictVerificationStarted
    ? 'not_started'
    : documentsStepComplete && employmentStepComplete && financialStepComplete
    ? 'qualified'
    : 'not_qualified';
  const strictReadinessScore = useMemo(() => {
    if (!isBorrower) {
      return 0;
    }

    const completedSteps = [documentsStepComplete, employmentStepComplete, financialStepComplete].filter(Boolean).length;
    return Math.round((completedSteps / 3) * 100);
  }, [documentsStepComplete, employmentStepComplete, financialStepComplete, isBorrower]);
  const strictVerificationMessage = !strictVerificationStarted
    ? 'Upload your real ID documents and save your details to start the strict eligibility check.'
    : !strictHasVerifiedGovernmentId
    ? latestGovernmentIdDocument?.status === 'uploaded'
      ? 'Your latest government ID is waiting for officer verification.'
      : latestGovernmentIdDocument?.status === 'rejected'
      ? 'Upload a clearer real government ID and wait for officer approval.'
      : 'Upload a real government ID and wait for officer verification.'
    : !strictHasVerifiedSupportingDocument
    ? requiredSupportingDocument?.status === 'uploaded'
      ? `Your latest ${requiredSupportingDocumentLabel.toLowerCase()} is waiting for officer verification.`
      : requiredSupportingDocument?.status === 'rejected'
      ? `Upload a clearer ${requiredSupportingDocumentLabel.toLowerCase()} and wait for officer approval.`
      : `Upload your ${requiredSupportingDocumentLabel.toLowerCase()} and wait for officer verification.`
    : employmentStatus === 'unemployed'
    ? 'Unemployed borrowers are not eligible right now.'
    : strictIncomeValue < MIN_INCOME
    ? `Monthly income must be at least P${MIN_INCOME.toLocaleString()}.`
    : strictDebtToIncomeRatio !== null && strictDebtToIncomeRatio > MAX_DTI
    ? `Debt-to-income ratio must stay at ${Math.round(MAX_DTI * 100)}% or below.`
    : 'Review your latest details and try again.';

  const uploadSelectedDocument = useCallback(
    async (documentType: DocumentType, label: string, asset: SelectedUpload, successMessage: string) => {
      setUploadingDocumentType(documentType);
      try {
        const fileUri = asset.uri.trim();
        if (!fileUri) {
          throw new Error(`Unable to read the selected ${label}. Please choose the file again.`);
        }

        const fileName = asset.name.trim() || `${documentType.replace(/_/g, '-')}-${Date.now()}`;
        const mimeType =
          asset.mimeType?.trim() ||
          asset.file?.type ||
          inferMimeTypeFromName(fileName);

        await uploadBorrowerDocument(
          documentType,
          fileUri,
          fileName,
          mimeType,
          asset.file
        );
        await loadBorrowerDocuments();
        Alert.alert('Document uploaded', successMessage);
      } catch (error) {
        Alert.alert(
          'Upload failed',
          error instanceof Error ? error.message : `Unable to upload your ${label} right now.`
        );
      } finally {
        setUploadingDocumentType(null);
      }
    },
    [loadBorrowerDocuments]
  );

  const pickEligibilityUpload = useCallback(async (label: string, fallbackPrefix: string) => {
    const source = await chooseUploadSource(label);
    if (!source) {
      return null;
    }

    if (source === 'files') {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      return buildDocumentPickerUpload(result.assets[0], fallbackPrefix);
    }

    if (source === 'library') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Allow photo access so you can choose an ID or supporting document.');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      return buildImagePickerUpload(result.assets[0] as ImagePicker.ImagePickerAsset & { file?: Blob }, fallbackPrefix);
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow camera access so you can capture an ID or supporting document.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    return buildImagePickerUpload(result.assets[0] as ImagePicker.ImagePickerAsset & { file?: Blob }, fallbackPrefix);
  }, []);

  const handleGovernmentIdUpload = async () => {
    const asset = await pickEligibilityUpload('government ID', 'government-id');
    if (!asset) {
      return;
    }

    await uploadSelectedDocument(
      DocTypes.GOVERNMENT_ID,
      'government ID',
      asset,
      'Your latest government ID was uploaded. A loan officer must verify it before you qualify.'
    );
  };

  const handleSupportingDocumentUpload = async () => {
    const asset = await pickEligibilityUpload(
      requiredSupportingDocumentType === DocTypes.STUDENT_ID ? 'student ID' : requiredSupportingDocumentLabel,
      requiredSupportingDocumentType.replace(/_/g, '-')
    );
    if (!asset) {
      return;
    }

    await uploadSelectedDocument(
      requiredSupportingDocumentType,
      requiredSupportingDocumentType === DocTypes.STUDENT_ID ? 'student ID' : 'supporting document',
      asset,
      `Your latest ${requiredSupportingDocumentLabel.toLowerCase()} was uploaded. A loan officer must verify it before you qualify.`
    );
  };

  const handleVerificationSubmit = async () => {
    if (!user || user.role !== 'borrower') {
      Alert.alert('Unavailable', 'Borrower verification is only available to borrower accounts.');
      return;
    }

    setVerificationSaving(true);
    try {
      const updatedUser = await updateCurrentUser({
        employmentStatus,
        monthlyIncome: strictIncomeValue,
        monthlyDebt: strictDebtValue,
      });
      applyAuthenticatedUserUpdate(updatedUser);
      const nextStatus = updatedUser.verificationStatus ?? strictVerificationStatus;

      Alert.alert(
        'Eligibility updated',
        nextStatus === 'qualified'
          ? 'Eligibility passed. Your latest required documents are verified, and you can apply for a loan.'
          : 'Eligibility not passed yet. Your latest government ID and required student or income document must be verified by an officer before you can apply.'
      );
    } catch (error) {
      Alert.alert('Verification failed', error instanceof Error ? error.message : 'Unable to verify right now.');
    } finally {
      setVerificationSaving(false);
    }
  };

  const handleContactSubmit = async () => {
    if (!user || user.role !== 'borrower') {
      Alert.alert('Not available', 'Contact updates are only available for borrower accounts.');
      return;
    }

    const trimmedGcashName = gcashAccountName.trim();
    const normalizedGcashNumber = gcashAccountNumber.replace(/\D/g, '');

    if (!trimmedGcashName) {
      Alert.alert('Missing GCash name', 'Enter the GCash account name before saving your payout profile.');
      return;
    }

    if (!normalizedGcashNumber) {
      Alert.alert('Missing GCash number', 'Enter the GCash number before saving your payout profile.');
      return;
    }

    if (normalizedGcashNumber.length !== 11 || !normalizedGcashNumber.startsWith('0')) {
      Alert.alert('Invalid GCash number', 'Enter a valid 11-digit GCash mobile number.');
      return;
    }

    setContactSaving(true);
    try {
      const updatedUser = await updateCurrentUser({
        phoneNumber,
        smsNotificationsEnabled,
        gcashAccountName: trimmedGcashName,
        gcashAccountNumber,
      });
      applyAuthenticatedUserUpdate(updatedUser);
      Alert.alert('Saved', 'Contact, SMS, and GCash payout details updated.');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to save contact details right now.');
    } finally {
      setContactSaving(false);
    }
  };

  const handleLanguagePress = () => {
    Alert.alert('Language', `Current: ${LANGUAGES[language]?.label ?? language}`, [
      { text: 'English', onPress: () => setLanguage('English') },
      { text: 'Filipino', onPress: () => setLanguage('Filipino') },
      { text: 'Español', onPress: () => setLanguage('Spanish') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handlePickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access so you can choose a PNG or other profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? inferMimeTypeFromName(asset.fileName);
    const fileName = asset.fileName ?? `profile-${Date.now()}.${inferPhotoExtension(mimeType)}`;

    setPhotoSaving(true);
    try {
      const updatedUser = await updateCurrentUser({
        profilePhoto: {
          uri: asset.uri,
          name: fileName,
          type: mimeType,
          file: 'file' in asset ? asset.file ?? undefined : undefined,
        },
      });
      applyAuthenticatedUserUpdate(updatedUser);
      Alert.alert('Profile updated', 'Your profile photo was updated.');
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload your profile photo.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    setPhotoSaving(true);
    try {
      const updatedUser = await updateCurrentUser({ removeProfilePhoto: true });
      applyAuthenticatedUserUpdate(updatedUser);
      Alert.alert('Photo removed', 'Your profile photo was removed.');
    } catch (error) {
      Alert.alert('Remove failed', error instanceof Error ? error.message : 'Unable to remove your profile photo.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const scrollToContact = () => {
    scrollRef.current?.scrollTo({ y: Math.max(contactCardY.current - spacing.lg, 0), animated: true });
  };

  const scrollToVerification = () => {
    scrollRef.current?.scrollTo({ y: Math.max(verificationCardY.current - spacing.lg, 0), animated: true });
  };

  useEffect(() => {
    const focusSection = route?.params?.focusSection as 'contact' | 'verification' | undefined;
    if (!focusSection) {
      return;
    }

    const timer = setTimeout(() => {
      if (focusSection === 'contact') {
        scrollToContact();
      } else {
        scrollToVerification();
      }

      navigation.setParams?.({ focusSection: undefined });
    }, 180);

    return () => clearTimeout(timer);
  }, [navigation, route?.params?.focusSection]);

  const openSupport = () => navigation.navigate('Support');

  const initials = useMemo(() => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }, [user?.name]);

  const heroRoleLabel = useMemo(() => {
    if (user?.role === 'officer') {
      return 'Loan Officer';
    }
    if (user?.role === 'admin') {
      return 'Admin';
    }
    if (user?.role === 'borrower') {
      return 'Borrower';
    }
    return 'User';
  }, [user?.role]);

  const statusBadgeColor = STATUS_COLOR[strictVerificationStatus];

  const notificationsToggle = (
    <Switch
      value={smsNotificationsEnabled}
      onValueChange={setSmsNotificationsEnabled}
      trackColor={{ false: '#CBD5E1', true: colors.backdrop }}
      thumbColor={smsNotificationsEnabled ? colors.primary : '#F1F5F9'}
    />
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl + tabBarHeight }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.primaryDeep, colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.hero,
          compactHeader && styles.heroCompact,
          stackedHeader && styles.heroTight,
        ]}
      >
        <View style={styles.heroOrbLarge} />
        <View style={styles.heroOrbSmall} />
        <View style={[styles.heroTopRow, compactHeader && styles.heroTopRowCompact]}>
          <View style={styles.heroHeading}>
            {isBorrower ? (
              <Text
                style={[
                  styles.heroTitle,
                  compactHeader && styles.heroTitleCompact,
                  stackedHeader && styles.heroTitleTight,
                ]}
              >
                {langStrings.settings}
              </Text>
            ) : (
              <>
                <Text style={[styles.heroEyebrow, compactHeader && styles.heroEyebrowCompact]}>Profile Studio</Text>
                <Text
                  style={[
                    styles.heroTitle,
                    compactHeader && styles.heroTitleCompact,
                    stackedHeader && styles.heroTitleTight,
                  ]}
                >
                  {langStrings.settings}
                </Text>
              </>
            )}
          </View>
          <View style={[styles.rolePill, compactHeader && styles.rolePillCompact]}>
            <Text style={[styles.rolePillText, compactHeader && styles.rolePillTextCompact]}>
              {heroRoleLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={[styles.avatarRow, compactHeader && styles.avatarRowCompact]}>
          <View style={[styles.avatarFrame, compactHeader && styles.avatarFrameCompact]}>
            {user?.profilePhotoUrl ? (
              <Image source={{ uri: user.profilePhotoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={[styles.avatarText, compactHeader && styles.avatarTextCompact]}>{initials}</Text>
              </View>
            )}
          </View>
          <View style={[styles.heroIdentity, compactHeader && styles.heroIdentityCompact]}>
            <Text style={[styles.userName, compactHeader && styles.userNameCompact]}>{user?.name ?? 'Loan User'}</Text>
            <Text style={[styles.userMeta, compactHeader && styles.userMetaCompact]}>{user?.email ?? 'Add your email'}</Text>
            <Text style={[styles.userMeta, compactHeader && styles.userMetaCompact]}>
              {user?.phoneNumber ?? 'Add a phone number for SMS alerts'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.heroActionRow,
            compactHeader && styles.heroActionRowCompact,
            stackedHeader && styles.heroActionRowStacked,
          ]}
        >
          <TouchableOpacity
            style={[
              styles.editAvatarButton,
              compactHeader && styles.editAvatarButtonCompact,
              photoSaving && styles.actionButtonDisabled,
            ]}
            onPress={() => void handlePickProfilePhoto()}
            activeOpacity={0.85}
            disabled={photoSaving}
          >
            <UserRoundPen size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.editAvatarText}>{photoSaving ? 'Updating...' : 'Choose photo'}</Text>
          </TouchableOpacity>
          {user?.profilePhotoUrl ? (
            <TouchableOpacity
              style={[
                styles.removeAvatarButton,
                compactHeader && styles.removeAvatarButtonCompact,
                stackedHeader && styles.removeAvatarButtonStacked,
                photoSaving && styles.actionButtonDisabled,
              ]}
              onPress={() => void handleRemoveProfilePhoto()}
              activeOpacity={0.85}
              disabled={photoSaving}
            >
              <Text style={styles.removeAvatarText}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={[styles.photoHint, compactHeader && styles.photoHintCompact]}>
          Supports PNG, JPG, and WEBP up to 5 MB.
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        {isOffline ? (
          <Card style={styles.networkCard}>
            <Text style={styles.networkTitle}>Offline mode</Text>
            <Text style={styles.networkText}>
              Borrower settings still open, but uploads, password changes, and account requests need
              the backend connection again before they can finish.
            </Text>
          </Card>
        ) : null}

        <Card style={styles.statusCard}>
          <View style={styles.statusCardHeader}>
            <Text style={styles.statusHeadline}>Account pulse</Text>
            <Text style={styles.statValue}>{user?.createdAt ?? '--'}</Text>
          </View>

          {isBorrower ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${strictReadinessScore}%` }]} />
              </View>
              <Text style={styles.progressCaption}>Borrower readiness: {strictReadinessScore}%</Text>
            </>
          ) : (
            <Text style={styles.progressCaption}>Theme mode: {isDark ? 'Dark' : 'Light'}</Text>
          )}

          <View style={styles.statusRow}>
            <View style={styles.statusInfo}>
              <Text style={styles.statLabel}>Verification</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusBadgeColor }]}>
                <Text style={styles.statusBadgeText}>{STATUS_LABEL[strictVerificationStatus]}</Text>
              </View>
            </View>
            <View>
              <Text style={styles.statLabel}>Member since</Text>
              <Text style={styles.statValue}>{user?.createdAt ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statLabel}>Account status</Text>
              <Text style={styles.statValue}>{user?.active ? 'Active' : 'Inactive'}</Text>
            </View>
            <TouchableOpacity style={styles.linkButton} onPress={isBorrower ? scrollToVerification : openSupport}>
              <BadgeCheck size={16} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.linkButtonText}>{isBorrower ? 'Update verification' : 'Open support'}</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <SettingRow
            icon={Fingerprint}
            title="Change Password"
            subtitle="Open a separate screen to update your password"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <SettingRow
            icon={UserRoundPen}
            title="Profile controls"
            subtitle={isBorrower ? 'Jump to contact, payout, and photo settings' : 'Review photo and account details'}
            onPress={isBorrower ? scrollToContact : undefined}
          />
          <SettingRow
            icon={Bell}
            title="Notifications"
            subtitle={
              isBorrower
                ? unreadNotificationCount > 0
                  ? `${unreadNotificationCount} unread in-app update${unreadNotificationCount === 1 ? '' : 's'} plus SMS alerts`
                  : 'SMS alerts for account activity'
                : 'In-app only'
            }
            trailing={isBorrower ? notificationsToggle : undefined}
            value={!isBorrower ? 'In-app only' : undefined}
          />
          <SettingRow
            icon={Globe2}
            title="Language"
            subtitle={`Interface language — ${LANGUAGES[language]?.label ?? language}`}
            value={LANGUAGES[language]?.label ?? language}
            onPress={handleLanguagePress}
            isLast
          />
        </Card>

        {isBorrower ? (
          <Card
            onLayout={(event) => {
              contactCardY.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.sectionTitle}>Contact & GCash profile</Text>
            <Text style={styles.helperText}>
              Add your phone number and saved GCash payout profile. Future loan applications will reuse this GCash destination.
            </Text>

            <Input
              label="Phone Number"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+1 555 000 1005"
              keyboardType="phone-pad"
            />

            <Input
              label="GCash Account Name (Required)"
              value={gcashAccountName}
              onChangeText={setGcashAccountName}
              placeholder="Account holder name"
            />

            <Input
              label="GCash Number (Required)"
              value={gcashAccountNumber}
              onChangeText={setGcashAccountNumber}
              placeholder="09XXXXXXXXX"
              keyboardType="phone-pad"
            />

            <Button title="Save contact & GCash settings" onPress={handleContactSubmit} loading={contactSaving} />
          </Card>
        ) : null}

        {isBorrower ? (
          <Card
            style={vStyles.card}
            onLayout={(event) => {
              verificationCardY.current = event.nativeEvent.layout.y;
            }}
          >
            {/* ── Header ── */}
            <View style={vStyles.header}>
              <View style={vStyles.headerLeft}>
                <ShieldCheck size={20} color={statusBadgeColor} strokeWidth={2.4} />
                <View>
                  <Text style={vStyles.title}>Eligibility Check</Text>
                  <Text style={vStyles.subtitle}>3 steps to unlock loan access</Text>
                </View>
              </View>
              <View style={[vStyles.statusPill, { backgroundColor: `${statusBadgeColor}18`, borderColor: `${statusBadgeColor}40` }]}>
                <Text style={[vStyles.statusPillText, { color: statusBadgeColor }]}>
                  {STATUS_LABEL[strictVerificationStatus]}
                </Text>
              </View>
            </View>

            {/* ── Step Progress Bar ── */}
            <View style={vStyles.stepsRow}>
              {[
                { label: 'Documents', done: documentsStepComplete },
                { label: 'Employment', done: employmentStepComplete },
                { label: 'Financials', done: financialStepComplete },
              ].map((step, i) => {
                return (
                  <View key={step.label} style={vStyles.stepItem}>
                    <View style={[vStyles.stepDot, step.done ? vStyles.stepDotDone : vStyles.stepDotPending]}>
                      {step.done
                        ? <CheckCircle2 size={12} color="#FFFFFF" strokeWidth={3} />
                        : <Text style={vStyles.stepDotNum}>{i + 1}</Text>}
                    </View>
                    <Text style={[vStyles.stepLabel, step.done && vStyles.stepLabelDone]}>{step.label}</Text>
                    {i < 2 ? <View style={[vStyles.stepLine, step.done && vStyles.stepLineDone]} /> : null}
                  </View>
                );
              })}
            </View>

            {/* ── STEP 1: Documents ── */}
            <View style={vStyles.section}>
              <Text style={vStyles.sectionLabel}>Step 1 — Required Documents</Text>
              <Text style={vStyles.sectionHint}>We need these to verify your identity and income.</Text>
              {documentsError ? <Text style={vStyles.errorText}>{documentsError}</Text> : null}

              <DocRequirementRow
                state={strictGovernmentIdState}
                label="Valid Government ID"
                hint={strictGovernmentIdHint}
                uploading={uploadingDocumentType === DocTypes.GOVERNMENT_ID}
                onUpload={() => void handleGovernmentIdUpload()}
              />
              <DocRequirementRow
                state={strictSupportingDocumentState}
                label={requiredSupportingDocumentLabel}
                hint={strictSupportingDocumentHint}
                uploading={uploadingDocumentType === requiredSupportingDocumentType}
                onUpload={() => void handleSupportingDocumentUpload()}
              />

              <TouchableOpacity
                style={vStyles.docCenterBtn}
                onPress={() => navigation.navigate('DocumentCenter')}
                activeOpacity={0.88}
              >
                <FileText size={14} color={colors.primary} strokeWidth={2.4} />
                <Text style={vStyles.docCenterBtnText}>View all documents in Document Center</Text>
              </TouchableOpacity>
            </View>

            {/* ── STEP 2: Employment ── */}
            <View style={vStyles.section}>
              <Text style={vStyles.sectionLabel}>Step 2 — Employment Status</Text>
              <Text style={vStyles.sectionHint}>This helps us assess your repayment capacity.</Text>
              <View style={vStyles.empGrid}>
                {EMPLOYMENT_OPTIONS.map((opt) => {
                  const EmpIcon = opt.icon;
                  const active = employmentStatus === opt.value;
                  const isUnemployed = opt.value === 'unemployed';
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        vStyles.empCard,
                        active && vStyles.empCardActive,
                        isUnemployed && active && vStyles.empCardWarning,
                      ]}
                      onPress={() => setEmploymentStatus(opt.value)}
                      activeOpacity={0.88}
                    >
                      <View style={[
                        vStyles.empIconWrap,
                        active && vStyles.empIconWrapActive,
                        isUnemployed && active && vStyles.empIconWrapWarning,
                      ]}>
                        <EmpIcon size={18} color={active ? '#FFFFFF' : colors.textLight} strokeWidth={2.2} />
                      </View>
                      <Text style={[vStyles.empLabel, active && vStyles.empLabelActive]}>{opt.label}</Text>
                      <Text style={vStyles.empHint}>{opt.hint}</Text>
                      {active ? (
                        <View style={vStyles.empCheck}>
                          <CheckCircle2 size={14} color={isUnemployed ? colors.warning : colors.success} strokeWidth={2.5} />
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!employmentStepComplete ? (
                <View style={vStyles.warningBanner}>
                  <Info size={14} color="#92400E" strokeWidth={2.4} />
                  <Text style={vStyles.warningText}>
                    Unemployed applicants are not currently eligible. Consider updating your status once employed.
                  </Text>
                </View>
              ) : null}
            </View>

            {/* ── STEP 3: Financial Info ── */}
            <View style={vStyles.section}>
              <Text style={vStyles.sectionLabel}>Step 3 — Financial Information</Text>
              <Text style={vStyles.sectionHint}>Your information is encrypted and never shared.</Text>

              {/* Income input */}
              <View style={vStyles.inputGroup}>
                <View style={vStyles.inputLabelRow}>
                  <Text style={vStyles.inputLabel}>Monthly Income</Text>
                  <TouchableOpacity
                    onPress={() => Alert.alert(
                      'Monthly Income',
                      'Enter your average take-home pay before deductions. Include salary, freelance income, or business revenue.',
                      [{ text: 'Got it' }]
                    )}
                  >
                    <Info size={14} color={colors.textMuted} strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>
                <View style={[
                  vStyles.currencyInput,
                  strictIncomeValue > 0 && strictIncomeValue < MIN_INCOME && vStyles.currencyInputError,
                  strictIncomeValue >= MIN_INCOME && vStyles.currencyInputSuccess,
                ]}>
                  <Text style={vStyles.currencySymbol}>₱</Text>
                  <TextInput
                    style={vStyles.currencyField}
                    value={monthlyIncome}
                    onChangeText={setMonthlyIncome}
                    placeholder="e.g. 15,000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                  {strictIncomeValue >= MIN_INCOME
                    ? <CheckCircle2 size={16} color={colors.success} strokeWidth={2.5} />
                    : null}
                </View>
                <Text style={vStyles.inputHint}>
                  {strictIncomeValue > 0 && strictIncomeValue < MIN_INCOME
                    ? `⚠ Minimum required income is ₱${MIN_INCOME.toLocaleString()}`
                    : 'Enter your average monthly income before expenses'}
                </Text>
                {/* Income meter */}
                {strictIncomeValue > 0 ? (
                  <View style={vStyles.meterWrap}>
                    <View style={vStyles.meterTrack}>
                      <View style={[
                        vStyles.meterFill,
                        {
                          width: `${Math.min((strictIncomeValue / MIN_INCOME) * 100, 100)}%` as any,
                          backgroundColor: strictIncomeValue >= MIN_INCOME ? colors.success : colors.warning,
                        },
                      ]} />
                    </View>
                    <Text style={vStyles.meterLabel}>
                      {strictIncomeValue >= MIN_INCOME
                        ? `✅ Meets minimum (₱${MIN_INCOME.toLocaleString()})`
                        : `₱${MIN_INCOME.toLocaleString()} minimum required`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* ── Qualification Preview ── */}
            {true ? (
              <View style={[
                vStyles.resultBanner,
                strictVerificationStatus === 'qualified' ? vStyles.resultBannerGood : vStyles.resultBannerBad,
              ]}>
                {strictVerificationStatus === 'qualified' ? (
                  <>
                    <Text style={vStyles.resultEmoji}>🎉</Text>
                    <View style={vStyles.resultText}>
                      <Text style={vStyles.resultTitle}>You\'re eligible for a loan!</Text>
                      <Text style={vStyles.resultSub}>Head to Home and tap Apply to get started.</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={vStyles.resultEmoji}>💡</Text>
                    <View style={vStyles.resultText}>
                      <Text style={[vStyles.resultTitle, { color: '#92400E' }]}>
                        {strictVerificationStatus === 'not_started' ? 'Verification not started' : 'You\'re almost there'}
                      </Text>
                      <Text style={[vStyles.resultSub, { color: '#78350F' }]}>
                        {false && (Number(monthlyIncome) < MIN_INCOME
                          ? `Increase income to at least ₱${MIN_INCOME.toLocaleString()}.`
                          : employmentStatus === 'unemployed'
                          ? 'Update your employment status once you start working.'
                          : 'Review your details and try again.')}
                        {strictVerificationMessage}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            ) : null}

            {/* ── CTA Button ── */}
            <TouchableOpacity
              style={[
                vStyles.ctaBtn,
                verificationSaving && vStyles.ctaBtnLoading,
              ]}
              onPress={() => void handleVerificationSubmit()}
              disabled={verificationSaving}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={verificationSaving ? ['#94A3B8', '#94A3B8'] : ['#1E3A8A', '#2F56D4', '#4169E1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={vStyles.ctaBtnGradient}
              >
                {false && (verificationSaving ? (
                  <Text style={vStyles.ctaBtnText}>Checking your eligibility…</Text>
                ) : (
                  <Text style={vStyles.ctaBtnText}>Static Eligibility Check →</Text>
                ))}
                <Text style={vStyles.ctaBtnText}>
                  {verificationSaving ? 'Saving strict eligibility check...' : 'Save & Check Eligibility ->'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.sectionTitle}>Support</Text>
          <SettingRow
            icon={HelpCircle}
            title="Support center"
            subtitle="Help, contact details, and privacy policy"
            onPress={openSupport}
            isLast
          />
        </Card>

        <TouchableOpacity style={styles.logoutCard} onPress={logout} activeOpacity={0.85}>
          <LogOut size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const DocRequirementRow = ({
  state,
  label,
  hint,
  uploading,
  onUpload,
}: {
  state: DocumentRequirementState;
  label: string;
  hint: string;
  uploading?: boolean;
  onUpload: () => void;
}) => {
  const isVerified = state === 'verified';
  const hasDocument = state !== 'missing';
  const isRejected = state === 'rejected';
  const isUploaded = state === 'uploaded';

  const containerStyle = isVerified
    ? vStyles.docRowDone
    : isRejected
    ? vStyles.docRowRejected
    : isUploaded
    ? vStyles.docRowUploaded
    : vStyles.docRowMissing;
  const iconStyle = isVerified
    ? vStyles.docRowIconDone
    : isRejected
    ? vStyles.docRowIconRejected
    : isUploaded
    ? vStyles.docRowIconUploaded
    : vStyles.docRowIconMissing;
  const labelStyle = isVerified
    ? vStyles.docRowLabelDone
    : isRejected
    ? vStyles.docRowLabelRejected
    : isUploaded
    ? vStyles.docRowLabelUploaded
    : null;
  const statusText = isVerified
    ? 'Verified'
    : isRejected
    ? 'Rejected'
    : isUploaded
    ? 'Uploaded'
    : 'Required';
  const statusStyle = isVerified
    ? vStyles.docStatusVerified
    : isRejected
    ? vStyles.docStatusRejected
    : isUploaded
    ? vStyles.docStatusUploaded
    : vStyles.docStatusMissing;

  return (
    <View style={[vStyles.docRow, containerStyle]}>
      <View style={[vStyles.docRowIcon, iconStyle]}>
        {isRejected ? (
          <XCircle size={16} color="#B91C1C" strokeWidth={2.5} />
        ) : hasDocument ? (
          <CheckCircle2
            size={16}
            color={isVerified ? '#065F46' : '#1D4ED8'}
            strokeWidth={2.5}
          />
        ) : (
          <Upload size={16} color="#92400E" strokeWidth={2.4} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={vStyles.docRowTop}>
          <Text style={[vStyles.docRowLabel, labelStyle]}>{label}</Text>
          <View style={[vStyles.docStatusPill, statusStyle]}>
            <Text style={vStyles.docStatusText}>{statusText}</Text>
          </View>
        </View>
        <Text style={vStyles.docRowHint}>{hint}</Text>
      </View>
      <TouchableOpacity
        style={[vStyles.uploadBtn, uploading && vStyles.uploadBtnDisabled]}
        onPress={onUpload}
        activeOpacity={0.88}
        disabled={uploading}
      >
        <Text style={vStyles.uploadBtnText}>
          {uploading ? 'Uploading...' : hasDocument ? 'Edit' : 'Upload'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const vStyles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, paddingBottom: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textLight, marginTop: 1 },
  statusPill: {
    borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  // Step progress
  stepsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    position: 'relative',
  },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  stepDotDone: { backgroundColor: colors.success },
  stepDotPending: { backgroundColor: '#E2E8F0', borderWidth: 1.5, borderColor: '#CBD5E1' },
  stepDotNum: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  stepLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  stepLabelDone: { color: colors.success, fontWeight: '700' },
  stepLine: {
    position: 'absolute', top: 13, left: '50%', right: '-50%',
    height: 2, backgroundColor: '#E2E8F0', zIndex: -1,
  },
  stepLineDone: { backgroundColor: colors.success },

  // Section
  section: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: spacing.md,
  },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 3 },
  sectionHint: { fontSize: 12, color: colors.textLight, marginBottom: spacing.md, lineHeight: 17 },
  errorText: { fontSize: 12, color: colors.danger, fontWeight: '600', marginBottom: spacing.sm },

  // Doc rows
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1,
  },
  docRowDone: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  docRowUploaded: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
  docRowRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  docRowMissing: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  docRowIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  docRowIconDone: { backgroundColor: '#DCFCE7' },
  docRowIconUploaded: { backgroundColor: '#DBEAFE' },
  docRowIconRejected: { backgroundColor: '#FEE2E2' },
  docRowIconMissing: { backgroundColor: '#FEF3C7' },
  docRowLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  docRowLabelDone: { color: '#065F46' },
  docRowLabelUploaded: { color: '#1D4ED8' },
  docRowLabelRejected: { color: '#B91C1C' },
  docRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  docRowHint: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  docStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  docStatusVerified: { backgroundColor: '#DCFCE7' },
  docStatusUploaded: { backgroundColor: '#DBEAFE' },
  docStatusRejected: { backgroundColor: '#FEE2E2' },
  docStatusMissing: { backgroundColor: '#FEF3C7' },
  docStatusText: { fontSize: 10, fontWeight: '800', color: colors.text },
  uploadBtn: {
    backgroundColor: colors.primary, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  uploadBtnDisabled: { opacity: 0.65 },
  uploadBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  docCenterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primarySoft, borderRadius: 10,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    alignSelf: 'flex-start', marginTop: spacing.xs,
  },
  docCenterBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },

  // Employment cards
  empGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empCard: {
    width: '47%', borderRadius: 14, padding: spacing.sm,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FAFCFF', position: 'relative',
  },
  empCardActive: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  empCardWarning: { borderColor: colors.warning, backgroundColor: '#FFFBEB' },
  empIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F1F5F9', alignItems: 'center',
    justifyContent: 'center', marginBottom: 6,
  },
  empIconWrapActive: { backgroundColor: colors.primary },
  empIconWrapWarning: { backgroundColor: colors.warning },
  empLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  empLabelActive: { color: colors.primaryDark },
  empHint: { fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  empCheck: { position: 'absolute', top: 8, right: 8 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: spacing.sm,
    borderWidth: 1, borderColor: '#FCD34D', marginTop: spacing.sm,
  },
  warningText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Currency inputs
  inputGroup: { marginBottom: spacing.md },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  currencyInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FCFF', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DCE6FF',
    paddingHorizontal: spacing.sm, height: 50,
  },
  currencyInputError: { borderColor: colors.danger, backgroundColor: '#FFF5F5' },
  currencyInputSuccess: { borderColor: colors.success, backgroundColor: '#F0FDF4' },
  currencySymbol: { fontSize: 16, fontWeight: '700', color: colors.textLight, marginRight: 6 },
  currencyField: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  inputHint: { fontSize: 11, color: colors.textMuted, marginTop: 5, lineHeight: 15 },

  // Income meter
  meterWrap: { marginTop: spacing.xs },
  meterTrack: {
    height: 6, borderRadius: 3,
    backgroundColor: '#E2E8F0', overflow: 'hidden', marginBottom: 4,
  },
  meterFill: { height: '100%', borderRadius: 3 },
  meterLabel: { fontSize: 11, color: colors.textLight, fontWeight: '600' },

  // DTI banner
  dtiBanner: {
    borderRadius: 14, padding: spacing.md,
    borderWidth: 1, marginBottom: spacing.sm,
  },
  dtiBannerGood: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  dtiBannerBad: { backgroundColor: '#FFF5F5', borderColor: '#FECACA' },
  dtiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dtiLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  dtiValue: { fontSize: 16, fontWeight: '900' },
  dtiTrack: {
    height: 8, borderRadius: 4,
    backgroundColor: '#E2E8F0', overflow: 'hidden',
    marginBottom: 8, position: 'relative',
  },
  dtiFill: { height: '100%', borderRadius: 4 },
  dtiMarker: {
    position: 'absolute', top: 0, bottom: 0,
    left: '45%', width: 2, backgroundColor: '#94A3B8',
  },
  dtiFeedback: { fontSize: 12, lineHeight: 17, fontWeight: '600' },

  // Result banner
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: 14, padding: spacing.md,
    borderWidth: 1, marginBottom: spacing.md,
  },
  resultBannerGood: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  resultBannerBad: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  resultEmoji: { fontSize: 28 },
  resultText: { flex: 1 },
  resultTitle: { fontSize: 15, fontWeight: '800', color: '#065F46', marginBottom: 2 },
  resultSub: { fontSize: 12, color: '#047857', lineHeight: 17 },

  // CTA
  ctaBtn: { borderRadius: 14, overflow: 'hidden', marginHorizontal: spacing.md, marginBottom: spacing.md },
  ctaBtnLoading: { opacity: 0.75 },
  ctaBtnDisabled: { opacity: 0.55 },
  ctaBtnGradient: { height: 52, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4FBFF',
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + spacing.sm,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
  },
  heroCompact: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg + spacing.xs,
  },
  heroTight: {
    paddingHorizontal: spacing.sm + 2,
  },
  heroOrbLarge: {
    position: 'absolute',
    top: -38,
    right: -28,
    width: 164,
    height: 164,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroOrbSmall: {
    position: 'absolute',
    left: -26,
    bottom: 34,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heroTopRowCompact: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  heroHeading: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroTitleRowCompact: {
    gap: spacing.xs,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroEyebrowCompact: {
    fontSize: 11,
    letterSpacing: 0.9,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroTitleCompact: {
    fontSize: 24,
    lineHeight: 28,
  },
  heroTitleTight: {
    fontSize: 22,
    lineHeight: 26,
  },
  rolePill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rolePillCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  rolePillInline: {
    alignSelf: 'center',
  },
  rolePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  rolePillTextInline: {
    letterSpacing: 0.3,
  },
  rolePillTextCompact: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  avatarRowCompact: {
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  avatarFrame: {
    width: 92,
    height: 92,
    borderRadius: 999,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  avatarFrameCompact: {
    width: 76,
    height: 76,
    padding: 3,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#E9EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#D8F0FF',
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  avatarTextCompact: {
    fontSize: 24,
  },
  heroIdentity: {
    flex: 1,
  },
  heroIdentityCompact: {
    paddingTop: 2,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroActionRowCompact: {
    marginTop: spacing.xs,
  },
  heroActionRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  editAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    flex: 1,
  },
  editAvatarButtonCompact: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  editAvatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  removeAvatarButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  removeAvatarButtonCompact: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  removeAvatarButtonStacked: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  removeAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  actionButtonDisabled: {
    opacity: 0.72,
  },
  photoHint: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    marginTop: spacing.sm,
  },
  photoHintCompact: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  userNameCompact: {
    fontSize: 18,
  },
  userMeta: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    marginTop: 2,
  },
  userMetaCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
  content: {
    paddingHorizontal: spacing.md,
    marginTop: -spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  helperText: {
    fontSize: 13,
    color: colors.textLight,
    marginBottom: spacing.sm,
  },
  helperError: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  networkCard: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  networkTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9A3412',
  },
  networkText: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 18,
    color: '#C2410C',
  },
  statusCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusHeadline: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#D9EDF7',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  progressCaption: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: -spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textLight,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  linkButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
  },
  settingRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  settingIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  settingSubtitle: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 2,
  },
  settingValue: {
    fontSize: 13,
    color: colors.textLight,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  verificationCard: {
    marginTop: spacing.sm,
  },
  verificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  requirementText: {
    fontSize: 13,
    color: colors.textLight,
    flex: 1,
  },
  docCenterLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  docCenterLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: '#FFFFFF',
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  typeChipText: {
    color: colors.textLight,
    fontSize: 12,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  ratioText: {
    fontSize: 12,
    color: colors.textLight,
    marginBottom: spacing.sm,
  },
  criteriaText: {
    fontSize: 12,
    color: colors.textLight,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  logoutCard: {
    marginTop: spacing.sm,
    backgroundColor: '#FFE4E6',
    borderRadius: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 15,
  },
});

