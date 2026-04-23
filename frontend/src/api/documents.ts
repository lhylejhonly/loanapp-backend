import { Platform } from 'react-native';
import { apiRequest } from './client';
import { BorrowerDocument, DocumentType } from '../../types';
import { extractCollection, type ApiListPayload } from './collections';

type DocumentUploadFile = {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
};

type BackendDocument = {
  id: number;
  borrower: number;
  document_type: 'id' | 'income_proof' | 'government_id' | 'student_id' | 'business_permit' | 'business_owner_id' | 'proof_of_revenue';
  file_name: string;
  file_url?: string | null;
  status: 'uploaded' | 'verified' | 'rejected';
  rejection_reason?: string | null;
  uploaded_at: string;
};

type BackendDocumentCollection = ApiListPayload<BackendDocument>;

const toDate = (value: string) => {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
};

const mapDocument = (item: BackendDocument): BorrowerDocument => ({
  id: String(item.id),
  borrowerId: String(item.borrower),
  type: item.document_type,
  fileName: item.file_name,
  fileUrl: item.file_url ?? undefined,
  status: item.status,
  rejectionReason: item.rejection_reason ?? undefined,
  uploadedAt: toDate(item.uploaded_at),
});

const inferMimeTypeFromFileName = (fileName?: string | null) => {
  const normalizedFileName = fileName?.trim().toLowerCase() ?? '';
  if (normalizedFileName.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (normalizedFileName.endsWith('.png')) {
    return 'image/png';
  }
  if (normalizedFileName.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalizedFileName.endsWith('.heic')) {
    return 'image/heic';
  }
  if (normalizedFileName.endsWith('.heif')) {
    return 'image/heif';
  }
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

const buildFallbackFileName = (documentType: DocumentType, mimeType: string) =>
  `${documentType.replace(/_/g, '-')}-${Date.now()}.${inferExtensionFromMimeType(mimeType)}`;

const resolveWebUploadPayload = async (
  uploadFile: DocumentUploadFile
): Promise<Blob | DocumentUploadFile> => {
  if (uploadFile.file) {
    return uploadFile.file;
  }

  const uri = uploadFile.uri?.trim();
  if (!uri) return uploadFile;

  // blob:, data:, http(s): can be fetched into a Blob
  const canFetchBlob =
    typeof fetch === 'function' &&
    /^(blob:|data:|https?:)/i.test(uri);

  if (canFetchBlob) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to read the selected file before upload (HTTP ${response.status}).`);
    }
    return await response.blob();
  }

  // file:// URIs on native — return as-is so React Native FormData handles it
  return uploadFile;
};

export const fetchBorrowerDocuments = async (): Promise<BorrowerDocument[]> => {
  const payload = await apiRequest<BackendDocumentCollection>('/borrower/documents/', {
    requireAuth: true,
  });

  return extractCollection(payload).map(mapDocument);
};

export const uploadDocument = async (
  documentType: DocumentType,
  fileUri: string,
  fileName: string,
  mimeType: string = 'application/octet-stream',
  file?: Blob
): Promise<BorrowerDocument> => {
  const normalizedUri = fileUri?.trim();
  if (!normalizedUri) {
    throw new Error('Unable to upload the selected document because its file location is missing.');
  }

  const normalizedMimeType =
    mimeType?.trim() ||
    file?.type?.trim() ||
    inferMimeTypeFromFileName(fileName);
  const normalizedFileName =
    fileName?.trim() || buildFallbackFileName(documentType, normalizedMimeType);

  const formData = new FormData();
  formData.append('document_type', documentType);
  formData.append('file_name', normalizedFileName);
  const uploadFile: DocumentUploadFile = {
    uri: normalizedUri,
    name: normalizedFileName,
    type: normalizedMimeType,
    ...(file ? { file } : {}),
  };

  if (Platform.OS === 'web') {
    const uploadPayload = await resolveWebUploadPayload(uploadFile);

    if (uploadPayload instanceof Blob) {
      formData.append('file', uploadPayload, uploadFile.name);
    } else {
      formData.append('file', uploadPayload as unknown as Blob);
    }
  } else {
    formData.append('file', {
      uri: normalizedUri,
      name: normalizedFileName,
      type: normalizedMimeType,
    } as unknown as Blob);
  }

  const payload = await apiRequest<BackendDocument>('/borrower/documents/', {
    method: 'POST',
    requireAuth: true,
    body: formData,
  });

  return mapDocument(payload);
};

export { uploadDocument as uploadDocumentWithFile };
