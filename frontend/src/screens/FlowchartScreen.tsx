import React, { useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../components/LinearGradient';
import { ArrowDown, ArrowLeft, CheckCircle, Shield, User, Users } from 'lucide-react-native';

type Role = 'borrower' | 'officer' | 'admin';

type FlowNode = {
  id: string;
  label: string;
  sublabel?: string;
  type: 'start' | 'end' | 'step' | 'decision' | 'action' | 'screen';
  branches?: { label: string; nodes: FlowNode[] }[];
};

const BORROWER_FLOW: FlowNode[] = [
  { id: 'b1', label: 'Launch App', type: 'start' },
  { id: 'b2', label: 'Landing Screen', sublabel: 'Browse loan programs or sign in', type: 'screen' },
  {
    id: 'b3', label: 'Has Account?', type: 'decision',
    branches: [
      {
        label: 'No — Register',
        nodes: [
          { id: 'b3a1', label: 'Register Screen', sublabel: 'Name, email, phone, password', type: 'screen' },
          { id: 'b3a2', label: 'Email Verification', sublabel: 'Enter 6-digit code', type: 'screen' },
        ],
      },
      {
        label: 'Yes — Login',
        nodes: [
          { id: 'b3b1', label: 'Login Screen', sublabel: 'Username & password', type: 'screen' },
          { id: 'b3b2', label: 'Forgot Password?', sublabel: 'Reset via email link', type: 'action' },
        ],
      },
    ],
  },
  { id: 'b4', label: 'Post-Login Splash', sublabel: 'Welcome animation', type: 'screen' },
  { id: 'b5', label: 'Borrower Home', sublabel: 'View active loans & balance', type: 'screen' },
  {
    id: 'b6', label: 'What to do?', type: 'decision',
    branches: [
      {
        label: 'Apply for Loan',
        nodes: [
          { id: 'b6a1', label: 'Loan Programs', sublabel: 'Browse available loan types', type: 'screen' },
          { id: 'b6a2', label: 'Select Loan Type', sublabel: 'Choose program & amount', type: 'action' },
          { id: 'b6a3', label: 'Document Center', sublabel: 'Upload required documents', type: 'screen' },
          { id: 'b6a4', label: 'Submit Application', sublabel: 'Confirm & send to officer', type: 'action' },
          { id: 'b6a5', label: 'Awaiting Review', sublabel: 'Officer reviews application', type: 'step' },
          {
            id: 'b6a6', label: 'Decision', type: 'decision',
            branches: [
              { label: 'Approved', nodes: [{ id: 'b6a6a', label: 'Loan Disbursed', sublabel: 'Funds sent via GCash', type: 'end' }] },
              { label: 'Rejected', nodes: [{ id: 'b6a6b', label: 'Rejection Notice', sublabel: 'Reason shown in app', type: 'end' }] },
            ],
          },
        ],
      },
      {
        label: 'Track Loan',
        nodes: [
          { id: 'b6b1', label: 'Stage Screen', sublabel: 'View loan status & progress', type: 'screen' },
          { id: 'b6b2', label: 'Repayment Schedule', sublabel: 'See installment dates', type: 'screen' },
        ],
      },
      {
        label: 'Manage Docs',
        nodes: [
          { id: 'b6c1', label: 'Documents Screen', sublabel: 'Upload & view documents', type: 'screen' },
        ],
      },
      {
        label: 'Notifications',
        nodes: [
          { id: 'b6d1', label: 'Notifications Screen', sublabel: 'Loan & payment alerts', type: 'screen' },
        ],
      },
    ],
  },
];

const OFFICER_FLOW: FlowNode[] = [
  { id: 'o1', label: 'Login', sublabel: 'Officer credentials', type: 'start' },
  { id: 'o2', label: 'Officer Dashboard', sublabel: 'Applications tab', type: 'screen' },
  {
    id: 'o3', label: 'Task', type: 'decision',
    branches: [
      {
        label: 'Review Applications',
        nodes: [
          { id: 'o3a1', label: 'Applications Screen', sublabel: 'List of pending loans', type: 'screen' },
          { id: 'o3a2', label: 'Review Loan Details', sublabel: 'Check amount, docs, borrower', type: 'action' },
          {
            id: 'o3a3', label: 'Decision', type: 'decision',
            branches: [
              { label: 'Approve', nodes: [{ id: 'o3a3a', label: 'Set Interest Rate & Approve', type: 'action' }] },
              { label: 'Reject', nodes: [{ id: 'o3a3b', label: 'Enter Rejection Reason', type: 'action' }] },
            ],
          },
          { id: 'o3a4', label: 'Borrower Notified', sublabel: 'Auto notification sent', type: 'end' },
        ],
      },
      {
        label: 'Repayments',
        nodes: [
          { id: 'o3b1', label: 'Disbursements & Repayments', sublabel: 'Loan release and repayment actions', type: 'screen' },
          { id: 'o3b2', label: 'Select Loan', sublabel: 'Find borrower loan', type: 'action' },
          { id: 'o3b3', label: 'Record Repayment', sublabel: 'Amount, method, reference', type: 'action' },
          { id: 'o3b4', label: 'Balance Updated', sublabel: 'Loan balance reduced', type: 'end' },
        ],
      },
      {
        label: 'View Borrowers',
        nodes: [
          { id: 'o3c1', label: 'Borrowers Screen', sublabel: 'All registered borrowers', type: 'screen' },
          { id: 'o3c2', label: 'Borrower Profile', sublabel: 'Loans, docs, history', type: 'action' },
        ],
      },
    ],
  },
];

const ADMIN_FLOW: FlowNode[] = [
  { id: 'a1', label: 'Login', sublabel: 'Admin / Super Admin', type: 'start' },
  { id: 'a2', label: 'Admin Dashboard', sublabel: 'Overview & metrics', type: 'screen' },
  {
    id: 'a3', label: 'Admin Task', type: 'decision',
    branches: [
      {
        label: 'Manage Users',
        nodes: [
          { id: 'a3a1', label: 'Users Screen', sublabel: 'All borrowers & officers', type: 'screen' },
          { id: 'a3a2', label: 'Create / Edit / Deactivate', sublabel: 'Manage user accounts', type: 'action' },
          { id: 'a3a3', label: 'Approve Pending Admins', sublabel: 'Super admin only', type: 'action' },
        ],
      },
      {
        label: 'Manage Loan Types',
        nodes: [
          { id: 'a3b1', label: 'Loan Types Screen', sublabel: 'All loan programs', type: 'screen' },
          { id: 'a3b2', label: 'Create / Edit Type', sublabel: 'Amounts, rates, terms, docs', type: 'action' },
          { id: 'a3b3', label: 'Activate / Deactivate', sublabel: 'Toggle loan availability', type: 'action' },
        ],
      },
      {
        label: 'View Transactions',
        nodes: [
          { id: 'a3c1', label: 'Loans Screen', sublabel: 'All loans across users', type: 'screen' },
          { id: 'a3c2', label: 'Disburse Loan', sublabel: 'Trigger GCash payout', type: 'action' },
        ],
      },
      {
        label: 'Reports',
        nodes: [
          { id: 'a3d1', label: 'Reports Screen', sublabel: 'Analytics & summaries', type: 'screen' },
        ],
      },
    ],
  },
];

const NODE_STYLES: Record<FlowNode['type'], { bg: string; border: string; textColor: string }> = {
  start:    { bg: '#4169E1', border: '#5A7BEB', textColor: '#FFFFFF' },
  end:      { bg: '#10B981', border: '#059669', textColor: '#FFFFFF' },
  screen:   { bg: '#FFFFFF', border: '#DCE6FF', textColor: '#0F172A' },
  step:     { bg: '#F7F9FF', border: '#B9C8FF', textColor: '#2F56D4' },
  decision: { bg: '#FEF3C7', border: '#FCD34D', textColor: '#92400E' },
  action:   { bg: '#F5F3FF', border: '#C4B5FD', textColor: '#5B21B6' },
};

const FlowNodeBox = ({ node, depth = 0 }: { node: FlowNode; depth?: number }) => {
  const s = NODE_STYLES[node.type];
  const isDecision = node.type === 'decision';

  return (
    <View style={styles.nodeWrapper}>
      <View style={[styles.nodeBox, isDecision && styles.nodeBoxDecision, { backgroundColor: s.bg, borderColor: s.border }]}>
        <Text style={[styles.nodeLabel, { color: s.textColor }]}>{node.label}</Text>
        {node.sublabel ? <Text style={[styles.nodeSublabel, { color: s.textColor, opacity: 0.72 }]}>{node.sublabel}</Text> : null}
      </View>

      {node.branches ? (
        <View style={styles.branchesRow}>
          {node.branches.map((branch, bi) => (
            <View key={bi} style={styles.branchCol}>
              <View style={styles.branchConnector} />
              <View style={[styles.branchLabel]}>
                <Text style={styles.branchLabelText}>{branch.label}</Text>
              </View>
              {branch.nodes.map((child, ci) => (
                <View key={child.id} style={styles.nodeWrapper}>
                  {ci > 0 ? <ArrowDown size={14} color="#94A3B8" style={styles.arrow} /> : null}
                  <FlowNodeBox node={child} depth={depth + 1} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const FlowSection = ({ nodes }: { nodes: FlowNode[] }) => (
  <View style={styles.flowSection}>
    {nodes.map((node, i) => (
      <View key={node.id}>
        {i > 0 ? <ArrowDown size={16} color="#94A3B8" style={styles.arrow} /> : null}
        <FlowNodeBox node={node} />
      </View>
    ))}
  </View>
);

const ROLES: { key: Role; label: string; icon: React.ComponentType<any>; colors: [string, string]; desc: string }[] = [
  { key: 'borrower', label: 'Borrower', icon: User,   colors: ['#4169E1', '#5A7BEB'], desc: 'Register → Apply → Track → Repay' },
  { key: 'officer',  label: 'Officer',  icon: Users,  colors: ['#7C3AED', '#5B21B6'], desc: 'Review loans, disburse funds, record repayments' },
  { key: 'admin',    label: 'Admin',    icon: Shield, colors: ['#0F766E', '#0D9488'], desc: 'Manage Users, Loans & Reports' },
];

const FLOW_MAP: Record<Role, FlowNode[]> = {
  borrower: BORROWER_FLOW,
  officer:  OFFICER_FLOW,
  admin:    ADMIN_FLOW,
};

export const FlowchartScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [activeRole, setActiveRole] = useState<Role>('borrower');
  const role = ROLES.find(r => r.key === activeRole)!;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FF" />
      <LinearGradient colors={['#F7F9FF', '#E9EEFF', '#DCE6FF']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={18} color="#102A5B" strokeWidth={2.5} />
        </TouchableOpacity>

        <Text style={styles.eyebrow}>App Flowchart</Text>
        <Text style={styles.title}>How the Loan App Works</Text>
        <Text style={styles.subtitle}>Select a role to see the full user journey</Text>

        {/* Role Selector */}
        <View style={styles.roleRow}>
          {ROLES.map(r => {
            const Icon = r.icon;
            const active = activeRole === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.roleBtn, active && styles.roleBtnActive]}
                onPress={() => setActiveRole(r.key)}
                activeOpacity={0.85}
              >
                {active ? (
                  <LinearGradient colors={r.colors} style={styles.roleBtnGradient}>
                    <Icon size={16} color="#FFF" strokeWidth={2.2} />
                    <Text style={[styles.roleBtnText, { color: '#FFF' }]}>{r.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.roleBtnInner}>
                    <Icon size={16} color="#64748B" strokeWidth={2.2} />
                    <Text style={styles.roleBtnText}>{r.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Role description */}
        <View style={styles.roleDesc}>
          <CheckCircle size={14} color="#4169E1" strokeWidth={2.5} />
          <Text style={styles.roleDescText}>{role.desc}</Text>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {Object.entries(NODE_STYLES).map(([type, s]) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.bg, borderColor: s.border }]} />
              <Text style={styles.legendText}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
            </View>
          ))}
        </View>

        {/* Flowchart */}
        <View style={styles.chartWrap}>
          <FlowSection nodes={FLOW_MAP[activeRole]} />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  eyebrow: { color: '#4169E1', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#0F172A', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#51627E', fontSize: 13, lineHeight: 20 },

  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: {
    flex: 1, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  roleBtnActive: { borderColor: 'transparent' },
  roleBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  roleBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  roleBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },

  roleDesc: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: 12 },
  roleDescText: { color: '#2F56D4', fontSize: 13, fontWeight: '600', flex: 1 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
  legendText: { fontSize: 11, color: '#64748B', fontWeight: '600' },

  chartWrap: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 24, padding: 16,
    borderWidth: 1, borderColor: '#DCE6FF',
  },
  flowSection: { alignItems: 'center', gap: 2 },

  nodeWrapper: { alignItems: 'center', width: '100%' },
  nodeBox: {
    borderWidth: 1.5, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', width: '90%',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  nodeBoxDecision: { borderRadius: 10, borderStyle: 'dashed' },
  nodeLabel: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  nodeSublabel: { fontSize: 11, textAlign: 'center', marginTop: 2 },

  arrow: { alignSelf: 'center', marginVertical: 3 },

  branchesRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', marginTop: 4 },
  branchCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  branchConnector: { width: 1.5, height: 16, backgroundColor: '#CBD5E1' },
  branchLabel: {
    backgroundColor: '#F1F5F9', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0',
  },
  branchLabelText: { fontSize: 10, fontWeight: '700', color: '#475569', textAlign: 'center' },
});
