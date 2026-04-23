import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { AppDataProvider } from './src/context/AppDataContext';
import { ConnectivityBanner } from './src/components/ConnectivityBanner';
import { BorrowerStatusProvider } from './src/context/BorrowerStatusContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <AuthProvider>
          <BorrowerStatusProvider>
            <ConnectivityBanner />
            <AppNavigator />
          </BorrowerStatusProvider>
        </AuthProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
