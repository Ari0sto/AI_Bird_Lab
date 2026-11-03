import { useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={styles.brand}>
          <Text style={styles.brandIcon}>B</Text>
          <Text style={styles.brandTitle}>AI Bird Lab</Text>
          <Text style={styles.brandSubtitle}>
            MOBILE APPLICATION
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>

          <Text style={styles.description}>
            Sign in to access bird recognition,
            analysis history and statistics.
          </Text>

          <Text style={styles.label}>Email</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#8DAAA2"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#8DAAA2"
            secureTextEntry
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          <Pressable
            style={[
              styles.button,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>
          Use your existing AI Bird Lab account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },

  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  brand: {
    alignItems: 'center',
    marginBottom: 35,
  },

  brandIcon: {
    backgroundColor: COLORS.accent,
    color: COLORS.dark,
    fontSize: 28,
    fontWeight: '800',
    width: 58,
    height: 58,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },

  brandTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.white,
  },

  brandSubtitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: COLORS.accent,
    marginTop: 7,
  },

  card: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#496766',
  },

  title: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 10,
  },

  description: {
    color: COLORS.textOnDark,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 28,
  },

  label: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 9,
  },

  input: {
    backgroundColor: COLORS.dark,
    borderWidth: 1,
    borderColor: '#496766',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: COLORS.white,
    marginBottom: 20,
  },

  error: {
    color: '#FF9B9B',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 20,
  },

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },

  footer: {
    textAlign: 'center',
    color: '#8DB2A9',
    fontSize: 12,
    marginTop: 28,
  },
});