import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { ArrowLeft, CircleDollarSign } from 'lucide-react-native';
import { ApiError, verifyEmailCodeRequest, sendEmailVerificationCodeRequest } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { colors } from '../../constants/theme';

const CODE_LENGTH = 6;
const MIN_CODE_LENGTH = 4;

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return email;
  }

  const visible = local.slice(0, 4);
  return `${visible}${local.length > 4 ? '***' : '*'}@${domain}`;
};

const getRetryAfterSeconds = (error: unknown) => {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object') {
    return 0;
  }

  const payload = error.details as { retry_after_seconds?: unknown };
  return typeof payload.retry_after_seconds === 'number' && Number.isFinite(payload.retry_after_seconds)
    ? Math.max(0, Math.ceil(payload.retry_after_seconds))
    : 0;
};

const formatCountdown = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const VerificationCodeScreen = ({ navigation, route }: any) => {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const params = route?.params ?? {};
  const username = typeof params.username === 'string' ? params.username : '';
  const email = typeof params.email === 'string' ? params.email : '';
  const password = typeof params.password === 'string' ? params.password : '';
  const initialInfo = typeof params.initialInfo === 'string' ? params.initialInfo : '';
  const initialError = typeof params.initialError === 'string' ? params.initialError : '';
  const skipInitialSend = Boolean(params.skipInitialSend);
  const initialCooldownSeconds =
    typeof params.initialCooldownSeconds === 'number' && Number.isFinite(params.initialCooldownSeconds)
      ? Math.max(0, Math.ceil(params.initialCooldownSeconds))
      : 0;

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState(initialError);
  const [info, setInfo] = useState(initialInfo);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(initialCooldownSeconds);
  const [verificationLockoutSeconds, setVerificationLockoutSeconds] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(0);
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const { login } = useAuth();

  const contactPreview = useMemo(() => (email ? maskEmail(email) : 'your email address'), [email]);
  const submitDisabled = loading || sendingCode || verificationLockoutSeconds > 0;
  const resendDisabled = sendingCode || resendCooldownSeconds > 0 || verificationLockoutSeconds > 0;

  const resetInputs = () => {
    setDigits(Array(CODE_LENGTH).fill(''));
    setError('');
    setFocusedIndex(0);
    inputsRef.current[0]?.focus();
  };

  const applyRetryState = (err: unknown) => {
    const retryAfterSeconds = getRetryAfterSeconds(err);
    if (retryAfterSeconds <= 0) {
      return;
    }

    if (err instanceof ApiError && err.code === 'verification_locked') {
      setVerificationLockoutSeconds(retryAfterSeconds);
      return;
    }

    setResendCooldownSeconds(retryAfterSeconds);
  };

  const sendVerificationCode = async (isResend: boolean) => {
    if (!email) {
      setError('Sign up session expired. Please sign up again.');
      return;
    }

    if (verificationLockoutSeconds > 0) {
      setError(`Too many incorrect codes. Try again in ${formatCountdown(verificationLockoutSeconds)}.`);
      return;
    }

    if (isResend && resendCooldownSeconds > 0) {
      return;
    }

    setSendingCode(true);
    setError('');
    setInfo('');
    try {
      const result = await sendEmailVerificationCodeRequest({ email });
      resetInputs();
      setVerificationLockoutSeconds(0);
      setResendCooldownSeconds(result.cooldownSeconds);
      setInfo(isResend ? 'A new code was sent to your email.' : 'A verification code was sent to your email.');
    } catch (err) {
      applyRetryState(err);
      setError(err instanceof Error ? err.message : 'Unable to send verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  useEffect(() => {
    if (resendCooldownSeconds <= 0 && verificationLockoutSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setVerificationLockoutSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldownSeconds, verificationLockoutSeconds]);

  useEffect(() => {
    if (skipInitialSend || initialInfo || initialError || initialCooldownSeconds > 0) {
      return;
    }

    sendVerificationCode(false);
  }, [initialCooldownSeconds, initialError, initialInfo, skipInitialSend]);

  const handleDigitChange = (value: string, index: number) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setError('');

    if (!sanitized) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      const maxPasteLength = CODE_LENGTH - index;
      const chunks = sanitized.slice(0, maxPasteLength).split('');

      chunks.forEach((digit, chunkIndex) => {
        next[index + chunkIndex] = digit;
      });

      return next;
    });

    const nextIndex = Math.min(index + sanitized.length, CODE_LENGTH - 1);
    setFocusedIndex(nextIndex);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key !== 'Backspace') {
      return;
    }

    if (!digits[index] && index > 0) {
      setFocusedIndex(index - 1);
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    const joined = digits.join('');

    if (!username || !email || !password) {
      setError('Sign up session expired. Please sign up again.');
      return;
    }

    if (verificationLockoutSeconds > 0) {
      setError(`Too many incorrect codes. Try again in ${formatCountdown(verificationLockoutSeconds)}.`);
      return;
    }

    if (joined.length < MIN_CODE_LENGTH) {
      setError('Please enter your verification code.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    try {
      const verified = await verifyEmailCodeRequest({
        email,
        code: joined,
      });
      if (!verified) {
        setError('Invalid verification code.');
        return;
      }
      await login(username, password);
    } catch (err) {
      applyRetryState(err);
      setError(err instanceof Error ? err.message : 'Unable to finish verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']} style={styles.container}>
      <View style={styles.bgOrbLarge} />
      <View style={styles.bgOrbSmall} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingHorizontal: compact ? 18 : 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.shell, { maxWidth: compact ? 360 : 410 }]}>
              <View style={styles.topBar}>
                <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
                  <ArrowLeft size={18} color={colors.primaryDeep} />
                </Pressable>
                <Text style={styles.backLabel}>Back to sign up</Text>
              </View>

              <View style={styles.heroWrap}>
                <LinearGradient colors={['#1E3A8A', '#2F56D4', '#4169E1']} style={styles.logoBadge}>
                  <CircleDollarSign size={30} color="#FFFFFF" strokeWidth={2.2} />
                </LinearGradient>
                <Text style={styles.brand}>ElevateFunds</Text>
                <Text style={styles.tagline}>Secure email confirmation</Text>
                <View style={styles.emailPill}>
                  <Text style={styles.emailPillText}>{contactPreview}</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>EMAIL VERIFICATION</Text>
                <Text style={styles.cardTitle}>Enter the code</Text>
                <Text style={styles.cardDesc}>
                  {error
                    ? `We could not deliver a usable code yet. Review the message below, then request another code for ${contactPreview}.`
                    : `Type the ${CODE_LENGTH}-digit code we sent to ${contactPreview}.`}
                </Text>

                <View style={[styles.codeRow, compact ? styles.codeRowCompact : undefined]}>
                  {digits.map((digit, index) => (
                    <TextInput
                      key={String(index)}
                      ref={(input) => {
                        inputsRef.current[index] = input;
                      }}
                      style={[
                        styles.codeInput,
                        compact ? styles.codeInputCompact : undefined,
                        digit ? styles.codeInputFilled : undefined,
                        focusedIndex === index ? styles.codeInputFocused : undefined,
                      ]}
                      keyboardType="number-pad"
                      value={digit}
                      onChangeText={(value) => handleDigitChange(value, index)}
                      onKeyPress={(event) => handleKeyPress(event.nativeEvent.key, index)}
                      onFocus={() => setFocusedIndex(index)}
                      onBlur={() => setFocusedIndex((prev) => (prev === index ? null : prev))}
                      autoFocus={index === 0}
                      selectionColor={colors.primary}
                      editable={!loading && !sendingCode}
                      textAlign="center"
                      textContentType="oneTimeCode"
                      maxLength={CODE_LENGTH}
                    />
                  ))}
                </View>

                <Text style={styles.codeHint}>Enter one digit per box, or paste the full code into any box.</Text>

                {error ? (
                  <View style={[styles.notice, styles.noticeError]}>
                    <Text style={[styles.noticeText, styles.noticeErrorText]}>{error}</Text>
                  </View>
                ) : null}

                {info ? (
                  <View style={[styles.notice, styles.noticeInfo]}>
                    <Text style={[styles.noticeText, styles.noticeInfoText]}>{info}</Text>
                  </View>
                ) : null}

                <View style={styles.resendSection}>
                  {verificationLockoutSeconds > 0 ? (
                    <Text style={styles.resendText}>
                      Verification is temporarily locked. Try again in{' '}
                      <Text style={styles.resendCountdown}>{formatCountdown(verificationLockoutSeconds)}</Text>.
                    </Text>
                  ) : resendCooldownSeconds > 0 ? (
                    <Text style={styles.resendText}>
                      You can request another code in{' '}
                      <Text style={styles.resendCountdown}>{formatCountdown(resendCooldownSeconds)}</Text>.
                    </Text>
                  ) : (
                    <Text style={styles.resendText}>Did not receive the email yet?</Text>
                  )}

                  <Pressable
                    style={[styles.resendButton, resendDisabled ? styles.resendButtonDisabled : undefined]}
                    onPress={() => sendVerificationCode(true)}
                    disabled={resendDisabled}
                  >
                    <Text
                      style={[
                        styles.resendButtonText,
                        resendDisabled ? styles.resendButtonTextDisabled : undefined,
                      ]}
                    >
                      {sendingCode
                        ? 'Sending new code...'
                        : verificationLockoutSeconds > 0
                          ? 'Resend unavailable'
                          : resendCooldownSeconds > 0
                            ? `Resend in ${formatCountdown(resendCooldownSeconds)}`
                            : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.submitWrap, submitDisabled ? styles.submitDisabled : undefined]}
                  onPress={handleSubmit}
                  disabled={submitDisabled}
                >
                  <LinearGradient
                    colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}
                  >
                    <Text style={styles.submitText}>
                      {sendingCode ? 'Sending code...' : loading ? 'Submitting...' : 'Verify email'}
                    </Text>
                  </LinearGradient>
                </Pressable>

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>
                    Log in
                  </Text>
                </View>
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
  bgOrbLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(124,202,244,0.22)',
    top: -40,
    right: -70,
  },
  bgOrbSmall: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(44,110,145,0.10)',
    bottom: 90,
    left: -55,
  },
  safeArea: { flex: 1 },
  kav: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  shell: { width: '100%', alignItems: 'center' },

  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
  },
  backLabel: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },

  heroWrap: { alignItems: 'center', marginBottom: 22 },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  brand: { color: '#1E3A8A', fontSize: 34, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  tagline: { color: colors.textLight, fontSize: 14, fontWeight: '500' },
  emailPill: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: '#DCE6FF',
  },
  emailPillText: { color: '#2F56D4', fontSize: 13, fontWeight: '700' },

  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 22,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  cardEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  cardTitle: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: 4 },
  cardDesc: { color: colors.textLight, fontSize: 14, lineHeight: 21, marginBottom: 22 },

  codeRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  codeRowCompact: {
    gap: 8,
  },
  codeInput: {
    flex: 1,
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: '#F8FCFF',
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontVariant: ['tabular-nums'],
  },
  codeInputCompact: {
    minHeight: 56,
    borderRadius: 16,
    fontSize: 24,
  },
  codeInputFilled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B9C8FF',
  },
  codeInputFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#4169E1',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  codeHint: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  notice: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeInfo: {
    backgroundColor: 'rgba(65,105,225,0.08)',
    borderColor: '#B9C8FF',
  },
  noticeError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.18)',
  },
  noticeText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  noticeInfoText: {
    color: '#2F56D4',
  },
  noticeErrorText: {
    color: colors.danger,
  },

  resendSection: {
    marginTop: 22,
    alignItems: 'center',
  },
  resendText: {
    color: colors.textLight,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  resendCountdown: {
    color: '#2F56D4',
    fontWeight: '800',
  },
  resendButton: {
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5,
    borderColor: '#B9C8FF',
  },
  resendButtonDisabled: {
    backgroundColor: 'rgba(233,238,255,0.85)',
    borderColor: '#DCE6FF',
  },
  resendButtonText: {
    color: '#2F56D4',
    fontSize: 14,
    fontWeight: '700',
  },
  resendButtonTextDisabled: {
    color: colors.textMuted,
  },

  submitWrap: { borderRadius: 16, overflow: 'hidden', marginTop: 22 },
  submitDisabled: { opacity: 0.65 },
  submitGradient: { minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' },
  footerText: { color: colors.textLight, fontSize: 14 },
  footerLink: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
