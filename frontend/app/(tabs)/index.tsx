import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

function todayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function Today() {
  const router = useRouter();
  const [date, setDate] = useState<string>(todayStr());
  const [data, setData] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [overheads, setOverheads] = useState<any[]>([]);
  const [mode, setMode] = useState<'accrual' | 'cash'>('accrual');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, tr, ov] = await Promise.all([
        api.get(`/pnl/daily?date=${date}`),
        api.get(`/trips?date_from=${date}&date_to=${date}`),
        api.get(`/overheads?date_from=${date}&date_to=${date}`),
      ]);
      setData(p); setTrips(tr || []); setOverheads(ov || []);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setLoading(true); load(); }, [date, load]);

  const net = mode === 'accrual' ? (data?.accrual?.net_profit ?? 0) : (data?.cash?.net_cash ?? 0);
  const isProfit = net >= 0;

  const nav = (delta: number) => {
    const d = new Date(date); d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const dateLabel = (() => {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  })();

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="today-screen">
      <View style={styles.header}>
        <Pressable testID="prev-day-button" onPress={() => nav(-1)} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={theme.color.onSurface} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle} testID="today-date-label">{dateLabel}</Text>
          <Text style={styles.headerSub}>ANCL Ledger</Text>
        </View>
        <Pressable testID="next-day-button" onPress={() => nav(1)} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={22} color={theme.color.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {loading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.color.brand} />
        ) : (
          <>
            <View style={styles.hero} testID="net-profit-card">
              <View style={styles.modeRow}>
                <Pressable
                  testID="mode-accrual"
                  onPress={() => setMode('accrual')}
                  style={[styles.modeBtn, mode === 'accrual' && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeTxt, mode === 'accrual' && styles.modeTxtActive]}>Accrual</Text>
                </Pressable>
                <Pressable
                  testID="mode-cash"
                  onPress={() => setMode('cash')}
                  style={[styles.modeBtn, mode === 'cash' && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeTxt, mode === 'cash' && styles.modeTxtActive]}>Cash</Text>
                </Pressable>
              </View>
              <Text style={styles.heroLabel}>{mode === 'accrual' ? "Today's Net Profit" : "Today's Net Cash"}</Text>
              <Text
                testID="net-profit-value"
                style={[styles.heroValue, { color: isProfit ? theme.color.profit : theme.color.loss }]}
              >
                {inr(net, { showZero: true })}
              </Text>
              {mode === 'accrual' && data && (
                <View style={styles.breakRow}>
                  <BreakItem label="Income" value={data.accrual.income} />
                  <BreakItem label="Trip Cost" value={-data.accrual.variable_cost} />
                  <BreakItem label="Overhead" value={-data.accrual.overhead} />
                </View>
              )}
              {mode === 'cash' && data && (
                <View style={styles.breakRow}>
                  <BreakItem label="Cash In" value={data.cash.cash_in} />
                  <BreakItem label="Cash Out" value={-data.cash.cash_out} />
                </View>
              )}
              {mode === 'accrual' && data?.accrual?.overhead > 0 && (
                <Text style={styles.accrNote}>Includes {inr(data.accrual.overhead)} accrued overhead</Text>
              )}
            </View>

            <View style={styles.chips}>
              <Chip label="Trips" value={String(data?.chips?.trips_today ?? 0)} testID="chip-trips" />
              <Chip label="Own / Rented" value={`${data?.chips?.own_trips ?? 0} / ${data?.chips?.rented_trips ?? 0}`} testID="chip-split" />
              <Chip label="New Pending" value={inr(data?.chips?.new_pending_today, { showZero: true })} testID="chip-new-pending" />
              <Chip label="All Pending" value={inr(data?.chips?.total_pending_all_time, { showZero: true })} testID="chip-all-pending" />
            </View>

            <Text style={styles.sectionTitle}>Today's Entries</Text>
            {trips.length === 0 && overheads.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={40} color={theme.color.muted} />
                <Text style={styles.emptyTxt}>No entries for this day</Text>
                <Text style={styles.emptySub}>Tap + to add a trip.</Text>
              </View>
            )}
            {trips.map((t) => (
              <Pressable
                key={t.id}
                testID={`trip-row-${t.id}`}
                onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })}
                style={styles.row}
              >
                <View style={styles.rowIcon}><Ionicons name="car" size={18} color={theme.color.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.ts_no} · {t.vehicle_no}</Text>
                  <Text style={styles.rowSub}>{t.party_name || 'No party'} · {t.route_from || '-'} → {t.route_to || '-'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowAmt}>{inr(t.revenue_to_pay)}</Text>
                  <Text style={[styles.rowMargin, { color: (t.trip_margin ?? 0) >= 0 ? theme.color.profit : theme.color.loss }]}>
                    m {inr(t.trip_margin, { showZero: true })}
                  </Text>
                </View>
              </Pressable>
            ))}
            {overheads.map((o) => (
              <View key={o.id} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: '#FEF3C7' }]}><Ionicons name="wallet" size={18} color={theme.color.warning} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Overhead · {o.category_name}</Text>
                  <Text style={styles.rowSub}>{o.description || o.paid_to || ''}</Text>
                </View>
                <Text style={styles.rowAmt}>-{inr(o.amount)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Pressable
        testID="fab-add"
        onPress={() => router.push({ pathname: '/trip/[id]', params: { id: 'new' } })}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
      <Pressable
        testID="fab-overhead"
        onPress={() => router.push('/overhead/new')}
        style={styles.fabSecondary}
      >
        <Ionicons name="wallet-outline" size={20} color={theme.color.brand} />
      </Pressable>
    </SafeAreaView>
  );
}

