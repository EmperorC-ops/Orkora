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
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, gradient, radius, spacing, typography } from '@/theme/tokens';
import { ApiError, authApi, persistTokens } from '@/api/client';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tokens = await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });
      await persistTokens(tokens);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(auth)/code');
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiError && err.status === 401) {
        setError('Email or password is incorrect.');
      } else {
        setError('Could not sign you in. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email to receive a code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.sendOtp({
        channel: 'email',
        destination: email.trim().toLowerCase(),
        purpose: 'login',
      });
      await Haptics.selectionAsync();
      router.push({
        pathname: '/(auth)/otp',
        params: {
          destination: email.trim().toLowerCase(),
          purpose: 'login',
        },
      });
    } catch {
      setError('Could not send a sign-in code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={gradient.brand} style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.hero}>
            <Text style={styles.heroThe}>Welcome back to</Text>
            <View style={styles.heroWordmarkRow}>
              <Text style={styles.heroBold}>EVENT</Text>
              <Text style={styles.heroDim}>APP</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.slate[400]}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.slate[400]}
                secureTextEntry
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonLabel}>Sign in</Text>
              )}
            </Pressable>

            <Pressable onPress={handleMagicLink} style={styles.linkBtn} accessibilityRole="link">
              <Text style={styles.linkText}>Send me a sign-in code instead</Text>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={() => router.push('/(auth)/signup')}
              style={styles.linkBtn}
              accessibilityRole="link"
            >
              <Text style={styles.linkText}>Create a new account</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  hero: { paddingTop: spacing['2xl'], alignItems: 'flex-start' },
  heroThe: { color: colors.white, fontSize: 18, opacity: 0.9 },
  heroWordmarkRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroBold: { ...typography.display, color: colors.white, fontSize: 44 },
  heroDim: { ...typography.display, color: colors.white, opacity: 0.55, fontSize: 44 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: colors.slate[900] },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.slate[600], fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.slate[100],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 15,
    color: colors.slate[900],
  },
  error: { color: colors.danger, fontSize: 13 },
  button: {
    backgroundColor: colors.brand[700],
    borderRadius: radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.white, fontWeight: '700', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.slate[200] },
  dividerText: { color: colors.slate[500], fontSize: 12 },
  linkBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  linkText: { color: colors.brand[700], fontWeight: '600' },
});
