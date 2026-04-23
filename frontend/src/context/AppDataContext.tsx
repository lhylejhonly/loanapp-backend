import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AppNotification,
  AppUserRecord,
  BorrowerDocument,
  DocumentType,
  EmploymentStatus,
  Loan,
  LoanType,
  Payment,
  User,
  UserRole,
  VerificationStatus,
} from '../../types';
import { API_BASE_URL } from '../api/config';
import { fetchLoanTypes } from '../api/loans';

type ApplyLoanPayload = {
  borrowerId: string;
  loanTypeId: string;
  amount: number;
  termMonths: number;
};

type DecideLoanPayload = {
  loanId: string;
  officerId: string;
  approve: boolean;
  interestRate: number;
  rejectionReason?: string;
};

type RecordPaymentPayload = {
  loanId: string;
  amount: number;
  officerId: string;
  note?: string;
};

type AddLoanTypePayload = {
  name: string;
  minAmount: number;
  maxAmount: number;
  baseInterestRate: number;
  termsInMonths: number[];
};

type UpdateBorrowerVerificationPayload = {
  borrowerId: string;
  employmentStatus: EmploymentStatus;
  monthlyIncome: number;
  monthlyDebt: number;
};

type UpdateBorrowerContactPayload = {
  borrowerId: string;
  phoneNumber: string;
  smsNotificationsEnabled: boolean;
};

type AppDataContextType = {
  users: User[];
  loans: Loan[];
  payments: Payment[];
  documents: BorrowerDocument[];
  notifications: AppNotification[];
  loanTypes: LoanType[];
  registerBorrower: (
    name: string,
    email: string,
    password: string,
    phoneNumber: string,
    smsNotificationsEnabled: boolean
  ) => Promise<User>;
  authenticate: (email: string, password: string) => Promise<User>;
  getUserById: (userId: string) => User | undefined;
  applyLoan: (payload: ApplyLoanPayload) => Promise<Loan>;
  decideLoan: (payload: DecideLoanPayload) => void;
  recordPayment: (payload: RecordPaymentPayload) => void;
  uploadDocument: (borrowerId: string, type: DocumentType, fileName: string) => Promise<BorrowerDocument>;
  markNotificationRead: (notificationId: string) => void;
  toggleBorrowerStatus: (borrowerId: string) => void;
  updateUserRole: (userId: string, role: UserRole) => void;
  addLoanType: (payload: AddLoanTypePayload) => void;
  toggleLoanType: (loanTypeId: string) => void;
  updateBorrowerVerification: (payload: UpdateBorrowerVerificationPayload) => User;
  updateBorrowerContact: (payload: UpdateBorrowerContactPayload) => User;
  syncUserFromAuth: (user: User) => void;
};

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

const API_URL = API_BASE_URL;

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const today = () => new Date().toISOString().split('T')[0];
const MIN_MONTHLY_INCOME = 1200;
const MAX_DEBT_TO_INCOME = 0.45;

