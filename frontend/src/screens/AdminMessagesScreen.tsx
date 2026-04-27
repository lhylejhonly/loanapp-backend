import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MessageCircle, Send, X } from 'lucide-react-native';
import { Card } from '../components/Card';
import { colors, radii, spacing } from '../../constants/theme';
import {
  ContactMessage,
  getStaffMessages,
  markMessageRead,
  replyToMessage,
} from '../api/contact';

const STATUS_FILTERS = ['all', 'unread', 'read', 'replied'] as const;
type Filter = (typeof STATUS_FILTERS)[number];

const statusColor: Record<string, string> = {
  unread: '#EF4444',
  read: '#F59E0B',
  replied: '#10B981',
};

export const AdminMessagesScreen = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getStaffMessages(filter === 'all' ? undefined : filter);
      setMessages(data);
    } catch {
      Alert.alert('Error', 'Failed to load messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const openMessage = async (msg: ContactMessage) => {
    setSelected(msg);
    setReply('');
    if (msg.status === 'unread') {
      try {
        const updated = await markMessageRead(msg.id);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      } catch { /* ignore */ }
    }
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const updated = await replyToMessage(selected.id, reply.trim());
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setSelected(updated);
      setReply('');
      Alert.alert('Sent', 'Reply sent successfully.');
    } catch {
      Alert.alert('Error', 'Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {messages.length === 0 && (
            <Text style={styles.empty}>No messages found.</Text>
          )}
          {messages.map((msg) => (
            <TouchableOpacity key={msg.id} onPress={() => void openMessage(msg)} activeOpacity={0.85}>
              <Card style={styles.messageCard}>
                <View style={styles.messageHeader}>
                  <View style={styles.messageMeta}>
                    <Text style={styles.senderName}>{msg.sender_name}</Text>
                    <Text style={styles.senderEmail}>{msg.sender_email}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor[msg.status] + '22' }]}>
                    <Text style={[styles.statusText, { color: statusColor[msg.status] }]}>
                      {msg.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.subject}>{msg.subject}</Text>
                <Text style={styles.preview} numberOfLines={2}>{msg.message}</Text>
                <Text style={styles.date}>{new Date(msg.created_at).toLocaleDateString()}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{selected?.subject}</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <X size={22} color={colors.text} strokeWidth={2.3} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalSender}>{selected?.sender_name} · {selected?.sender_email}</Text>
            <Text style={styles.modalDate}>{selected ? new Date(selected.created_at).toLocaleString() : ''}</Text>
            <Card style={styles.messageBox}>
              <Text style={styles.messageText}>{selected?.message}</Text>
            </Card>
            {selected?.reply ? (
              <Card style={[styles.messageBox, styles.replyBox]}>
                <Text style={styles.replyLabel}>Your reply · {selected.replied_by_name}</Text>
                <Text style={styles.messageText}>{selected.reply}</Text>
              </Card>
            ) : null}
            {selected?.status !== 'replied' && (
              <View style={styles.replySection}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Write a reply..."
                  placeholderTextColor={colors.textMuted}
                  value={reply}
                  onChangeText={setReply}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                  onPress={() => void handleReply()}
                  disabled={sending}
                  activeOpacity={0.85}
                >
                  <Send size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send Reply'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textLight },
  filterChipTextActive: { color: '#FFFFFF' },
  loader: { marginTop: 40 },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  messageCard: { gap: spacing.xs },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  messageMeta: { flex: 1 },
  senderName: { fontSize: 14, fontWeight: '700', color: colors.text },
  senderEmail: { fontSize: 12, color: colors.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  subject: { fontSize: 14, fontWeight: '700', color: colors.text },
  preview: { fontSize: 13, color: colors.textLight, lineHeight: 19 },
  date: { fontSize: 11, color: colors.textMuted },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1, marginRight: spacing.sm },
  modalBody: { padding: spacing.md },
  modalSender: { fontSize: 14, fontWeight: '700', color: colors.text },
  modalDate: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  messageBox: { marginBottom: spacing.sm },
  replyBox: { backgroundColor: colors.primary + '11' },
  replyLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  messageText: { fontSize: 14, lineHeight: 22, color: colors.text },
  replySection: { gap: spacing.sm, marginTop: spacing.sm },
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
  textArea: { minHeight: 100, paddingTop: spacing.sm },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
  },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
