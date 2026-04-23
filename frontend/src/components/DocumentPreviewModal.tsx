import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ExternalLink, Eye, FileText, X } from 'lucide-react-native';
import { colors, radii, spacing } from '../../constants/theme';

type Props = {
  visible: boolean;
  title: string;
  fileName?: string;
  fileUrl?: string;
  onClose: () => void;
};

const IMAGE_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'];

const canPreviewInline = (fileName?: string, fileUrl?: string) => {
  const normalizedValue = `${fileName ?? ''} ${fileUrl ?? ''}`.toLowerCase();
  return IMAGE_FILE_EXTENSIONS.some((extension) => normalizedValue.includes(extension));
};

export const DocumentPreviewModal = ({
  visible,
  title,
  fileName,
  fileUrl,
  onClose,
}: Props) => {
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const previewInline = useMemo(() => canPreviewInline(fileName, fileUrl), [fileName, fileUrl]);

  const handleOpenExternal = async () => {
    if (!fileUrl) {
      Alert.alert('Unavailable', 'This document does not have a file URL yet.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(fileUrl);
      if (!supported) {
        Alert.alert('Unavailable', 'This device cannot open the document link.');
        return;
      }

      await Linking.openURL(fileUrl);
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to open this document right now.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <View style={styles.previewIcon}>
                {previewInline ? (
                  <Eye size={18} color={colors.primary} strokeWidth={2.4} />
                ) : (
                  <FileText size={18} color={colors.primary} strokeWidth={2.4} />
                )}
              </View>
              <View style={styles.titleTextWrap}>
                <Text style={styles.title}>{title}</Text>
                {fileName ? (
                  <Text style={styles.fileName} numberOfLines={2}>
                    {fileName}
                  </Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
              <X size={18} color={colors.text} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <View style={styles.previewWrap}>
            {!fileUrl ? (
              <Text style={styles.helperText}>This document does not have a previewable file yet.</Text>
            ) : previewInline && !imageFailed ? (
              <>
                {imageLoading ? (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.helperText}>Loading image preview...</Text>
                  </View>
                ) : null}
                <Image
                  source={{ uri: fileUrl }}
                  style={[styles.previewImage, imageLoading && styles.previewImageHidden]}
                  resizeMode="contain"
                  onLoadStart={() => {
                    setImageLoading(true);
                    setImageFailed(false);
                  }}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => {
                    setImageLoading(false);
                    setImageFailed(true);
                  }}
                />
              </>
            ) : (
              <Text style={styles.helperText}>
                Inline preview is not available for this file type. Use the button below to open it in your device browser or file viewer.
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.openBtn} onPress={() => void handleOpenExternal()} activeOpacity={0.88}>
            <ExternalLink size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.openBtnText}>Open Full File</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 26, 46, 0.72)',
    padding: spacing.md,
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  previewIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2 },
  fileName: { fontSize: 12, color: colors.textLight, lineHeight: 18 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    minHeight: 280,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    padding: spacing.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  loaderWrap: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  previewImage: {
    width: '100%',
    minHeight: 280,
    maxHeight: 520,
  },
  previewImageHidden: {
    opacity: 0.12,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textLight,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  openBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
