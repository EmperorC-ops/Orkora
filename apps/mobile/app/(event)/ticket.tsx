import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { registrationApi, type PublicTicket } from '../../src/api/client';

export default function TicketScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const ticketCode = code ?? '';

  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    registrationApi
      .getTicket(ticketCode)
      .then((t) => {
        if (!cancelled) setTicket(t);
      })
      .catch(() => {
        if (!cancelled) setError('We could not load this ticket.');
      });
    return () => {
      cancelled = true;
    };
  }, [ticketCode]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Ticket not found</Text>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6C5CE7" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} style={{ backgroundColor: '#0F1222' }}>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Feather name="arrow-left" size={18} color="#A0A4C0" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.heroCard}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {ticket.status === 'issued' ? 'Issued' : ticket.status}
          </Text>
        </View>
        <Text style={styles.eventTitle}>{ticket.event.title}</Text>
        <Text style={styles.eventDate}>
          {new Date(ticket.event.startAt).toLocaleString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      <View style={styles.qrCard}>
        <Text style={styles.qrLabel}>SCAN AT ENTRY</Text>
        <View style={styles.qrWrap}>
          <QRCode value={ticket.qrToken} size={220} backgroundColor="#fff" color="#0F172A" />
        </View>
        <Text style={styles.ticketCode}>{ticket.code}</Text>
      </View>

      <View style={{ gap: 8, marginTop: 16 }}>
        <Row label="Holder" value={ticket.holderName} />
        <Row label="Email" value={ticket.holderEmail} />
        <Row label="Tier" value={ticket.tier.name} />
        <Row label="Event code" value={ticket.event.code} mono />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: 'Menlo' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60, gap: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1222',
    padding: 24,
  },
  heading: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  muted: { color: '#A0A4C0', fontSize: 13 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backText: { color: '#A0A4C0', fontSize: 13 },
  heroCard: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2E3454',
    backgroundColor: 'rgba(108,92,231,0.12)',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,200,150,0.15)',
  },
  statusDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: '#00C896' },
  statusText: { color: '#00C896', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  eventTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: -0.4,
  },
  eventDate: { color: '#A0A4C0', fontSize: 13, marginTop: 6, textAlign: 'center' },
  qrCard: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  qrLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  qrWrap: { marginTop: 14 },
  ticketCode: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 12,
    fontFamily: 'Menlo',
  },
  row: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2E3454',
    backgroundColor: 'rgba(26,31,58,0.6)',
    gap: 4,
  },
  rowLabel: { color: '#6B7090', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  rowValue: { color: '#fff', fontSize: 14 },
});
