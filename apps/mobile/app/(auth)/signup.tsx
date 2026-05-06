import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { ApiError, authApi } from '@/api/client';

/**
 * Sign up screen. Collects name + email + phone + password, then routes to OTP
 * for email verification. Tokens are not persisted until OTP succeeds.
 */
export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function valid(): boolean {
    if (fullName.trim().length < 2) return setMsg('Please enter your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg('Enter a valid email address.');
    if (password.length < 8) return setMsg('Password must be at least 8 characters.');
    return true;
  }

  function setMsg(m: string): false {
    setError(m);
    return false;
  }

  async function handleContinue() {
    if (!valid()) return;
    setLoading(true);
    setError(null);
    try {
      // Trigger OTP send. The signup itself happens on the OTP verify step
      // so the user has a verified email before we create their account.
      await authApi.sendOtp({
        channel: 'email',
        destination: email.trim().toLowerCase(),
        purpose: 'signup',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({
        pathname: '/(auth)/otp',
        params: {
          destination: email.trim().toLowerCase(),
          purpose: 'signup',
          fullName: fullName.trim(),
          phone: phone.trim(),
          password,
        },
      });
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiError && err.status === 429) {
        setError('Please wait a moment before trying again.');
      } else {
        setError('Could not send verification code. Try again.');
      }
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
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <Text style={styles.heroThe}>Create your</Text>
              <View style={styles.heroWordmarkRow}>
                <Text style={styles.heroBold}>EVENT</Text>
                <Text style={styles.heroDim}>APP</Text>
              </View>
              <Text style={styles.heroSubtitle}>account in under 30 seconds</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sign up</Text>

              <Field
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ada Lovelace"
                autoCapitalize="words"
              />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Field
                label="Phone (optional)"
                value={phone}
                onChangeText={setPhone}
                placeholder="+234 800 000 0000"
                keyboardType="phone-pad"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
              />

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                onPress={handleContinue}
                disabled={loading}
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonLabel}>Continue</Text>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={styles.linkBtn}
                accessibilityRole="link"
              >
                <Text style={styles.linkText}>I already have an account</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.slate[400]}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        keyboardType={props.keyboardType ?? 'default'}
        secureTextEntry={props.secureTextEntry}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  hero: { paddingTop: spacing.lg, alignItems: 'flex-start' },
  heroThe: { color: colors.white, fontSize: 18, opacity: 0.9 },
  heroWordmarkRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroBold: { ...typography.display, color: colors.white, fontSize: 44 },
  heroDim: { ...typography.display, color: colors.white, opacity: 0.55, fontSize: 44 },
  heroSubtitle: { color: colors.white, opacity: 0.8, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.slate[900],
  },
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.slate[200] },
  dividerText: { color: colors.slate[500], fontSize: 12 },
  linkBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { color: colors.brand[700], fontWeight: '600' },
});
