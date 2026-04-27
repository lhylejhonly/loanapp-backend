import React from 'react';
import { Platform, Pressable, Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBarButtonProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  ClipboardList,
  Clock3,
  FileText,
  House,
  LayoutDashboard,
  MessageCircle,
  PieChart,
  ReceiptText,
  Settings,
  Users,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { LandingScreen } from '../screens/LandingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { VerificationCodeScreen } from '../screens/VerificationCodeScreen';
import { BorrowerHomeScreen } from '../screens/BorrowerHomeScreen';
import { LoanProgramsScreen } from '../screens/LoanProgramsScreen';
import { DocumentsScreen } from '../screens/DocumentsScreen';
import { FindUsScreen } from '../screens/FindUsScreen';
import { StageScreen } from '../screens/StageScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OfficerApplicationsScreen } from '../screens/OfficerApplicationsScreen';
import { OfficerPaymentsScreen } from '../screens/OfficerPaymentsScreen';
import { OfficerBorrowersScreen } from '../screens/OfficerBorrowersScreen';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { AdminUsersScreen } from '../screens/AdminUsersScreen';
import { AdminLoansScreen } from '../screens/AdminLoansScreen';
import { AdminLoanTypesScreen } from '../screens/AdminLoanTypesScreen';
import { AdminReportsScreen } from '../screens/AdminReportsScreen';
import { AdminMessagesScreen } from '../screens/AdminMessagesScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { PostLoginSplashScreen } from '../screens/PostLoginSplashScreen';
import { BorrowerHistoryScreen } from '../screens/BorrowerHistoryScreen';
import { DocumentCenterScreen } from '../screens/DocumentCenterScreen';
import { TermsScreen } from '../screens/TermsScreen';
import { RepaymentScheduleScreen } from '../screens/RepaymentScheduleScreen';
import { FlowchartScreen } from '../screens/FlowchartScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';

import { colors, spacing } from '../../constants/theme';
const Stack = createNativeStackNavigator();

const Tab = createBottomTabNavigator();

const appTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

const getCommonTabOptions = ({
  bottomInset,
  isCompactScreen,
  width,
}: {
  bottomInset: number;
  isCompactScreen: boolean;
  width: number;
}) => {
  const isWideLayout = width >= 720;
  const useFloatingDock = Platform.OS !== 'web';
  const mobileSideInset = isCompactScreen ? spacing.xs : spacing.sm;
  const tabBarHeight = isCompactScreen ? 74 : 82;
  const tabBarBottom = isWideLayout ? spacing.lg : Math.max(bottomInset - spacing.xs, 2);
  const tabBarPaddingBottom = isCompactScreen ? 9 : 11;
  const floatingDockWidth = Math.min(width - mobileSideInset * 2, 680);
  const floatingDockOffset = Math.max((width - floatingDockWidth) / 2, spacing.md);

  return {
    headerStyle: {
      backgroundColor: colors.card,
    },
    headerTitleStyle: {
      color: colors.text,
      fontWeight: '700' as const,
    },
    headerShadowVisible: false,
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.tabInactive,
    tabBarStyle: {
      height: tabBarHeight,
      paddingBottom: tabBarPaddingBottom,
      paddingTop: isWideLayout ? 10 : 8,
      paddingHorizontal: isWideLayout ? 18 : 10,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.98)' : colors.card,
      borderRadius: isWideLayout ? 28 : 22,
      borderWidth: 1,
      borderColor: '#DCE6FF',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isWideLayout ? 0.16 : 0.12,
      shadowRadius: isWideLayout ? 28 : 22,
      zIndex: 20,
      borderTopWidth: 0,
      elevation: 12,
      ...(useFloatingDock
        ? {
            position: 'absolute' as const,
            left: isWideLayout ? floatingDockOffset : mobileSideInset,
            right: isWideLayout ? floatingDockOffset : mobileSideInset,
            bottom: tabBarBottom,
          }
        : {
            position: 'relative' as const,
            alignSelf: 'center' as const,
            width: Math.min(width - spacing.md * 2, floatingDockWidth),
            marginBottom: spacing.md,
          }),
    },
    tabBarItemStyle: {
      borderRadius: 18,
      marginHorizontal: isWideLayout ? 6 : 2,
      paddingHorizontal: isWideLayout ? 6 : 0,
    },
    tabBarLabelStyle: {
      fontSize: isCompactScreen ? 11 : 12,
      fontWeight: '600' as const,
      marginTop: 4,
    },
    tabBarIconStyle: {
      marginTop: 2,
    },
    sceneContainerStyle: {
      backgroundColor: colors.background,
      paddingBottom: useFloatingDock ? tabBarHeight + tabBarBottom + spacing.xl : spacing.md,
    },
  };
};

