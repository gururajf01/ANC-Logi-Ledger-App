import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function Collect() {
  const router = useRouter();
  const { partyId, name } = useLocalSearchParams<{ partyId: string; name?: string }>();
  const [openTrips, setOpenTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [date, setDate] = useState(todayStr());
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get(`/parties/${partyId}/open-trips`); setOpenTrips(r || []); }
    catch (e) { console.warn(e); } finally { setLoading(false); }
  }, [partyId]);

  useEffect(() => { load(); }, [load]);

  const totalOpen = useMemo(() => openTrips.reduce((a, t) => a + (t.pending || 0), 0), [openTrips]);
  const amountN = Number((amount || '').replace(/[^0-9.]/g, '')) || 0;

  // live allocation preview (oldest first)
  const preview = useMemo(() => {
    let rem = amountN;
    return openTrips.map((t) => {
      const take = Math.min(rem, t.pending);
      rem = Math.max(0, rem - take);
      return { ...t, alloc: take };
    });
  }, [openTrips, amountN]);

  const submit = async () => {
    setErr(null);
    if (amountN <= 0) { setErr('Enter an amount'); return; }
    setSaving(true);
    try {
      const res = await api.post('/receipts/collect', {
        party_id: partyId, amount: amountN, date, payment_mode: mode, reference_no: ref || undefined,
      });
      setDone(res);
    } catch (e: any) { setErr(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="collect-screen">
      <View style={styles.header}>
        <Pressable testID="close-collect" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Collect · {name || 'Party'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {done ? (
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark-circle" size={56} color={theme.color.success} />
          <Text style={styles.doneTitle}>Payment recorded</Text>
          <Text style={styles.doneLine}>Allocated {inr(done.allocated)} across {done.allocations.length} trip(s)</Text>
          <Text style={styles.doneLine}>Remaining outstanding: <Text style={{ fontWeight: '800', color: done.party_outstanding > 0 ? theme.color.loss : theme.color.success }}>{inr(done.party_outstanding, { showZero: true })}</Text></Text>
          <Pressable testID="collect-done-btn" onPress={() => router.back()} style={styles.primaryBtn}>
            <Text style={styles.primaryTxt}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>Total outstanding</Text>
              <Text style={styles.summaryValue}>{inr(totalOpen, { showZero: true })}</Text>
            </View>

            <Text style={styles.label}>Amount received</Text>
            <View style={styles.moneyBox}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput testID="collect-amount" keyboardType="numeric" value={amount} onChangeText={setAmount} style={styles.moneyInput} placeholder="0" autoFocus />
            </View>
            <View style={styles.quickRow}>
              <Pressable testID="collect-full" onPress={() => setAmount(String(Math.round(totalOpen)))} style={styles.quickBtn}>
                <Text style={styles.quickTxt}>Full {inr(totalOpen)}</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Date</Text>
            <TextInput testID="collect-date" value={date} onChangeText={setDate} style={styles.input} />

            <Text style={styles.label}>Payment mode</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {['Cash', 'UPI', 'Bank'].map((m) => (
                <Pressable key={m} testID={`collect-mode-${m}`} onPress={() => setMode(m)} style={[styles.chip, mode === m && styles.chipActive]}>
                  <Text style={[styles.chipTxt, mode === m && { color: '#fff' }]}>{m}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Reference no. (optional)</Text>
            <TextInput testID="collect-ref" value={ref} onChangeText={setRef} style={styles.input} placeholder="UTR / cheque no." />

            <Text style={styles.section}>Auto-allocation (oldest first)</Text>
            {preview.map((t) => (
              <View key={t.trip_id} style={styles.allocRow} testID={`alloc-${t.trip_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.allocTs}>{t.ts_no || t.trip_id}</Text>
                  <Text style={styles.allocSub}>{t.date} · {t.age_days}d · pending {inr(t.pending)}</Text>
                </View>
                <Text style={[styles.allocAmt, { color: t.alloc > 0 ? theme.color.success : theme.color.muted }]}>
                  {t.alloc > 0 ? `+${inr(t.alloc)}` : '—'}
                </Text>
              </View>
            ))}

            {err && <Text style={styles.err}>{err}</Text>}
            <Pressable testID="collect-submit" onPress={submit} style={styles.primaryBtn} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>Record {amountN > 0 ? inr(amountN) : 'Payment'}</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  summary: { backgroundColor: theme.color.surfaceInverse, borderRadius: theme.radius.lg, padding: theme.space.lg, marginBottom: theme.space.lg },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  summaryValue: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 4 },
  label: { fontSize: 12, color: theme.color.muted, marginBottom: 4, marginTop: theme.space.md, fontWeight: '600' },
  input: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.color.onSurface, minHeight: 44 },
  moneyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, minHeight: 52 },
  rupee: { fontSize: 20, color: theme.color.muted, marginRight: 6 },
  moneyInput: { flex: 1, fontSize: 22, color: theme.color.onSurface, paddingVertical: 10, fontWeight: '800' },
  quickRow: { flexDirection: 'row', marginTop: theme.space.sm },
  quickBtn: { backgroundColor: theme.color.surfaceTertiary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill },
  quickTxt: { color: theme.color.onSurface, fontWeight: '700', fontSize: 12 },
  chip: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill, paddingHorizontal: 16, paddingVertical: 8, minHeight: 40 },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipTxt: { color: theme.color.onSurface, fontSize: 13, fontWeight: '600' },
  section: { fontSize: 11, fontWeight: '800', color: theme.color.muted, textTransform: 'uppercase', marginTop: theme.space.xl, marginBottom: theme.space.sm, letterSpacing: 0.5 },
  allocRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.color.divider },
  allocTs: { fontWeight: '700', color: theme.color.onSurface, fontSize: 14 },
  allocSub: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  allocAmt: { fontWeight: '800', fontSize: 15 },
  primaryBtn: { backgroundColor: theme.color.brand, minHeight: 50, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', marginTop: theme.space.xl },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  err: { color: theme.color.error, marginTop: theme.space.md, fontWeight: '600' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space.xl },
  doneTitle: { fontSize: 20, fontWeight: '800', color: theme.color.onSurface, marginTop: theme.space.md },
  doneLine: { color: theme.color.onSurfaceSecondary, marginTop: theme.space.sm, textAlign: 'center' },
});
