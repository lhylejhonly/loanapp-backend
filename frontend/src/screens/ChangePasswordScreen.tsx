import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Fingerprint, ShieldCheck } from 'lucide-react-native';
import { LinearGradient } from '../components/LinearGradient';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { changePassword } from '../api/account';
import { colors, spacing } from '../../constants/theme';

export const ChangePasswordScreen = ({ navigation }: any) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()) {
      setError('Enter your current password and the new password twice.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccess('Password updated successfully.');
      setTimeout(() => {
        navigation.goBack();
      }, 650);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update your password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.shell}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <ArrowLeft size={18} color={colors.text} strokeWidth={2.3} />
            </Pressable>

            <View style={styles.heroIcon}>
              <Fingerprint size={28} color={colors.primary} strokeWidth={2.2} />
            </View>

            <Text style={styles.title}>Change password</Text>
            <Text style={styles.subtitle}>
              Use a fresh password that is at least 8 characters and includes a number and special
              character.
            </Text>

            {success ? <Text style={styles.successText}>{success}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.card}>
              <Input
                label="Current Password"
                value={currentPassword}
                onChangeText={(value) => {
                  setCurrentPassword(value);
                  if (error) setError('');
                }}
                placeholder="Enter current password"
                secureTextEntry
              />

              <Input
                label="New Password"
                value={newPassword}
                onChangeText={(value) => {
                  setNewPassword(value);
                  if (error) setError('');
                }}
                placeholder="8+ chars, number, special char"
                secureTextEntry
              />

              <Input
                label="Confirm New Password"
                value={confirmNewPassword}
                onChangeText={(value) => {
                  setConfirmNewPassword(value);
                  if (error) setError('');
                }}
                placeholder="Repeat new password"
                secureTextEntry
              />

              <Button
                title="Save New Password"
                onPress={() => void handleSubmit()}
                loading={loading}
              />

              <View style={styles.tipWrap}>
                <ShieldCheck size={15} color={colors.primary} strokeWidth={2.3} />
                <Text style={styles.tipText}>
                  Forgot your current password? Go back to login and use `Forgot password`.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  shell: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#B9C8FF',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
    paddingHorizontal: 18,
    paddingVertical: 22,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 10,
  },
  tipWrap: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tipText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