const BreakItem = ({ label, value }: { label: string; value: number }) => (
  <View style={{ alignItems: 'center', flex: 1 }}>
    <Text style={styles.breakLabel}>{label}</Text>
    <Text style={styles.breakValue}>{inr(value, { showZero: true })}</Text>
  </View>
);

const Chip = ({ label, value, testID }: { label: string; value: string; testID?: string }) => (
  <View style={styles.chip} testID={testID}>
    <Text style={styles.chipLabel}>{label}</Text>
    <Text style={styles.chipValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md,
    borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.color.onSurface },
  headerSub: { fontSize: 11, color: theme.color.muted, marginTop: 2 },
  arrow: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.color.surfaceTertiary,
  },
  hero: {
    backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg,
    padding: theme.space.lg, borderWidth: 1, borderColor: theme.color.border,
  },
  modeRow: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: theme.color.surfaceTertiary, borderRadius: theme.radius.pill, padding: 3 },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: theme.radius.pill },
  modeBtnActive: { backgroundColor: theme.color.brand },
  modeTxt: { color: theme.color.muted, fontSize: 12, fontWeight: '600' },
  modeTxtActive: { color: '#fff' },
  heroLabel: { color: theme.color.muted, fontSize: 13, marginTop: theme.space.md },
  heroValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  breakRow: { flexDirection: 'row', marginTop: theme.space.md, borderTopWidth: 1, borderTopColor: theme.color.divider, paddingTop: theme.space.md },
  breakLabel: { fontSize: 11, color: theme.color.muted },
  breakValue: { fontSize: 14, fontWeight: '700', color: theme.color.onSurface, marginTop: 2 },
  accrNote: { marginTop: theme.space.sm, fontSize: 11, color: theme.color.muted, fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: theme.space.md },
  chip: {
    flexBasis: '48%', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border,
    borderRadius: theme.radius.md, padding: theme.space.md,
  },
  chipLabel: { fontSize: 11, color: theme.color.muted },
  chipValue: { fontSize: 16, fontWeight: '700', color: theme.color.onSurface, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.color.onSurface, marginTop: theme.space.xl, marginBottom: theme.space.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.space.md,
    backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md,
    padding: theme.space.md, marginBottom: theme.space.sm, borderWidth: 1, borderColor: theme.color.border,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: theme.color.onSurface },
  rowSub: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  rowAmt: { fontSize: 14, fontWeight: '700', color: theme.color.onSurface },
  rowMargin: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: theme.space.xxxl },
  emptyTxt: { color: theme.color.onSurface, fontWeight: '700', marginTop: theme.space.md },
  emptySub: { color: theme.color.muted, fontSize: 12, marginTop: 4 },
  fab: {
    position: 'absolute', right: theme.space.lg, bottom: 82,
    width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brand,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 8px rgba(0,0,0,0.15)', elevation: 6,
  },
  fabSecondary: {
    position: 'absolute', right: theme.space.lg, bottom: 148,
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
