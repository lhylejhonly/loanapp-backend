import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { AppNotification } from '../../types';
import {
  ApiError,
  getApiConnectivityState,
  subscribeApiConnectivity,
} from '../api/auth';
import {
  fetchBorrowerNotifications,
  markBorrowerNotificationRead,
} from '../api/notifications';
import { useAuth } from './AuthContext';

type BorrowerStatusContextType = {
  notifications: AppNotification[];
  unreadNotificationCount: number;
  notificationsLoading: boolean;
  notificationsRefreshing: boolean;
  notificationsError: string;
  isOffline: boolean;
  recentlyReconnected: boolean;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
};

const POLL_INTERVAL_MS = 45000;

const BorrowerStatusContext = createContext<BorrowerStatusContextType | undefined>(undefined);

export const BorrowerStatusProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const isBorrower = user?.role === 'borrower';
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsRefreshing, setNotificationsRefreshing] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [isOffline, setIsOffline] = useState(!getApiConnectivityState());
  const [recentlyReconnected, setRecentlyReconnected] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const wasOfflineRef = useRef(!getApiConnectivityState());

  const loadNotifications = useCallback(
    async (mode: 'initial' | 'manual' | 'background' = 'manual') => {
      if (!isBorrower) {
        setNotifications([]);
        setNotificationsError('');
        setNotificationsLoading(false);
        setNotificationsRefreshing(false);
        return;
      }

      if (mode === 'initial') {
        setNotificationsLoading(true);
      } else if (mode === 'manual') {
        setNotificationsRefreshing(true);
      }

      try {
        const payload = await fetchBorrowerNotifications();
        setNotifications(payload);
        setNotificationsError('');
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 0)) {
          setNotificationsError(
            error instanceof Error ? error.message : 'Unable to load borrower notifications right now.'
          );
        }
      } finally {
        setNotificationsLoading(false);
        setNotificationsRefreshing(false);
      }
    },
    [isBorrower]
  );

  useEffect(() => {
    if (!isBorrower) {
      setNotifications([]);
      setNotificationsError('');
      setNotificationsLoading(false);
      setNotificationsRefreshing(false);
      setRecentlyReconnected(false);
      return;
    }

    void loadNotifications('initial');
  }, [isBorrower, loadNotifications, user?.id]);

  useEffect(() => {
    const unsubscribe = subscribeApiConnectivity((isOnline) => {
      setIsOffline(!isOnline);

      if (wasOfflineRef.current && isOnline) {
        setRecentlyReconnected(true);
        void loadNotifications('background');
      }

      wasOfflineRef.current = !isOnline;
    });

    return unsubscribe;
  }, [loadNotifications]);

  useEffect(() => {
    if (!recentlyReconnected) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setRecentlyReconnected(false);
    }, 3500);

    return () => clearTimeout(timeoutId);
  }, [recentlyReconnected]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      const returningToForeground =
        (previousState === 'inactive' || previousState === 'background') &&
        nextAppState === 'active';

      if (isBorrower && returningToForeground) {
        void loadNotifications('background');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isBorrower, loadNotifications]);

  useEffect(() => {
    if (!isBorrower) {
      return;
    }

    const intervalId = setInterval(() => {
      if (appStateRef.current === 'active') {
        void loadNotifications('background');
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isBorrower, loadNotifications]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    let previousNotifications: AppNotification[] = [];
    setNotifications((current) => {
      previousNotifications = current;
      return current.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      );
    });

    try {
      await markBorrowerNotificationRead(notificationId);
    } catch (error) {
      setNotifications(previousNotifications);
      if (!(error instanceof ApiError && error.status === 0)) {
        setNotificationsError(
          error instanceof Error ? error.message : 'Unable to update this notification right now.'
        );
      }
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const unreadNotifications = notifications.filter((notification) => !notification.read);
    if (unreadNotifications.length === 0) {
      return;
    }

    const previousNotifications = notifications;
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));

    try {
      await Promise.all(
        unreadNotifications.map((notification) => markBorrowerNotificationRead(notification.id))
      );
    } catch (error) {
      setNotifications(previousNotifications);
      if (!(error instanceof ApiError && error.status === 0)) {
        setNotificationsError(
          error instanceof Error ? error.message : 'Unable to mark notifications as read right now.'
        );
      }
    }
  }, [notifications]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const value = useMemo<BorrowerStatusContextType>(
    () => ({
      notifications,
      unreadNotificationCount,
      notificationsLoading,
      notificationsRefreshing,
      notificationsError,
      isOffline,
      recentlyReconnected,
      refreshNotifications: async () => {
        await loadNotifications('manual');
      },
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      isOffline,
      loadNotifications,
      markAllNotificationsRead,
      markNotificationRead,
      notifications,
      notificationsError,
      notificationsLoading,
      notificationsRefreshing,
      recentlyReconnected,
      unreadNotificationCount,
    ]
  );

  return (
    <BorrowerStatusContext.Provider value={value}>{children}</BorrowerStatusContext.Provider>
  );
};

export const useBorrowerStatus = () => {
  const context = useContext(BorrowerStatusContext);
  if (!context) {
    throw new Error('useBorrowerStatus must be used within BorrowerStatusProvider');
  }
  return context;
};
