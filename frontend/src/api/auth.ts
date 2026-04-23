import { User } from '../../types';
import { API_BASE_URL } from './config';
import { apiRequest } from './client';

export { ApiError } from './client';
export { getApiConnectivityState, subscribeApiConnectivity, subscribeSessionExpired } from './client';

export type BackendUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  profile_photo_url?: string | null;
  phone_number: string;
  sms_notifications_enabled: boolean;
  gcash_account_name?: string;
  gcash_account_number?: string;
  role: User['role'];
  is_active: boolean;
  verification_status?: User['verificationStatus'] | null;
  verification_updated_at?: string | null;
  employment_status?: User['employmentStatus'] | null;
  monthly_income?: string | number | null;
  monthly_debt?: string | number | null;
  date_joined: string;
  approval_status?: User['approvalStatus'] | null;
  approved_at?: string | null;
  approved_by?: number | null;
  approved_by_name?: string | null;
  is_superuser?: boolean;
};

type LoginApiResponse = {
  access: string;
  refresh: string;
  user: BackendUser;
};

type RefreshApiResponse = {
  access: string;
  refresh?: string;
};

type RegisterPayload = {
  username: string;
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  smsNotificationsEnabled?: boolean;
};

type EmailVerificationPayload = {
  email: string;
};

type SendEmailVerificationApiResponse = {
  detail?: string;
  verified?: boolean;
  cooldown_seconds?: number;
  remaining_sends_this_hour?: number;
  send_window_reset_seconds?: number;
};

type VerifyEmailCodePayload = {
  email: string;
  code: string;
};

type LoginPayload = {
  username: string;
  password: string;
};

const toNumberOrUndefined = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toDate = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

export const toAbsoluteAssetUrl = (value?: string | null) => {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return new URL(value, API_BASE_URL).toString();
  } catch {
    return value;
  }
};

const normalizeVerificationStatus = (
  value: BackendUser['verification_status']
): User['verificationStatus'] | undefined => {
  if (value === 'qualified' || value === 'not_qualified' || value === 'not_started') {
    return value;
  }
  return undefined;
};

const normalizeEmploymentStatus = (
  value: BackendUser['employment_status']
): User['employmentStatus'] | undefined => {
  if (
    value === 'employed' ||
    value === 'self_employed' ||
    value === 'student' ||
    value === 'unemployed'
  ) {
    return value;
  }
  return undefined;
};

export const mapBackendUser = (backendUser: BackendUser): User => ({
  id: String(backendUser.id),
  username: backendUser.username,
  name: backendUser.name,
  email: backendUser.email,
  profilePhotoUrl: toAbsoluteAssetUrl(backendUser.profile_photo_url),
  phoneNumber: backendUser.phone_number || '',
  smsNotificationsEnabled: Boolean(backendUser.sms_notifications_enabled),
  gcashAccountName: backendUser.gcash_account_name?.trim() ? backendUser.gcash_account_name : undefined,
  gcashAccountNumber: backendUser.gcash_account_number?.trim() ? backendUser.gcash_account_number : undefined,
  role: backendUser.role,
  active: Boolean(backendUser.is_active),
  createdAt: toDate(backendUser.date_joined),
  verificationStatus: normalizeVerificationStatus(backendUser.verification_status),
  verificationUpdatedAt: toDate(backendUser.verification_updated_at ?? undefined) || undefined,
  employmentStatus: normalizeEmploymentStatus(backendUser.employment_status),
  monthlyIncome: toNumberOrUndefined(backendUser.monthly_income),
  monthlyDebt: toNumberOrUndefined(backendUser.monthly_debt),
  approvalStatus:
    backendUser.approval_status === 'pending' ||
    backendUser.approval_status === 'approved' ||
    backendUser.approval_status === 'rejected'
      ? backendUser.approval_status
      : undefined,
  approvedAt: toDate(backendUser.approved_at ?? undefined) || undefined,
  approvedByName: backendUser.approved_by_name?.trim() ? backendUser.approved_by_name : undefined,
  isSuperuser: Boolean(backendUser.is_superuser),
});

export const loginRequest = async ({
  username,
  password,
}: LoginPayload): Promise<{ accessToken: string; refreshToken: string; user: User }> => {
  const normalizedPassword = password.trim();
  const normalizedUsername = username.trim();

  const payload = await apiRequest<LoginApiResponse>('/auth/login/', {
    method: 'POST',
    data: {
      username: normalizedUsername,
      password: normalizedPassword,
    },
  });

  return {
    accessToken: payload.access,
    refreshToken: payload.refresh,
    user: mapBackendUser(payload.user),
  };
};

export const registerRequest = async ({
  username,
  name,
  email,
  password,
  phoneNumber,
  smsNotificationsEnabled = true,
}: RegisterPayload): Promise<void> => {
  const normalizedPassword = password.trim();

  await apiRequest('/auth/register/', {
    method: 'POST',
    data: {
      username: username.trim().toLowerCase(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: normalizedPassword,
      phone_number: phoneNumber.trim(),
      sms_notifications_enabled: smsNotificationsEnabled,
    },
  });
};

export const sendEmailVerificationCodeRequest = async ({
  email,
}: EmailVerificationPayload): Promise<{
  verified: boolean;
  cooldownSeconds: number;
  remainingSendsThisHour: number | null;
  sendWindowResetSeconds: number | null;
}> => {
  const payload = await apiRequest<SendEmailVerificationApiResponse>('/auth/verification/send/', {
    method: 'POST',
    data: {
      email: email.trim().toLowerCase(),
    },
  });

  return {
    verified: Boolean(payload.verified),
    cooldownSeconds:
      typeof payload.cooldown_seconds === 'number' && Number.isFinite(payload.cooldown_seconds)
        ? payload.cooldown_seconds
        : 0,
    remainingSendsThisHour:
      typeof payload.remaining_sends_this_hour === 'number' &&
      Number.isFinite(payload.remaining_sends_this_hour)
        ? payload.remaining_sends_this_hour
        : null,
    sendWindowResetSeconds:
      typeof payload.send_window_reset_seconds === 'number' &&
      Number.isFinite(payload.send_window_reset_seconds)
        ? payload.send_window_reset_seconds
        : null,
  };
};

export const verifyEmailCodeRequest = async ({
  email,
  code,
}: VerifyEmailCodePayload): Promise<boolean> => {
  const payload = await apiRequest<{ verified?: boolean }>('/auth/verification/verify/', {
    method: 'POST',
    data: {
      email: email.trim().toLowerCase(),
      code: code.trim(),
    },
  });

  return Boolean(payload.verified);
};

export const fetchCurrentUser = async (accessToken: string): Promise<User> => {
  const payload = await apiRequest<BackendUser>('/auth/me/', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return mapBackendUser(payload);
};

export const refreshAccessToken = async (
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  const payload = await apiRequest<RefreshApiResponse>('/auth/refresh/', {
    method: 'POST',
    data: { refresh: refreshToken },
  });

  return {
    accessToken: payload.access,
    refreshToken: payload.refresh ?? refreshToken,
  };
};

export const forgotPasswordRequest = async (email: string): Promise<void> => {
  await apiRequest<{ detail: string }>('/auth/forgot-password/', {
    method: 'POST',
    data: { email: email.trim().toLowerCase() },
  });
};

export const resetPasswordRequest = async (token: string, newPassword: string): Promise<void> => {
  await apiRequest('/auth/reset-password/', {
    method: 'POST',
    data: { token: token.trim(), new_password: newPassword },
  });
};
