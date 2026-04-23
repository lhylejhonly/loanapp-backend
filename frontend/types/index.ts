export type UserRole = 'borrower' | 'officer' | 'admin';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type EmploymentStatus = 'employed' | 'self_employed' | 'student' | 'unemployed';

export type VerificationStatus = 'not_started' | 'qualified' | 'not_qualified';

export type User = {
  id: string;
  username?: string;
  name: string;
  email: string;
  profilePhotoUrl?: string;
  phoneNumber?: string;
  smsNotificationsEnabled?: boolean;
  gcashAccountName?: string;
  gcashAccountNumber?: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  verificationStatus?: VerificationStatus;
  verificationUpdatedAt?: string;
  employmentStatus?: EmploymentStatus;
  monthlyIncome?: number;
  monthlyDebt?: number;
  approvalStatus?: ApprovalStatus;
  approvedAt?: string;
  approvedByName?: string;
  isSuperuser?: boolean;
};

export type AppUserRecord = User & {
  password: string;
};

export type LoanStatus = 'pending' | 'approved' | 'rejected';
export type DisbursementMethod = 'bank_transfer' | 'gcash' | 'maya' | 'cash_pickup';
export type DisbursementStatus = 'pending' | 'processing' | 'disbursed' | 'failed' | 'reversed';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'gcash' | 'maya';
export type PaymentSubmissionStatus = 'pending' | 'approved' | 'rejected';
export type LoanApplicationPurpose = 'purchase' | 'refinance' | 'both';
export type LoanApplicantCount = 'one' | 'two' | 'many';
export type DocumentType =
  | 'id'
  | 'income_proof'
  | 'government_id'
  | 'student_id'
  | 'business_permit'
  | 'business_owner_id'
  | 'proof_of_revenue';

export type LoanType = {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  baseInterestRate: number;
  termsInMonths: number[];
  requiredDocuments: DocumentType[];
  active: boolean;
  createdAt: string;
};

export type LoanRepaymentSummary = {
  scheduledInstallmentAmount: number;
  paidInstallments: number;
  remainingInstallments: number;
  totalInstallments: number;
  repaymentStartDate?: string;
  nextDueDate?: string;
  maturityDate?: string;
  daysUntilDue?: number;
  isOverdue: boolean;
  overdueInstallments: number;
};

export type Loan = {
  id: string;
  borrowerId: string;
  borrowerName: string;
  borrowerEmail?: string;
  borrowerPhotoUrl?: string;
  loanTypeId: string;
  loanTypeName: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  status: LoanStatus;
  balance: number;
  createdAt: string;
  updatedAt: string;
  reviewedByOfficerId?: string;
  reviewedByName?: string;
  rejectionReason?: string;
  applicationPurpose?: LoanApplicationPurpose;
  applicantCount?: LoanApplicantCount;
  contactEmail?: string;
  contactPhoneNumber?: string;
  disbursementMethod?: DisbursementMethod;
  disbursementAccountName?: string;
  disbursementAccountNumber?: string;
  disbursementStatus?: DisbursementStatus;
  disbursementProvider?: 'manual' | 'xendit';
  disbursementReference?: string;
  disbursementExternalId?: string;
  disbursementProviderStatus?: string;
  disbursementFailureCode?: string;
  disbursementFailureMessage?: string;
  disbursementRequestedAt?: string;
  disbursedAt?: string;
  paymentsCount?: number;
  repaymentSummary?: LoanRepaymentSummary;
};

export type Payment = {
  id: string;
  loanId: string;
  borrowerId: string;
  borrowerName?: string;
  borrowerPhotoUrl?: string;
  amount: number;
  date: string;
  recordedByOfficerId?: string;
  recordedByOfficerName?: string;
  loanStatus?: LoanStatus;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  note?: string;
};

export type PaymentSubmission = {
  id: string;
  loanId: string;
  borrowerId: string;
  borrowerName?: string;
  borrowerPhotoUrl?: string;
  loanTypeName?: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  note?: string;
  proofFileName?: string;
  proofFileUrl?: string;
  status: PaymentSubmissionStatus;
  rejectionReason?: string;
  reviewedByOfficerId?: string;
  reviewedByOfficerName?: string;
  reviewedAt?: string;
  approvedPaymentId?: string;
  submittedAt: string;
  loanStatus?: LoanStatus;
};

export type BorrowerAccountRequestType = 'data_export' | 'account_deletion';
export type BorrowerAccountRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export type BorrowerAccountRequest = {
  id: string;
  requestType: BorrowerAccountRequestType;
  status: BorrowerAccountRequestStatus;
  note?: string;
  adminNote?: string;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type BorrowerDocument = {
  id: string;
  borrowerId: string;
  type: DocumentType;
  fileName: string;
  fileUrl?: string;
  uploadedAt: string;
  status: 'uploaded' | 'verified' | 'rejected';
  rejectionReason?: string;
};

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  type: 'system' | 'loan' | 'payment' | 'document' | 'sms';
};
