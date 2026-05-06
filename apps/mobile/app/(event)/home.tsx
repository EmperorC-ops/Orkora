import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  api,
  type PublicEvent,
  type PublicSession,
  type PublicSpeaker,
  type PublicTier,
} from '@/api/client';
import { colors, gradient, radius, spacing, typography } from '@/theme/tokens';

type Tab = 'agenda' | 'speakers' | 'tickets';

export default function EventHome() {
  const router = useRouter();
  const { eventId, code } = useLocalSearchParams<{ eventId?: string; code?: string }>();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('agenda');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let detail: PublicEvent | null = null;
        if (eventId) {
          detail = await api<PublicEvent>(`/v1/events/${eventId}`);
        } else if (code) {
          // Resolve via code first, then re-fetch the richer slug payload.
          const minimal = await api<PublicEvent>(`/v1/events/by-code/${code}`, { auth: false });
          if (minimal.organization.slug && minimal.slug) {
            detail = await api<PublicEvent>(
              `/v1/events/by-slug/${minimal.organization.slug}/${minimal.slug}`,
              { auth: false },
            );
          } else {
            detail = minimal;
          }
        }
        if (!cancelled) {
          if (detail) setEvent(detail);
          else setError('Event not found.');
        }
      } catch {
        if (!cancelled) setError('Could not load this event.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, code]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.brand[700]} size="large" />
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
        <Text style={styles.errorText}>{error ?? 'Event unavailable'}</Text>
        <Pressable onPress={() => router.back()} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        <Hero event={event} onBack={() => router.back()} />
        <Tabs current={tab} onChange={setTab} />
        {tab === 'agenda' && <Agenda event={event} />}
        {tab === 'speakers' && <Speakers speakers={event.speakers ?? []} />}
        {tab === 'tickets' && <Tickets tiers={event.tiers ?? []} eventCode={event.code} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Hero({ event, onBack }: { event: PublicEvent; onBack: () => void }) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const dateLine = formatRange(start, end);
  return (
    <LinearGradient colors={gradient.brand} style={styles.hero}>
      <View style={styles.heroTop}>
        <Pressable onPress={onBack} hitSlop={16}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        {event.status === 'live' && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>Live now</Text>
          </View>
        )}
      </View>
      <Text style={styles.eventKicker}>{event.organization.name}</Text>
      <Text style={styles.eventTitle}>{event.title}</Text>
      <Text style={styles.eventMeta}>{dateLine}</Text>
      <Text style={styles.eventCode}>Code {event.code}</Text>
    </LinearGradient>
  );
}

function Tabs({ current, onChange }: { current: Tab; onChange: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
    { key: 'speakers', label: 'Speakers', icon: 'people-outline' },
    { key: 'tickets', label: 'Tickets', icon: 'ticket-outline' },
  ];
  return (
    <View style={styles.tabs}>
      {items.map((it) => {
        const active = current === it.key;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Ionicons
              name={it.icon}
              size={16}
              color={active ? colors.brand[700] : colors.slate[500]}
            />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Agenda({ event }: { event: PublicEvent }) {
  const sessions = event.sessions ?? [];
  const tracks = useMemo(
    () => new Map((event.tracks ?? []).map((t) => [t.id, t])),
    [event.tracks],
  );

  if (sessions.length === 0) {
    return <Empty icon="calendar-outline" message="The agenda will appear here once it is published." />;
  }

  const groups = groupByDay(sessions);

  return (
    <View style={styles.section}>
      {groups.map(([day, items]) => (
        <View key={day} style={{ marginBottom: spacing.md }}>
          <Text style={styles.dayHeader}>{formatDay(new Date(day))}</Text>
          {items.map((s) => {
            const track = s.trackId ? tracks.get(s.trackId) : null;
            return (
              <View key={s.id} style={styles.sessionCard}>
                <Text style={styles.sessionTime}>
                  {formatTime(new Date(s.startAt))} - {formatTime(new Date(s.endAt))}
                  {track ? `  ${track.name}` : ''}
                </Text>
                <Text style={styles.sessionName}>{s.title}</Text>
                {s.description && (
                  <Text style={styles.sessionSpeaker} numberOfLines={2}>
                    {s.description}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Speakers({ speakers }: { speakers: PublicSpeaker[] }) {
  if (speakers.length === 0) {
    return <Empty icon="people-outline" message="Speaker line-up coming soon." />;
  }
  return (
    <View style={[styles.section, { flexDirection: 'row', flexWrap: 'wrap' }]}>
      {speakers.map((sp) => (
        <View key={sp.id} style={styles.speakerCard}>
          <View style={styles.speakerAvatar}>
            {sp.avatarUrl ? (
              <Image source={{ uri: sp.avatarUrl }} style={styles.speakerImage} />
            ) : (
              <Ionicons name="person" size={32} color={colors.slate[400]} />
            )}
          </View>
          <Text style={styles.speakerName} numberOfLines={2}>
            {sp.fullName}
          </Text>
          {sp.title && (
            <Text style={styles.speakerTitle} numberOfLines={2}>
              {sp.title}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Tickets({ tiers, eventCode }: { tiers: PublicTier[]; eventCode: string }) {
  const router = useRouter();
  if (tiers.length === 0) {
    return <Empty icon="ticket-outline" message="No tickets are on sale yet." />;
  }
  return (
    <View style={styles.section}>
      {tiers.map((tier) => {
        const remaining = tier.quantityTotal
          ? Math.max(0, tier.quantityTotal - tier.quantitySold)
          : null;
        const soldOut = remaining === 0;
        return (
          <View key={tier.id} style={styles.tierCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tierName}>{tier.name}</Text>
              {tier.description && (
                <Text style={styles.tierDesc} numberOfLines={2}>
                  {tier.description}
                </Text>
              )}
              {remaining !== null && (
                <Text style={styles.tierRemaining}>
                  {soldOut ? 'Sold out' : `${remaining} left`}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.tierPrice}>
                {formatPrice(tier.priceMinor, tier.currency)}
              </Text>
              <Pressable
                disabled={soldOut}
                onPress={() =>
                  router.push({ pathname: '/(event)/register', params: { code: eventCode } })
                }
                style={[styles.tierButton, soldOut && styles.tierButtonOff]}
              >
                <Text style={[styles.tierButtonLabel, soldOut && styles.tierButtonLabelOff]}>
                  {soldOut ? 'Sold out' : 'Register'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Empty({
  icon,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={32} color={colors.slate[400]} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ---- formatting helpers ----

function formatRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${start.toDateString()}, ${formatTime(start)} - ${formatTime(end)}`;
  }
  return `${start.toDateString()} to ${end.toDateString()}`;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

function formatPrice(priceMinor: number, currency: string): string {
  if (priceMinor === 0) return 'Free';
  const major = priceMinor / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(major);
  } catch {
    return `${currency.toUpperCase()} ${major.toFixed(2)}`;
  }
}

function groupByDay(sessions: PublicSession[]): Array<[string, PublicSession[]]> {
  const groups: Record<string, PublicSession[]> = {};
  for (const s of [...sessions].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )) {
    const key = new Date(s.startAt).toDateString();
    (groups[key] ??= []).push(s);
  }
  return Object.entries(groups);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  center: {
    flex: 1,
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorText: { color: colors.slate[700], textAlign: 'center' },
  errorButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand[700],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  errorButtonText: { color: colors.white, fontWeight: '600' },

  hero: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    gap: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34D399' },
  livePillText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  eventKicker: {
    marginTop: spacing.lg,
    color: colors.brand[200],
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  eventTitle: { color: colors.white, fontSize: 28, fontWeight: '800', marginTop: spacing.xs },
  eventMeta: { color: colors.brand[100], marginTop: spacing.xs },
  eventCode: { color: colors.brand[100], marginTop: 4, fontSize: 12, fontFamily: 'Courier' },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.white,
  },
  tabActive: {
    backgroundColor: colors.brand[50] ?? '#EDE9FE',
  },
  tabLabel: { color: colors.slate[500], fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: colors.brand[700] },

  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  dayHeader: {
    color: colors.slate[500],
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  sessionCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.sm,
  },
  sessionTime: { color: colors.brand[700], fontSize: 12, fontWeight: '700' },
  sessionName: { ...typography.body, fontWeight: '600', color: colors.slate[900] },
  sessionSpeaker: { color: colors.slate[500], fontSize: 13 },

  speakerCard: { width: '50%', alignItems: 'center', padding: spacing.sm },
  speakerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.slate[200],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  speakerImage: { width: '100%', height: '100%' },
  speakerName: {
    marginTop: spacing.sm,
    fontWeight: '700',
    color: colors.slate[900],
    textAlign: 'center',
  },
  speakerTitle: { color: colors.slate[500], fontSize: 12, textAlign: 'center', marginTop: 2 },

  tierCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  tierName: { fontWeight: '700', color: colors.slate[900], fontSize: 16 },
  tierDesc: { color: colors.slate[500], fontSize: 13, marginTop: 2 },
  tierRemaining: { color: colors.slate[400], fontSize: 12, marginTop: 6 },
  tierPrice: { color: colors.brand[700], fontWeight: '800', fontSize: 18 },
  tierButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand[700],
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  tierButtonOff: { backgroundColor: colors.slate[200] },
  tierButtonLabel: { color: colors.white, fontWeight: '700', fontSize: 13 },
  tierButtonLabelOff: { color: colors.slate[500] },

  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: { color: colors.slate[500], textAlign: 'center' },
});
