import { useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  ApiError,
  eventsApi,
  registrationApi,
  type AttendeeInput,
  type PublicEvent,
  type PublicTier,
} from '../../src/api/client';

export default function RegisterScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const eventCode = code ?? '';

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tierId, setTierId] = useState<string>('');
  const [attendees, setAttendees] = useState<AttendeeInput[]>([
    { fullName: '', email: '', phone: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    eventsApi
      .findByCode(eventCode)
      .then((e) => {
        if (cancelled) return;
        setEvent(e);
        const tiers = e.tiers ?? [];
        const first = [...tiers].sort((a, b) => a.position - b.position)[0];
        if (first) setTierId(first.id);
      })
      .catch(() => {
        if (!cancelled) setLoadError('We could not load that event.');
      });
    return () => {
      cancelled = true;
    };
  }, [eventCode]);

  const tier: PublicTier | null = useMemo(
    () => event?.tiers?.find((t) => t.id === tierId) ?? null,
    [event, tierId],
  );

  const isFree = tier ? tier.priceMinor === 0 : false;
  const remaining = tier?.quantityTotal === undefined || tier?.quantityTotal === null
    ? null
    : tier!.quantityTotal - tier!.quantitySold;

  function updateAttendee(i: number, patch: Partial<AttendeeInput>) {
    setAttendees((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function addAttendee() {
    if (!tier) return;
    if (attendees.length >= tier.maxPerOrder) return;
    setAttendees((prev) => [...prev, { fullName: '', email: '', phone: '' }]);
  }

  function removeAttendee(i: number) {
    setAttendees((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function submit() {
    if (!tier) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await registrationApi.register(eventCode, {
        tierId: tier.id,
        attendees: attendees.map((a) => ({
          fullName: a.fullName.trim(),
          email: a.email.trim(),
          phone: a.phone?.trim() || undefined,
        })),
        paymentMethod: isFree ? 'free' : 'stripe',
      });
      if (isFree) {
        const firstCode = result.tickets[0]?.code;
        if (firstCode) {
          router.replace({ pathname: '/(event)/ticket', params: { code: firstCode } });
          return;
        }
      } else {
        setSubmitError(
          'Payment provider is not yet wired in this build. Free tickets are available now.',
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(prettify(err));
      } else {
        setSubmitError('Could not complete your registration.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Event not found</Text>
        <Text style={styles.muted}>{loadError}</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6C5CE7" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Feather name="arrow-left" size={18} color="#A0A4C0" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Register</Text>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.muted}>
          {new Date(event.startAt).toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </Text>

        <Text style={styles.sectionLabel}>Choose a ticket</Text>
        <View style={{ gap: 8 }}>
          {(event.tiers ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((t) => {
              const r = t.quantityTotal == null ? null : t.quantityTotal - t.quantitySold;
              const soldOut = r !== null && r <= 0;
              const selected = t.id === tierId;
              return (
                <Pressable
                  key={t.id}
                  disabled={soldOut}
                  onPress={() => setTierId(t.id)}
                  style={[
                    styles.tier,
                    selected && styles.tierSelected,
                    soldOut && { opacity: 0.5 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tierName}>{t.name}</Text>
                    {t.description ? (
                      <Text style={styles.tierDesc}>{t.description}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.tierPrice}>
                      {t.priceMinor === 0 ? 'Free' : formatMoney(t.priceMinor, t.currency)}
                    </Text>
                    {soldOut ? (
                      <Text style={styles.soldOut}>Sold out</Text>
                    ) : r !== null ? (
                      <Text style={styles.tierMeta}>{r} left</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
        </View>

        <View style={styles.attendeesHeader}>
          <Text style={styles.sectionLabel}>Attendee details</Text>
          {tier && attendees.length < tier.maxPerOrder ? (
            <Pressable onPress={addAttendee} style={styles.addBtn}>
              <Feather name="plus" size={14} color="#ACA6F1" />
              <Text style={styles.addBtnText}>Add attendee</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ gap: 12 }}>
          {attendees.map((a, i) => (
            <View key={i} style={styles.attendeeCard}>
              <View style={styles.attendeeHead}>
                <Text style={styles.attendeeIndex}>Attendee {i + 1}</Text>
                {attendees.length > 1 ? (
                  <Pressable onPress={() => removeAttendee(i)}>
                    <Feather name="trash-2" size={14} color="#A0A4C0" />
                  </Pressable>
                ) : null}
              </View>
              <Field
                label="Full name"
                value={a.fullName}
                onChangeText={(v) => updateAttendee(i, { fullName: v })}
              />
              <Field
                label="Email"
                value={a.email}
                onChangeText={(v) => updateAttendee(i, { email: v })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Phone (optional)"
                value={a.phone ?? ''}
                onChangeText={(v) => updateAttendee(i, { phone: v })}
                keyboardType="phone-pad"
              />
            </View>
          ))}
        </View>

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={submitting || !tier}
          style={[styles.cta, submitting && { opacity: 0.6 }]}
        >
          <Text style={styles.ctaText}>
            {submitting
              ? 'Processing...'
              : isFree
                ? `Register ${attendees.length} attendee${attendees.length > 1 ? 's' : ''}`
                : tier
                  ? `Continue to payment ${formatMoney(tier.priceMinor * attendees.length, tier.currency)}`
                  : 'Register'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={styles.input}
        placeholderTextColor="#6B7090"
      />
    </View>
  );
}

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(0)}`;
  }
}

function prettify(err: ApiError): string {
  try {
    const parsed = JSON.parse(err.message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // not json
  }
  if (err.status === 409) return 'Not enough tickets remaining in this tier.';
  if (err.status === 400) return 'Some details are invalid.';
  return err.message || 'Something went wrong.';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1222' },
  scroll: { padding: 20, paddingBottom: 60, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1222', padding: 24 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backText: { color: '#A0A4C0', fontSize: 13 },
  eyebrow: {
    color: '#ACA6F1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  heading: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  muted: { color: '#A0A4C0', fontSize: 13 },
  sectionLabel: {
    color: '#A0A4C0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  tier: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2E3454',
    backgroundColor: 'rgba(26,31,58,0.6)',
  },
  tierSelected: { borderColor: '#6C5CE7', backgroundColor: 'rgba(108,92,231,0.12)' },
  tierName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tierDesc: { color: '#A0A4C0', fontSize: 12, marginTop: 4 },
  tierPrice: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tierMeta: { color: '#6B7090', fontSize: 11, marginTop: 4 },
  soldOut: { color: '#FF9090', fontSize: 11, fontWeight: '700', marginTop: 4 },
  attendeesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { color: '#ACA6F1', fontSize: 12, fontWeight: '600' },
  attendeeCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2E3454',
    backgroundColor: 'rgba(26,31,58,0.6)',
    gap: 12,
  },
  attendeeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  attendeeIndex: { color: '#A0A4C0', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  fieldLabel: { color: '#A0A4C0', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  input: {
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E3454',
    backgroundColor: 'rgba(15,18,34,0.6)',
  },
  error: {
    color: '#FF9090',
    fontSize: 13,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,118,117,0.3)',
    backgroundColor: 'rgba(255,118,117,0.1)',
  },
  cta: {
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: '#6C5CE7',
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
