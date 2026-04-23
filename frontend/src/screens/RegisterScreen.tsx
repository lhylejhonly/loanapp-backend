import React, { useRef, useState } from 'react';
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
import { Check, CircleDollarSign, Eye, EyeOff } from 'lucide-react-native';
import { ApiError, sendEmailVerificationCodeRequest } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { colors } from '../../constants/theme';

const getRegistrationPasswordChecks = (value: string) => {
  const normalizedValue = value.trim();
  return {
    minLength: normalizedValue.length >= 8,
    hasNumber: /[0-9]/.test(normalizedValue),
    hasSpecialCharacter: /[^A-Za-z0-9]/.test(normalizedValue),
  };
};

const hasStrongRegistrationPassword = (value: string) => {
  const checks = getRegistrationPasswordChecks(value);
  return checks.minLength && checks.hasNumber && checks.hasSpecialCharacter;
};

const getRetryAfterSeconds = (error: unknown) => {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object') return 0;
  const payload = error.details as { retry_after_seconds?: unknown };
  return typeof payload.retry_after_seconds === 'number' && Number.isFinite(payload.retry_after_seconds)
    ? Math.max(0, Math.ceil(payload.retry_after_seconds))
    : 0;
};

export const RegisterScreen = ({ navigation }: any) => {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const { register } = useAuth();
  const passwordChecks = getRegistrationPasswordChecks(password);
  const normalizedPassword = password.trim();
  const normalizedConfirmPassword = confirmPassword.trim();
  const passwordRequirements = [
    { label: 'At least 8 characters', met: passwordChecks.minLength },
    { label: 'Contains a number', met: passwordChecks.hasNumber },
    { label: 'Contains a special character', met: passwordChecks.hasSpecialCharacter },
  ];
  const passwordsMatch =
    normalizedConfirmPassword.length > 0 && normalizedPassword === normalizedConfirmPassword;

  const canSubmit = !loading && username.trim().length > 0 && name.trim().length > 0 &&
    email.trim().length > 0 && phoneNumber.trim().length > 0 && password.length > 0 && confirmPassword.length > 0;

  const handleRegister = async () => {
    setError('');
    const u = username.trim().toLowerCase();
    const n = name.trim();
    const e = email.trim().toLowerCase();
    const ph = phoneNumber.trim();
    const pw = password.trim();
    const cpw = confirmPassword.trim();

    if (!u || !n || !e || !ph || !pw || !cpw) { setError('Please complete all fields.'); return; }
    if (!/^[a-z0-9_.-]{3,30}$/.test(u)) { setError('Username: 3-30 chars, letters/numbers/dots/underscores only.'); return; }
    if (n.length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (!e.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (ph.replace(/\D/g, '').length < 10) { setError('Please enter a valid phone number.'); return; }
    if (!hasStrongRegistrationPassword(pw)) {
      setError('Password must be at least 8 characters and include a number and special character.');
      return;
    }
    if (pw !== cpw) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await register(u, n, e, pw, ph);
      let initialInfo = '';
      let initialError = '';
      let skipInitialSend = false;
      let initialCooldownSeconds = 0;
      try {
        const sendResult = await sendEmailVerificationCodeRequest({ email: e });
        initialInfo = 'A verification code was sent to your email.';
        skipInitialSend = true;
        initialCooldownSeconds = sendResult.cooldownSeconds;
      } catch (sendError) {
        initialError = sendError instanceof Error ? sendError.message : 'Account created, but code could not be sent.';
        initialCooldownSeconds = getRetryAfterSeconds(sendError);
      }
      navigation.navigate('VerificationCode', { username: u, email: e, password: pw, initialInfo, initialError, skipInitialSend, initialCooldownSeconds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: {
      ref?: React.RefObject<TextInput | null>;
      nextRef?: React.RefObject<TextInput | null>;
      placeholder?: string;
      keyboard?: 'default' | 'email-address' | 'phone-pad';
      capitalize?: 'none' | 'words';
      secure?: boolean;
      last?: boolean;
    } = {}
  ) => (
    <View style={styles.inputWrap} key={label}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        ref={opts.ref}
        style={[styles.input, opts.secure && { paddingRight: 46 }]}
        value={value}
        onChangeText={(v) => { onChange(v); if (error) setError(''); }}
        placeholder={opts.placeholder ?? ''}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={opts.capitalize ?? 'none'}
        autoCorrect={false}
        keyboardType={opts.keyboard ?? 'default'}
        secureTextEntry={opts.secure && !showPassword}
        editable={!loading}
        returnKeyType={opts.last ? 'done' : 'next'}
        onSubmitEditing={opts.last ? (loading ? undefined : handleRegister) : () => opts.nextRef?.current?.focus()}
      />
      {opts.secure ? (
        <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn} hitSlop={8}>
          {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <LinearGradient colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingHorizontal: compact ? 18 : 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.shell, { maxWidth: compact ? 360 : 400 }]}>

              <View style={styles.heroWrap}>
                <LinearGradient colors={['#1E3A8A', '#2F56D4', '#4169E1']} style={styles.logoBadge}>
                  <CircleDollarSign size={30} color="#FFFFFF" strokeWidth={2.2} />
                </LinearGradient>
                <Text style={styles.brand}>ElevateFunds</Text>
                <Text style={styles.tagline}>Create your borrower account</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>GET STARTED</Text>
                <Text style={styles.cardTitle}>Create your account</Text>
                <Text style={styles.cardDesc}>Use at least 8 characters with a number and special character.</Text>

                {field('Username', username, setUsername, { placeholder: 'juandelacruz', nextRef: nameRef })}
                {field('Full name', name, setName, { ref: nameRef, placeholder: 'Juan Dela Cruz', capitalize: 'words', nextRef: emailRef })}
                {field('Email address', email, setEmail, { ref: emailRef, placeholder: 'you@example.com', keyboard: 'email-address', nextRef: phoneRef })}
                {field('Phone number', phoneNumber, setPhoneNumber, { ref: phoneRef, placeholder: '09XX XXX XXXX', keyboard: 'phone-pad', nextRef: passwordRef })}
                {field('Password', password, setPassword, { ref: passwordRef, placeholder: 'At least 8 chars, 1 number, 1 symbol', secure: true, nextRef: confirmRef })}
                <View style={styles.requirementsCard}>
                  <Text style={styles.requirementsEyebrow}>PASSWORD MUST HAVE</Text>
                  {passwordRequirements.map((requirement) => (
                    <View style={styles.requirementRow} key={requirement.label}>
                      <View style={[styles.requirementIcon, requirement.met ? styles.requirementIconMet : null]}>
                        {requirement.met ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                      <Text style={[styles.requirementText, requirement.met ? styles.requirementTextMet : null]}>
                        {requirement.label}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.requirementHint}>Use a strong password that is not easy to guess.</Text>
                </View>
                {field('Confirm password', confirmPassword, setConfirmPassword, { ref: confirmRef, placeholder: 'Repeat your password', secure: true, last: true })}
                {normalizedConfirmPassword ? (
                  <Text
                    style={[
                      styles.passwordMatchText,
                      passwordsMatch ? styles.passwordMatchTextSuccess : styles.passwordMatchTextError,
                    ]}
                  >
                    {passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}
                  </Text>
                ) : null}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable
                  style={[styles.btnWrap, !canSubmit && styles.btnDisabled]}
                  onPress={handleRegister}
                  disabled={!canSubmit}
                >
                  <LinearGradient
                    colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>{loading ? 'Creating account...' : 'Create account'}</Text>
                  </LinearGradient>
                </Pressable>

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>Log in</Text>
                </View>
              </View>

              <Pressable style={styles.guestBtn} onPress={() => navigation.navigate('Browse')}>
                <Text style={styles.guestText}>Continue as guest</Text>
              </Pressable>
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
  kav: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  shell: { width: '100%', alignItems: 'center' },

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
  cardTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  cardDesc: { color: colors.textLight, fontSize: 13, lineHeight: 19, marginBottom: 18 },

  inputWrap: { marginBottom: 14 },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: {
    minHeight: 52,
    backgroundColor: '#F8FCFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
  },
  requirementsCard: {
    marginTop: 2,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#DCE6FF',
    backgroundColor: '#F8FCFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  requirementsEyebrow: {
    color: colors.textLight,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  requirementIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#B9C8FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requirementIconMet: {
    borderColor: '#0F766E',
    backgroundColor: '#0F766E',
  },
  requirementText: {
    flex: 1,
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  requirementTextMet: {
    color: colors.text,
  },
  requirementHint: {
    marginTop: 4,
    color: colors.textLight,
    fontSize: 12,
    lineHeight: 18,
  },
  eyeBtn: { position: 'absolute', right: 14, bottom: 16 },
  passwordMatchText: {
    marginTop: -6,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  passwordMatchTextSuccess: {
    color: '#0F766E',
  },
  passwordMatchTextError: {
    color: colors.danger,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },

  btnWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  btnDisabled: { opacity: 0.6 },
  btnGradient: { minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' },
  footerText: { color: colors.textLight, fontSize: 14 },
  footerLink: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  guestBtn: {
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1.5,
    borderColor: '#B9C8FF',
  },
  guestText: { color: '#2F56D4', fontSize: 14, fontWeight: '700' },
});
