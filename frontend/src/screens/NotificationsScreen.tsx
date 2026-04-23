import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/Card';
import { useBorrowerStatus } from '../context/BorrowerStatusContext';
import { AppNotification } from '../../types';
import { colors, spacing } from '../../constants/theme';

const TYPE_LABEL: Record<AppNotification['type'], string> = {
  system: 'SYSTEM',
  loan: 'LOAN',
  payment: 'PAYMENT',
  document: 'DOCUMENT',
  sms: 'SMS',
};

const TYPE_COLOR: Record<AppNotification['type'], string> = {
  system: '#475569',
  loan: colors.primary,
  payment: colors.success,
  document: '#7C3AED',
  sms: '#4169E1',
};

const getNotificationAccent = (notification: AppNotification): string => {
  if (notification.type === 'payment') {
    const title = notification.title.toLowerCase();
    if (title.includes('overdue') || title.includes('seriously')) return colors.danger;
    if (title.includes('today') || title.includes('tomorrow')) return colors.warning;
    if (title.includes('due in')) return '#2F56D4';
  }
  return TYPE_COLOR[notification.type];
};

const getDuePrefix = (title: string): string => {
  const normalizedTitle = title.toLowerCase();
  if (normalizedTitle.includes('seriously overdue')) return '[Urgent]';
  if (normalizedTitle.includes('overdue')) return '[Overdue]';
  if (normalizedTitle.includes('today')) return '[Today]';
  if (normalizedTitle.includes('tomorrow')) return '[Tomorrow]';
  if (normalizedTitle.includes('due in')) return '[Upcoming]';
  return '';
};

export const NotificationsScreen = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const {
    notifications,
    unreadNotificationCount,
    notificationsLoading,
    notificationsRefreshing,
    notificationsError,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useBorrowerStatus();

  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications])
  );

  const handleRead = async (notification: AppNotification) => {
    if (notification.read) {
      return;
    }

    await markNotificationRead(notification.id);
  };

  if (notificationsLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + spacing.xs, spacing.lg),
          paddingBottom: tabBarHeight + spacing.xl,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={notificationsRefreshing}
          onRefresh={() => void refreshNotifications()}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          {unreadNotificationCount > 0 ? (
            <Text style={styles.unreadCountText}>{unreadNotificationCount} unread</Text>
          ) : null}
        </View>
        {unreadNotificationCount > 0 ? (
          <TouchableOpacity
            style={[styles.markAllBtn, notificationsRefreshing && styles.markAllBtnDisabled]}
            onPress={() => void markAllNotificationsRead()}
            disabled={notificationsRefreshing}
            activeOpacity={0.85}
          >
            <Text style={styles.markAllBtnText}>
              {notificationsRefreshing ? 'Marking...' : 'Mark all read'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.subtitle}>
        Loan, payment, and document updates from your borrower account appear here.
      </Text>

      {notificationsError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{notificationsError}</Text>
        </Card>
      ) : null}

      {notifications.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </Card>
      ) : (
        notifications.map((notification) => {
          const duePrefix = getDuePrefix(notification.title);
          const accentColor = getNotificationAccent(notification);
          const isOverduePayment =
            notification.type === 'payment' && notification.title.toLowerCase().includes('overdue');

          return (
            <TouchableOpacity
              key={notification.id}
              activeOpacity={0.85}
              onPress={() => void handleRead(notification)}
            >
              <Card
                style={[
                  styles.notificationCard,
                  !notification.read ? styles.unreadCard : undefined,
                  isOverduePayment ? styles.overdueCard : undefined,
                ]}
              >
                <View style={styles.headerRow}>
                  <View style={styles.headerLeft}>
                    <Text style={styles.notificationTitle}>
                      {duePrefix ? `${duePrefix} ${notification.title}` : notification.title}
                    </Text>
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor: `${accentColor}20`,
                          borderColor: accentColor,
                        },
                      ]}
                    >
                      <Text style={[styles.typeText, { color: accentColor }]}>
                        {TYPE_LABEL[notification.type]}
                      </Text>
                    </View>
                  </View>
                  {!notification.read ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.message}>{notification.message}</Text>
                <Text style={styles.date}>{notification.createdAt}</Text>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
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
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  unreadCountText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  markAllBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  markAllBtnDisabled: {
    opacity: 0.6,
  },
  markAllBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textLight,
    marginBottom: spacing.lg,
    lineHeight: 20,
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
  notificationCard: {
    marginBottom: spacing.sm,
  },
  unreadCard: {
    borderWidth: 1,
    borderColor: '#B9C8FF',
    backgroundColor: '#F7F9FF',
  },
  overdueCard: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  typeBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  message: {
    color: colors.textLight,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  date: {
    color: '#94A3B8',
    fontSize: 12,
  },
  emptyText: {
    color: colors.textLight,
  },
});
