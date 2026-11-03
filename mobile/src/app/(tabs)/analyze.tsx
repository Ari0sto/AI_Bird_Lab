// import { View, Text, StyleSheet } from 'react-native';
// import { COLORS } from '@/constants/theme';

// export default function AnalyzeScreen() {
//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Bird Analysis</Text>
//       <Text style={styles.description}>
//         Image and audio recognition will be available here.
//       </Text>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: COLORS.background,
//     padding: 24,
//     paddingTop: 60,
//   },
//   title: {
//     fontSize: 30,
//     fontWeight: '800',
//     color: COLORS.heading,
//     marginBottom: 12,
//   },
//   description: {
//     fontSize: 15,
//     lineHeight: 24,
//     color: COLORS.textSecondary,
//   },
// });

import { useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import { apiRequest } from '@/services/api';

export default function AnalyzeScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('Not tested yet.');

  async function checkConnection() {
    setLoading(true);
    setResult('Checking connection...');

    try {
      // Check C# Central Server
      const centralResponse = await apiRequest('/health');

      if (!centralResponse.ok) {
        throw new Error(
          `Central Server: HTTP ${centralResponse.status}`
        );
      }

      // Check Python AI Server through C#
      const aiResponse = await apiRequest('/api/ai/health');

      if (!aiResponse.ok) {
        throw new Error(
          `AI Server: HTTP ${aiResponse.status}`
        );
      }

      setResult(
        'Central Server: Connected\n' +
        'AI Server: Connected'
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown connection error';

      setResult(`Connection failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20 },
      ]}
    >
      <Text style={styles.subtitle}>AI BIRD LAB</Text>

      <Text style={styles.title}>Bird Analysis</Text>

      <Text style={styles.description}>
        Connect to the AI Bird Lab backend to analyze
        photographs and audio recordings.
      </Text>

      <Text style={styles.sectionTitle}>
        Backend Connection
      </Text>

      <Text style={styles.status}>{result}</Text>

      <Pressable
        style={[
          styles.button,
          loading && styles.disabledButton,
        ]}
        onPress={checkConnection}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.buttonText}>
            Test Connection
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.primary,
    marginBottom: 12,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: 12,
  },

  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 35,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: 15,
  },

  status: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 20,
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 20,
  },

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },

  buttonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },

  disabledButton: {
    opacity: 0.6,
  },
});