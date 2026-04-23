import { apiRequest } from './client';
import {
  DisbursementMethod,
  DocumentType,
  Loan,
  LoanApplicantCount,
  LoanApplicationPurpose,
  LoanRepaymentSummary,
  LoanType,
  Payment,
} from '../../types';
import { extractCollection, type ApiListPayload } from './collections';
import { toAbsoluteAssetUrl } from './auth';

export type BackendLoan = {
  id: number;
  borrower: number;
  borrower_name: string;
  borrower_email?: string;
  borrower_profile_photo_url?: string | null;
  loan_type: number;
  loan_type_name: string;
  amount: string | number;
  interest_rate: string | number;
  term_months: number;
  status: 'pending' | 'approved' | 'rejected';
  balance: string | number;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
  rejection_reason?: string;
  application_purpose?: LoanApplicationPurpose;
  applicant_count?: LoanApplicantCount;
  contact_email?: string;
  contact_phone_number?: string;
  disbursement_method?: 'bank_transfer' | 'gcash' | 'maya' | 'cash_pickup';
  disbursement_account_name?: string;
  disbursement_account_number?: string;
  disbursement_status?: 'pending' | 'processing' | 'disbursed' | 'failed' | 'reversed';
  disbursement_provider?: 'manual' | 'xendit';
  disbursement_reference?: string;
  disbursement_external_id?: string;
  disbursement_provider_status?: string;
  disbursement_failure_code?: string;
  disbursement_failure_message?: string;
  disbursement_requested_at?: string | null;
  disbursed_at?: string | null;
  payments_count?: number;
  repayment_summary?: BackendLoanRepaymentSummary | null;
  created_at: string;
  updated_at: string;
};

type BackendLoanRepaymentSummary = {
  scheduled_installment_amount: string | number;
  paid_installments: number;
  remaining_installments: number;
  total_installments: number;
  repayment_start_date?: string | null;
  next_due_date?: string | null;
  maturity_date?: string | null;
  days_until_due?: number | null;
  is_overdue: boolean;
  overdue_installments: number;
};

type BackendLoanType = {
  id: number;
  name: string;
  min_amount: string | number;
  max_amount: string | number;
  base_interest_rate: string | number;
  terms_months: number[];
  required_documents: DocumentType[];
  is_active: boolean;
  created_at: string;
};

export type BackendPayment = {
  id: number;
  loan: number;
  loan_status?: 'pending' | 'approved' | 'rejected';
  borrower: number;
  borrower_name?: string;
  borrower_profile_photo_url?: string | null;
  amount: string | number;
  date: string;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
  payment_method?: 'cash' | 'bank_transfer' | 'gcash' | 'maya';
  payment_reference?: string;
  note?: string;
  created_at: string;
};

type BackendLoanCollection = ApiListPayload<BackendLoan>;
type BackendLoanTypeCollection = ApiListPayload<BackendLoanType>;

type AdminTransactionsResponse = {
  loans: BackendLoan[];
  payments: BackendPayment[];
};

