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
import { Eye, EyeOff, CircleDollarSign } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../../constants/theme';

export const LoginScreen = ({ navigation }: any) => {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordInputRef = useRef<TextInput>(null);
  const { login } = useAuth();
  const canSubmit = !loading && username.trim().length > 0 && password.length > 0;

  const handleLogin = async () => {
    setError('');
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { setError('Please enter your username and password.'); return; }
    setLoading(true);
    try {
      await login(u, p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
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
            <View style={[styles.shell, { maxWidth: compact ? 360 : 400 }]}>

              {/* Hero */}
              <View style={styles.heroWrap}>
                <Text style={styles.heroEyebrow}>Borrower access</Text>
                <LinearGradient
                  colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                  style={styles.logoBadge}
                >
                  <CircleDollarSign size={30} color="#FFFFFF" strokeWidth={2.2} />
                </LinearGradient>
                <Text style={styles.brand}>ElevateFunds</Text>
                <Text style={styles.tagline}>Your trusted loan partner</Text>
                <View style={styles.trustRow}>
                  <View style={styles.trustPill}>
                    <Text style={styles.trustText}>Mobile-friendly</Text>
                  </View>
                  <View style={styles.trustPill}>
                    <Text style={styles.trustText}>Fast access</Text>
                  </View>
                  <View style={styles.trustPill}>
                    <Text style={styles.trustText}>Secure login</Text>
                  </View>
                </View>
              </View>

              {/* Card */}
              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>WELCOME BACK</Text>
                <Text style={styles.cardTitle}>Log in to your account</Text>
                <Text style={styles.cardDesc}>Use your registered username and password.</Text>

                {/* Username */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Username</Text>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={(v) => { setUsername(v); if (error) setError(''); }}
                    placeholder="juandelacruz"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                  />
                </View>

                {/* Password */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.input, { paddingRight: 46 }]}
                    value={password}
                    onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    returnKeyType="done"
                    onSubmitEditing={loading ? undefined : handleLogin}
                  />
                  <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn} hitSlop={8}>
                    {showPassword
                      ? <EyeOff size={18} color={colors.textMuted} />
                      : <Eye size={18} color={colors.textMuted} />}
                  </Pressable>
                </View>

                <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* Submit */}
                <Pressable
                  style={[styles.btnWrap, !canSubmit && styles.btnDisabled]}
                  onPress={handleLogin}
                  disabled={!canSubmit}
                >
                  <LinearGradient
                    colors={['#1E3A8A', '#2F56D4', '#4169E1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>{loading ? 'Logging in...' : 'Log in'}</Text>
                  </LinearGradient>
                </Pressable>

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>New user? </Text>
                  <Text style={styles.footerLink} onPress={() => navigation.navigate('Register')}>
                    Create an account
                  </Text>
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

  heroWrap: { alignItems: 'center', marginBottom: 24 },
  heroEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 },
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
  brand: { color: '#1E3A8A', fontSize: 36, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  tagline: { color: colors.textLight, fontSize: 14, fontWeight: '500' },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  trustPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: '#DCE6FF',
  },
  trustText: { color: '#2F56D4', fontSize: 11, fontWeight: '700' },

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
  cardDesc: { color: colors.textLight, fontSize: 13, lineHeight: 19, marginBottom: 20 },

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
  eyeBtn: { position: 'absolute', right: 14, bottom: 16 },
  forgotText: { color: colors.primary, fontSize: 13, fontWeight: '700', textAlign: 'right', marginBottom: 16 },
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
