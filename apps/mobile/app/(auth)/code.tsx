import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, gradient, radius, spacing, typography } from '@/theme/tokens';
import { eventsApi, ApiError } from '@/api/client';

/**
 * Event code entry screen for the Orkora attendee app.
 * Dark canvas with a soft brand glow at top, watermark glyph, and a raised
 * surface card containing the locked code input + primary submit button.
 */
export default function EventCodeScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError('Please enter a valid event code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const event = await eventsApi.findByCode(trimmed);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/(event)/home', params: { eventId: event.id } });
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        err instanceof ApiError && err.status === 404
          ? 'We could not find that event. Double check the code.'
          : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.canvas}>
      {/* Soft brand glow at the top of the dark canvas */}
      <LinearGradient
        colors={[colors.brand[600], 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.glow}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Decorative watermark glyph */}
          <View pointerEvents="none" style={styles.watermark}>
            <Text style={styles.watermarkChar}>O</Text>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroPill}>ORKORA</Text>
            <Text style={styles.heroHeadline}>Step into the room.</Text>
            <Text style={styles.heroSub}>
              Enter your event code to access the agenda, tickets, and live updates.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Event code</Text>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="e.g. ABCD23"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                value={code}
                onChangeText={(v) => {
                  setError(null);
                  setCode(v);
                }}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                editable={!loading}
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit event code"
              disabled={loading}
              onPress={handleSubmit}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <LinearGradient
                colors={gradient.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonInner}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonLabel}>Submit</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/code')}
              style={styles.scanLink}
              accessibilityRole="link"
            >
              <Ionicons name="qr-code-outline" size={16} color={colors.brand[300]} />
              <Text style={styles.scanLinkText}>Scan QR instead</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerMark} />
            <Text style={styles.footerText}>orkora</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.background },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    opacity: 0.45,
  },
  safe: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'space-between' },
  watermark: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.05,
  },
  watermarkChar: {
    fontSize: 480,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -20,
  },
  hero: {
    marginTop: spacing['2xl'],
    paddingHorizontal: spacing.md,
  },
  heroPill: {
    color: colors.brand[200],
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  heroHeadline: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 34,
    lineHeight: 40,
    marginBottom: spacing.sm,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  cardTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 52,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 2,
    fontWeight: '600',
  },
  error: {
    marginTop: spacing.sm,
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  buttonInner: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  scanLink: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  scanLinkText: {
    color: colors.brand[300],
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  footerMark: {
    width: 16,
    height: 16,
    backgroundColor: colors.brand[400],
    opacity: 0.9,
    borderRadius: 4,
    transform: [{ rotate: '45deg' }],
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
