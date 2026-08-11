import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PnL() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPerTrip, setShowPerTrip] = useState(true);
  const [showOverhead, setShowOverhead] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get(`/pnl/monthly?year=${year}&month=${month}`); setData(r); }
    catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nav = (delta: number) => {
    let m = month + delta, y = year;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  const exportUrl = `${api.base}/api/excel/export?year=${year}&month=${month}`;

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="pnl-screen">
      <View style={styles.header}>
        <Pressable testID="prev-month-btn" onPress={() => nav(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={20} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>{MONTHS[month-1]} {year}</Text>
        <Pressable testID="next-month-btn" onPress={() => nav(1)} style={styles.arrow}><Ionicons name="chevron-forward" size={20} color={theme.color.onSurface} /></Pressable>
      </View>

      {loading ? <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /> : data && (
        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}>
          <View style={styles.netCard} testID="pnl-net-card">
            <Text style={styles.netLabel}>Net Profit / (Loss)</Text>
            <Text style={[styles.netVal, { color: data.net_profit >= 0 ? theme.color.profit : theme.color.loss }]}>{inr(data.net_profit, { showZero: true })}</Text>
            <Text style={styles.netPct}>{data.profit_pct}% of Total Income</Text>
          </View>

          <SectionTitle text="A. Income" />
          <LineRow label="Revenue (To Pay)" value={data.income.revenue} testID="pnl-revenue" />
          <LineRow label="Return / Adjustments" value={data.income.return_adjustment} />
          <LineRow label="TOTAL INCOME (A)" value={data.income.total_income} bold testID="pnl-total-income" />

          <SectionTitle text="B. Expenses" />
          <Pressable onPress={() => setShowPerTrip(v => !v)}>
            <View style={styles.subhead}>
              <Ionicons name={showPerTrip ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.color.muted} />
              <Text style={styles.subheadTxt}>Per-Trip</Text>
              <Text style={styles.subheadAmt}>{inr(data.per_trip_total)}</Text>
            </View>
          </Pressable>
          {showPerTrip && data.per_trip_items.map((it: any) => (
            <LineRow key={it.id} label={it.name} value={it.amount} indent />
          ))}
          <LineRow label="Per-trip sub-total" value={data.per_trip_total} bold />

          <Pressable onPress={() => setShowOverhead(v => !v)}>
            <View style={styles.subhead}>
              <Ionicons name={showOverhead ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.color.muted} />
              <Text style={styles.subheadTxt}>Overheads</Text>
              <Text style={styles.subheadAmt}>{inr(data.overhead_total)}</Text>
            </View>
          </Pressable>
          {showOverhead && data.overhead_items.map((it: any) => (
            <LineRow key={it.id} label={it.name} value={it.amount} indent />
          ))}
          <LineRow label="Overhead sub-total" value={data.overhead_total} bold />
          <LineRow label="TOTAL EXPENSES (B)" value={data.total_expense} bold testID="pnl-total-expense" />

          <View style={{ height: theme.space.lg }} />
          <View style={styles.netCard}>
            <Text style={styles.netLabel}>NET PROFIT / (LOSS) = A − B</Text>
            <Text style={[styles.netVal, { color: data.net_profit >= 0 ? theme.color.profit : theme.color.loss }]}>{inr(data.net_profit, { showZero: true })}</Text>
          </View>

          <SectionTitle text="Memorandum (not part of P&L)" />
          <LineRow label="Received (cash collected)" value={data.memorandum.received} />
          <LineRow label="Pending Freight outstanding" value={data.memorandum.pending_freight} />
          <View style={styles.restate}>
            <Ionicons name="warning" size={16} color={theme.color.warning} />
            <Text style={styles.restateTxt}>
              Corrected: old workbook double-counted Received. Original total-income figure would have been {inr(data.memorandum.old_workbook_income_double_counted)}.
            </Text>
          </View>

          <SectionTitle text="Vehicle Type Summary" />
          <View style={styles.twoCol}>
            <SummaryCard title="Own" s={data.vehicle_type_summary.own} />
            <SummaryCard title="Rented" s={data.vehicle_type_summary.rented} />
          </View>

          <Pressable
            testID="export-excel-btn"
            style={styles.exportBtn}
            onPress={() => {
              if (typeof window !== 'undefined') window.open(exportUrl, '_blank');
            }}
          >
            <Ionicons name="download" size={18} color="#fff" />
            <Text style={styles.exportTxt}>Export {MONTHS[month-1]} {year} to Excel</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const SectionTitle = ({ text }: { text: string }) => <Text style={styles.section}>{text}</Text>;

const LineRow = ({ label, value, bold, indent, testID }: any) => (
  <View style={[styles.line, indent && { paddingLeft: theme.space.xl }]} testID={testID}>
    <Text style={[styles.lineLabel, bold && { fontWeight: '800' }]}>{label}</Text>
    <Text style={[styles.lineVal, bold && { fontWeight: '800' }]}>{inr(value, { showZero: true })}</Text>
  </View>
);

const SummaryCard = ({ title, s }: any) => (
  <View style={styles.summary}>
    <Text style={styles.summTitle}>{title}</Text>
    <View style={styles.summRow}><Text style={styles.summL}>Trips</Text><Text style={styles.summV}>{s.trips}</Text></View>
    <View style={styles.summRow}><Text style={styles.summL}>Revenue</Text><Text style={styles.summV}>{inr(s.revenue)}</Text></View>
    <View style={styles.summRow}><Text style={styles.summL}>Pending</Text><Text style={styles.summV}>{inr(s.pending)}</Text></View>
    <View style={styles.summRow}><Text style={styles.summL}>Expenses</Text><Text style={styles.summV}>{inr(s.trip_expenses)}</Text></View>
    <View style={[styles.summRow, { borderTopWidth: 1, borderTopColor: theme.color.divider, paddingTop: 6, marginTop: 2 }]}>
      <Text style={[styles.summL, { fontWeight: '700', color: theme.color.onSurface }]}>Net</Text>
      <Text style={[styles.summV, { color: s.net_contribution >= 0 ? theme.color.profit : theme.color.loss }]}>{inr(s.net_contribution)}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, backgroundColor: theme.color.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  headerTitle: { fontSize: 18, fontWeight: '800', color: theme.color.onSurface, letterSpacing: -0.4 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surfaceTertiary },
  netCard: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, padding: theme.space.lg, borderWidth: 1, borderColor: theme.color.border, alignItems: 'center' },
  netLabel: { color: theme.color.muted, fontSize: 13 },
  netVal: { fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  netPct: { color: theme.color.muted, fontSize: 12, marginTop: 4 },
  section: { fontSize: 12, fontWeight: '800', color: theme.color.muted, textTransform: 'uppercase', marginTop: theme.space.xl, marginBottom: theme.space.sm, letterSpacing: 0.5 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.color.divider },
  lineLabel: { color: theme.color.onSurfaceSecondary, fontSize: 14 },
  lineVal: { color: theme.color.onSurface, fontSize: 14, fontWeight: '600' },
  subhead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.color.divider },
  subheadTxt: { flex: 1, color: theme.color.onSurface, fontWeight: '700', fontSize: 13 },
  subheadAmt: { fontWeight: '700', color: theme.color.onSurface, fontSize: 13 },
  restate: { flexDirection: 'row', gap: 8, padding: theme.space.md, backgroundColor: '#FEF3C7', borderRadius: theme.radius.md, marginTop: theme.space.sm },
  restateTxt: { flex: 1, color: theme.color.onSurface, fontSize: 12, lineHeight: 17 },
  twoCol: { flexDirection: 'row', gap: theme.space.md },
  summary: { flex: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.space.md, borderWidth: 1, borderColor: theme.color.border },
  summTitle: { fontWeight: '800', color: theme.color.onSurface, marginBottom: theme.space.sm },
  summRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summL: { color: theme.color.muted, fontSize: 12 },
  summV: { color: theme.color.onSurface, fontSize: 12, fontWeight: '600' },
  exportBtn: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.color.brand, paddingVertical: 14, borderRadius: theme.radius.md, marginTop: theme.space.xl },
  exportTxt: { color: '#fff', fontWeight: '700' },
});
