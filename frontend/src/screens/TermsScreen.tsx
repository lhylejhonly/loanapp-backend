import React, { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { colors, spacing, radii } from '../../constants/theme';

const SECTIONS = [
  {
    title: '1. Loan Agreement',
    body: 'By submitting a loan application through ElevateFunds, you agree to be bound by these Terms and Conditions. This agreement is entered into between you (the "Borrower") and ElevateFunds ("Lender"). The loan amount, interest rate, and repayment schedule will be specified in your approved loan offer.',
  },
  {
    title: '2. Eligibility Requirements',
    body: 'To qualify for a loan, you must:\n• Be at least 18 years of age\n• Be a resident of the Philippines\n• Have a valid government-issued ID\n• Have a verifiable source of income\n• Have a monthly income of at least PHP 1,200\n• Not be currently declared bankrupt or insolvent',
  },
  {
    title: '3. Interest Rate & Fees',
    body: 'The interest rate applicable to your loan will be disclosed in your loan offer before you accept. Interest is calculated on the outstanding principal balance. Late payment fees may apply if a scheduled payment is missed. ElevateFunds reserves the right to adjust interest rates for new loan applications in accordance with BSP regulations.',
  },
  {
    title: '4. Repayment Obligations',
    body: 'You agree to repay the full loan amount plus applicable interest within the agreed repayment term. Payments must be made on or before the scheduled due date. Failure to repay on time may result in:\n• Late payment penalties\n• Negative impact on your borrower profile\n• Legal action to recover the outstanding balance',
  },
  {
    title: '5. Disbursement',
    body: 'Approved loan funds will be disbursed to your registered GCash account within 1–3 business days after approval. ElevateFunds is not responsible for delays caused by your mobile wallet provider. You are responsible for ensuring your GCash account details are accurate at the time of application.',
  },
  {
    title: '6. Document Verification',
    body: 'All documents submitted must be authentic, current, and belong to the applicant. Submission of falsified, altered, or borrowed documents is a criminal offense under Philippine law (RA 10175 — Cybercrime Prevention Act and RA 3815 — Revised Penal Code). ElevateFunds reserves the right to reject any application where document authenticity cannot be confirmed.',
  },
  {
    title: '7. Data Privacy',
    body: 'ElevateFunds collects and processes your personal data in accordance with the Philippine Data Privacy Act of 2012 (RA 10173). Your data is used solely for loan processing, identity verification, and regulatory compliance. We do not sell your personal information to third parties. You may request access to, correction of, or deletion of your data by contacting our support team.',
  },
  {
    title: '8. Loan Cancellation',
    body: 'You may cancel a pending loan application at any time before it is approved. Once a loan is approved and disbursed, cancellation is not possible. To cancel a pending application, use the "Cancel Application" button on the Stage screen.',
  },
  {
    title: '9. Default & Collections',
    body: 'A loan is considered in default if payment is not received within 30 days of the due date. In the event of default, ElevateFunds may:\n• Charge additional penalties\n• Report the default to credit bureaus\n• Engage a collections agency\n• Pursue legal remedies available under Philippine law',
  },
  {
    title: '10. Amendments',
    body: 'ElevateFunds reserves the right to amend these Terms and Conditions at any time. Continued use of the application after changes are posted constitutes your acceptance of the revised terms. Material changes will be communicated via in-app notification.',
  },
  {
    title: '11. Governing Law',
    body: 'These Terms and Conditions are governed by the laws of the Republic of the Philippines. Any disputes arising from this agreement shall be subject to the exclusive jurisdiction of the courts of Metro Manila, Philippines.',
  },
  {
    title: '12. Contact',
    body: 'For questions about these Terms and Conditions, contact us at:\n\nEmail: support@elevatefunds.com\nPhone: +63 912 345 6789\nAddress: 123 Financial Plaza, 4th Floor, Business District, Metro Manila\nHours: Monday–Friday, 9:00 AM – 5:00 PM',
  },
];

export const TermsScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const returnTo = (route?.params?.returnTo as string | undefined) ?? 'Documents';

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isBottom && !scrolledToBottom) setScrolledToBottom(true);
  };

  const handleAccept = () => {
    navigation.navigate({
      name: returnTo,
      params: { acceptedTermsAt: Date.now() },
      merge: true,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#1E3A8A', '#2F56D4', '#4169E1']}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <ArrowLeft size={18} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
          <Text style={styles.headerSub}>ElevateFunds Loan Agreement — Please read carefully</Text>
        </View>
      </LinearGradient>

      {/* Scroll hint */}
      {!scrolledToBottom ? (
        <View style={styles.scrollHint}>
          <Text style={styles.scrollHintText}>📖 Scroll to the bottom to accept</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.effectiveDate}>Effective Date: January 1, 2025</Text>
        <Text style={styles.intro}>
          Please read these Terms and Conditions carefully before submitting your loan application.
          By ticking the acceptance checkbox, you confirm that you have read, understood, and agree
          to be bound by all terms stated below.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.signatureBox}>
          <Text style={styles.signatureText}>
            By tapping &quot;I Agree & Accept&quot; below, you electronically sign this agreement and confirm
            all information provided is accurate and truthful.
          </Text>
        </View>
      </ScrollView>

      {/* Accept button — fixed at bottom */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TouchableOpacity
          style={[styles.acceptBtn, !scrolledToBottom && styles.acceptBtnDisabled]}
          onPress={handleAccept}
          disabled={!scrolledToBottom}
          activeOpacity={0.88}
        >
          <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.acceptBtnText}>
            {scrolledToBottom ? 'I Agree & Accept' : 'Read all terms to continue'}
          </Text>
        </TouchableOpacity>
        {!scrolledToBottom ? (
          <Text style={styles.footerHint}>Keep scrolling to enable the accept button</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FCFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  scrollHint: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
  },
  scrollHintText: { color: '#92400E', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.md },
  effectiveDate: {
    fontSize: 12, color: colors.textMuted, fontWeight: '600',
    marginBottom: spacing.sm,
  },
  intro: {
    fontSize: 13, color: colors.textLight, lineHeight: 20,
    marginBottom: spacing.lg,
    backgroundColor: '#EFF6FF',
    borderRadius: radii.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  section: {
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAF4',
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '800', color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionBody: {
    fontSize: 13, color: colors.textLight, lineHeight: 21,
  },
  signatureBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#86EFAC',
    marginTop: spacing.sm,
  },
  signatureText: {
    fontSize: 13, color: '#065F46', lineHeight: 20, fontWeight: '600',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2EAF4',
    gap: 6,
  },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.primary,
    borderRadius: radii.lg, minHeight: 52,
  },
  acceptBtnDisabled: { backgroundColor: '#94A3B8' },
  acceptBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  footerHint: {
    textAlign: 'center', fontSize: 11,
    color: colors.textMuted, fontWeight: '600',
  },
});
