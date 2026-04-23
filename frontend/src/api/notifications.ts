import { AppNotification } from '../../types';
import { apiRequest } from './client';
import { extractCollection, type ApiListPayload } from './collections';

type BackendNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: 'system' | 'loan' | 'payment' | 'document';
  is_read: boolean;
  created_at: string;
};

type BackendNotificationCollection = ApiListPayload<BackendNotification>;

const toDate = (value: string) => {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const mapNotification = (item: BackendNotification): AppNotification => ({
  id: String(item.id),
  userId: '',
  title: item.title,
  message: item.message,
  createdAt: toDate(item.created_at),
  read: item.is_read,
  type: item.notification_type,
});

export const fetchBorrowerNotifications = async (): Promise<AppNotification[]> => {
  const payload = await apiRequest<BackendNotificationCollection>('/borrower/notifications/', {
    requireAuth: true,
  });

  return extractCollection(payload).map(mapNotification);
};

export const markBorrowerNotificationRead = async (notificationId: string): Promise<void> => {
  await apiRequest(`/borrower/notifications/${notificationId}/read/`, {
    method: 'POST',
    requireAuth: true,
  });
};
