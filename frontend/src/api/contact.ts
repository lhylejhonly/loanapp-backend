import { apiRequest } from './client';
import { extractCollection, type ApiListPayload } from './collections';

export interface ContactMessage {
  id: number;
  sender: number;
  sender_name: string;
  sender_email: string;
  subject: string;
  message: string;
  status: 'unread' | 'read' | 'replied';
  reply: string;
  replied_by: number | null;
  replied_by_name: string | null;
  replied_at: string | null;
  created_at: string;
}

type ContactMessageCollection = ApiListPayload<ContactMessage>;

export const sendContactMessage = (subject: string, message: string) =>
  apiRequest<ContactMessage>('/borrower/messages/', {
    method: 'POST',
    requireAuth: true,
    data: { subject, message },
  });

export const getBorrowerMessages = async () => {
  const payload = await apiRequest<ContactMessageCollection>('/borrower/messages/', {
    method: 'GET',
    requireAuth: true,
  });
  return extractCollection(payload);
};

export const getStaffMessages = async (status?: string) => {
  const payload = await apiRequest<ContactMessageCollection>(`/staff/messages/${status ? `?status=${status}` : ''}`, {
    method: 'GET',
    requireAuth: true,
  });
  return extractCollection(payload);
};

export const replyToMessage = (id: number, reply: string) =>
  apiRequest<ContactMessage>(`/staff/messages/${id}/reply/`, {
    method: 'POST',
    requireAuth: true,
    data: { reply },
  });

export const markMessageRead = (id: number) =>
  apiRequest<ContactMessage>(`/staff/messages/${id}/reply/`, {
    method: 'PATCH',
    requireAuth: true,
  });
