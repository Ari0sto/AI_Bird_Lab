import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { COLORS } from '@/constants/theme';

function Navigator() {
  const { session, isLoading } = useAuth();
  if (isLoading) {
    return <View style={styles.loading}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>;
  }
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!session}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack.Protected>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="(tabs)" />
    </Stack.Protected>
  </Stack>;
}

export default function RootLayout() {
  return <AuthProvider><Navigator /></AuthProvider>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
