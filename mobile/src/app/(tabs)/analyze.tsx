import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  analyzeBird, percentage, type Analysis, type LocalUpload,
} from '@/services/birds';
import { File } from 'expo-file-system';

type Mode = 'image' | 'audio';
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_AUDIO = 20 * 1024 * 1024;

export default function AnalyzeScreen() {
  const insets = useSafeAreaInsets();
  const { authenticatedFetch } = useAuth();
  const [mode, setMode] = useState<Mode>('image');
  const [file, setFile] = useState<LocalUpload | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function changeMode(next: Mode) {
    setMode(next); setFile(null); setResult(null); setError('');
  }

  function selectFile(next: LocalUpload, nextMode: Mode) {
    const extension = next.name.split('.').pop()?.toLowerCase() ?? '';
    const allowed = nextMode === 'image'
      ? ['jpg', 'jpeg', 'png']
      : ['mp3', 'm4a', 'wav', 'flac', 'ogg'];
    if (!allowed.includes(extension)) {
      setError(`Unsupported ${nextMode} file. Allowed: ${allowed.join(', ')}.`);
      return;
    }
    const max = nextMode === 'image' ? MAX_IMAGE : MAX_AUDIO;
    if (next.size && next.size > max) {
      setError(`The file is too large (limit: ${max / (1024 * 1024)} MB).`);
      return;
    }
    setFile(next); setResult(null); setError('');
  }

  async function choosePhoto() {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 1, allowsEditing: false,
      });
      if (picked.canceled || !picked.assets.length) return;
      const image = picked.assets[0];
      const fallbackExt = image.mimeType === 'image/png' ? 'png' : 'jpg';
      const name = image.fileName || `bird_photo.${fallbackExt}`;
      selectFile({ uri: image.uri, name,
        mimeType: image.mimeType || (fallbackExt === 'png' ? 'image/png' : 'image/jpeg'),
        size: image.fileSize }, 'image');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open gallery.'); }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Camera permission required'); return; }
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], quality: .9, allowsEditing: false,
      });
      if (picked.canceled || !picked.assets.length) return;
      const image = picked.assets[0];
      selectFile({ uri: image.uri, name: 'bird_camera.jpg', mimeType: 'image/jpeg',
        size: image.fileSize }, 'image');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open camera.'); }
  }

  async function chooseAudio() {
  try {
    setError('');

    const picked = await File.pickFileAsync({
      mimeTypes: ['audio/*'],
    });

    if (picked.canceled) {
      return;
    }

    const audio = picked.result;

    console.log('[AUDIO TEST] URI:', audio.uri);
    console.log('[AUDIO TEST] Name:', audio.name);
    console.log('[AUDIO TEST] Size:', audio.size);
    console.log('[AUDIO TEST] Exists:', audio.exists);

    // const bytes = await audio.bytes();

    // console.log('[AUDIO TEST] Read bytes:', bytes.length);

    selectFile(
      {
        uri: audio.uri,
        name: audio.name,
        mimeType: audio.type || 'audio/mpeg',
        size: audio.size,
      },
      'audio'
    );
  } catch (error) {
    console.error('[AUDIO TEST] Error:', error);

    setError(
      error instanceof Error
        ? error.message
        : 'Could not select audio.'
    );
  }
}

  async function submit() {
    if (!file) { setError('Select a file first.'); return; }
    setBusy(true); setError(''); setResult(null);
    try { setResult(await analyzeBird(authenticatedFetch, mode, file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed.'); }
    finally { setBusy(false); }
  }

  async function openLink(url: string) {
    try { await Linking.openURL(url); }
    catch { Alert.alert('Cannot open link', url); }
  }

  function detail(label: string, value: string | undefined) {
    return <View style={styles.fact} key={label}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value?.trim() || 'Not found'}</Text>
    </View>;
  }

  return <ScrollView style={styles.root} contentContainerStyle={[
    styles.content, { paddingTop: insets.top + 20 },
  ]}>
    <Text style={styles.kicker}>AI BIRD LAB</Text>
    <Text style={styles.title}>Bird Analysis</Text>
    <Text style={styles.description}>Recognize bird species using an image or sound recording.</Text>
    <View style={styles.modeRow}>
      <Pressable style={[styles.modeButton, mode === 'image' && styles.modeActive]} onPress={() => changeMode('image')} disabled={busy}>
        <Text style={[styles.modeText, mode === 'image' && styles.activeText]}>Photo</Text>
      </Pressable>
      <Pressable style={[styles.modeButton, mode === 'audio' && styles.modeActive]} onPress={() => changeMode('audio')} disabled={busy}>
        <Text style={[styles.modeText, mode === 'audio' && styles.activeText]}>Audio</Text>
      </Pressable>
    </View>
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>{mode === 'image' ? 'Choose a bird photograph' : 'Choose a bird recording'}</Text>
      <Text style={styles.hint}>{mode === 'image'
        ? 'JPG / PNG · up to 12 MB'
        : 'MP3 / WAV / M4A / FLAC / OGG · up to 20 MB'}</Text>
      {mode === 'image' ? <>
        <Pressable style={styles.secondaryButton} onPress={choosePhoto} disabled={busy}>
          <Text style={styles.secondaryText}>Choose from Gallery</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={takePhoto} disabled={busy}>
          <Text style={styles.secondaryText}>Take Photo</Text>
        </Pressable>
      </> : <Pressable style={styles.secondaryButton} onPress={chooseAudio} disabled={busy}>
        <Text style={styles.secondaryText}>Choose Audio File</Text>
      </Pressable>}
      {!!file && <>
        <Text style={styles.fileName}>Selected: {file.name}</Text>
        {mode === 'image' && <Image source={{ uri: file.uri }} style={styles.preview} resizeMode="contain" />}
      </>}
      <Pressable style={[styles.primaryButton, (!file || busy) && styles.disabled]} onPress={submit} disabled={!file || busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryText}>Analyze {mode === 'image' ? 'Photo' : 'Audio'}</Text>}
      </Pressable>
      {busy && <Text style={styles.hint}>Running AI inference. The first request may take longer.</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
    {result && <View style={styles.panel}>
      <Text style={styles.kicker}>RECOGNITION RESULT</Text>
      <Text style={styles.resultTitle}>{result.predictions?.[0]?.species ?? 'Not identified'}</Text>
      <Text style={styles.confidence}>Confidence: {percentage(result.predictions?.[0]?.confidence)}</Text>
      {result.predictions?.length > 1 && <View style={styles.otherPredictions}>
        <Text style={styles.sectionTitle}>Other predictions</Text>
        {result.predictions.slice(1).map((p, i) => <Text key={i} style={styles.otherText}>
          {p.species}: {percentage(p.confidence)}
        </Text>)}
      </View>}
      {detail('Scientific name', result.info?.scientific_name)}
      {detail('Family', result.info?.family)}
      {detail('Range', result.info?.range)}
      {detail('Diet', result.info?.diet)}
      {detail('Description', result.info?.description)}
      {result.info?.wikipedia_url && <Pressable onPress={() => void openLink(result.info.wikipedia_url!)}>
        <Text style={styles.link}>View Wikipedia source</Text>
      </Pressable>}
      {result.info?.wikidata_url && <Pressable onPress={() => void openLink(result.info.wikidata_url!)}>
        <Text style={styles.link}>View Wikidata source</Text>
      </Pressable>}
      {!!result.notice && <Text style={styles.notice}>{result.notice}</Text>}
      <Text style={styles.saved}>Saved to history · record #{result.id}</Text>
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 22, paddingBottom: 50 },
  kicker: { color: COLORS.primary, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 9 },
  title: { fontSize: 31, fontWeight: '800', color: COLORS.heading, marginBottom: 8 },
  description: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 23, marginBottom: 22 },
  modeRow: { flexDirection: 'row', gap: 9, marginBottom: 18 },
  modeButton: { flex: 1, alignItems: 'center', padding: 14, backgroundColor: COLORS.surface,
    borderRadius: 11, borderWidth: 1, borderColor: COLORS.border },
  modeActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeText: { fontWeight: '700', color: COLORS.primary },
  activeText: { color: COLORS.white },
  panel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 17, padding: 19, marginBottom: 20 },
  sectionTitle: { color: COLORS.heading, fontSize: 17, fontWeight: '700', marginBottom: 9 },
  hint: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 14, lineHeight: 18 },
  secondaryButton: { padding: 14, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.uploadBorder, backgroundColor: COLORS.uploadBackground,
    alignItems: 'center', marginBottom: 10 },
  secondaryText: { color: COLORS.primary, fontWeight: '700' },
  fileName: { color: COLORS.text, fontSize: 13, marginTop: 7, marginBottom: 12 },
  preview: { width: '100%', height: 190, marginBottom: 13, borderRadius: 10 },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: 11, padding: 15,
    alignItems: 'center', marginTop: 8 },
  primaryText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: .55 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 13, lineHeight: 20 },
  resultTitle: { color: COLORS.heading, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  confidence: { color: COLORS.primary, fontWeight: '700', marginBottom: 20 },
  otherPredictions: { marginBottom: 18 },
  otherText: { color: COLORS.textSecondary, marginBottom: 7 },
  fact: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 12 },
  factLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 5 },
  factValue: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  link: { color: COLORS.primary, fontWeight: '700', marginTop: 13 },
  notice: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 17 },
  saved: { color: COLORS.success, fontSize: 12, fontWeight: '600', marginTop: 14 },
});
