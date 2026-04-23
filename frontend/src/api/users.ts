import { User } from '../../types';
import { BackendUser, mapBackendUser } from './auth';
import { apiRequest } from './client';

type AdminUsersApiResponse =
  | BackendUser[]
  | {
      count?: number;
      next?: string | null;
      previous?: string | null;
      results?: BackendUser[];
    };

type CreateAdminUserPayload = {
  username: string;
  name: string;
  email: string;
  password: string;
  role?: User['role'];
  phoneNumber?: string;
  smsNotificationsEnabled?: boolean;
};

type UpdateAdminUserPayload = {
  name?: string;
  role?: User['role'];
  approvalStatus?: User['approvalStatus'];
  active?: boolean;
  phoneNumber?: string;
  smsNotificationsEnabled?: boolean;
};

const normalizeAdminUsersPayload = (payload: AdminUsersApiResponse): BackendUser[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  return [];
};

export const fetchAdminUsers = async (): Promise<User[]> => {
  const payload = await apiRequest<AdminUsersApiResponse>('/admin/users/', {
    requireAuth: true,
  });

  return normalizeAdminUsersPayload(payload).map(mapBackendUser);
};

export const createAdminUser = async ({
  username,
  name,
  email,
  password,
  role = 'admin',
  phoneNumber,
  smsNotificationsEnabled = false,
}: CreateAdminUserPayload): Promise<User> => {
  const payload = await apiRequest<BackendUser>('/admin/users/', {
    method: 'POST',
    requireAuth: true,
    data: {
      username: username.trim().toLowerCase(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      role,
      phone_number: phoneNumber?.trim() ?? '',
      sms_notifications_enabled: smsNotificationsEnabled,
    },
  });

  return mapBackendUser(payload);
};

export const updateAdminUser = async (
  userId: string,
  updates: UpdateAdminUserPayload
): Promise<User> => {
  const payload = await apiRequest<BackendUser>(`/admin/users/${userId}/`, {
    method: 'PATCH',
    requireAuth: true,
    data: {
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.approvalStatus !== undefined ? { approval_status: updates.approvalStatus } : {}),
      ...(updates.active !== undefined ? { is_active: updates.active } : {}),
      ...(updates.phoneNumber !== undefined ? { phone_number: updates.phoneNumber.trim() } : {}),
      ...(updates.smsNotificationsEnabled !== undefined
        ? { sms_notifications_enabled: updates.smsNotificationsEnabled }
        : {}),
    },
  });

  return mapBackendUser(payload);
};
