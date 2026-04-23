import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const inMemoryStore = new Map<string, string>();

const getWebStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }

  return null;
};

export const getItemAsync = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      return storage.getItem(key);
    }

    return inMemoryStore.get(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
};

export const setItemAsync = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      storage.setItem(key, value);
      return;
    }

    inMemoryStore.set(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
};

export const deleteItemAsync = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      storage.removeItem(key);
      return;
    }

    inMemoryStore.delete(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
};
