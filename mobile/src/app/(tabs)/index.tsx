import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';

import { useAuth } from '@/context/AuthContext';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 20,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.subtitle}>WELCOME TO</Text>
        <Text style={styles.title}>AI Bird Lab</Text>
        <Text style={styles.description}>
          Discover and identify bird species using artificial intelligence.
        </Text>
      </View>

      {/* Information card */}
      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Bird Recognition</Text>

        <Text style={styles.cardDescription}>
          Upload a photograph or audio recording to identify a bird species.
        </Text>

        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            Mobile application initialized
          </Text>
        </View>
      </View>

      {/* Action cards */}
      <Text style={styles.sectionTitle}>Explore Features</Text>

      <TouchableOpacity
        style={styles.featureCard}
        onPress={() => router.push('/analyze')}
      >
        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>Image Analysis</Text>
          <Text style={styles.featureDescription}>
            Identify birds from photographs
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <View style={styles.featureCard}>
        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>Audio Analysis</Text>
          <Text style={styles.featureDescription}>
            Recognize birds by their sounds
          </Text>
        </View>
      </View>

      <View style={styles.featureCard}>
        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>Analysis History</Text>
          <Text style={styles.featureDescription}>
            Review previous recognition results
          </Text>
        </View>
      </View>

      {/* Logout button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => {
          void signOut();
        }}
      >
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      
      {/* Footer */}
      <Text style={styles.footer}>
        AI Bird Lab · Mobile Application
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
  flexGrow: 1,
  paddingHorizontal: 24,
  paddingBottom: 40,
  },

  header: {
    marginBottom: 30,
  },

  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.primary,
    marginBottom: 8,
  },

  title: {
    fontSize: 38,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: 12,
  },

  description: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },

  infoCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 20,
    padding: 24,
    marginBottom: 32,
  },

  cardTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 12,
  },

  cardDescription: {
    fontSize: 15,
    color: COLORS.textOnDark,
    lineHeight: 23,
    marginBottom: 20,
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
    marginRight: 9,
  },

  statusText: {
    fontSize: 13,
    color: COLORS.textOnDark,
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: 16,
  },

  featureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  featureContent: {
    flex: 1,
  },

  featureTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },

  featureDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  arrow: {
    fontSize: 28,
    color: COLORS.primary,
    marginLeft: 12,
  },

  footer: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 32,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },

  logoutText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});