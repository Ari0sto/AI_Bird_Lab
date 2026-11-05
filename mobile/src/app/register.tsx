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

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password || !confirm) {
      setError('Complete all fields.'); return;
    }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try { await signUp(email, password); }
    catch (e) { setError(e instanceof Error ? e.message : 'Registration failed.'); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="light" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[
      styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
    ]}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>AI Bird Lab</Text>
        <Text style={styles.brandCaption}>CREATE AN ACCOUNT</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Join Bird Lab</Text>
        <Text style={styles.description}>Your account works in both the web and mobile applications.</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail}
          placeholder="Email address" placeholderTextColor="#8DAAA2" keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          placeholder="Password" placeholderTextColor="#8DAAA2" secureTextEntry
          autoComplete="new-password" editable={!busy} />
        <Text style={styles.label}>Confirm password</Text>
        <TextInput style={styles.input} value={confirm} onChangeText={setConfirm}
          placeholder="Repeat password" placeholderTextColor="#8DAAA2" secureTextEntry
          editable={!busy} />
        <Text style={styles.hint}>Use the same password rules as the web application.</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Create Account</Text>}
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.back()} disabled={busy}>
          <Text style={styles.linkText}>Already registered? Sign in</Text>
        </Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.dark },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 30 },
  brandTitle: { color: COLORS.white, fontSize: 30, fontWeight: '800' },
  brandCaption: { color: COLORS.accent, letterSpacing: 2.5, fontSize: 11, marginTop: 6 },
  card: { backgroundColor: COLORS.darkCard, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#496766' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.white, marginBottom: 9 },
  description: { color: COLORS.textOnDark, marginBottom: 22, lineHeight: 21 },
  label: { color: COLORS.white, fontWeight: '600', fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: COLORS.dark, borderColor: '#496766', borderWidth: 1,
    borderRadius: 10, color: COLORS.white, padding: 14, fontSize: 15, marginBottom: 17 },
  hint: { color: '#9EBCB4', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  error: { color: '#FFABAB', marginBottom: 12, lineHeight: 20 },
  button: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  disabled: { opacity: .5 },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', padding: 15, marginTop: 4 },
  linkText: { color: COLORS.accent, fontWeight: '600' },
});
