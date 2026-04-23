import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { ClipboardList, FileText, LayoutDashboard, ReceiptText, TrendingUp, Users } from 'lucide-react-native';
import { Card } from '../components/Card';
import { fetchAdminDashboard } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radii } from '../../constants/theme';

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

export const AdminDashboardScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchAdminDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await fetchAdminDashboard();
      setDashboard(payload);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load dashboard.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadDashboard(); }, [loadDashboard]));

  const features = useMemo(() => [
    {
      id: 'users', title: 'Manage Users', icon: Users,
      onPress: () => user?.isSuperuser ? navigation.navigate('Users') : Alert.alert('Restricted', 'Super admin only.'),
    },
    { id: 'reports', title: 'Reports', icon: ClipboardList, onPress: () => navigation.navigate('Reports') },
    { id: 'loans', title: 'Loan Transactions', icon: ReceiptText, onPress: () => navigation.navigate('Transactions') },
    { id: 'types', title: 'Loan Types', icon: FileText, onPress: () => navigation.navigate('Loan Types') },
  ], [navigation, user?.isSuperuser]);

  if (loading && !dashboard) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadDashboard(true)} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.primaryDeep, colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}
      >
        <Text style={styles.heroLabel}>ADMIN PANEL</Text>
        <Text style={styles.heroTitle}>Dashboard</Text>
        <Text style={styles.heroSub}>Live portfolio overview</Text>
        <View style={styles.heroStats}>
          {[
            { label: 'Users', value: dashboard?.users.total ?? 0 },
            { label: 'Loans', value: dashboard?.loans.total ?? 0 },
            { label: 'Pending', value: dashboard?.loans.pending ?? 0 },
            { label: 'Approved', value: dashboard?.loans.approved ?? 0 },
          ].map((s) => (
            <View key={s.label} style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{s.value}</Text>
              <Text style={styles.heroStatLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {error ? <Card style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></Card> : null}

        {/* Financials */}
        <Text style={styles.sectionTitle}>Financials</Text>
        <View style={styles.row}>
          {[
            { label: 'Disbursed', value: formatCurrency(dashboard?.loans.totalDisbursed ?? 0), color: colors.success },
            { label: 'Collected', value: formatCurrency(dashboard?.payments.totalCollected ?? 0), color: colors.primary },
          ].map((item) => (
            <Card key={item.label} style={styles.halfCard}>
              <View style={[styles.dot, { backgroundColor: item.color + '22' }]}>
                <TrendingUp size={16} color={item.color} strokeWidth={2.2} />
              </View>
              <Text style={[styles.finValue, { color: item.color }]}>{item.value}</Text>
              <Text style={styles.finLabel}>{item.label}</Text>
            </Card>
          ))}
        </View>
        <Card style={styles.outstandingCard}>
          <Text style={styles.outstandingLabel}>Outstanding Balance</Text>
          <Text style={[styles.finValue, { color: colors.warning }]}>{formatCurrency(dashboard?.loans.outstandingBalance ?? 0)}</Text>
        </Card>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Card style={styles.actionsCard}>
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.actionRow, i < features.length - 1 && styles.actionDivider]}
                onPress={f.onPress}
                activeOpacity={0.75}
              >
                <View style={styles.actionIcon}>
                  <Icon size={17} color={colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={styles.actionTitle}>{f.title}</Text>
                <Text style={styles.actionChevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </Card>

        {/* User Breakdown */}
        <Text style={styles.sectionTitle}>User Breakdown</Text>
        <Card>
          {[
            { label: 'Borrowers', value: dashboard?.users.borrowers ?? 0 },
            { label: 'Officers', value: dashboard?.users.officers ?? 0 },
            { label: 'Admins', value: dashboard?.users.admins ?? 0 },
            { label: 'Rejected Loans', value: dashboard?.loans.rejected ?? 0 },
          ].map((item, i, arr) => (
            <View key={item.label} style={[styles.breakdownRow, i < arr.length - 1 && styles.actionDivider]}>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={styles.breakdownValue}>{item.value}</Text>
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText: { marginTop: spacing.sm, color: colors.textLight, fontSize: 14, fontWeight: '600' },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 4 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2, marginBottom: spacing.lg },
  heroStats: { flexDirection: 'row', gap: spacing.sm },
  heroStat: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14,
    paddingVertical: spacing.sm, alignItems: 'center',
  },
  heroStatValue: { color: '#fff', fontSize: 20, fontWeight: '900' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  body: { padding: spacing.md, gap: spacing.sm },
  errorCard: { borderColor: 'rgba(220,38,38,0.2)' },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textLight, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  halfCard: { flex: 1 },
  dot: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  finValue: { fontSize: 16, fontWeight: '900' },
  finLabel: { color: colors.textLight, fontSize: 12, fontWeight: '600', marginTop: 2 },
  outstandingCard: { marginTop: 0 },
  outstandingLabel: { color: colors.textLight, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  actionsCard: { padding: 0, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14, paddingHorizontal: spacing.md },
  actionDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  actionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  actionChevron: { fontSize: 20, color: colors.textMuted, lineHeight: 22 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  breakdownLabel: { fontSize: 14, color: colors.textLight },
  breakdownValue: { fontSize: 14, fontWeight: '800', color: colors.text },
});
