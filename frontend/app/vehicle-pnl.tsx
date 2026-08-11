import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function VehiclePnl() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get(`/pnl/vehicles?year=${year}&month=${month}`); setData(r); }
    catch (e) { console.warn(e); } finally { setLoading(false); }
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nav = (d: number) => {
    let m = month + d, y = year;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="vehicle-pnl-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Per-Truck P&L</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.monthBar}>
        <Pressable testID="vpnl-prev" onPress={() => nav(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={18} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.monthTxt}>{MONTHS[month-1]} {year}</Text>
        <Pressable testID="vpnl-next" onPress={() => nav(1)} style={styles.arrow}><Ionicons name="chevron-forward" size={18} color={theme.color.onSurface} /></Pressable>
      </View>

      {loading || !data ? <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}>
          <Text style={styles.note}>Net = revenue + adj − trip cost − EMI − share of overheads (allocated by trips). Shared overhead this month: {inr(data.shared_overhead)}.</Text>
          {data.vehicles.map((v: any) => {
            const open = expanded === v.vehicle_id;
            const profit = v.net_contribution >= 0;
            return (
              <Pressable key={v.vehicle_id} testID={`vpnl-${v.vehicle_id}`} style={styles.card} onPress={() => setExpanded(open ? null : v.vehicle_id)}>
                <View style={styles.cardTop}>
                  <View style={[styles.badge, { backgroundColor: v.type === 'Own' ? '#DBEAFE' : '#FEF3C7' }]}>
                    <Ionicons name="car" size={16} color={v.type === 'Own' ? theme.color.brand : theme.color.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vNo}>{v.vehicle_no}</Text>
                    <Text style={styles.vSub}>{v.type} · {v.trips} trip(s) · {v.trips ? inr(v.per_trip) + '/trip' : 'idle'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.net, { color: profit ? theme.color.profit : theme.color.loss }]}>{inr(v.net_contribution, { showZero: true })}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.color.muted} />
                  </View>
                </View>
                {open && (
                  <View style={styles.detail}>
                    <Line l="Revenue" v={v.revenue} />
                    <Line l="Return / Adj" v={v.return_adj} />
                    <Line l="Trip cost" v={-v.trip_cost} />
                    <Line l="EMI" v={-v.emi} />
                    <Line l="Overhead share" v={-v.overhead_share} />
                    <View style={styles.divider} />
                    <Line l="Net contribution" v={v.net_contribution} bold />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const Line = ({ l, v, bold }: { l: string; v: number; bold?: boolean }) => (
  <View style={styles.line}>
    <Text style={[styles.lineL, bold && { fontWeight: '800', color: theme.color.onSurface }]}>{l}</Text>
    <Text style={[styles.lineV, bold && { fontWeight: '800' }, v < 0 && { color: theme.color.loss }]}>{inr(v, { showZero: true })}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space.lg, paddingVertical: theme.space.sm, backgroundColor: theme.color.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  monthTxt: { fontSize: 15, fontWeight: '700', color: theme.color.onSurface },
  arrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surfaceTertiary },
  note: { fontSize: 12, color: theme.color.muted, marginBottom: theme.space.md, lineHeight: 17 },
  card: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.space.md, marginBottom: theme.space.sm, borderWidth: 1, borderColor: theme.color.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  vNo: { fontSize: 15, fontWeight: '800', color: theme.color.onSurface },
  vSub: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  net: { fontSize: 16, fontWeight: '800' },
  detail: { marginTop: theme.space.md, paddingTop: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.color.divider },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  lineL: { fontSize: 13, color: theme.color.muted },
  lineV: { fontSize: 13, color: theme.color.onSurfaceSecondary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.color.divider, marginVertical: 4 },
});
