import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  FileText,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
} from 'lucide-react-native';
import { Card } from '../components/Card';
import { LinearGradient } from '../components/LinearGradient';
import { colors, radii, spacing } from '../../constants/theme';
import { ApiError } from '../api/client';
import { sendContactMessage } from '../api/contact';
import { useAuth } from '../context/AuthContext';

const SUPPORT = {
  email: 'support@elevatefunds.com',
  phone: '+63 2 8888 0000',
  mobile: '+63 917 000 0000',
  hours: 'Mon-Fri, 8:00 AM - 5:00 PM',
  office: '123 Finance St., Makati City',
};

const openExternalUrl = async (url: string, failureMessage: string) => {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Unavailable', failureMessage);
      return;
    }

    await Linking.openURL(url);
  } catch {
    Alert.alert('Unavailable', failureMessage);
  }
};

const buildSupportEmailUrl = (subject: string, message: string) =>
  `mailto:${SUPPORT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

const shouldOfferEmailFallback = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status === 404 || error.status === 405 || error.status >= 500);

const useSafeBottomTabBarHeight = () => {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useBottomTabBarHeight();
  } catch {
    return 0;
  }
};

export const SupportScreen = ({ navigation }: any) => {
  const { user, authLoading } = useAuth();
  const tabBarHeight = useSafeBottomTabBarHeight();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const isBorrower = user?.role === 'borrower';
  const canOpenMessageInbox = user?.role === 'officer' || user?.role === 'admin';

  const handleSend = async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedSubject || !trimmedMessage) {
      Alert.alert('Required', 'Please fill in both subject and message.');
      return;
    }

    setSending(true);
    try {
      await sendContactMessage(trimmedSubject, trimmedMessage);
      setSubject('');
      setMessage('');
      Alert.alert('Sent', 'Your message has been sent. We will get back to you soon.');
    } catch (err: unknown) {
      if (shouldOfferEmailFallback(err)) {
        Alert.alert(
          'Support service unavailable',
          'The in-app message service is unavailable right now. You can still send the same message using your email app.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Email',
              onPress: () =>
                void openExternalUrl(
                  buildSupportEmailUrl(trimmedSubject, trimmedMessage),
                  'Unable to open the email app right now.'
                ),
            },
          ]
        );
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setSending(false);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Settings')} activeOpacity={0.85}>
          <ArrowLeft size={18} color={colors.primaryDeep} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerEyebrow}>Support</Text>
      </View>

      <Text style={styles.title}>Support Center</Text>
      <Text style={styles.subtitle}>
        {isBorrower
          ? 'Get help with borrower verification, documents, loan applications, payments, and account privacy.'
          : 'View support contact details and manage borrower inquiries from the staff message inbox.'}
      </Text>

      <LinearGradient
        colors={[colors.primaryDeep, colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroBadge}>
          <ShieldCheck size={16} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={styles.heroBadgeText}>Account help</Text>
        </View>
        <Text style={styles.heroTitle}>Questions about eligibility or documents?</Text>
        <Text style={styles.heroText}>
          The support team can help explain required IDs, officer verification, privacy, and payment concerns.
        </Text>

        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaItem}>
            <Clock3 size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.heroMetaText}>{SUPPORT.hours}</Text>
          </View>
          <View style={styles.heroMetaItem}>
            <MapPin size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.heroMetaText}>{SUPPORT.office}</Text>
          </View>
        </View>
      </LinearGradient>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <HelpCircle size={18} color={colors.primary} strokeWidth={2.3} />
          <Text style={styles.sectionTitle}>Help & support</Text>
        </View>
        <Text style={styles.sectionBody}>
          For assistance with uploads, borrower eligibility, document rejection reasons, or loan status updates, contact
          the team during office hours.
        </Text>
      </Card>

      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() =>
            void openExternalUrl(`mailto:${SUPPORT.email}`, 'Unable to open the email app right now.')
          }
          activeOpacity={0.88}
        >
          <Mail size={18} color={colors.primaryDeep} strokeWidth={2.4} />
          <Text style={styles.actionTitle}>Email us</Text>
          <Text style={styles.actionValue}>{SUPPORT.email}</Text>
          <ExternalLink size={15} color={colors.textMuted} strokeWidth={2.2} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() =>
            void openExternalUrl(`tel:${SUPPORT.mobile.replace(/\s+/g, '')}`, 'Unable to open the phone dialer right now.')
          }
          activeOpacity={0.88}
        >
          <Phone size={18} color={colors.primaryDeep} strokeWidth={2.4} />
          <Text style={styles.actionTitle}>Call or SMS</Text>
          <Text style={styles.actionValue}>{SUPPORT.mobile}</Text>
          <ExternalLink size={15} color={colors.textMuted} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <MessageCircle size={18} color={colors.primary} strokeWidth={2.3} />
          <Text style={styles.sectionTitle}>Contact us</Text>
        </View>
        <Text style={styles.sectionListItem}>Email: {SUPPORT.email}</Text>
        <Text style={styles.sectionListItem}>Phone: {SUPPORT.phone}</Text>
        <Text style={styles.sectionListItem}>SMS/Viber: {SUPPORT.mobile}</Text>
        <Text style={styles.sectionListItem}>Office: {SUPPORT.office}</Text>
      </Card>

      {isBorrower ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Send size={18} color={colors.primary} strokeWidth={2.3} />
            <Text style={styles.sectionTitle}>Send us a message</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Subject"
            placeholderTextColor={colors.textMuted}
            value={subject}
            onChangeText={setSubject}
            maxLength={200}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Your message or feedback..."
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={5}
            maxLength={2000}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={() => void handleSend()}
            disabled={sending}
            activeOpacity={0.85}
          >
            <Send size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send Message'}</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MessageCircle size={18} color={colors.primary} strokeWidth={2.3} />
            <Text style={styles.sectionTitle}>Borrower message inbox</Text>
          </View>
          <Text style={styles.sectionBody}>
            In-app support messages are reserved for borrower accounts. Staff users should review and reply from the
            Messages tab instead of sending a new support request here.
          </Text>
          {canOpenMessageInbox ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('Messages')}
              activeOpacity={0.85}
            >
              <MessageCircle size={16} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.secondaryButtonText}>Open Messages Inbox</Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      )}

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <FileText size={18} color={colors.primary} strokeWidth={2.3} />
          <Text style={styles.sectionTitle}>Privacy policy</Text>
        </View>
        <Text style={styles.sectionBody}>
          ElevateFunds collects personal data only to process loan applications, verify borrower identity, manage
          repayments, and comply with legal requirements. Data is encrypted, not sold, and retained only as long as
          required by policy and regulation.
        </Text>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textLight,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textLight,
  },
  heroCard: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.88)',
  },
  heroMetaRow: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroMetaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  actionValue: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textLight,
  },
  sectionCard: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textLight,
  },
  sectionListItem: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textLight,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.sm,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
  },
  secondaryButtonText: {
    color: colors.primaryDeep,
    fontSize: 15,
    fontWeight: '700',
  },
});
