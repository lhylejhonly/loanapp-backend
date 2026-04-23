import { apiRequest } from './client';
import { Payment, AppNotification } from '../../types';
import { extractCollection, type ApiListPayload } from './collections';
import { toAbsoluteAssetUrl } from './auth';

type BackendPayment = {
  id: number;
  loan: number;
  loan_status?: string;
  borrower: number;
  borrower_name: string;
  borrower_profile_photo_url?: string | null;
  amount: string | number;
  date: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  payment_method?: 'cash' | 'bank_transfer' | 'gcash' | 'maya';
  payment_reference?: string;
  note?: string;
  created_at: string;
};

type BackendNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: 'system' | 'loan' | 'payment' | 'document';
  is_read: boolean;
  created_at: string;
};

type BackendPaymentCollection = ApiListPayload<BackendPayment>;
type BackendNotificationCollection = ApiListPayload<BackendNotification>;

const toNumber = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: string) => {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const mapPayment = (item: BackendPayment): Payment => ({
  id: String(item.id),
  loanId: String(item.loan),
  borrowerId: String(item.borrower),
  borrowerName: item.borrower_name,
  borrowerPhotoUrl: toAbsoluteAssetUrl(item.borrower_profile_photo_url),
  amount: toNumber(item.amount),
  date: toDate(item.date),
  recordedByOfficerId: item.recorded_by ? String(item.recorded_by) : undefined,
  paymentMethod: item.payment_method,
  paymentReference: item.payment_reference?.trim() ? item.payment_reference : undefined,
  note: item.note,
});

const mapNotification = (item: BackendNotification): AppNotification => ({
  id: String(item.id),
  userId: '', // Will be set by context
  title: item.title,
  message: item.message,
  type: item.notification_type,
  read: item.is_read,
  createdAt: toDate(item.created_at),
});

export const fetchBorrowerPayments = async (): Promise<Payment[]> => {
  const payload = await apiRequest<BackendPaymentCollection>('/borrower/payments/', { requireAuth: true });
  return extractCollection(payload).map(mapPayment);
};

export const fetchBorrowerNotifications = async (): Promise<AppNotification[]> => {
  const payload = await apiRequest<BackendNotificationCollection>('/borrower/notifications/', { requireAuth: true });
  return extractCollection(payload).map(mapNotification);
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  await apiRequest(`/borrower/notifications/${notificationId}/read/`, {
    method: 'POST',
    requireAuth: true,
  });
};
