import { apiRequest } from './client';

type AdminDashboardResponse = {
  users: {
    total: number;
    borrowers: number;
    officers: number;
    admins: number;
  };
  loans: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    total_disbursed: string | number;
    outstanding_balance: string | number;
  };
  payments: {
    total_count: number;
    total_collected: string | number;
  };
  documents: {
    unverified: number;
  };
};

type AdminReportsResponse = {
  performance: {
    approved_principal: string | number;
    collected_payments: string | number;
    collection_rate_percent: number;
  };
  loan_status_breakdown: {
    pending: number;
    approved: number;
    rejected: number;
  };
  monthly_payment_trend: Array<{
    month: string;
    amount: string | number;
  }>;
  top_borrowers: Array<{
    borrower_id: number;
    name: string;
    approved_amount: string | number;
  }>;
};

const toNumber = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const fetchAdminDashboard = async () => {
  const payload = await apiRequest<AdminDashboardResponse>('/admin/dashboard/', {
    requireAuth: true,
  });

  return {
    users: payload.users,
    loans: {
      ...payload.loans,
      totalDisbursed: toNumber(payload.loans.total_disbursed),
      outstandingBalance: toNumber(payload.loans.outstanding_balance),
    },
    payments: {
      ...payload.payments,
      totalCollected: toNumber(payload.payments.total_collected),
    },
    documents: {
      unverified: payload.documents?.unverified ?? 0,
    },
  };
};

export const fetchAdminReports = async () => {
  const payload = await apiRequest<AdminReportsResponse>('/admin/reports/', {
    requireAuth: true,
  });

  return {
    performance: {
      approvedPrincipal: toNumber(payload.performance.approved_principal),
      collectedPayments: toNumber(payload.performance.collected_payments),
      collectionRatePercent: payload.performance.collection_rate_percent,
    },
    loanStatusBreakdown: payload.loan_status_breakdown,
    monthlyPaymentTrend: payload.monthly_payment_trend.map((entry) => ({
      month: entry.month,
      amount: toNumber(entry.amount),
    })),
    topBorrowers: payload.top_borrowers.map((entry) => ({
      borrowerId: String(entry.borrower_id),
      name: entry.name,
      approvedAmount: toNumber(entry.approved_amount),
    })),
  };
};
