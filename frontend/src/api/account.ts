import {
  BorrowerAccountRequest,
  BorrowerAccountRequestStatus,
  BorrowerAccountRequestType,
} from '../../types';
import { apiRequest } from './client';
import { extractCollection, type ApiListPayload } from './collections';

type BackendBorrowerAccountRequest = {
  id: number;
  request_type: BorrowerAccountRequestType;
  status: BorrowerAccountRequestStatus;
  note?: string;
  admin_note?: string;
  resolved_by?: number | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
};

type BackendBorrowerAccountRequestCollection = ApiListPayload<BackendBorrowerAccountRequest>;

const toDate = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const mapBorrowerAccountRequest = (
  item: BackendBorrowerAccountRequest
): BorrowerAccountRequest => ({
  id: String(item.id),
  requestType: item.request_type,
  status: item.status,
  note: item.note?.trim() ? item.note : undefined,
  adminNote: item.admin_note?.trim() ? item.admin_note : undefined,
  resolvedById: item.resolved_by ? String(item.resolved_by) : undefined,
  resolvedByName: item.resolved_by_name?.trim() ? item.resolved_by_name : undefined,
  resolvedAt: toDate(item.resolved_at),
  createdAt: toDate(item.created_at) ?? '',
  updatedAt: toDate(item.updated_at) ?? '',
});

export const fetchBorrowerAccountRequests = async (): Promise<BorrowerAccountRequest[]> => {
  const payload = await apiRequest<BackendBorrowerAccountRequestCollection>('/borrower/account-requests/', {
    requireAuth: true,
  });

  return extractCollection(payload).map(mapBorrowerAccountRequest);
};

export const createBorrowerAccountRequest = async (payload: {
  requestType: BorrowerAccountRequestType;
  note?: string;
}): Promise<BorrowerAccountRequest> => {
  const response = await apiRequest<BackendBorrowerAccountRequest>('/borrower/account-requests/', {
    method: 'POST',
    requireAuth: true,
    data: {
      request_type: payload.requestType,
      ...(payload.note?.trim() ? { note: payload.note.trim() } : {}),
    },
  });

  return mapBorrowerAccountRequest(response);
};

export const changePassword = async (payload: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): Promise<void> => {
  await apiRequest('/auth/change-password/', {
    method: 'POST',
    requireAuth: true,
    data: {
      current_password: payload.currentPassword,
      new_password: payload.newPassword,
      confirm_new_password: payload.confirmNewPassword,
    },
  });
};
