import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

const BUCKETS = [
  { key: '0_15', label: '0–15d', color: '#059669' },
  { key: '16_30', label: '16–30d', color: '#D97706' },
  { key: '31_60', label: '31–60d', color: '#EA580C' },
  { key: '60_plus', label: '60+d', color: '#DC2626' },
];

export default function Pending() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const r = await api.get('/pending-freight'); setData(r || []); }
    catch (e) { console.warn(e); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grandTotal = data.reduce((a, p) => a + (p.total_pending || 0), 0);

  const sendWhatsApp = (party: any) => {
    const lines = (party.trips || []).map((t: any) => `• ${t.ts_no || t.trip_id} (${t.date}): ${inr(t.pending)}`).join('\n');
    const msg = `Dear ${party.party_name},\n\nGentle reminder — the following freight payments are pending with ANCL Logistics:\n\n${lines}\n\nTotal outstanding: ${inr(party.total_pending)}\n\nKindly arrange payment at the earliest. Thank you.`;
    const phone = (party.phone || '').replace(/[^0-9]/g, '');
    const withCc = phone ? (phone.length === 10 ? '91' + phone : phone) : '';
    const url = withCc
      ? `https://wa.me/${withCc}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="pending-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pending Freight</Text>
        <View style={styles.totalPill}>
          <Text style={styles.totalTxt}>{inr(grandTotal, { showZero: true })}</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.party_id}
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={44} color={theme.color.success} />
              <Text style={styles.emptyTxt}>No pending freight</Text>
              <Text style={styles.emptySub}>All customers are settled up.</Text>
            </View>
          }
          renderItem={({ item: p }) => {
            const total = p.total_pending || 1;
            return (
              <View style={styles.card} testID={`pending-party-${p.party_id}`}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partyName}>{p.party_name}</Text>
                    <Text style={styles.partySub}>{(p.trips || []).length} open trip(s)</Text>
                  </View>
                  <Text style={styles.partyAmt}>{inr(p.total_pending)}</Text>
                </View>

                <View style={styles.barTrack}>
                  {BUCKETS.map((b) => {
                    const v = p.buckets?.[b.key] || 0;
                    if (v <= 0) return null;
                    return <View key={b.key} style={{ width: `${(v / total) * 100}%`, backgroundColor: b.color, height: '100%' }} />;
                  })}
                </View>
                <View style={styles.legend}>
                  {BUCKETS.map((b) => (
                    <View key={b.key} style={styles.legendItem}>
                      <View style={[styles.dot, { backgroundColor: b.color }]} />
                      <Text style={styles.legendTxt}>{b.label} {inr(p.buckets?.[b.key], { showZero: true })}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.actions}>
                  <Pressable
                    testID={`collect-${p.party_id}`}
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => router.push({ pathname: '/collect/[partyId]', params: { partyId: p.party_id, name: p.party_name } })}
                  >
                    <Ionicons name="cash" size={16} color="#fff" />
                    <Text style={styles.actionPrimaryTxt}>Collect</Text>
                  </Pressable>
                  <Pressable
                    testID={`whatsapp-${p.party_id}`}
                    style={[styles.actionBtn, styles.actionWa]}
                    onPress={() => sendWhatsApp(p)}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.actionPrimaryTxt}>Remind</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, backgroundColor: theme.color.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.color.onSurface, letterSpacing: -0.4 },
  totalPill: { backgroundColor: '#FEE2E2', paddingHorizontal: theme.space.md, paddingVertical: 6, borderRadius: theme.radius.pill },
  totalTxt: { color: theme.color.loss, fontWeight: '800', fontSize: 14 },
  card: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, padding: theme.space.md, marginBottom: theme.space.md, borderWidth: 1, borderColor: theme.color.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space.md },
  partyName: { fontSize: 16, fontWeight: '800', color: theme.color.onSurface },
  partySub: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  partyAmt: { fontSize: 18, fontWeight: '800', color: theme.color.loss },
  barTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: theme.color.surfaceTertiary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: theme.space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: 10, color: theme.color.muted },
  actions: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: theme.radius.md },
  actionPrimary: { backgroundColor: theme.color.brand },
  actionWa: { backgroundColor: '#25D366' },
  actionPrimaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: theme.space.xxxl },
  emptyTxt: { color: theme.color.onSurface, fontWeight: '800', marginTop: theme.space.md, fontSize: 16 },
  emptySub: { color: theme.color.muted, fontSize: 13, marginTop: 4 },
});
