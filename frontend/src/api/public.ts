import { DocumentType, Loan, LoanStatus, LoanType, Payment } from '../../types';
import { apiRequest } from './client';

type PublicLoanTypeApiItem = {
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

type PublicOverviewApiResponse = {
  loan_types: PublicLoanTypeApiItem[];
  stats: {
    applications: number;
    pending: number;
    approved: number;
    rejected: number;
    approval_rate_percent: number;
    total_disbursed: string | number;
  };
  recent_approved_loans: Array<{
    id: number;
    borrower_alias: string;
    loan_type_id: number;
    loan_type_name: string;
    amount: string | number;
    interest_rate: string | number;
    term_months: number;
    status: string;
    balance: string | number;
    created_at: string;
    updated_at: string;
  }>;
  recent_payments: Array<{
    id: number;
    loan_id: number;
    amount: string | number;
    date: string;
  }>;
};

export type PublicOverviewData = {
  loanTypes: LoanType[];
  stats: {
    applications: number;
    pending: number;
    approved: number;
    rejected: number;
    approvalRatePercent: number;
    totalDisbursed: number;
  };
  recentLoans: Loan[];
  recentPayments: Payment[];
};

const toNumber = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: string) => {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const toLoanStatus = (value: string): LoanStatus => {
  if (value === 'pending' || value === 'rejected') {
    return value;
  }
  return 'approved';
};

const mapLoanType = (item: PublicLoanTypeApiItem): LoanType => ({
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

export const fetchPublicOverview = async (): Promise<PublicOverviewData> => {
  const payload = await apiRequest<PublicOverviewApiResponse>('/public/overview/');
  const loanTypes = payload.loan_types.map(mapLoanType);
  const recentLoans: Loan[] = payload.recent_approved_loans.map((item) => ({
    id: `public-loan-${item.id}`,
    borrowerId: `public-borrower-${item.id}`,
    borrowerName: item.borrower_alias,
    loanTypeId: String(item.loan_type_id),
    loanTypeName: item.loan_type_name,
    amount: toNumber(item.amount),
    interestRate: toNumber(item.interest_rate),
    termMonths: item.term_months,
    status: toLoanStatus(item.status),
    balance: toNumber(item.balance),
    createdAt: toDate(item.created_at),
    updatedAt: toDate(item.updated_at),
  }));

  const recentPayments: Payment[] = payload.recent_payments.map((item) => ({
    id: `public-payment-${item.id}`,
    loanId: `public-loan-${item.loan_id}`,
    borrowerId: 'public',
    amount: toNumber(item.amount),
    date: toDate(item.date),
    recordedByOfficerId: 'public',
  }));

  return {
    loanTypes,
    stats: {
      applications: payload.stats.applications ?? 0,
      pending: payload.stats.pending ?? 0,
      approved: payload.stats.approved ?? 0,
      rejected: payload.stats.rejected ?? 0,
      approvalRatePercent: payload.stats.approval_rate_percent ?? 0,
      totalDisbursed: toNumber(payload.stats.total_disbursed),
    },
    recentLoans,
    recentPayments,
  };
};