const getBorrowerTabOptions = ({
  isCompactScreen,
  width,
  bottomInset,
}: {
  isCompactScreen: boolean;
  width: number;
  bottomInset: number;
}) => {
  const isWideLayout = width >= 720;
  const useFloatingDock = Platform.OS !== 'web';
  const mobileSideInset = isCompactScreen ? spacing.xs + 2 : spacing.sm;
  const tabBarHeight = isCompactScreen ? 70 : 76;
  const tabBarBottom = isWideLayout
    ? spacing.lg
    : Platform.OS === 'ios'
      ? Math.max(Math.round(bottomInset * 0.35), spacing.xs)
      : 4;
  const floatingDockWidth = Math.min(width - mobileSideInset * 2, 408);
  const floatingDockOffset = Math.max((width - floatingDockWidth) / 2, spacing.md);

  return {
    headerStyle: {
      backgroundColor: colors.card,
    },
    headerTitleStyle: {
      color: colors.text,
      fontWeight: '700' as const,
    },
    headerShadowVisible: false,
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: '#C9CED9',
    tabBarStyle: {
      height: tabBarHeight,
      paddingTop: 6,
      paddingBottom: isCompactScreen ? 7 : 9,
      paddingHorizontal: isCompactScreen ? 7 : 10,
      backgroundColor: 'rgba(255,255,255,0.985)',
      borderRadius: 24,
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: '#DCE6FF',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 22,
      elevation: 10,
      ...(useFloatingDock
        ? {
            position: 'absolute' as const,
            left: isWideLayout ? floatingDockOffset : mobileSideInset,
            right: isWideLayout ? floatingDockOffset : mobileSideInset,
            bottom: tabBarBottom,
          }
        : {
            position: 'relative' as const,
            alignSelf: 'center' as const,
            width: Math.min(width - spacing.md, floatingDockWidth),
            marginBottom: spacing.md,
          }),
    },
    tabBarItemStyle: {
      borderRadius: 18,
      marginHorizontal: 0,
      paddingHorizontal: 0,
    },
    tabBarLabelStyle: {
      fontSize: isCompactScreen ? 7 : 8,
      fontWeight: '700' as const,
      marginTop: 2,
      letterSpacing: 0.3,
    },
    tabBarIconStyle: {
      marginTop: 1,
    },
    sceneContainerStyle: {
      backgroundColor: colors.background,
      paddingBottom: useFloatingDock ? tabBarHeight + tabBarBottom + spacing.xl + spacing.xs : spacing.md,
    },
  };
};

const getAdminTabOptions = ({
  isCompactScreen,
  width,
  bottomInset,
}: {
  isCompactScreen: boolean;
  width: number;
  bottomInset: number;
}) => {
  const isWideLayout = width >= 720;
  const useFloatingDock = Platform.OS !== 'web';
  const mobileSideInset = isCompactScreen ? spacing.xs : spacing.sm;
  const tabBarHeight = isCompactScreen ? 74 : 82;
  const tabBarBottom = isWideLayout ? spacing.lg : Math.max(bottomInset - spacing.xs, 2);
  const floatingDockWidth = Math.min(width - mobileSideInset * 2, 560);
  const floatingDockOffset = Math.max((width - floatingDockWidth) / 2, spacing.md);

  return {
    headerStyle: {
      backgroundColor: colors.card,
    },
    headerTitleStyle: {
      color: colors.text,
      fontWeight: '700' as const,
    },
    headerShadowVisible: false,
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.tabInactive,
    tabBarStyle: {
      height: tabBarHeight,
      paddingBottom: isCompactScreen ? 8 : 10,
      paddingTop: 8,
      paddingHorizontal: isCompactScreen ? 6 : 10,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.985)' : colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: '#DCE6FF',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isWideLayout ? 0.16 : 0.12,
      shadowRadius: 24,
      zIndex: 20,
      borderTopWidth: 0,
      elevation: 12,
      ...(useFloatingDock
        ? {
            position: 'absolute' as const,
            left: isWideLayout ? floatingDockOffset : mobileSideInset,
            right: isWideLayout ? floatingDockOffset : mobileSideInset,
            bottom: tabBarBottom,
          }
        : {
            position: 'relative' as const,
            alignSelf: 'center' as const,
            width: Math.min(width - spacing.md * 2, floatingDockWidth),
            marginBottom: spacing.md,
          }),
    },
    tabBarItemStyle: {
      borderRadius: 16,
      marginHorizontal: 0,
      paddingHorizontal: 0,
    },
    tabBarLabelStyle: {
      fontSize: isCompactScreen ? 8 : 9,
      fontWeight: '700' as const,
      marginTop: 3,
      letterSpacing: 0.2,
    },
    tabBarIconStyle: {
      marginTop: 1,
    },
    sceneContainerStyle: {
      backgroundColor: colors.background,
      paddingBottom: useFloatingDock ? tabBarHeight + tabBarBottom + spacing.xl : spacing.md,
    },
  };
};