const toNumber = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: string) => {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const mapRepaymentSummary = (item?: BackendLoanRepaymentSummary | null): LoanRepaymentSummary | undefined => {
  if (!item) {
    return undefined;
  }

  return {
    scheduledInstallmentAmount: toNumber(item.scheduled_installment_amount),
    paidInstallments: item.paid_installments,
    remainingInstallments: item.remaining_installments,
    totalInstallments: item.total_installments,
    repaymentStartDate: item.repayment_start_date ? toDate(item.repayment_start_date) : undefined,
    nextDueDate: item.next_due_date ? toDate(item.next_due_date) : undefined,
    maturityDate: item.maturity_date ? toDate(item.maturity_date) : undefined,
    daysUntilDue: typeof item.days_until_due === 'number' ? item.days_until_due : undefined,
    isOverdue: item.is_overdue,
    overdueInstallments: item.overdue_installments,
  };
};

export const mapLoan = (item: BackendLoan): Loan => ({
  id: String(item.id),
  borrowerId: String(item.borrower),
  borrowerName: item.borrower_name,
  borrowerEmail: item.borrower_email,
  borrowerPhotoUrl: toAbsoluteAssetUrl(item.borrower_profile_photo_url),
  loanTypeId: String(item.loan_type),
  loanTypeName: item.loan_type_name,
  amount: toNumber(item.amount),
  interestRate: toNumber(item.interest_rate),
  termMonths: item.term_months,
  status: item.status,
  balance: toNumber(item.balance),
  reviewedByOfficerId: item.reviewed_by ? String(item.reviewed_by) : undefined,
  rejectionReason: item.rejection_reason,
  applicationPurpose: item.application_purpose,
  applicantCount: item.applicant_count,
  contactEmail: item.contact_email?.trim() ? item.contact_email : undefined,
  contactPhoneNumber: item.contact_phone_number?.trim() ? item.contact_phone_number : undefined,
  disbursementMethod: item.disbursement_method,
  disbursementAccountName: item.disbursement_account_name?.trim() ? item.disbursement_account_name : undefined,
  disbursementAccountNumber: item.disbursement_account_number?.trim() ? item.disbursement_account_number : undefined,
  disbursementStatus: item.disbursement_status,
  disbursementProvider: item.disbursement_provider,
  disbursementReference: item.disbursement_reference?.trim() ? item.disbursement_reference : undefined,
  disbursementExternalId: item.disbursement_external_id?.trim() ? item.disbursement_external_id : undefined,
  disbursementProviderStatus: item.disbursement_provider_status?.trim() ? item.disbursement_provider_status : undefined,
  disbursementFailureCode: item.disbursement_failure_code?.trim() ? item.disbursement_failure_code : undefined,
  disbursementFailureMessage: item.disbursement_failure_message?.trim() ? item.disbursement_failure_message : undefined,
  disbursementRequestedAt: item.disbursement_requested_at ? toDate(item.disbursement_requested_at) : undefined,
  disbursedAt: item.disbursed_at ? toDate(item.disbursed_at) : undefined,
  paymentsCount: item.payments_count ?? 0,
  repaymentSummary: mapRepaymentSummary(item.repayment_summary),
  createdAt: toDate(item.created_at),
  updatedAt: toDate(item.updated_at),
  reviewedByName: item.reviewed_by_name ?? undefined,
});

const mapLoanType = (item: BackendLoanType): LoanType => ({
  id: String(item.id),
  name: item.name,
  minAmount: toNumber(item.min_amount),
  maxAmount: toNumber(item.max_amount),
  baseInterestRate: toNumber(item.base_interest_rate),
  termsInMonths: item.terms_months,
  requiredDocuments: item.required_documents ?? [],
  active: item.is_active,
  createdAt: toDate(item.created_at),
});

const normalizeLoanTypeCollection = (payload: BackendLoanTypeCollection) => {
  return extractCollection(payload).map(mapLoanType);
};

export const mapPayment = (item: BackendPayment): Payment => ({
  id: String(item.id),
  loanId: String(item.loan),
  borrowerId: String(item.borrower),
  borrowerName: item.borrower_name,
  borrowerPhotoUrl: toAbsoluteAssetUrl(item.borrower_profile_photo_url),
  amount: toNumber(item.amount),
  date: toDate(item.date),
  recordedByOfficerId: item.recorded_by ? String(item.recorded_by) : undefined,
  recordedByOfficerName: item.recorded_by_name ?? undefined,
  loanStatus: item.loan_status,
  paymentMethod: item.payment_method,
  paymentReference: item.payment_reference?.trim() ? item.payment_reference : undefined,
  note: item.note?.trim() ? item.note : undefined,
});

export const fetchBorrowerLoans = async (): Promise<Loan[]> => {
  const payload = await apiRequest<BackendLoanCollection>('/borrower/loans/', { requireAuth: true });
  return extractCollection(payload).map(mapLoan);
};

export const cancelBorrowerLoan = async (loanId: string): Promise<Loan> => {
  const payload = await apiRequest<BackendLoan>(`/borrower/loans/${loanId}/cancel/`, {
    method: 'POST',
    requireAuth: true,
  });
  return mapLoan(payload);
};

export const applyForLoan = async (
  loanTypeId: string,
  amount: number,
  termMonths: number,
  application?: {
    applicantName?: string;
    applicationPurpose?: LoanApplicationPurpose;
    applicantCount?: LoanApplicantCount;
    contactEmail?: string;
    contactPhoneNumber?: string;
  },
  disbursement?: {
    method?: DisbursementMethod;
    accountName?: string;
    accountNumber?: string;
  }
): Promise<Loan> => {
  const payload = await apiRequest('/borrower/loans/', {
    method: 'POST',
    requireAuth: true,
    data: {
      loan_type: Number(loanTypeId),
      amount,
      term_months: termMonths,
      ...(application?.applicantName?.trim() ? { applicant_name: application.applicantName.trim() } : {}),
      ...(application?.applicationPurpose ? { application_purpose: application.applicationPurpose } : {}),
      ...(application?.applicantCount ? { applicant_count: application.applicantCount } : {}),
      ...(application?.contactEmail?.trim()
        ? { contact_email: application.contactEmail.trim().toLowerCase() }
        : {}),
      ...(application?.contactPhoneNumber?.trim()
        ? { contact_phone_number: application.contactPhoneNumber.trim() }
        : {}),
      disbursement_method: disbursement?.method ?? 'gcash',
      ...(disbursement?.accountName?.trim()
        ? { disbursement_account_name: disbursement.accountName.trim() }
        : {}),
      ...(disbursement?.accountNumber?.trim()
        ? { disbursement_account_number: disbursement.accountNumber.trim() }
        : {}),
    },
  }) as BackendLoan;
  
  return mapLoan(payload);
};

export const fetchLoanTypes = async (): Promise<LoanType[]> => {
  const payload = await apiRequest('/public/loan-types/') as BackendLoanTypeCollection;

  return normalizeLoanTypeCollection(payload);
};

export const fetchAdminLoanTypes = async (): Promise<LoanType[]> => {
  const payload = await apiRequest('/admin/loan-types/', {
    requireAuth: true,
  }) as BackendLoanTypeCollection;

  return normalizeLoanTypeCollection(payload);
};

export const fetchAdminTransactions = async (): Promise<{
  loans: Loan[];
  payments: Payment[];
}> => {
  const payload = await apiRequest<AdminTransactionsResponse>('/admin/transactions/', {
    requireAuth: true,
  });

  return {
    loans: payload.loans.map(mapLoan),
    payments: payload.payments.map(mapPayment),
  };
};

export const submitAdminLoanDecision = async (
  loanId: string,
  payload: {
    approve: boolean;
    interestRate?: number;
    rejectionReason?: string;
  }
): Promise<Loan> => {
  const response = await apiRequest<BackendLoan>(`/admin/loans/${loanId}/decision/`, {
    method: 'POST',
    requireAuth: true,
    data: {
      approve: payload.approve,
      ...(payload.interestRate !== undefined ? { interest_rate: payload.interestRate } : {}),
      ...(payload.rejectionReason !== undefined
        ? { rejection_reason: payload.rejectionReason.trim() }
        : {}),
    },
  });

  return mapLoan(response);
};

export const createAdminLoanType = async ({
  name,
  minAmount,
  maxAmount,
  baseInterestRate,
  termsInMonths,
  requiredDocuments = [],
  active = true,
}: {
  name: string;
  minAmount: number;
  maxAmount: number;
  baseInterestRate: number;
  termsInMonths: number[];
  requiredDocuments?: DocumentType[];
  active?: boolean;
}): Promise<LoanType> => {
  const payload = await apiRequest('/admin/loan-types/', {
    method: 'POST',
    requireAuth: true,
    data: {
      name: name.trim(),
      min_amount: minAmount,
      max_amount: maxAmount,
      base_interest_rate: baseInterestRate,
      terms_months: termsInMonths,
      required_documents: requiredDocuments,
      is_active: active,
    },
  }) as BackendLoanType;

  return mapLoanType(payload);
};

export const updateAdminLoanType = async (
  loanTypeId: string,
  payload: {
    name?: string;
    minAmount?: number;
    maxAmount?: number;
    baseInterestRate?: number;
    termsInMonths?: number[];
    requiredDocuments?: DocumentType[];
    active?: boolean;
  }
): Promise<LoanType> => {
  const patchPayload: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    patchPayload.name = payload.name.trim();
  }
  if (payload.minAmount !== undefined) {
    patchPayload.min_amount = payload.minAmount;
  }
  if (payload.maxAmount !== undefined) {
    patchPayload.max_amount = payload.maxAmount;
  }
  if (payload.baseInterestRate !== undefined) {
    patchPayload.base_interest_rate = payload.baseInterestRate;
  }
  if (payload.termsInMonths !== undefined) {
    patchPayload.terms_months = payload.termsInMonths;
  }
  if (payload.requiredDocuments !== undefined) {
    patchPayload.required_documents = payload.requiredDocuments;
  }
  if (payload.active !== undefined) {
    patchPayload.is_active = payload.active;
  }

  const response = await apiRequest(`/admin/loan-types/${loanTypeId}/`, {
    method: 'PATCH',
    requireAuth: true,
    data: patchPayload,
  }) as BackendLoanType;

  return mapLoanType(response);
};
