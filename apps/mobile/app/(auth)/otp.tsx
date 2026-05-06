import { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, gradient, radius, spacing, typography } from '@/theme/tokens';
import { ApiError, authApi, persistTokens } from '@/api/client';

const RESEND_SECONDS = 30;

/**
 * 6-digit OTP entry. The screen accepts a `purpose` (signup or login) and a
 * `destination`. On success: signup creates the account, login swaps the OTP
 * for a token bundle. We support paste of the entire code at once.
 */
export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    destination?: string;
    purpose?: string;
    fullName?: string;
    phone?: string;
    password?: string;
  }>();
  const destination = String(params.destination ?? '');
  const purpose = String(params.purpose ?? 'login') as 'signup' | 'login';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  function setDigit(i: number, raw: string) {
    setError(null);
    // Support pasting the entire code into one box.
    if (raw.length > 1) {
      const cleaned = raw.replace(/\D/g, '').slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      for (let k = 0; k < cleaned.length; k++) next[k] = cleaned[k];
      setDigits(next);
      const lastIdx = Math.min(cleaned.length, 5);
      inputs.current[lastIdx]?.focus();
      if (cleaned.length === 6) handleVerify(next.join(''));
      return;
    }
    const value = raw.replace(/\D/g, '');
    const next = [...digits];
    next[i] = value;
    setDigits(next);
    if (value && i < 5) inputs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) handleVerify(next.join(''));
  }

  function handleBackspace(i: number) {
    if (digits[i]) return;
    if (i > 0) inputs.current[i - 1]?.focus();
  }

  async function handleVerify(code: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.verifyOtp({ destination, code, purpose });

      // OTP confirmed. Now finalize: signup creates the account; login
      // exchanges OTP-verified email for a fresh token via the login flow.
      let tokens;
      if (purpose === 'signup' && params.password) {
        tokens = await authApi.signup({
          email: destination,
          password: String(params.password),
          fullName: String(params.fullName ?? ''),
          phone: params.phone ? String(params.phone) : undefined,
        });
      } else {
        // For login via OTP we need a server endpoint that issues tokens
        // for a verified email. The current API does that as part of login;
        // future iteration: add a dedicated /auth/login-otp endpoint.
        // For now we treat verify as a stepping stone and route to signin.
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(auth)/login');
        return;
      }

      await persistTokens(tokens);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(auth)/code');
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiError && err.status === 401) {
        setError('That code is incorrect or expired.');
      } else {
        setError('Could not verify your code. Try again.');
      }
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.sendOtp({
        channel: 'email',
        destination,
        purpose: purpose === 'signup' ? 'signup' : 'login',
      });
      setResendIn(RESEND_SECONDS);
      await Haptics.selectionAsync();
    } catch {
      setError('Could not resend code. Try again in a moment.');
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
            <Text style={styles.heroBold}>Check your email</Text>
            <Text style={styles.heroSubtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.heroDest}>{destination}</Text>
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enter verification code</Text>
            <View style={styles.codeRow}>
              {digits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  style={[styles.codeBox, d && styles.codeBoxFilled]}
                  value={d}
                  onChangeText={(v) => setDigit(i, v)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace') handleBackspace(i);
                  }}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? 6 : 1}
                  autoFocus={i === 0}
                  textContentType="oneTimeCode"
                  editable={!loading}
                />
              ))}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            {loading && (
              <View style={styles.loaderRow}>
                <ActivityIndicator color={colors.brand[700]} />
              </View>
            )}

            <Pressable
              onPress={handleResend}
              disabled={resendIn > 0 || loading}
              style={styles.linkBtn}
              accessibilityRole="link"
            >
              <Text style={[styles.linkText, resendIn > 0 && styles.linkTextDisabled]}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </Text>
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
  hero: { paddingTop: spacing['2xl'], alignItems: 'flex-start', gap: spacing.xs },
  heroBold: { ...typography.display, color: colors.white, fontSize: 36 },
  heroSubtitle: { color: colors.white, opacity: 0.9, fontSize: 15, lineHeight: 22 },
  heroDest: { fontWeight: '700' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.slate[900] },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  codeBox: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.slate[100],
    borderWidth: 1,
    borderColor: colors.slate[200],
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.slate[900],
  },
  codeBoxFilled: { borderColor: colors.brand[700], backgroundColor: '#F5F3FF' },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  loaderRow: { alignItems: 'center', paddingVertical: spacing.sm },
  linkBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { color: colors.brand[700], fontWeight: '600' },
  linkTextDisabled: { color: colors.slate[400] },
});
