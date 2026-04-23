import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { User } from '../../types';
import {
  ApiError,
  fetchCurrentUser,
  loginRequest,
  refreshAccessToken,
  registerRequest,
  subscribeSessionExpired,
} from '../api/auth';
import { useAppData } from './AppDataContext';
import * as SessionStore from '../utils/sessionStore';

type AuthContextType = {
  user: User | null;
  authLoading: boolean;
  postLoginSplashVisible: boolean;
  applyAuthenticatedUserUpdate: (nextUser: User) => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, name: string, email: string, password: string, phoneNumber: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_ACCESS_TOKEN_KEY = 'session_access_token';
const SESSION_REFRESH_TOKEN_KEY = 'session_refresh_token';
const SESSION_USER_ID_KEY = 'session_user_id';

const isSameUser = (a: User | null, b: User | null) => {
  if (!a || !b) {
    return a === b;
  }

  return (
    a.id === b.id &&
    a.username === b.username &&
    a.name === b.name &&
    a.email === b.email &&
    a.profilePhotoUrl === b.profilePhotoUrl &&
    a.phoneNumber === b.phoneNumber &&
    a.smsNotificationsEnabled === b.smsNotificationsEnabled &&
    a.gcashAccountName === b.gcashAccountName &&
    a.gcashAccountNumber === b.gcashAccountNumber &&
    a.role === b.role &&
    a.active === b.active &&
    a.createdAt === b.createdAt &&
    a.verificationStatus === b.verificationStatus &&
    a.verificationUpdatedAt === b.verificationUpdatedAt &&
    a.employmentStatus === b.employmentStatus &&
    a.monthlyIncome === b.monthlyIncome &&
    a.monthlyDebt === b.monthlyDebt &&
    a.approvalStatus === b.approvalStatus &&
    a.approvedAt === b.approvedAt &&
    a.approvedByName === b.approvedByName &&
    a.isSuperuser === b.isSuperuser
  );
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { users, syncUserFromAuth } = useAppData();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [postLoginSplashVisible, setPostLoginSplashVisible] = useState(false);
  const sessionExpiryAlertVisible = useRef(false);

  useEffect(() => {
    if (!postLoginSplashVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPostLoginSplashVisible(false);
    }, 1600);

    return () => clearTimeout(timeoutId);
  }, [postLoginSplashVisible]);

  useEffect(() => {
    const hydrateAuth = async () => {
      try {
        const [storedAccessToken, storedRefreshToken] = await Promise.all([
          SessionStore.getItemAsync(SESSION_ACCESS_TOKEN_KEY),
          SessionStore.getItemAsync(SESSION_REFRESH_TOKEN_KEY),
        ]);

        if (!storedAccessToken || !storedRefreshToken) {
          setUser(null);
          setPostLoginSplashVisible(false);
          await Promise.all([
            SessionStore.deleteItemAsync(SESSION_ACCESS_TOKEN_KEY),
            SessionStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
            SessionStore.deleteItemAsync(SESSION_USER_ID_KEY),
          ]);
          return;
        }

        try {
          const me = await fetchCurrentUser(storedAccessToken);
          syncUserFromAuth(me);
          setUser(me);
          await SessionStore.setItemAsync(SESSION_USER_ID_KEY, me.id);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) {
            throw error;
          }

          const refreshed = await refreshAccessToken(storedRefreshToken);
          const me = await fetchCurrentUser(refreshed.accessToken);
          syncUserFromAuth(me);
          setUser(me);

          await Promise.all([
            SessionStore.setItemAsync(SESSION_ACCESS_TOKEN_KEY, refreshed.accessToken),
            SessionStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, refreshed.refreshToken),
            SessionStore.setItemAsync(SESSION_USER_ID_KEY, me.id),
          ]);
        }
      } catch {
        setUser(null);
        setPostLoginSplashVisible(false);
        await Promise.all([
          SessionStore.deleteItemAsync(SESSION_ACCESS_TOKEN_KEY),
          SessionStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
          SessionStore.deleteItemAsync(SESSION_USER_ID_KEY),
        ]);
      } finally {
        setAuthLoading(false);
      }
    };

    hydrateAuth();
  }, [syncUserFromAuth]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const mirroredUser = users.find((item) => item.id === user.id);
    if (!mirroredUser || isSameUser(user, mirroredUser)) {
      return;
    }

    setUser(mirroredUser);
  }, [user, users]);

  useEffect(() => {
    const unsubscribe = subscribeSessionExpired(() => {
      setUser((currentUser) => {
        if (currentUser && !sessionExpiryAlertVisible.current) {
          sessionExpiryAlertVisible.current = true;
          Alert.alert('Session expired', 'Please sign in again to continue.', [
            {
              text: 'OK',
              onPress: () => {
                sessionExpiryAlertVisible.current = false;
              },
            },
          ]);
        }

        return null;
      });
      setPostLoginSplashVisible(false);
      void Promise.all([
        SessionStore.deleteItemAsync(SESSION_ACCESS_TOKEN_KEY),
        SessionStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
        SessionStore.deleteItemAsync(SESSION_USER_ID_KEY),
      ]);
    });

    return unsubscribe;
  }, []);

  const login = async (username: string, password: string) => {
    const result = await loginRequest({ username, password });
    syncUserFromAuth(result.user);
    setUser(result.user);
    setPostLoginSplashVisible(true);

    await Promise.all([
      SessionStore.setItemAsync(SESSION_ACCESS_TOKEN_KEY, result.accessToken),
      SessionStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, result.refreshToken),
      SessionStore.setItemAsync(SESSION_USER_ID_KEY, result.user.id),
    ]);
  };

  const register = async (username: string, name: string, email: string, password: string, phoneNumber: string) => {
    await registerRequest({
      username,
      name,
      email,
      password,
      phoneNumber,
    });
  };

  const applyAuthenticatedUserUpdate = (nextUser: User) => {
    syncUserFromAuth(nextUser);
    setUser(nextUser);
  };

  const logout = async () => {
    setUser(null);
    setPostLoginSplashVisible(false);
    sessionExpiryAlertVisible.current = false;
    await Promise.all([
      SessionStore.deleteItemAsync(SESSION_ACCESS_TOKEN_KEY),
      SessionStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
      SessionStore.deleteItemAsync(SESSION_USER_ID_KEY),
    ]);
  };

  return (
    <AuthContext.Provider
      value={{ user, authLoading, postLoginSplashVisible, applyAuthenticatedUserUpdate, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