const normalizePhoneNumber = (value: string) => value.replace(/[^+\d]/g, '');

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const maskPhoneNumber = (value: string) => {
  const normalized = normalizePhoneNumber(value);
  const digits = digitsOnly(normalized);
  if (digits.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, normalized.length - 4)).replace(/\d/g, '*')}${normalized.slice(-4)}`;
};

const toPublicUser = (user: AppUserRecord): User => {
  const { password: _password, ...rest } = user;
  return rest;
};

const evaluateVerificationStatus = ({
  employmentStatus,
  monthlyIncome,
  monthlyDebt,
}: {
  employmentStatus: EmploymentStatus;
  monthlyIncome: number;
  monthlyDebt: number;
}) => {
  const debtToIncomeRatio = monthlyIncome <= 0 ? 1 : monthlyDebt / monthlyIncome;
  const employmentAllowed = employmentStatus !== 'unemployed';
  const qualified =
    monthlyIncome >= MIN_MONTHLY_INCOME &&
    debtToIncomeRatio <= MAX_DEBT_TO_INCOME &&
    employmentAllowed;

  const verificationStatus: VerificationStatus = qualified ? 'qualified' : 'not_qualified';

  return { verificationStatus, debtToIncomeRatio };
};

export const AppDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [userRecords, setUserRecords] = useState<AppUserRecord[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [documents, setDocuments] = useState<BorrowerDocument[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [token, setToken] = useState<string | null>(null);

  const users = useMemo(() => userRecords.map(toPublicUser), [userRecords]);

  // Fetch initial public data
  React.useEffect(() => {
    const fetchPublic = async () => {
      try {
        const types = await fetchLoanTypes();
        setLoanTypes(types);
      } catch {
        setLoanTypes([]);
      }
    };
    fetchPublic();
  }, []);

  // Helper to fetch protected data
  const fetchProtected = useCallback(async (endpoint: string) => {
    if (!token) return;
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) return res.json();
    throw new Error(`Failed to fetch ${endpoint}`);
  }, [token]);

  // Refresh user data when token changes
  React.useEffect(() => {
    if (token) {
      Promise.all([
        fetchProtected('/borrower/loans/').then(setLoans).catch(() => {}),
        fetchProtected('/borrower/payments/').then(setPayments).catch(() => {}),
        fetchProtected('/borrower/documents/').then(setDocuments).catch(() => {}),
        fetchProtected('/borrower/notifications/').then(setNotifications).catch(() => {}),
      ]);
    }
  }, [token, fetchProtected]);

  const syncUserFromAuth = useCallback((user: User) => {
    setUserRecords((prev) => {
      const existing = prev.find((record) => record.id === user.id);

      const nextRecord: AppUserRecord = {
        id: user.id,
        username: user.username ?? existing?.username ?? user.email.split('@')[0].toLowerCase(),
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profilePhotoUrl ?? existing?.profilePhotoUrl,
        phoneNumber: user.phoneNumber ?? existing?.phoneNumber ?? '',
        smsNotificationsEnabled:
          user.smsNotificationsEnabled ?? existing?.smsNotificationsEnabled ?? false,
        gcashAccountName: user.gcashAccountName ?? existing?.gcashAccountName ?? '',
        gcashAccountNumber: user.gcashAccountNumber ?? existing?.gcashAccountNumber ?? '',
        password: existing?.password ?? '__external_auth__',
        role: user.role,
        active: user.active,
        createdAt: user.createdAt || existing?.createdAt || today(),
        verificationStatus: user.verificationStatus ?? existing?.verificationStatus,
        verificationUpdatedAt: user.verificationUpdatedAt ?? existing?.verificationUpdatedAt,
        employmentStatus: user.employmentStatus ?? existing?.employmentStatus,
        monthlyIncome: user.monthlyIncome ?? existing?.monthlyIncome,
        monthlyDebt: user.monthlyDebt ?? existing?.monthlyDebt,
        approvalStatus: user.approvalStatus ?? existing?.approvalStatus,
        approvedAt: user.approvedAt ?? existing?.approvedAt,
        approvedByName: user.approvedByName ?? existing?.approvedByName,
        isSuperuser: user.isSuperuser ?? existing?.isSuperuser,
      };

      if (existing) {
        return prev.map((record) => (record.id === user.id ? nextRecord : record));
      }

      return [nextRecord, ...prev];
    });
  }, []);

  const addNotification = (
    userId: string,
    title: string,
    message: string,
    type: AppNotification['type'],
    options?: {
      sendSms?: boolean;
      userRecord?: AppUserRecord;
    }
  ) => {
    const createdAt = today();
    const targetUser =
      options?.userRecord ?? userRecords.find((record) => record.id === userId);
    const canSendSms =
      type !== 'sms' &&
      (options?.sendSms ?? true) &&
      !!targetUser?.smsNotificationsEnabled &&
      !!targetUser?.phoneNumber;

    const nextNotifications: AppNotification[] = [
      {
        id: makeId('notif'),
        userId,
        title,
        message,
        createdAt,
        read: false,
        type,
      },
    ];

    if (canSendSms && targetUser?.phoneNumber) {
      nextNotifications.unshift({
        id: makeId('notif'),
        userId,
        title: 'SMS Alert Sent',
        message: `SMS to ${maskPhoneNumber(targetUser.phoneNumber)}: ${title}`,
        createdAt,
        read: false,
        type: 'sms',
      });
    }

    setNotifications((prev) => [...nextNotifications, ...prev]);
  };

  const registerBorrower = async (
    name: string,
    email: string,
    password: string,
    phoneNumber: string,
    smsNotificationsEnabled: boolean
  ) => {
    const response = await fetch(`${API_URL}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password,
        phone_number: phoneNumber,
      smsNotificationsEnabled,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Registration failed');
    }
    
    const data = await response.json();
    setToken(data.access);
    syncUserFromAuth(data.user);
    return data.user;
  };

  const authenticate = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Invalid email or password.');
    }

    const data = await response.json();
    setToken(data.access); // In prod, store this in SecureStore
    syncUserFromAuth(data.user);
    return data.user;
  };

  const getUserById = (userId: string) => users.find((user) => user.id === userId);

  const updateBorrowerContact = ({
    borrowerId,
    phoneNumber,
    smsNotificationsEnabled,
  }: UpdateBorrowerContactPayload) => {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const phoneDigits = digitsOnly(normalizedPhone);

    if (!normalizedPhone || phoneDigits.length < 10) {
      throw new Error('Please enter a valid phone number.');
    }
    if (smsNotificationsEnabled && !normalizedPhone) {
      throw new Error('Phone number is required for SMS notifications.');
    }

    let updatedUser: User | undefined;

    setUserRecords((prev) =>
      prev.map((record) => {
        if (record.id !== borrowerId || record.role !== 'borrower') {
          return record;
        }

        const nextRecord: AppUserRecord = {
          ...record,
          phoneNumber: normalizedPhone,
          smsNotificationsEnabled,
        };
        updatedUser = toPublicUser(nextRecord);
        return nextRecord;
      })
    );

    if (!updatedUser) {
      throw new Error('Borrower account not found.');
    }

    addNotification(
      borrowerId,
      'Contact Updated',
      smsNotificationsEnabled
        ? `SMS alerts are enabled for ${maskPhoneNumber(normalizedPhone)}.`
        : 'SMS alerts are disabled. In-app notifications remain active.',
      'system',
      { sendSms: false }
    );

    return updatedUser;
  };

  const updateBorrowerVerification = ({
    borrowerId,
    employmentStatus,
    monthlyIncome,
    monthlyDebt,
  }: UpdateBorrowerVerificationPayload) => {
    if (monthlyIncome <= 0) {
      throw new Error('Monthly income must be greater than zero.');
    }
    if (monthlyDebt < 0) {
      throw new Error('Monthly debt cannot be negative.');
    }

    const normalizedIncome = Number(monthlyIncome.toFixed(2));
    const normalizedDebt = Number(monthlyDebt.toFixed(2));
    const { verificationStatus, debtToIncomeRatio } = evaluateVerificationStatus({
      employmentStatus,
      monthlyIncome: normalizedIncome,
      monthlyDebt: normalizedDebt,
    });

    let updatedUser: User | undefined;

    setUserRecords((prev) =>
      prev.map((record) => {
        if (record.id !== borrowerId || record.role !== 'borrower') {
          return record;
        }

        const nextRecord: AppUserRecord = {
          ...record,
          employmentStatus,
          monthlyIncome: normalizedIncome,
          monthlyDebt: normalizedDebt,
          verificationStatus,
          verificationUpdatedAt: today(),
        };

        updatedUser = toPublicUser(nextRecord);
        return nextRecord;
      })
    );

    if (!updatedUser) {
      throw new Error('Borrower account not found.');
    }

    addNotification(
      borrowerId,
      verificationStatus === 'qualified' ? 'Verification Qualified' : 'Verification Needs Improvement',
      verificationStatus === 'qualified'
        ? `You are qualified to apply. Debt-to-income ratio: ${(debtToIncomeRatio * 100).toFixed(1)}%.`
        : `You are not yet qualified. Income must be at least PHP ${MIN_MONTHLY_INCOME.toLocaleString()} and debt-to-income ratio must be ${Math.round(MAX_DEBT_TO_INCOME * 100)}% or less.`,
      'system'
    );

    return updatedUser;
  };

  const applyLoan = async ({ borrowerId, loanTypeId, amount, termMonths }: ApplyLoanPayload) => {
    if (!token) throw new Error('You must be logged in to apply.');

    const response = await fetch(`${API_URL}/borrower/loans/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        loan_type_id: loanTypeId,
        amount,
        term_months: termMonths
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Loan application failed.');
    }

    const newLoan = await response.json();
    setLoans((prev) => [newLoan, ...prev]);
    return newLoan;
  };

  const decideLoan = ({
    loanId,
    officerId,
    approve,
    interestRate,
    rejectionReason,
  }: DecideLoanPayload) => {
    const officer = users.find((user) => user.id === officerId && user.role === 'officer');
    if (!officer) {
      throw new Error('Officer account not found.');
    }

    let updatedLoan: Loan | undefined;

    setLoans((prev) =>
      prev.map((loan) => {
        if (loan.id !== loanId) {
          return loan;
        }

        updatedLoan = {
          ...loan,
          status: approve ? 'approved' : 'rejected',
          interestRate: approve ? interestRate : loan.interestRate,
          rejectionReason: approve ? undefined : rejectionReason || 'Application rejected.',
          reviewedByOfficerId: officerId,
          updatedAt: today(),
        };
        return updatedLoan;
      })
    );

    if (!updatedLoan) {
      throw new Error('Loan not found.');
    }

    addNotification(
      updatedLoan.borrowerId,
      approve ? 'Loan Approved' : 'Loan Rejected',
      approve
        ? `Your loan was approved at ${interestRate.toFixed(2)}% interest.`
        : `Your loan was rejected. ${updatedLoan.rejectionReason}`,
      'loan'
    );
  };

  const recordPayment = ({ loanId, amount, officerId, note }: RecordPaymentPayload) => {
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const officer = users.find((user) => user.id === officerId && user.role === 'officer');
    if (!officer) {
      throw new Error('Officer account not found.');
    }

    let borrowerId = '';
    let adjustedAmount = amount;

    setLoans((prev) =>
      prev.map((loan) => {
        if (loan.id !== loanId) {
          return loan;
        }
        if (loan.status !== 'approved') {
          throw new Error('Only approved loans can accept payments.');
        }
        borrowerId = loan.borrowerId;
        adjustedAmount = Math.min(amount, loan.balance);
        return {
          ...loan,
          balance: Number((loan.balance - adjustedAmount).toFixed(2)),
          updatedAt: today(),
        };
      })
    );

    if (!borrowerId) {
      throw new Error('Loan not found.');
    }

    const payment: Payment = {
      id: makeId('pay'),
      loanId,
      borrowerId,
      amount: adjustedAmount,
      date: today(),
      recordedByOfficerId: officerId,
      note: note?.trim() || undefined,
    };
    setPayments((prev) => [payment, ...prev]);

    addNotification(
      borrowerId,
      'Payment Received',
      `A payment of PHP ${adjustedAmount.toLocaleString()} was recorded by ${officer.name}.`,
      'payment'
    );
  };

  const uploadDocument = async (borrowerId: string, type: DocumentType, fileName: string) => {
    // For real upload, we normally use FormData with the file object.
    // This mock adaptation assumes metadata upload as per the current flow.
    if (!token) throw new Error("Not logged in");
    
    const response = await fetch(`${API_URL}/borrower/documents/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ type, file_name: fileName })
    });

    if (!response.ok) throw new Error("Document upload failed");
    
    const newDoc = await response.json();
    setDocuments((prev) => [newDoc, ...prev]);
    return newDoc;
  };

  const markNotificationRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      )
    );
  };

  const toggleBorrowerStatus = (borrowerId: string) => {
    let nextStatus: boolean | undefined;

    setUserRecords((prev) =>
      prev.map((record) => {
        if (record.id !== borrowerId || record.role !== 'borrower') {
          return record;
        }
        nextStatus = !record.active;
        return { ...record, active: !record.active };
      })
    );

    if (nextStatus !== undefined) {
      addNotification(
        borrowerId,
        nextStatus ? 'Account Activated' : 'Account Deactivated',
        nextStatus
          ? 'Your borrower account is active again.'
          : 'Your borrower account was temporarily deactivated.',
        'system'
      );
    }
  };

  const updateUserRole = (userId: string, role: UserRole) => {
    setUserRecords((prev) =>
      prev.map((record) => (record.id === userId ? { ...record, role } : record))
    );
  };

  const addLoanType = ({
    name,
    minAmount,
    maxAmount,
    baseInterestRate,
    termsInMonths,
  }: AddLoanTypePayload) => {
    if (!name.trim()) {
      throw new Error('Loan type name is required.');
    }
    if (minAmount <= 0 || maxAmount <= 0 || maxAmount < minAmount) {
      throw new Error('Invalid minimum or maximum amount.');
    }
    if (baseInterestRate <= 0) {
      throw new Error('Base interest rate should be positive.');
    }

    const uniqueTerms = Array.from(new Set(termsInMonths)).sort((a, b) => a - b);
    if (uniqueTerms.length === 0) {
      throw new Error('At least one term is required.');
    }

    setLoanTypes((prev) => [
      {
        id: makeId('lt'),
        name: name.trim(),
        minAmount,
        maxAmount,
        baseInterestRate,
        termsInMonths: uniqueTerms,
        requiredDocuments: [],
        active: true,
        createdAt: today(),
      },
      ...prev,
    ]);
  };

  const toggleLoanType = (loanTypeId: string) => {
    setLoanTypes((prev) =>
      prev.map((loanType) =>
        loanType.id === loanTypeId ? { ...loanType, active: !loanType.active } : loanType
      )
    );
  };

  const value: AppDataContextType = {
    users,
    loans,
    payments,
    documents,
    notifications,
    loanTypes,
    registerBorrower,
    authenticate,
    getUserById,
    applyLoan,
    decideLoan,
    recordPayment,
    uploadDocument,
    markNotificationRead,
    toggleBorrowerStatus,
    updateUserRole,
    updateBorrowerVerification,
    updateBorrowerContact,
    syncUserFromAuth,
    addLoanType,
    toggleLoanType,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return context;
};
