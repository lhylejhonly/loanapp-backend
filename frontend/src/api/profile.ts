import { User } from '../../types';
import { mapBackendUser, type BackendUser } from './auth';
import { apiRequest } from './client';

type ProfilePhotoUpload = {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
};

export const updateCurrentUser = async (payload: {
  name?: string;
  phoneNumber?: string;
  smsNotificationsEnabled?: boolean;
  gcashAccountName?: string;
  gcashAccountNumber?: string;
  employmentStatus?: User['employmentStatus'];
  monthlyIncome?: number;
  monthlyDebt?: number;
  profilePhoto?: ProfilePhotoUpload;
  removeProfilePhoto?: boolean;
}): Promise<User> => {
  const shouldUseMultipart =
    payload.profilePhoto !== undefined || payload.removeProfilePhoto !== undefined;

  const jsonPayload = {
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.phoneNumber !== undefined ? { phone_number: payload.phoneNumber.trim() } : {}),
    ...(payload.smsNotificationsEnabled !== undefined
      ? { sms_notifications_enabled: payload.smsNotificationsEnabled }
      : {}),
    ...(payload.gcashAccountName !== undefined
      ? { gcash_account_name: payload.gcashAccountName.trim() }
      : {}),
    ...(payload.gcashAccountNumber !== undefined
      ? { gcash_account_number: payload.gcashAccountNumber.trim() }
      : {}),
    ...(payload.employmentStatus !== undefined ? { employment_status: payload.employmentStatus } : {}),
    ...(payload.monthlyIncome !== undefined ? { monthly_income: payload.monthlyIncome } : {}),
    ...(payload.monthlyDebt !== undefined ? { monthly_debt: payload.monthlyDebt } : {}),
  };

  const requestData = shouldUseMultipart
    ? (() => {
        const formData = new FormData();

        Object.entries(jsonPayload).forEach(([key, value]) => {
          if (value === undefined || value === null) {
            return;
          }

          formData.append(key, String(value));
        });

        if (payload.removeProfilePhoto) {
          formData.append('remove_profile_photo', 'true');
        }

        if (payload.profilePhoto) {
          if (payload.profilePhoto.file) {
            formData.append('profile_photo', payload.profilePhoto.file, payload.profilePhoto.name);
          } else {
            formData.append('profile_photo', payload.profilePhoto as unknown as Blob);
          }
        }

        return formData;
      })()
    : jsonPayload;

  const response = await apiRequest<BackendUser>('/auth/me/', {
    method: 'PATCH',
    requireAuth: true,
    data: requestData,
  });

  return mapBackendUser(response);
};
