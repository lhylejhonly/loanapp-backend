import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { ArrowLeft, CheckCircle2, Circle, Clock3 } from 'lucide-react-native';
import { Loan } from '../../types';
import { colors, spacing, radii } from '../../constants/theme';

const formatCurrency = (v: number) =>
  `PHP ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addMonths = (dateStr: string, months: number): string => {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

type ScheduleRow = {
  installment: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  status: 'paid' | 'current' | 'upcoming';
};

const buildSchedule = (loan: Loan): ScheduleRow[] => {
  const principal = loan.amount;
  const rate = loan.interestRate / 100;
  const terms = loan.termMonths;
  const totalInterest = principal * rate;
  const totalRepayment = principal + totalInterest;
  const installment = totalRepayment / terms;
  const principalPerMonth = principal / terms;
  const interestPerMonth = totalInterest / terms;

  // Estimate start date from createdAt
  const startDate = loan.repaymentSummary?.repaymentStartDate ?? addMonths(loan.createdAt, 1);

  // How many installments have been paid based on balance
  const paid = loan.amount - loan.balance;
  const paidInstallments = Math.min(Math.round(paid / installment), terms);

  return Array.from({ length: terms }, (_, i) => {
    const num = i + 1;
    const dueDate = addMonths(startDate, i);
    let status: ScheduleRow['status'] = 'upcoming';
    if (num <= paidInstallments) status = 'paid';
    else if (num === paidInstallments + 1) status = 'current';
    return {
      installment: num,
      dueDate,
      principal: principalPerMonth,
      interest: interestPerMonth,
      total: installment,
      status,
    };
  });
};

export const RepaymentScheduleScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const loan = route?.params?.loan as Loan | undefined;

  const schedule = useMemo(() => (loan ? buildSchedule(loan) : []), [loan]);

  const paidCount = schedule.filter((r) => r.status === 'paid').length;
  const totalPaid = paidCount * (schedule[0]?.total ?? 0);
  const progressPct = schedule.length > 0 ? (paidCount / schedule.length) * 100 : 0;

  if (!loan) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Loan data not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#1E3A8A', '#2F56D4', '#4169E1']}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <ArrowLeft size={18} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Repayment Schedule</Text>
          <Text style={styles.headerSub}>{loan.loanTypeName} — {formatCurrency(loan.amount)}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Loan</Text>
              <Text style={styles.summaryValue}>{formatCurrency(loan.amount)}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Interest Rate</Text>
              <Text style={styles.summaryValue}>{loan.interestRate}%</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Term</Text>
              <Text style={styles.summaryValue}>{loan.termMonths} mo</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>{paidCount} of {schedule.length} payments made</Text>
              <Text style={styles.progressPct}>{progressPct.toFixed(0)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Paid</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {formatCurrency(totalPaid)}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Remaining</Text>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                {formatCurrency(loan.balance)}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Monthly</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(schedule[0]?.total ?? 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <CheckCircle2 size={14} color={colors.success} strokeWidth={2.5} />
            <Text style={styles.legendText}>Paid</Text>
          </View>
          <View style={styles.legendItem}>
            <Clock3 size={14} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.legendText}>Current</Text>
          </View>
          <View style={styles.legendItem}>
            <Circle size={14} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.legendText}>Upcoming</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 0.5 }]}>#</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.8 }]}>Due Date</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Principal</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Interest</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
        </View>

        {/* Schedule rows */}
        {schedule.map((row) => {
          const isPaid = row.status === 'paid';
          const isCurrent = row.status === 'current';
          return (
            <View
              key={row.installment}
              style={[
                styles.tableRow,
                isPaid && styles.tableRowPaid,
                isCurrent && styles.tableRowCurrent,
              ]}
            >
              <View style={[styles.tableCell, { flex: 0.5, alignItems: 'center' }]}>
                {isPaid
                  ? <CheckCircle2 size={14} color={colors.success} strokeWidth={2.5} />
                  : isCurrent
                  ? <Clock3 size={14} color={colors.primary} strokeWidth={2.5} />
                  : <Circle size={14} color={colors.textMuted} strokeWidth={2} />}
              </View>
              <View style={[styles.tableCell, { flex: 1.8 }]}>
                <Text style={[styles.tableCellText, isCurrent && styles.tableCellTextCurrent]}>
                  {row.dueDate}
                </Text>
                {isCurrent ? (
                  <Text style={styles.currentLabel}>Due now</Text>
                ) : null}
              </View>
              <View style={[styles.tableCell, { flex: 1.5, alignItems: 'flex-end' }]}>
                <Text style={[styles.tableCellText, isPaid && styles.tableCellTextPaid]}>
                  {formatCurrency(row.principal)}
                </Text>
              </View>
              <View style={[styles.tableCell, { flex: 1.5, alignItems: 'flex-end' }]}>
                <Text style={[styles.tableCellText, isPaid && styles.tableCellTextPaid]}>
                  {formatCurrency(row.interest)}
                </Text>
              </View>
              <View style={[styles.tableCell, { flex: 1.5, alignItems: 'flex-end' }]}>
                <Text style={[
                  styles.tableCellTotal,
                  isPaid && styles.tableCellTextPaid,
                  isCurrent && styles.tableCellTextCurrent,
                ]}>
                  {formatCurrency(row.total)}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Total row */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Repayment</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(schedule.reduce((s, r) => s + r.total, 0))}
          </Text>
        </View>

        <Text style={styles.disclaimer}>
          * Schedule is based on equal monthly installments. Actual amounts may vary slightly due to
          rounding. Contact support if you have questions about your repayment.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },
  errorText: { color: colors.danger, padding: spacing.lg, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: spacing.md },

  summaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: '#DCE6FF',
    shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    gap: spacing.md,
  },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 3 },
  summaryValue: { fontSize: 14, fontWeight: '800', color: colors.text },

  progressSection: { gap: 6 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
  progressPct: { fontSize: 12, color: colors.primary, fontWeight: '800' },
  progressTrack: {
    height: 8, borderRadius: 4,
    backgroundColor: '#E2E8F0', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.success },

  legend: {
    flexDirection: 'row', gap: spacing.md,
    marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 12, color: colors.textLight, fontWeight: '600' },

  tableHeader: {
    flexDirection: 'row', backgroundColor: '#2F56D4',
    borderRadius: radii.sm, paddingVertical: 8,
    paddingHorizontal: spacing.sm, marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 10, fontWeight: '800',
    color: '#FFFFFF', letterSpacing: 0.4,
  },

  tableRow: {
    flexDirection: 'row', paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: '#E9EEFF',
    backgroundColor: '#FFFFFF',
  },
  tableRowPaid: { backgroundColor: '#F0FDF4' },
  tableRowCurrent: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  tableCell: { justifyContent: 'center' },
  tableCellText: { fontSize: 12, color: colors.text },
  tableCellTextPaid: { color: colors.success },
  tableCellTextCurrent: { color: colors.primary, fontWeight: '700' },
  tableCellTotal: { fontSize: 12, fontWeight: '700', color: colors.text },
  currentLabel: {
    fontSize: 9, color: colors.primary,
    fontWeight: '700', marginTop: 1,
  },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', backgroundColor: '#1E3A8A',
    borderRadius: radii.sm, padding: spacing.sm,
    marginTop: 2, marginBottom: spacing.md,
  },
  totalLabel: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  totalValue: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },

  disclaimer: {
    fontSize: 11, color: colors.textMuted,
    lineHeight: 17, fontStyle: 'italic',
  },
});
