import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Card } from '../components/Card';
import { fetchAdminReports } from '../api/admin';
import { colors, spacing } from '../../constants/theme';

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

export const AdminReportsScreen = () => {
  const [report, setReport] = useState<Awaited<ReturnType<typeof fetchAdminReports>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const tabBarHeight = useBottomTabBarHeight();

  const loadReport = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const payload = await fetchAdminReports();
      setReport(payload);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load reports right now.');
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadReport();
    }, [loadReport])
  );

  if (loading && !report) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadReport(true)} />}
    >
      <Text style={styles.title}>Reports</Text>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      <Card style={styles.reportCard}>
        <Text style={styles.reportTitle}>Performance Summary</Text>
        <Text style={styles.value}>Approved Principal: {formatCurrency(report?.performance.approvedPrincipal ?? 0)}</Text>
        <Text style={styles.value}>Collected Payments: {formatCurrency(report?.performance.collectedPayments ?? 0)}</Text>
        <Text style={styles.value}>Collection Rate: {(report?.performance.collectionRatePercent ?? 0).toFixed(2)}%</Text>
      </Card>

      <Card style={styles.reportCard}>
        <Text style={styles.reportTitle}>Loan Status Breakdown</Text>
        <Text style={styles.value}>Pending: {report?.loanStatusBreakdown.pending ?? 0}</Text>
        <Text style={styles.value}>Approved: {report?.loanStatusBreakdown.approved ?? 0}</Text>
        <Text style={styles.value}>Rejected: {report?.loanStatusBreakdown.rejected ?? 0}</Text>
      </Card>

      <Card style={styles.reportCard}>
        <Text style={styles.reportTitle}>Monthly Payment Trend</Text>
        {(report?.monthlyPaymentTrend.length ?? 0) === 0 ? (
          <Text style={styles.emptyText}>No payment data yet.</Text>
        ) : (
          report?.monthlyPaymentTrend.map((entry) => (
            <View key={entry.month} style={styles.row}>
              <Text style={styles.value}>{entry.month}</Text>
              <Text style={styles.value}>{formatCurrency(entry.amount)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.reportCard}>
        <Text style={styles.reportTitle}>Top Borrowers (Approved Amount)</Text>
        {(report?.topBorrowers.length ?? 0) === 0 ? (
          <Text style={styles.emptyText}>No borrower data yet.</Text>
        ) : (
          report?.topBorrowers.map((borrower) => (
            <View key={borrower.borrowerId} style={styles.row}>
              <Text style={styles.value}>{borrower.name}</Text>
              <Text style={styles.value}>{formatCurrency(borrower.approvedAmount)}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  errorCard: {
    marginBottom: spacing.md,
    borderColor: 'rgba(220,38,38,0.14)',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  reportCard: {
    marginBottom: spacing.md,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  value: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: spacing.xs,
    flexShrink: 1,
  },
  emptyText: {
    color: colors.textLight,
  },
});