const renderTabIcon = (
  IconComponent: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
) => {
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return (
      <View style={[styles.tabIconWrap, focused ? styles.tabIconWrapActive : undefined]}>
        <IconComponent size={18} color={focused ? '#FFFFFF' : color} strokeWidth={2.3} />
      </View>
    );
  }

  TabIcon.displayName = `TabIcon(${IconComponent.displayName ?? IconComponent.name ?? 'Icon'})`;
  return TabIcon;
};

const renderBorrowerTabIcon = (
  IconComponent: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
) => {
  function BorrowerTabIcon({ color, focused }: { color: string; focused: boolean }) {
    return (
      <View style={styles.borrowerTabIconWrap}>
        <IconComponent
          size={focused ? 19 : 18}
          color={focused ? colors.primary : color}
          strokeWidth={focused ? 2.5 : 2.2}
        />
      </View>
    );
  }

  BorrowerTabIcon.displayName = `BorrowerTabIcon(${IconComponent.displayName ?? IconComponent.name ?? 'Icon'})`;
  return BorrowerTabIcon;
};

const BorrowerCenterTabButton = ({
  accessibilityState,
  onLongPress,
  onPress,
  style,
  testID,
}: BottomTabBarButtonProps) => {
  const focused = Boolean(accessibilityState?.selected);

  return (
    <Pressable
      accessibilityLabel="Apply for a Loan"
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        styles.centerTabButtonWrap,
        pressed ? styles.centerTabButtonPressed : undefined,
      ]}
      testID={testID}
    >
      <View style={[styles.centerTabButton, focused ? styles.centerTabButtonActive : undefined]}>
        <FileText size={21} color="#FFFFFF" strokeWidth={2.4} />
      </View>
      <Text style={[styles.centerTabLabel, focused ? styles.centerTabLabelActive : undefined]}>
        APPLY
      </Text>
    </Pressable>
  );
};

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Landing" component={LandingScreen} />
    <Stack.Screen name="Browse" component={BorrowerHomeScreen} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="VerificationCode" component={VerificationCodeScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <Stack.Screen name="Flowchart" component={FlowchartScreen} />
  </Stack.Navigator>
);

