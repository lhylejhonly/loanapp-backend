import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBorrowerStatus } from '../context/BorrowerStatusContext';

export const ConnectivityBanner = () => {
  const insets = useSafeAreaInsets();
  const { isOffline, recentlyReconnected } = useBorrowerStatus();

  if (!isOffline && !recentlyReconnected) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
        },
      ]}
    >
      <View style={[styles.banner, isOffline ? styles.bannerOffline : styles.bannerOnline]}>
        <Text style={[styles.title, isOffline ? styles.titleOffline : styles.titleOnline]}>
          {isOffline ? 'Offline mode' : 'Back online'}
        </Text>
        <Text style={[styles.message, isOffline ? styles.messageOffline : styles.messageOnline]}>
          {isOffline
            ? 'Uploads and refreshes will retry once the borrower app can reach the backend again.'
            : 'Borrower updates are syncing again.'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 100,
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  bannerOffline: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  bannerOnline: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  titleOffline: {
    color: '#C2410C',
  },
  titleOnline: {
    color: '#047857',
  },
  message: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  messageOffline: {
    color: '#9A3412',
  },
  messageOnline: {
    color: '#065F46',
  },
});
