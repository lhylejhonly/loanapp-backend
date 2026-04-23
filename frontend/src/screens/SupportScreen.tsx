import React from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
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
  ShieldCheck,
} from 'lucide-react-native';
import { Card } from '../components/Card';
import { LinearGradient } from '../components/LinearGradient';
import { colors, radii, spacing } from '../../constants/theme';

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

export const SupportScreen = ({ navigation }: any) => {
  const tabBarHeight = useBottomTabBarHeight();

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
        Get help with borrower verification, documents, loan applications, payments, and account privacy.
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
});
