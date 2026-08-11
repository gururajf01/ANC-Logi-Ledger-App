import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { api } from '@/src/api/client';
import { theme, inr, inrCompact } from '@/src/theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Annual() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const now = new Date();
  const defaultFy = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const [fy, setFy] = useState(defaultFy);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get(`/pnl/annual?fy_start_year=${fy}`); setData(r); }
    catch (e) { console.warn(e); } finally { setLoading(false); }
  }, [fy]);

  useEffect(() => { load(); }, [load]);

  const chartW = Math.max(280, width - 80);

  const netVals = (data?.months || []).map((m: any) => Math.round(m.net_profit));
  const maxV = Math.max(0, ...(netVals.length ? netVals : [0]));
  const minV = Math.min(0, ...(netVals.length ? netVals : [0]));
  const maxMag = Math.max(Math.abs(maxV), Math.abs(minV), 1);
  const niceStep = (x: number) => {
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const n = x / p;
    const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return f * p;
  };
  const step = niceStep(maxMag / 4) || 1;
  const secAbove = Math.max(1, Math.ceil(maxV / step));
  const secBelow = Math.ceil(Math.abs(minV) / step);

  const netData = (data?.months || []).map((m: any) => ({
    value: Math.round(m.net_profit),
    label: MONTHS[m.month - 1],
    frontColor: m.net_profit >= 0 ? theme.color.profit : theme.color.loss,
  }));
  const revData = (data?.months || []).map((m: any) => ({ value: Math.round(m.revenue), label: MONTHS[m.month - 1] }));
  const expData = (data?.months || []).map((m: any) => ({ value: Math.round(m.total_expense) }));

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="annual-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={theme.color.onSurface} /></Pressable>
        <View style={styles.fyPicker}>
          <Pressable testID="fy-prev" onPress={() => setFy(fy - 1)}><Ionicons name="chevron-back" size={18} color={theme.color.muted} /></Pressable>
          <Text style={styles.headerTitle}>FY {fy}–{(fy + 1) % 100}</Text>
          <Pressable testID="fy-next" onPress={() => setFy(fy + 1)}><Ionicons name="chevron-forward" size={18} color={theme.color.muted} /></Pressable>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading || !data ? <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}>
          <View style={styles.kpiRow}>
            <Kpi label="Revenue" value={inrCompact(data.totals.revenue)} />
            <Kpi label="Net Profit" value={inrCompact(data.totals.net_profit)} color={data.totals.net_profit >= 0 ? theme.color.profit : theme.color.loss} />
          </View>
          <View style={styles.kpiRow}>
            <Kpi label="Received" value={inrCompact(data.totals.received)} />
            <Kpi label="Pending" value={inrCompact(data.totals.pending)} color={theme.color.warning} />
          </View>

          <Text style={styles.chartTitle}>Net Profit by Month</Text>
          <View style={styles.chartCard}>
            <BarChart
              data={netData}
              width={chartW}
              height={180}
              barWidth={14}
              spacing={12}
              maxValue={step * secAbove}
              stepValue={step}
              noOfSections={secAbove}
              noOfSectionsBelowXAxis={secBelow}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={theme.color.border}
              xAxisLabelTextStyle={{ color: theme.color.muted, fontSize: 9 }}
              yAxisTextStyle={{ color: theme.color.muted, fontSize: 9 }}
              formatYLabel={(v: string) => inrCompact(Number(v))}
              isAnimated
            />
          </View>

          <Text style={styles.chartTitle}>Revenue vs Expense Trend</Text>
          <View style={styles.chartCard}>
            <LineChart
              data={revData}
              data2={expData}
              width={chartW}
              height={180}
              spacing={Math.max(18, chartW / 13)}
              initialSpacing={12}
              color1={theme.color.profit}
              color2={theme.color.loss}
              thickness={2}
              hideDataPoints={false}
              dataPointsColor1={theme.color.profit}
              dataPointsColor2={theme.color.loss}
              yAxisThickness={0}
              xAxisThickness={0}
              xAxisLabelTextStyle={{ color: theme.color.muted, fontSize: 9 }}
              yAxisTextStyle={{ color: theme.color.muted, fontSize: 9 }}
              formatYLabel={(v: string) => inrCompact(Number(v))}
              isAnimated
            />
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: theme.color.profit }]} /><Text style={styles.legendTxt}>Revenue</Text></View>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: theme.color.loss }]} /><Text style={styles.legendTxt}>Expense</Text></View>
            </View>
          </View>

          <Text style={styles.chartTitle}>Month-by-Month</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.th, { flex: 1.2 }]}>Month</Text>
              <Text style={styles.th}>Revenue</Text>
              <Text style={styles.th}>Expense</Text>
              <Text style={styles.th}>Net</Text>
            </View>
            {data.months.map((m: any) => (
              <Pressable
                key={`${m.year}-${m.month}`}
                testID={`annual-row-${m.month}`}
                style={styles.tr}
                onPress={() => router.push({ pathname: '/(tabs)/pnl' })}
              >
                <Text style={[styles.td, { flex: 1.2, fontWeight: '700' }]}>{MONTHS[m.month - 1]} {String(m.year).slice(2)}</Text>
                <Text style={styles.td}>{inrCompact(m.revenue)}</Text>
                <Text style={styles.td}>{inrCompact(m.total_expense)}</Text>
                <Text style={[styles.td, { color: m.net_profit >= 0 ? theme.color.profit : theme.color.loss, fontWeight: '700' }]}>{inrCompact(m.net_profit)}</Text>
              </Pressable>
            ))}
            <View style={[styles.tr, styles.trTotal]}>
              <Text style={[styles.td, { flex: 1.2, fontWeight: '800' }]}>TOTAL</Text>
              <Text style={[styles.td, { fontWeight: '800' }]}>{inrCompact(data.totals.revenue)}</Text>
              <Text style={[styles.td, { fontWeight: '800' }]}>{inrCompact(data.totals.total_expense)}</Text>
              <Text style={[styles.td, { fontWeight: '800', color: data.totals.net_profit >= 0 ? theme.color.profit : theme.color.loss }]}>{inrCompact(data.totals.net_profit)}</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const Kpi = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={styles.kpi}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={[styles.kpiValue, color && { color }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { fontSize: 16, fontWeight: '800', color: theme.color.onSurface },
  fyPicker: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  kpiRow: { flexDirection: 'row', gap: theme.space.md, marginBottom: theme.space.md },
  kpi: { flex: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.space.md, borderWidth: 1, borderColor: theme.color.border },
  kpiLabel: { color: theme.color.muted, fontSize: 12 },
  kpiValue: { color: theme.color.onSurface, fontSize: 20, fontWeight: '800', marginTop: 4 },
  chartTitle: { fontSize: 13, fontWeight: '800', color: theme.color.onSurface, marginTop: theme.space.lg, marginBottom: theme.space.sm },
  chartCard: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, padding: theme.space.md, borderWidth: 1, borderColor: theme.color.border, overflow: 'hidden' },
  legendRow: { flexDirection: 'row', gap: theme.space.lg, marginTop: theme.space.sm, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { color: theme.color.muted, fontSize: 12 },
  table: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.color.divider, alignItems: 'center' },
  trHead: { backgroundColor: theme.color.surfaceTertiary },
  trTotal: { backgroundColor: theme.color.surfaceTertiary, borderBottomWidth: 0 },
  th: { flex: 1, fontSize: 11, fontWeight: '800', color: theme.color.muted, textAlign: 'right' },
  td: { flex: 1, fontSize: 12, color: theme.color.onSurfaceSecondary, textAlign: 'right' },
});
