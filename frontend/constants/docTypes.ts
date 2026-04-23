export const DocTypes = {
  GOVERNMENT_ID: 'government_id',
  STUDENT_ID: 'student_id',
  BUSINESS_PERMIT: 'business_permit',
  BUSINESS_OWNER_ID: 'business_owner_id',
  PROOF_OF_REVENUE: 'proof_of_revenue',
  INCOME_PROOF: 'income_proof',
  ID: 'id',
} as const;

export type DocType = (typeof DocTypes)[keyof typeof DocTypes];

// Documents required per loan category
export const LOAN_REQUIRED_DOCS: Record<'student' | 'business' | 'general', DocType[]> = {
  student: [DocTypes.GOVERNMENT_ID, DocTypes.STUDENT_ID],
  business: [DocTypes.BUSINESS_PERMIT, DocTypes.BUSINESS_OWNER_ID, DocTypes.PROOF_OF_REVENUE],
  general: [DocTypes.ID, DocTypes.INCOME_PROOF],
};

// Human-readable labels
export const DOC_LABELS: Record<DocType, string> = {
  [DocTypes.GOVERNMENT_ID]: 'Government-Issued ID',
  [DocTypes.STUDENT_ID]: 'School / Student ID',
  [DocTypes.BUSINESS_PERMIT]: 'Business Permit',
  [DocTypes.BUSINESS_OWNER_ID]: 'Business Owner ID',
  [DocTypes.PROOF_OF_REVENUE]: 'Proof of Monthly Revenue',
  [DocTypes.INCOME_PROOF]: 'Proof of Income',
  [DocTypes.ID]: 'Valid ID',
};

export const DOC_DESCRIPTIONS: Record<DocType, string> = {
  [DocTypes.GOVERNMENT_ID]: 'Passport, Driver\'s License, SSS, PhilHealth, UMID, or Postal ID',
  [DocTypes.STUDENT_ID]: 'Current school year student ID with your name and photo',
  [DocTypes.BUSINESS_PERMIT]: 'DTI / SEC registration or Mayor\'s Permit — must be valid and current',
  [DocTypes.BUSINESS_OWNER_ID]: 'Valid government ID of the registered business owner',
  [DocTypes.PROOF_OF_REVENUE]: 'Bank statement, sales report, or audited financial statement (last 3 months)',
  [DocTypes.INCOME_PROOF]: 'Payslip, COE, or ITR showing your monthly income',
  [DocTypes.ID]: 'Any government-issued photo ID',
};

export const DOC_EMOJI: Record<DocType, string> = {
  [DocTypes.GOVERNMENT_ID]: '🪪',
  [DocTypes.STUDENT_ID]: '🎓',
  [DocTypes.BUSINESS_PERMIT]: '📋',
  [DocTypes.BUSINESS_OWNER_ID]: '🪪',
  [DocTypes.PROOF_OF_REVENUE]: '📊',
  [DocTypes.INCOME_PROOF]: '💰',
  [DocTypes.ID]: '🪪',
};

// Loan amount caps per category
export const LOAN_AMOUNT_CAPS: Record<'student' | 'business' | 'general', number> = {
  student: 5000,
  business: 100000,
  general: 50000,
};