const BorrowerTabs = ({
  bottomInset,
  isCompactScreen,
  width,
}: {
  bottomInset: number;
  isCompactScreen: boolean;
  width: number;
}) => (
  <Tab.Navigator screenOptions={getBorrowerTabOptions({ isCompactScreen, width, bottomInset })}>
    <Tab.Screen
      name="Home"
      component={BorrowerHomeScreen}
      options={{
        headerShown: false,
        tabBarLabel: 'HOME',
        tabBarIcon: renderBorrowerTabIcon(House),
      }}
    />
    <Tab.Screen
      name="Stage"
      component={StageScreen}
      options={{
        headerShown: false,
        tabBarLabel: 'STAGE',
        tabBarIcon: renderBorrowerTabIcon(PieChart),
      }}
    />
    <Tab.Screen
      name="LoanPrograms"
      component={LoanProgramsScreen}
      options={{
        headerShown: false,
        tabBarLabel: 'APPLY',
        tabBarIcon: () => null,
        tabBarButton: (props) => <BorrowerCenterTabButton {...props} />,
      }}
    />
    <Tab.Screen
      name="Notifications"
      component={NotificationsScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="Documents"
      component={DocumentsScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="FindUs"
      component={FindUsScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="DocumentCenter"
      component={DocumentCenterScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="Terms"
      component={TermsScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="Support"
      component={SupportScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="RepaymentSchedule"
      component={RepaymentScheduleScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="Flowchart"
      component={FlowchartScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="History"
      component={BorrowerHistoryScreen}
      options={{
        headerShown: false,
        tabBarLabel: 'HISTORY',
        tabBarIcon: renderBorrowerTabIcon(Clock3),
      }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{
        headerShown: false,
        tabBarLabel: 'SETTINGS',
        tabBarIcon: renderBorrowerTabIcon(Settings),
      }}
    />
    <Tab.Screen
      name="ChangePassword"
      component={ChangePasswordScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
  </Tab.Navigator>
);

const OfficerTabs = ({
  bottomInset,
  isCompactScreen,
  width,
}: {
  bottomInset: number;
  isCompactScreen: boolean;
  width: number;
}) => (
  <Tab.Navigator screenOptions={getCommonTabOptions({ bottomInset, isCompactScreen, width })}>
    <Tab.Screen
      name="Applications"
      component={OfficerApplicationsScreen}
      options={{
        tabBarIcon: renderTabIcon(ClipboardList),
      }}
    />
    <Tab.Screen
      name="Payments"
      component={OfficerPaymentsScreen}
      options={{
        tabBarIcon: renderTabIcon(ReceiptText),
      }}
    />
    <Tab.Screen
      name="Borrowers"
      component={OfficerBorrowersScreen}
      options={{
        tabBarIcon: renderTabIcon(Users),
      }}
    />
    <Tab.Screen
      name="Messages"
      component={AdminMessagesScreen}
      options={{
        tabBarIcon: renderTabIcon(MessageCircle),
      }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{
        tabBarIcon: renderTabIcon(Settings),
        headerShown: false,
      }}
    />
    <Tab.Screen
      name="ChangePassword"
      component={ChangePasswordScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="Support"
      component={SupportScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
  </Tab.Navigator>
);

const AdminTabs = ({
  bottomInset,
  isCompactScreen,
  isSuperAdmin,
  width,
}: {
  bottomInset: number;
  isCompactScreen: boolean;
  isSuperAdmin: boolean;
  width: number;
}) => (
  <Tab.Navigator screenOptions={getAdminTabOptions({ isCompactScreen, width, bottomInset })}>
    <Tab.Screen
      name="Dashboard"
      component={AdminDashboardScreen}
      options={{
        tabBarLabel: 'DASH',
        tabBarIcon: renderTabIcon(LayoutDashboard),
      }}
    />
    <Tab.Screen
      name="Users"
      component={AdminUsersScreen}
      options={{
        tabBarLabel: 'USERS',
        tabBarIcon: renderTabIcon(Users),
      }}
    />
    <Tab.Screen
      name="Transactions"
      component={AdminLoansScreen}
      options={{
        tabBarLabel: 'LOANS',
        tabBarIcon: renderTabIcon(ReceiptText),
      }}
    />
    <Tab.Screen
      name="Loan Types"
      component={AdminLoanTypesScreen}
      options={{
        tabBarLabel: 'TYPES',
        tabBarIcon: renderTabIcon(FileText),
      }}
    />
    <Tab.Screen
      name="Reports"
      component={AdminReportsScreen}
      options={{
        tabBarLabel: 'REPORT',
        tabBarIcon: renderTabIcon(ClipboardList),
      }}
    />
    <Tab.Screen
      name="Messages"
      component={AdminMessagesScreen}
      options={{
        tabBarLabel: 'MSGS',
        tabBarIcon: renderTabIcon(MessageCircle),
      }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{
        tabBarLabel: 'SET',
        tabBarIcon: renderTabIcon(Settings),
        headerShown: false,
      }}
    />
    <Tab.Screen
      name="ChangePassword"
      component={ChangePasswordScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
    <Tab.Screen
      name="Support"
      component={SupportScreen}
      options={{
        headerShown: false,
        tabBarButton: () => null,
      }}
    />
  </Tab.Navigator>
);

export const AppNavigator = () => {
  const { user, authLoading, postLoginSplashVisible } = useAuth();
  const { width } = useWindowDimensions();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const isCompactScreen = width < 380;

  if (authLoading) {
    return (
      <PostLoginSplashScreen
        subtitle="Securing your session"
        loadingLabel="Loading your account"
      />
    );
  }

  if (user && postLoginSplashVisible) {
    return <PostLoginSplashScreen />;
  }

  return (
    <NavigationContainer theme={appTheme}>
      {!user ? (
        <AuthStack />
      ) : user.role === 'admin' ? (
        <AdminTabs
          bottomInset={bottomInset}
          isCompactScreen={isCompactScreen}
          isSuperAdmin={Boolean(user.isSuperuser)}
          width={width}
        />
      ) : user.role === 'officer' ? (
        <OfficerTabs bottomInset={bottomInset} isCompactScreen={isCompactScreen} width={width} />
      ) : (
        <BorrowerTabs bottomInset={bottomInset} isCompactScreen={isCompactScreen} width={width} />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: '#B9C8FF',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  borrowerTabIconWrap: {
    width: 30,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTabButtonWrap: {
    top: -4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerTabButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  centerTabButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  centerTabButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: '#E9EEFF',
  },
  centerTabLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: '#C9CED9',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  centerTabLabelActive: {
    color: colors.primary,
  },
});

