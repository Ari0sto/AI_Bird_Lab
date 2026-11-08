import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { getAnalysisQuota, getWalletStatus, type AnalysisQuota } from '@/services/subscription';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut, authenticatedFetch } = useAuth();
  const [quota, setQuota] = useState<AnalysisQuota | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');

  const refreshSubscription = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      // A successful quota request is authoritative for subscription access.
      const currentQuota = await getAnalysisQuota(authenticatedFetch);
      setQuota(currentQuota);
      try {
        const wallet = await getWalletStatus(authenticatedFetch);
        setWalletAddress(wallet.linked ? wallet.walletAddress : null);
      } catch {
        // Wallet address is supplementary; quota can still be displayed.
        setWalletAddress(null);
      }
    } catch (error) {
      setQuota(null);
      setWalletAddress(null);
      setStatusError(error instanceof Error ? error.message : 'Could not load subscription status.');
    } finally {
      setStatusLoading(false);
    }
  }, [authenticatedFetch]);

  useFocusEffect(useCallback(() => {
    void refreshSubscription();
  }, [refreshSubscription]));

  const shortenedWallet = walletAddress && walletAddress.length > 13
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : walletAddress;
  return <ScrollView style={styles.root} contentContainerStyle={[
    styles.content, { paddingTop: insets.top + 20 },
  ]}>
    <View style={styles.header}>
      <Text style={styles.kicker}>WELCOME TO</Text>
      <Text style={styles.title}>AI Bird Lab</Text>
      <Text style={styles.subtitle}>Identify bird species using artificial intelligence.</Text>
    </View>
    <View style={styles.hero}>
      <Text style={styles.heroTitle}>Bird Recognition</Text>
      <Text style={styles.heroText}>Analyze photographs or bird sounds and explore verified species information.</Text>
      <View style={styles.status}><View style={styles.dot} /><Text style={styles.statusText}>Mobile app connected to AI Bird Lab</Text></View>
    </View>
    <View style={styles.subscriptionCard}>
      <View style={styles.subscriptionHeader}>
        <Text style={styles.subscriptionHeading}>Your Subscription</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh subscription status"
          onPress={() => { void refreshSubscription(); }}
          disabled={statusLoading}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      {statusLoading ? (
        <View style={styles.subscriptionRow}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.subscriptionDetail}>Checking subscription...</Text>
        </View>
      ) : statusError ? (
        <Text style={styles.subscriptionError}>Status unavailable: {statusError}</Text>
      ) : quota?.subscriptionActive ? (
        <>
          <Text style={styles.premiumTitle}>Premium Active</Text>
          <Text style={styles.subscriptionDetail}>Unlimited photo and audio analysis</Text>
          {shortenedWallet ? <Text style={styles.walletText}>Wallet: {shortenedWallet}</Text> : null}
        </>
      ) : quota ? (
        <>
          <Text style={styles.freeTitle}>Free Plan</Text>
          <Text style={styles.subscriptionDetail}>
            {quota.remainingAttempts} of {quota.freeLimit} free analyses remaining
          </Text>
          <Text style={styles.walletText}>
            {shortenedWallet ? `Linked wallet: ${shortenedWallet}` : 'No wallet linked'}
          </Text>
          <Text style={styles.subscriptionHint}>Subscriptions can be activated in the Web App.</Text>
        </>
      ) : null}
    </View>
    <Text style={styles.heading}>Explore Features</Text>
    <TouchableOpacity style={styles.card} onPress={() => router.push('/analyze')}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>Photo & Audio Analysis</Text>
        <Text style={styles.cardDetail}>Select a photo, use the camera or upload an audio recording</Text>
      </View><Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.card} onPress={() => router.push('/history')}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>Analysis History</Text>
        <Text style={styles.cardDetail}>Search, delete and export previous results</Text>
      </View><Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.card} onPress={() => router.push('/statistics')}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>Statistics</Text>
        <Text style={styles.cardDetail}>View recognition counts and common bird species</Text>
      </View><Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
    <Text style={styles.account}>Signed in as {session?.email ?? 'Unknown'}</Text>
    <TouchableOpacity style={styles.logout} onPress={() => { void signOut(); }}>
      <Text style={styles.logoutText}>Sign Out</Text>
    </TouchableOpacity>
    <Text style={styles.footer}>AI Bird Lab · Mobile Application</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 24, paddingBottom: 45 },
  header: { marginBottom: 27 },
  kicker: { color: COLORS.primary, letterSpacing: 3, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  title: { color: COLORS.heading, fontWeight: '800', fontSize: 38, marginBottom: 10 },
  subtitle: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 24 },
  hero: { backgroundColor: COLORS.darkCard, borderRadius: 20, padding: 24, marginBottom: 30 },
  heroTitle: { color: COLORS.white, fontWeight: '700', fontSize: 23, marginBottom: 11 },
  heroText: { color: COLORS.textOnDark, fontSize: 15, lineHeight: 23, marginBottom: 19 },
  status: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.accent, marginRight: 9 },
  statusText: { color: COLORS.textOnDark, fontSize: 12, flexShrink: 1 },
  subscriptionCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border,
    borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 27 },
  subscriptionHeader: { flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12 },
  subscriptionHeading: { color: COLORS.heading, fontSize: 18, fontWeight: '700' },
  refreshText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  subscriptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subscriptionDetail: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
  premiumTitle: { color: COLORS.success, fontWeight: '800', fontSize: 23, marginBottom: 5 },
  freeTitle: { color: COLORS.heading, fontWeight: '800', fontSize: 23, marginBottom: 5 },
  walletText: { color: COLORS.textSecondary, fontSize: 12, marginTop: 9 },
  subscriptionHint: { color: COLORS.textMuted, fontSize: 12, marginTop: 9, lineHeight: 18 },
  subscriptionError: { color: COLORS.danger, fontSize: 13, lineHeight: 20 },
  heading: { color: COLORS.heading, fontWeight: '700', fontSize: 21, marginBottom: 15 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, padding: 19, marginBottom: 13,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  cardContent: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 5 },
  cardDetail: { color: COLORS.textSecondary, lineHeight: 20, fontSize: 13 },
  arrow: { color: COLORS.primary, marginLeft: 15, fontSize: 28 },
  account: { textAlign: 'center', fontSize: 12, color: COLORS.textSecondary, marginTop: 20 },
  logout: { alignItems: 'center', backgroundColor: COLORS.surface, borderColor: COLORS.border,
    borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  logoutText: { color: COLORS.primary, fontWeight: '700' },
  footer: { color: COLORS.textMuted, textAlign: 'center', fontSize: 12, marginTop: 27 },
});
