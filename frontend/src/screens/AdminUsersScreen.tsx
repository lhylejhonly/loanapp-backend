import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { UserAvatar } from '../components/UserAvatar';
import { ApiError } from '../api/client';
import { createAdminUser, fetchAdminUsers, updateAdminUser } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { User } from '../../types';
import { colors, spacing } from '../../constants/theme';

const formatDate = (value: string) => {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
};

const formatRole = (role: User['role']) => {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'officer':
      return 'Officer';
    default:
      return 'Borrower';
  }
};

export const AdminUsersScreen = () => {
  const { user } = useAuth();
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const tabBarHeight = useBottomTabBarHeight();
  const canCreateAdmins = Boolean(user?.isSuperuser);

  const loadManagedUsers = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const payload = await fetchAdminUsers();
      setManagedUsers(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load user accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadManagedUsers();
    }, [loadManagedUsers])
  );

  const resetForm = () => {
    setUsername('');
    setName('');
    setEmail('');
    setPhoneNumber('');
    setPassword('');
  };

  const handleCreateAdmin = async () => {
    if (!canCreateAdmins) {
      Alert.alert('Restricted', 'Only the super admin can create admin accounts.');
      return;
    }

    if (!username.trim() || !name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Username, name, email, and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      const createdAdmin = await createAdminUser({
        username,
        name,
        email,
        password,
        phoneNumber,
      });

      setManagedUsers((prev) => [createdAdmin, ...prev.filter((item) => item.id !== createdAdmin.id)]);
      setError(null);
      resetForm();
      Alert.alert(
        'Admin account created',
        `${createdAdmin.name} can now sign in with username ${createdAdmin.username}.`
      );
    } catch (submitError) {
      Alert.alert(
        'Failed',
        submitError instanceof ApiError ? submitError.message : 'Unable to create admin account.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (managedUser: User) => {
    if (user?.id === managedUser.id) {
      Alert.alert('Unavailable', 'You cannot deactivate your own account.');
      return;
    }

    setTogglingId(managedUser.id);
    try {
      const updatedUser = await updateAdminUser(managedUser.id, {
        active: !managedUser.active,
      });

      setManagedUsers((prev) =>
        prev.map((item) => (item.id === updatedUser.id ? updatedUser : item))
      );
      Alert.alert(
        'Status updated',
        `${updatedUser.name} is now ${updatedUser.active ? 'active' : 'inactive'}.`
      );
    } catch (toggleError) {
      Alert.alert(
        'Failed',
        toggleError instanceof ApiError ? toggleError.message : 'Unable to update admin account.'
      );
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + spacing.xl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadManagedUsers('refresh')}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.title}>User Management</Text>
      <Text style={styles.subtitle}>
        Admins can review all non-superuser accounts here, monitor their roles, and activate or deactivate access.
      </Text>

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>Access policy</Text>
        <Text style={styles.infoText}>All admins can manage borrower, officer, and regular admin accounts.</Text>
        <Text style={styles.infoText}>Only the super admin can provide new admin accounts.</Text>
        <Text style={styles.infoText}>Super admin accounts stay excluded from this screen.</Text>
      </Card>

      {canCreateAdmins ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Create Admin Account</Text>
          <Input label="Username" value={username} onChangeText={setUsername} placeholder="admin.jane" />
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Jane Admin" />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="jane.admin@example.com"
            keyboardType="email-address"
          />
          <Input
            label="Phone Number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+63 912 345 6789"
            keyboardType="phone-pad"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 6 characters"
            secureTextEntry
          />
          <Button title="Create Admin Account" onPress={handleCreateAdmin} loading={submitting} />
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>All Users</Text>
        <Text style={styles.sectionMeta}>{managedUsers.length} account{managedUsers.length === 1 ? '' : 's'}</Text>
      </View>

      {loading ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateText}>Loading user accounts...</Text>
        </Card>
      ) : null}

      {!loading && error ? (
        <Card style={styles.stateCard}>
          <Text style={styles.stateTitle}>Unable to load user accounts</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Button title="Try again" onPress={() => void loadManagedUsers()} />
        </Card>
      ) : null}

      {!loading && !error && managedUsers.length === 0 ? (
        <Card style={styles.stateCard}>
          <Text style={styles.stateTitle}>No user accounts found</Text>
          <Text style={styles.stateText}>There are no non-superuser accounts to manage right now.</Text>
        </Card>
      ) : null}

      {!loading && !error
        ? managedUsers.map((managedUser) => (
            <Card key={managedUser.id} style={styles.userCard}>
              <View style={styles.userHeader}>
                <UserAvatar
                  name={managedUser.name}
                  photoUrl={managedUser.profilePhotoUrl}
                  size={46}
                  containerStyle={styles.userAvatar}
                />
                <View style={styles.userHeaderText}>
                  <Text style={styles.userName}>{managedUser.name}</Text>
                  <Text style={styles.userMeta}>@{managedUser.username ?? 'user'}</Text>
                </View>
                <View style={styles.badgeColumn}>
                  <View
                    style={[
                      styles.roleBadge,
                      managedUser.role === 'admin'
                        ? styles.adminRoleBadge
                        : managedUser.role === 'officer'
                        ? styles.officerRoleBadge
                        : styles.borrowerRoleBadge,
                    ]}
                  >
                    <Text style={styles.statusText}>{formatRole(managedUser.role).toUpperCase()}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      managedUser.active ? styles.activeBadge : styles.inactiveBadge,
                    ]}
                  >
                    <Text style={styles.statusText}>{managedUser.active ? 'ACTIVE' : 'INACTIVE'}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.detailText}>Email: {managedUser.email}</Text>
              <Text style={styles.detailText}>
                Phone: {managedUser.phoneNumber?.trim() ? managedUser.phoneNumber : 'Not provided'}
              </Text>
              <Text style={styles.detailText}>Created: {formatDate(managedUser.createdAt)}</Text>
              <Text style={styles.detailText}>
                Verification: {managedUser.verificationStatus ? managedUser.verificationStatus.replace('_', ' ') : 'n/a'}
              </Text>

              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  managedUser.active ? styles.deactivateButton : styles.activateButton,
                  (togglingId === managedUser.id || user?.id === managedUser.id) ? styles.disabledButton : undefined,
                ]}
                onPress={() => void handleToggleActive(managedUser)}
                disabled={togglingId === managedUser.id || user?.id === managedUser.id}
              >
                {togglingId === managedUser.id ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.toggleText}>
                    {user?.id === managedUser.id ? 'Current Account' : managedUser.active ? 'Deactivate' : 'Activate'}
                  </Text>
                )}
              </TouchableOpacity>
            </Card>
          ))
        : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textLight,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  infoCard: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  infoText: {
    fontSize: 13,
    color: colors.textLight,
    lineHeight: 19,
  },
  formCard: {
    marginBottom: spacing.lg,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionMeta: {
    fontSize: 13,
    color: colors.textLight,
  },
  stateCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  stateText: {
    fontSize: 14,
    color: colors.textLight,
    lineHeight: 20,
  },
  userCard: {
    marginBottom: spacing.sm,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  userAvatar: {
    backgroundColor: colors.primarySoft,
  },
  userHeaderText: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  userMeta: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 2,
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  adminRoleBadge: {
    backgroundColor: '#DCE6FF',
  },
  officerRoleBadge: {
    backgroundColor: '#EDE9FE',
  },
  borrowerRoleBadge: {
    backgroundColor: '#ECFDF5',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
  },
  inactiveBadge: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  detailText: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 2,
  },
  toggleButton: {
    marginTop: spacing.md,
    minHeight: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  activateButton: {
    backgroundColor: colors.success,
  },
  deactivateButton: {
    backgroundColor: colors.danger,
  },
  disabledButton: {
    opacity: 0.8,
  },
  toggleText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
