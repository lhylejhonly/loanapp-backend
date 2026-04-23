import { User } from '../../types';
import { mapBackendUser, type BackendUser } from './auth';
import { apiRequest } from './client';
import { extractCollection, type ApiListPayload } from './collections';
import { type BackendLoan, type BackendPayment, mapLoan, mapPayment } from './loans';

type OfficerBorrowerEntry = {
  user: BackendUser;
  metrics: {
    pending_loans: number;
    approved_loans: number;
    outstanding_balance: string | number;
  };
};

type OfficerBorrowerApiResponse = ApiListPayload<OfficerBorrowerEntry>;
type BackendLoanCollection = ApiListPayload<BackendLoan>;
type BackendPaymentCollection = ApiListPayload<BackendPayment>;

type RecordPaymentResponse = BackendPayment;

const toNumber = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type OfficerBorrowerRecord = {
  user: User;
  metrics: {
    pendingLoans: number;
    approvedLoans: number;
    outstandingBalance: number;
  };
};

export const fetchOfficerApplications = async () => {
  const payload = await apiRequest<BackendLoanCollection>('/officer/applications/', {
    requireAuth: true,
  });

  return extractCollection(payload).map(mapLoan);
};

export const submitOfficerLoanDecision = async (
  loanId: string,
  payload: {
    approve: boolean;
    interestRate?: number;
    rejectionReason?: string;
  }
) => {
  const response = await apiRequest<BackendLoan>(`/officer/applications/${loanId}/decision/`, {
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

export const fetchOfficerBorrowers = async (): Promise<OfficerBorrowerRecord[]> => {
  const payload = await apiRequest<OfficerBorrowerApiResponse>('/officer/borrowers/', {
    requireAuth: true,
  });

  return extractCollection(payload).map((entry) => ({
    user: mapBackendUser(entry.user),
    metrics: {
      pendingLoans: entry.metrics.pending_loans,
      approvedLoans: entry.metrics.approved_loans,
      outstandingBalance: toNumber(entry.metrics.outstanding_balance),
    },
  }));
};

export const toggleOfficerBorrowerStatus = async (borrowerId: string) => {
  const payload = await apiRequest<{ borrower: BackendUser }>(`/officer/borrowers/${borrowerId}/toggle-active/`, {
    method: 'POST',
    requireAuth: true,
  });

  return mapBackendUser(payload.borrower);
};

export const fetchOfficerApprovedLoans = async () => {
  const payload = await apiRequest<BackendLoanCollection>('/officer/approved-loans/', {
    requireAuth: true,
  });

  return extractCollection(payload).map(mapLoan);
};

export const fetchOfficerPayments = async (loanId?: string) => {
  const payload = await apiRequest<BackendPaymentCollection>('/officer/payments/', {
    requireAuth: true,
    params: loanId ? { loan_id: loanId } : undefined,
  });

  return extractCollection(payload).map(mapPayment);
};

export const recordOfficerLoanDisbursement = async (payload: {
  loanId: string;
  disbursementReference?: string;
}) => {
  const response = await apiRequest<BackendLoan>('/officer/disbursements/record/', {
    method: 'POST',
    requireAuth: true,
    data: {
      loan_id: Number(payload.loanId),
      ...(payload.disbursementReference?.trim()
        ? { disbursement_reference: payload.disbursementReference.trim() }
        : {}),
    },
  });

  return mapLoan(response);
};

export const recordOfficerPayment = async (payload: {
  loanId: string;
  amount: number;
  paymentMethod?: 'cash' | 'bank_transfer' | 'gcash' | 'maya';
  paymentReference?: string;
  note?: string;
}) => {
  const response = await apiRequest<RecordPaymentResponse>('/officer/payments/record/', {
    method: 'POST',
    requireAuth: true,
    data: {
      loan_id: Number(payload.loanId),
      amount: payload.amount,
      ...(payload.paymentMethod ? { payment_method: payload.paymentMethod } : {}),
      ...(payload.paymentReference?.trim() ? { payment_reference: payload.paymentReference.trim() } : {}),
      ...(payload.note?.trim() ? { note: payload.note.trim() } : {}),
    },
  });

  return mapPayment(response);
};

type BackendDocumentEntry = {
  id: number;
  borrower: number;
  document_type: 'id' | 'income_proof' | 'government_id' | 'student_id' | 'business_permit' | 'business_owner_id' | 'proof_of_revenue';
  file_name: string;
  file?: string | null;
  file_url?: string | null;
  status: 'uploaded' | 'verified' | 'rejected';
  rejection_reason?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  uploaded_at: string;
};

export type OfficerDocument = {
  id: string;
  borrowerId: string;
  type: 'id' | 'income_proof' | 'government_id' | 'student_id' | 'business_permit' | 'business_owner_id' | 'proof_of_revenue';
  fileName: string;
  fileUrl?: string;
  status: 'uploaded' | 'verified' | 'rejected';
  rejectionReason?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  uploadedAt: string;
};

const mapOfficerDocument = (item: BackendDocumentEntry): OfficerDocument => ({
  id: String(item.id),
  borrowerId: String(item.borrower),
  type: item.document_type,
  fileName: item.file_name,
  fileUrl: item.file_url ?? item.file ?? undefined,
  status: item.status,
  rejectionReason: item.rejection_reason ?? undefined,
  verifiedByName: item.verified_by_name ?? undefined,
  verifiedAt: item.verified_at ?? undefined,
  uploadedAt: item.uploaded_at,
});

export const fetchOfficerBorrowerDocuments = async (borrowerId: string): Promise<OfficerDocument[]> => {
  const payload = await apiRequest<BackendDocumentEntry[]>(`/officer/borrowers/${borrowerId}/documents/`, {
    requireAuth: true,
  });
  return (Array.isArray(payload) ? payload : []).map(mapOfficerDocument);
};

export const verifyOfficerDocument = async (documentId: string): Promise<void> => {
  await apiRequest(`/officer/documents/${documentId}/verify/`, {
    method: 'POST',
    requireAuth: true,
  });
};

export const rejectOfficerDocument = async (documentId: string, rejectionReason?: string): Promise<void> => {
  await apiRequest(`/officer/documents/${documentId}/reject/`, {
    method: 'POST',
    requireAuth: true,
    data: { rejection_reason: rejectionReason?.trim() ?? '' },
  });
};

export const fetchOfficerBorrowerLoans = async (borrowerId: string) => {
  const payload = await apiRequest<BackendLoanCollection>(`/officer/borrowers/${borrowerId}/loans/`, {
    requireAuth: true,
  });
  return extractCollection(payload).map(mapLoan);
};

export const fetchOfficerBorrowerPayments = async (borrowerId: string) => {
  const payload = await apiRequest<BackendPaymentCollection>(`/officer/borrowers/${borrowerId}/payments/`, {
    requireAuth: true,
  });
  return extractCollection(payload).map(mapPayment);
};
