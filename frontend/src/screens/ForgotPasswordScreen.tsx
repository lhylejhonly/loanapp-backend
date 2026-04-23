import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { ApiError, forgotPasswordRequest, resetPasswordRequest } from '../api/auth';
import { colors } from '../../constants/theme';

type Step = 'email' | 'reset';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSendCode = async () => {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await forgotPasswordRequest(trimmed);
      setInfo('A reset code was sent to your email. Enter it below along with your new password.');
      setStep('reset');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    if (!token.trim()) {
      setError('Enter the reset code from your email.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setError('Password must be at least 8 characters and include a number and special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await resetPasswordRequest(token.trim(), newPassword.trim());
      setInfo('');
      setError('');
      navigation.navigate('Login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. Check your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <ArrowLeft size={18} color={colors.text} strokeWidth={2.3} />
            </Pressable>

            <View style={styles.iconWrap}>
              <ShieldCheck size={28} color={colors.primary} strokeWidth={2.2} />
            </View>

            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? 'Enter your registered email and we will send you a reset code.'
                : 'Enter the 8-digit code from your email and choose a new password.'}
            </Text>

            {info ? <Text style={styles.infoText}>{info}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.card}>
              {step === 'email' ? (
                <>
                  <Text style={styles.label}>Email address</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(''); }}
                    placeholder="you@example.com"
                    placeholderTextColor="#8B8C96"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    returnKeyType="done"
                    onSubmitEditing={loading ? undefined : handleSendCode}
                  />
                  <Pressable
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleSendCode}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send reset code'}</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Reset code (from email)</Text>
                  <TextInput
                    style={styles.input}
                    value={token}
                    onChangeText={(v) => { setToken(v.replace(/\D/g, '')); setError(''); }}
                    placeholder="Enter the 8-digit code"
                    placeholderTextColor="#8B8C96"
                    keyboardType="number-pad"
                    autoCorrect={false}
                    maxLength={8}
                    editable={!loading}
                  />
                  <Text style={styles.label}>New password</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={(v) => { setNewPassword(v); setError(''); }}
                    placeholder="8+ chars, number, special char"
                    placeholderTextColor="#8B8C96"
                    secureTextEntry
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Text style={styles.label}>Confirm new password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
                    placeholder="Repeat new password"
                    placeholderTextColor="#8B8C96"
                    secureTextEntry
                    autoCapitalize="none"
                    editable={!loading}
                    returnKeyType="done"
                    onSubmitEditing={loading ? undefined : handleResetPassword}
                  />
                  <Pressable
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>{loading ? 'Resetting...' : 'Reset password'}</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable style={styles.resendBtn} onPress={() => setStep('email')}>
                    <Text style={styles.resendText}>Resend code</Text>
                  </Pressable>
                </>
              )}
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
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, borderWidth: 1.5, borderColor: '#DCE6FF',
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 16,
    borderWidth: 1.5, borderColor: '#B9C8FF',
  },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textLight, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  infoText: { color: colors.success, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 28,
    borderWidth: 1.5, borderColor: '#DCE6FF',
    paddingHorizontal: 18, paddingVertical: 22,
    shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1, shadowRadius: 28, elevation: 10,
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8, marginTop: 4 },
  input: {
    minHeight: 54, backgroundColor: '#FBFDFF', borderRadius: 16,
    paddingHorizontal: 16, fontSize: 15, color: colors.text,
    borderWidth: 1, borderColor: colors.border, marginBottom: 14,
  },
  button: { borderRadius: 18, overflow: 'hidden', marginTop: 4 },
  buttonDisabled: { opacity: 0.65 },
  buttonGradient: { minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  resendBtn: { alignItems: 'center', marginTop: 16 },
  resendText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
