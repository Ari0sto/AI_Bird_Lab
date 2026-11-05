import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { getStatistics, percentage, type Statistics } from '@/services/birds';

export default function StatisticsScreen() {
  const insets = useSafeAreaInsets();
  const { authenticatedFetch } = useAuth();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setStats(await getStatistics(authenticatedFetch)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load statistics.'); }
    finally { setLoading(false); }
  }, [authenticatedFetch]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const maxCount = Math.max(...(stats?.frequent_species.map(s => s.count) ?? []), 1);

  return <ScrollView style={styles.root} contentContainerStyle={[
    styles.content, { paddingTop: insets.top + 20 },
  ]}>
    <Text style={styles.kicker}>AI BIRD LAB</Text>
    <Text style={styles.title}>Statistics</Text>
    <Text style={styles.description}>Insights from your recorded bird recognitions.</Text>
    <Pressable style={styles.refresh} onPress={() => void reload()} disabled={loading}>
      <Text style={styles.refreshText}>Refresh Statistics</Text>
    </Pressable>
    {!!error && <Text style={styles.error}>{error}</Text>}
    {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={styles.spinner} /> : stats && <>
      <View style={styles.metricGrid}>
        <View style={styles.metric}><Text style={styles.metricLabel}>Total analyses</Text>
          <Text style={styles.metricValue}>{stats.total}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Max confidence</Text>
          <Text style={styles.metricValue}>{percentage(stats.max_confidence)}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Min confidence</Text>
          <Text style={styles.metricValue}>{percentage(stats.min_confidence)}</Text></View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.heading}>Most Recognized Species</Text>
        {!stats.frequent_species.length ? <Text style={styles.empty}>There are no analyses yet.</Text>
        : stats.frequent_species.map((bird, index) => <View style={styles.bird} key={`${bird.species}-${index}`}>
          <View style={styles.row}>
            <Text style={styles.birdName} numberOfLines={2}>{bird.species}</Text>
            <Text style={styles.count}>{bird.count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${100 * bird.count / maxCount}%` }]} />
          </View>
        </View>)}
      </View>
      <Text style={styles.note}>Statistics reflect the records stored by the AI Server.</Text>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 22, paddingBottom: 50 },
  kicker: { color: COLORS.primary, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 9 },
  title: { fontSize: 31, fontWeight: '800', color: COLORS.heading, marginBottom: 9 },
  description: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  refresh: { backgroundColor: COLORS.primary, borderRadius: 11, padding: 14,
    alignItems: 'center', marginBottom: 19 },
  refreshText: { color: COLORS.white, fontWeight: '700' },
  spinner: { marginTop: 30 },
  error: { color: COLORS.danger, marginBottom: 16 },
  metricGrid: { gap: 12, marginBottom: 18 },
  metric: { backgroundColor: COLORS.darkCard, borderRadius: 15, padding: 19 },
  metricLabel: { color: COLORS.textOnDark, fontSize: 13, marginBottom: 7 },
  metricValue: { color: COLORS.white, fontSize: 27, fontWeight: '800' },
  panel: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1,
    borderRadius: 16, padding: 19 },
  heading: { color: COLORS.heading, fontSize: 19, fontWeight: '700', marginBottom: 18 },
  empty: { color: COLORS.textSecondary },
  bird: { marginBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  birdName: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  count: { color: COLORS.primary, fontWeight: '700', marginLeft: 10 },
  track: { height: 9, backgroundColor: COLORS.uploadBackground, borderRadius: 8, overflow: 'hidden' },
  bar: { height: 9, backgroundColor: COLORS.primary, borderRadius: 8 },
  note: { color: COLORS.textMuted, fontSize: 12, marginTop: 19, lineHeight: 19 },
});
