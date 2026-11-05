import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  deleteHistory, getExportCsv, getHistory, percentage, type HistoryItem,
} from '@/services/birds';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { authenticatedFetch } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (term: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try { setItems(await getHistory(authenticatedFetch, term.trim())); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load history.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [authenticatedFetch]);

  useFocusEffect(useCallback(() => {
    void load(search);
    // Refresh whenever the tab becomes active (including after analysis).
  }, [load, search]));

  function confirmDelete(item: HistoryItem) {
    Alert.alert('Delete analysis', `Delete record #${item.id} (${item.predicted_species})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void remove(item.id); } },
    ]);
  }

  async function remove(id: number) {
    try { await deleteHistory(authenticatedFetch, id); await load(search); }
    catch (e) { Alert.alert('Delete failed', e instanceof Error ? e.message : 'Unknown error.'); }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await getExportCsv(authenticatedFetch);
      const available = await Sharing.isAvailableAsync();
      if (!available) throw new Error('The device does not support file sharing.');
      const file = new File(Paths.cache, 'bird_analysis.csv');
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export AI Bird Lab history',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e) { Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error.'); }
    finally { setExporting(false); }
  }

  return <ScrollView style={styles.root} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(search, true)} />}
    contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
    <Text style={styles.kicker}>AI BIRD LAB</Text>
    <Text style={styles.title}>Analysis History</Text>
    <Text style={styles.description}>Review saved bird recognitions. Pull down to refresh.</Text>
    <View style={styles.panel}>
      <TextInput style={styles.input} placeholder="Search by species" placeholderTextColor={COLORS.textMuted}
        value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search"
        onSubmitEditing={() => void load(search)} />
      <View style={styles.actions}>
        <Pressable style={styles.searchButton} onPress={() => void load(search)}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={() => void exportCsv()} disabled={exporting}>
          <Text style={styles.exportButtonText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text>
        </Pressable>
      </View>
    </View>
    {!!error && <Text style={styles.error}>{error}</Text>}
    {loading ? <ActivityIndicator color={COLORS.primary} size="large" style={styles.spinner} /> : <>
      <Text style={styles.count}>{items.length} result(s)</Text>
      {items.length === 0 && <View style={styles.panel}><Text style={styles.empty}>No analysis records found.</Text></View>}
      {items.map(item => <View style={styles.item} key={item.id}>
        <View style={styles.itemTop}>
          <Text style={styles.species}>{item.predicted_species}</Text>
          <Text style={styles.tag}>{item.media_type === 'audio' ? 'AUDIO' : 'PHOTO'}</Text>
        </View>
        <Text style={styles.detail}>Confidence: {percentage(item.confidence)}</Text>
        <Text style={styles.detail}>File: {item.image_name}</Text>
        <Text style={styles.detail}>Date: {new Date(item.analysis_date).toLocaleString()}</Text>
        {!!item.description && <Text style={styles.summary} numberOfLines={4}>{item.description}</Text>}
        <View style={styles.itemFooter}>
          <Text style={styles.id}>Record #{item.id}</Text>
          <Pressable onPress={() => confirmDelete(item)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>)}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 22, paddingBottom: 50 },
  kicker: { color: COLORS.primary, letterSpacing: 2, fontWeight: '700', fontSize: 12, marginBottom: 8 },
  title: { color: COLORS.heading, fontWeight: '800', fontSize: 31, marginBottom: 8 },
  description: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 21 },
  panel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 16, padding: 17, marginBottom: 18 },
  input: { backgroundColor: COLORS.uploadBackground, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 10, padding: 13,
    fontSize: 15, color: COLORS.text, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  searchButton: { flex: 1, backgroundColor: COLORS.primary, padding: 13,
    borderRadius: 10, alignItems: 'center' },
  searchButtonText: { color: COLORS.white, fontWeight: '700' },
  exportButton: { flex: 1, borderWidth: 1, borderColor: COLORS.uploadBorder,
    backgroundColor: COLORS.uploadBackground, padding: 13, borderRadius: 10, alignItems: 'center' },
  exportButtonText: { color: COLORS.primary, fontWeight: '700' },
  count: { color: COLORS.textSecondary, fontWeight: '600', marginBottom: 12 },
  empty: { color: COLORS.textSecondary, textAlign: 'center', padding: 16 },
  spinner: { marginTop: 30 },
  error: { color: COLORS.danger, marginBottom: 15, lineHeight: 20 },
  item: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 16, padding: 18, marginBottom: 13 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  species: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.heading },
  tag: { color: COLORS.primary, backgroundColor: COLORS.uploadBackground,
    fontSize: 10, padding: 5, borderRadius: 6, overflow: 'hidden', fontWeight: '700' },
  detail: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 5 },
  summary: { color: COLORS.text, lineHeight: 20, fontSize: 13, marginTop: 9 },
  itemFooter: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 14,
    paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  id: { fontSize: 12, color: COLORS.textMuted },
  deleteButton: { padding: 9 },
  deleteText: { color: COLORS.danger, fontWeight: '700' },
});
