import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from '../components/LinearGradient';
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  Navigation,
  Phone,
} from 'lucide-react-native';
import { Card } from '../components/Card';
import { colors, radii, spacing } from '../../constants/theme';

const OFFICE = {
  name: 'ElevateFunds Loan Center',
  address: '123 Financial Plaza, 4th Floor, Business District, Metro Manila, Philippines',
  phone: '+63 912 345 6789',
  email: 'support@elevatefunds.com',
  hours: [
    'Monday - Friday: 9:00 AM - 5:00 PM',
    'Saturday: 9:00 AM - 12:00 PM',
    'Sunday: Closed',
  ],
  // Coordinates for Makati CBD, Metro Manila
  lat: 14.5547,
  lng: 121.0244,
};

const buildMapsUrl = () => {
  const label = encodeURIComponent(OFFICE.name);
  const query = encodeURIComponent(OFFICE.address);

  if (Platform.OS === 'ios') {
    // Apple Maps with coordinates
    return `http://maps.apple.com/?ll=${OFFICE.lat},${OFFICE.lng}&q=${label}`;
  }

  if (Platform.OS === 'android') {
    // Google Maps with coordinates
    return `geo:${OFFICE.lat},${OFFICE.lng}?q=${OFFICE.lat},${OFFICE.lng}(${label})`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${query}`;
};

const openExternalUrl = async (url: string, failureMessage: string) => {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    Alert.alert('Unavailable', failureMessage);
    return;
  }

  await Linking.openURL(url);
};

export const FindUsScreen = ({ navigation }: any) => {
  const tabBarHeight = useBottomTabBarHeight();

  const openDirections = async () => {
    try {
      await openExternalUrl(
        buildMapsUrl(),
        'Maps is not available on this device right now.'
      );
    } catch {
      Alert.alert('Unavailable', 'Unable to open map directions right now.');
    }
  };

  const callOffice = async () => {
    try {
      await openExternalUrl(
        `tel:${OFFICE.phone.replace(/\s+/g, '')}`,
        'Phone calls are not available on this device right now.'
      );
    } catch {
      Alert.alert('Unavailable', 'Unable to open the phone dialer right now.');
    }
  };

  const emailOffice = async () => {
    try {
      await openExternalUrl(
        `mailto:${OFFICE.email}`,
        'Email is not available on this device right now.'
      );
    } catch {
      Alert.alert('Unavailable', 'Unable to open the email app right now.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.85}
        >
          <ArrowLeft size={18} color="#102A5B" strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerEyebrow}>Find Us</Text>
      </View>

      <Text style={styles.title}>Visit the loan office</Text>
      <Text style={styles.subtitle}>
        Borrowers can use this page to find the branch location, call the office, or open directions.
      </Text>

      <LinearGradient
        colors={['#163CB9', '#3155E7', '#6C84FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.mapGrid} />
        <View style={styles.routePath} />
        <View style={[styles.mapPoint, styles.mapPointStart]} />
        <View style={[styles.mapPoint, styles.mapPointEnd]} />
        <View style={styles.pinWrap}>
          <MapPin size={24} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <Text style={styles.heroLabel}>Nearest borrower support location</Text>
        <Text style={styles.heroTitle}>{OFFICE.name}</Text>
        <Text style={styles.heroAddress}>{OFFICE.address}</Text>

        <TouchableOpacity style={styles.heroButton} onPress={openDirections} activeOpacity={0.88}>
          <Navigation size={16} color="#1738B5" strokeWidth={2.4} />
          <Text style={styles.heroButtonText}>Open Directions</Text>
        </TouchableOpacity>
      </LinearGradient>

      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <MapPin size={18} color={colors.primary} strokeWidth={2.3} />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>Office Address</Text>
            <Text style={styles.infoValue}>{OFFICE.address}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Clock3 size={18} color={colors.primary} strokeWidth={2.3} />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>Office Hours</Text>
            {OFFICE.hours.map((item) => (
              <Text key={item} style={styles.infoValue}>
                {item}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Phone size={18} color={colors.primary} strokeWidth={2.3} />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>Phone</Text>
            <Text style={styles.infoValue}>{OFFICE.phone}</Text>
          </View>
        </View>

        <View style={[styles.infoRow, styles.infoRowLast]}>
          <View style={styles.infoIconWrap}>
            <Mail size={18} color={colors.primary} strokeWidth={2.3} />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>Email</Text>
            <Text style={styles.infoValue}>{OFFICE.email}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.actionCard} onPress={openDirections} activeOpacity={0.88}>
          <Navigation size={18} color="#1738B5" strokeWidth={2.4} />
          <Text style={styles.actionTitle}>Directions</Text>
          <Text style={styles.actionMeta}>Open maps and navigate to the branch.</Text>
          <ExternalLink size={16} color="#7C8BA8" strokeWidth={2.2} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={callOffice} activeOpacity={0.88}>
          <Phone size={18} color="#1738B5" strokeWidth={2.4} />
          <Text style={styles.actionTitle}>Call Office</Text>
          <Text style={styles.actionMeta}>Contact the team handling your loan questions.</Text>
          <ExternalLink size={16} color="#7C8BA8" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.emailCard} onPress={emailOffice} activeOpacity={0.88}>
        <Mail size={18} color="#1738B5" strokeWidth={2.4} />
        <View style={styles.emailBody}>
          <Text style={styles.actionTitle}>Email Support</Text>
          <Text style={styles.actionMeta}>Send questions about requirements, status, or payments.</Text>
        </View>
        <ExternalLink size={16} color="#7C8BA8" strokeWidth={2.2} />
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9EEFF',
  },
  content: {
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  headerEyebrow: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: '#51627E',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  mapGrid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.12,
    backgroundColor: 'transparent',
    borderRadius: 28,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  routePath: {
    position: 'absolute',
    left: 52,
    top: 76,
    width: 144,
    height: 52,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.28)',
    borderStyle: 'dashed',
    borderRadius: 32,
    transform: [{ rotate: '-9deg' }],
  },
  mapPoint: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  mapPointStart: {
    left: 46,
    top: 95,
  },
  mapPointEnd: {
    right: 34,
    top: 58,
  },
  pinWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.md,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  heroAddress: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 260,
    marginBottom: spacing.lg,
  },
  heroButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroButtonText: {
    color: '#1738B5',
    fontSize: 13,
    fontWeight: '800',
  },
  infoCard: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F9',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF3FF',
  },
  infoBody: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1B2942',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 13,
    lineHeight: 19,
    color: '#667085',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionCard: {
    flex: 1,
    minHeight: 142,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5EDFA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  actionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  actionMeta: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 'auto',
  },
  emailCard: {
    minHeight: 84,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5EDFA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emailBody: {
    flex: 1,
  },
});
