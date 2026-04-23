import { Platform } from 'react-native';
import { PaymentMethod, PaymentSubmission, PaymentSubmissionStatus } from '../../types';
import { toAbsoluteAssetUrl } from './auth';
import { apiRequest } from './client';
import { extractCollection, type ApiListPayload } from './collections';

type PaymentProofUploadFile = {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
};

type BackendPaymentSubmission = {
  id: number;
  loan: number;
  loan_status?: 'pending' | 'approved' | 'rejected';
  loan_type_name?: string;
  borrower: number;
  borrower_name?: string;
  borrower_profile_photo_url?: string | null;
  amount: string | number;
  payment_method?: PaymentMethod;
  payment_reference?: string;
  note?: string;
  proof_file_name?: string;
  proof_file_url?: string | null;
  status: PaymentSubmissionStatus;
  rejection_reason?: string | null;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  approved_payment_id?: number | null;
  submitted_at: string;
};

type BackendPaymentSubmissionCollection = ApiListPayload<BackendPaymentSubmission>;

const toNumber = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value?: string | null) => {
  if (!value) return undefined;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const inferMimeTypeFromFileName = (fileName?: string | null) => {
  const normalizedFileName = fileName?.trim().toLowerCase() ?? '';
  if (normalizedFileName.endsWith('.pdf')) return 'application/pdf';
  if (normalizedFileName.endsWith('.png')) return 'image/png';
  if (normalizedFileName.endsWith('.webp')) return 'image/webp';
  if (normalizedFileName.endsWith('.heic')) return 'image/heic';
  if (normalizedFileName.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
};

const inferExtensionFromMimeType = (mimeType: string) => {
  switch (mimeType.trim().toLowerCase()) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'jpg';
  }
};

const resolveWebUploadPayload = async (uploadFile: PaymentProofUploadFile): Promise<Blob | PaymentProofUploadFile> => {
  if (uploadFile.file) return uploadFile.file;

  const uri = uploadFile.uri?.trim();
  if (!uri) return uploadFile;

  const canFetchBlob = typeof fetch === 'function' && /^(blob:|data:|https?:)/i.test(uri);
  if (canFetchBlob) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to read the selected proof file before upload (HTTP ${response.status}).`);
    }
    return await response.blob();
  }

  return uploadFile;
};

const mapPaymentSubmission = (item: BackendPaymentSubmission): PaymentSubmission => ({
  id: String(item.id),
  loanId: String(item.loan),
  borrowerId: String(item.borrower),
  borrowerName: item.borrower_name,
  borrowerPhotoUrl: toAbsoluteAssetUrl(item.borrower_profile_photo_url),
  loanTypeName: item.loan_type_name?.trim() ? item.loan_type_name : undefined,
  amount: toNumber(item.amount),
  paymentMethod: item.payment_method,
  paymentReference: item.payment_reference?.trim() ? item.payment_reference : undefined,
  note: item.note?.trim() ? item.note : undefined,
  proofFileName: item.proof_file_name?.trim() ? item.proof_file_name : undefined,
  proofFileUrl: toAbsoluteAssetUrl(item.proof_file_url),
  status: item.status,
  rejectionReason: item.rejection_reason?.trim() ? item.rejection_reason : undefined,
  reviewedByOfficerId: item.reviewed_by ? String(item.reviewed_by) : undefined,
  reviewedByOfficerName: item.reviewed_by_name?.trim() ? item.reviewed_by_name : undefined,
  reviewedAt: toDate(item.reviewed_at),
  approvedPaymentId: item.approved_payment_id ? String(item.approved_payment_id) : undefined,
  submittedAt: toDate(item.submitted_at) ?? '',
  loanStatus: item.loan_status,
});

export const fetchBorrowerPaymentSubmissions = async (loanId?: string): Promise<PaymentSubmission[]> => {
  const payload = await apiRequest<BackendPaymentSubmissionCollection>('/borrower/payment-submissions/', {
    requireAuth: true,
    params: loanId ? { loan_id: loanId } : undefined,
  });
  return extractCollection(payload).map(mapPaymentSubmission);
};

export const submitBorrowerPaymentSubmission = async (payload: {
  loanId: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  note?: string;
  proof?: {
    uri: string;
    name?: string;
    type?: string;
    file?: Blob;
  };
}): Promise<PaymentSubmission> => {
  if (payload.proof?.uri?.trim()) {
    const proofUri = payload.proof.uri.trim();
    const proofType =
      payload.proof.type?.trim() ||
      payload.proof.file?.type?.trim() ||
      inferMimeTypeFromFileName(payload.proof.name);
    const proofName =
      payload.proof.name?.trim() ||
      `payment-proof-${Date.now()}.${inferExtensionFromMimeType(proofType)}`;

    const formData = new FormData();
    formData.append('loan_id', payload.loanId);
    formData.append('amount', String(payload.amount));
    formData.append('payment_method', payload.paymentMethod ?? 'cash');
    if (payload.paymentReference?.trim()) {
      formData.append('payment_reference', payload.paymentReference.trim());
    }
    if (payload.note?.trim()) {
      formData.append('note', payload.note.trim());
    }
    formData.append('proof_file_name', proofName);

    const uploadFile: PaymentProofUploadFile = {
      uri: proofUri,
      name: proofName,
      type: proofType,
      ...(payload.proof.file ? { file: payload.proof.file } : {}),
    };

    if (Platform.OS === 'web') {
      const uploadPayload = await resolveWebUploadPayload(uploadFile);
      if (uploadPayload instanceof Blob) {
        formData.append('proof_file', uploadPayload, uploadFile.name);
      } else {
        formData.append('proof_file', uploadPayload as unknown as Blob);
      }
    } else {
      formData.append('proof_file', {
        uri: proofUri,
        name: proofName,
        type: proofType,
      } as unknown as Blob);
    }

    const response = await apiRequest<BackendPaymentSubmission>('/borrower/payment-submissions/', {
      method: 'POST',
      requireAuth: true,
      body: formData,
    });
    return mapPaymentSubmission(response);
  }

  const response = await apiRequest<BackendPaymentSubmission>('/borrower/payment-submissions/', {
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
  return mapPaymentSubmission(response);
};

export const fetchOfficerPaymentSubmissions = async (filters?: {
  status?: PaymentSubmissionStatus;
  loanId?: string;
  borrowerId?: string;
}): Promise<PaymentSubmission[]> => {
  const payload = await apiRequest<BackendPaymentSubmissionCollection>('/officer/payment-submissions/', {
    requireAuth: true,
    params: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.loanId ? { loan_id: filters.loanId } : {}),
      ...(filters?.borrowerId ? { borrower_id: filters.borrowerId } : {}),
    },
  });
  return extractCollection(payload).map(mapPaymentSubmission);
};

export const approveOfficerPaymentSubmission = async (submissionId: string): Promise<PaymentSubmission> => {
  const response = await apiRequest<BackendPaymentSubmission>(`/officer/payment-submissions/${submissionId}/approve/`, {
    method: 'POST',
    requireAuth: true,
  });
  return mapPaymentSubmission(response);
};

export const rejectOfficerPaymentSubmission = async (
  submissionId: string,
  rejectionReason?: string
): Promise<PaymentSubmission> => {
  const response = await apiRequest<BackendPaymentSubmission>(`/officer/payment-submissions/${submissionId}/reject/`, {
    method: 'POST',
    requireAuth: true,
    data: rejectionReason?.trim() ? { rejection_reason: rejectionReason.trim() } : {},
  });
  return mapPaymentSubmission(response);
};
