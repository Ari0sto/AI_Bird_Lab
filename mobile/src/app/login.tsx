import { useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try { await signIn(email, password); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="light" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[
      styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
    ]}>
      <View style={styles.brand}>
        <Text style={styles.logo}>B</Text>
        <Text style={styles.brandTitle}>AI Bird Lab</Text>
        <Text style={styles.brandCaption}>MOBILE APPLICATION</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.body}>Sign in to identify birds using photographs and audio recordings.</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#8DAAA2"
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#8DAAA2"
          secureTextEntry autoComplete="current-password" value={password}
          onChangeText={setPassword} editable={!busy} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Sign In</Text>}
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push('/register')} disabled={busy}>
          <Text style={styles.linkText}>No account? Create one</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>Use the same account as the AI Bird Lab website.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.dark },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { backgroundColor: COLORS.accent, color: COLORS.dark, fontSize: 26,
    fontWeight: '800', width: 56, height: 56, textAlign: 'center',
    textAlignVertical: 'center', borderRadius: 15, overflow: 'hidden', marginBottom: 12 },
  brandTitle: { color: COLORS.white, fontWeight: '800', fontSize: 30 },
  brandCaption: { color: COLORS.accent, letterSpacing: 2.5, fontSize: 11, marginTop: 5 },
  card: { backgroundColor: COLORS.darkCard, padding: 24, borderRadius: 20,
    borderWidth: 1, borderColor: '#496766' },
  title: { color: COLORS.white, fontSize: 25, fontWeight: '800', marginBottom: 8 },
  body: { color: COLORS.textOnDark, lineHeight: 21, marginBottom: 24 },
  label: { color: COLORS.white, fontWeight: '600', fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: COLORS.dark, borderWidth: 1, borderColor: '#496766',
    borderRadius: 10, padding: 14, fontSize: 15, color: COLORS.white, marginBottom: 18 },
  error: { color: '#FFABAB', marginBottom: 12, lineHeight: 20 },
  button: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 4 },
  disabled: { opacity: .5 },
  buttonText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  link: { alignItems: 'center', padding: 14, marginTop: 4 },
  linkText: { color: COLORS.accent, fontWeight: '600' },
  footer: { color: '#8DB2A9', textAlign: 'center', marginTop: 26, fontSize: 12 },
});
