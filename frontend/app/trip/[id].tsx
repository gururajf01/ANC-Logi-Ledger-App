import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function TripForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!params.id && params.id !== 'new';

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayStr());
  const [tsNo, setTsNo] = useState('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [partyId, setPartyId] = useState<string>('');
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [revenue, setRevenue] = useState('');
  const [received, setReceived] = useState('');
  const [returnAdj, setReturnAdj] = useState('');
  const [notes, setNotes] = useState('');
  const [expenses, setExpenses] = useState<Record<string, string>>({});
  const [showMoreExpenses, setShowMoreExpenses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMasters = useCallback(async () => {
    const [v, d, p, c] = await Promise.all([
      api.get('/vehicles'), api.get('/drivers'), api.get('/parties'), api.get('/categories?kind=PerTrip'),
    ]);
    setVehicles(v || []); setDrivers(d || []); setParties(p || []); setCats(c || []);
    if (isEdit) {
      // Fetch actual trip
      try {
        const all = await api.get('/trips?limit=2000');
        const t2 = (all || []).find((x: any) => x.id === params.id);
        if (t2) {
          setDate(t2.date || todayStr());
          setTsNo(t2.ts_no || '');
          setVehicleId(t2.vehicle_id || '');
          setDriverId(t2.driver_id || '');
          setPartyId(t2.party_id || '');
          setRouteFrom(t2.route_from || ''); setRouteTo(t2.route_to || '');
          setRevenue(String(t2.revenue_to_pay ?? ''));
          setReceived(String(t2.amount_received ?? ''));
          setReturnAdj(String(t2.return_adjustment ?? ''));
          setNotes(t2.notes || '');
          const ex: Record<string, string> = {};
          Object.entries(t2.expenses || {}).forEach(([k, v]) => (ex[k] = String(v)));
          setExpenses(ex);
        }
      } catch {}
    }
    setLoading(false);
  }, [isEdit, params.id]);

  useEffect(() => { loadMasters(); }, [loadMasters]);

  // Auto-fill driver & default bhatta when vehicle changes
  useEffect(() => {
    if (!vehicleId) return;
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v) return;
    if (v.default_driver_id && !driverId) setDriverId(v.default_driver_id);
    if (v.default_driver_id) {
      const drv = drivers.find((d) => d.id === v.default_driver_id);
      if (drv) {
        const bhattaCat = cats.find((c: any) => c.name.toLowerCase() === 'bhatta');
        if (bhattaCat && !expenses[bhattaCat.id]) {
          setExpenses((prev) => ({ ...prev, [bhattaCat.id]: String(drv.default_bhatta_rate || 600) }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, vehicles, drivers, cats]);

  const num = (s: string) => Number((s || '').replace(/[^0-9.-]/g, '')) || 0;
  const revenueN = num(revenue);
  const receivedN = num(received);
  const retN = num(returnAdj);
  const expTotal = Object.values(expenses).reduce((a, b) => a + num(b), 0);
  const pending = revenueN - receivedN;
  const margin = revenueN + retN - expTotal;

  const save = async (addAnother = false) => {
    setError(null);
    if (!date || !tsNo || !vehicleId || revenueN <= 0) {
      setError('Date, TS No, Vehicle and Revenue are required.');
      return;
    }
    setSaving(true);
    try {
      const veh = vehicles.find((x) => x.id === vehicleId);
      const drv = drivers.find((x) => x.id === driverId);
      const pty = parties.find((x) => x.id === partyId);
      const body: any = {
        id: isEdit ? params.id : undefined,
        date, ts_no: tsNo, vehicle_id: vehicleId,
        vehicle_no: veh?.vehicle_no, vehicle_type: veh?.type || 'Own',
        driver_id: driverId || undefined, driver_name: drv?.name,
        party_id: partyId || undefined, party_name: pty?.party_name,
        route_from: routeFrom || undefined, route_to: routeTo || undefined,
        revenue_to_pay: revenueN, amount_received: receivedN, return_adjustment: retN,
        expenses: Object.fromEntries(Object.entries(expenses).map(([k, v]) => [k, num(v)])),
        notes: notes || undefined,
      };
      if (isEdit) await api.put(`/trips/${params.id}`, body);
      else await api.post('/trips', body);
      if (addAnother) {
        setTsNo(''); setPartyId(''); setRouteFrom(''); setRouteTo('');
        setRevenue(''); setReceived(''); setReturnAdj(''); setNotes('');
        setExpenses({}); setShowMoreExpenses(false);
      } else {
        router.back();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator color={theme.color.brand} /></View>;

  const nonZeroCats = cats.filter((c: any) => num(expenses[c.id] || '0') > 0);
  const zeroCats = cats.filter((c: any) => num(expenses[c.id] || '0') === 0);
  const visibleCats = showMoreExpenses ? cats : [...nonZeroCats, ...zeroCats.slice(0, 4)];

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="trip-form-screen">
      <View style={styles.header}>
        <Pressable testID="close-trip-form" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Trip' : 'Add Trip'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Trip</Text>
          <Field label="Date" testID="field-date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Field label="TS No." testID="field-ts" value={tsNo} onChangeText={setTsNo} placeholder="e.g. 1024" />

          <Text style={styles.label}>Vehicle</Text>
          <ChipPicker
            testIDPrefix="vehicle-chip"
            items={vehicles.map((v) => ({ id: v.id, label: `${v.vehicle_no}`, sub: v.type }))}
            selected={vehicleId}
            onChange={setVehicleId}
          />

          <Text style={styles.label}>Driver</Text>
          <ChipPicker
            testIDPrefix="driver-chip"
            items={drivers.map((d) => ({ id: d.id, label: d.name }))}
            selected={driverId}
            onChange={setDriverId}
          />

          <Text style={styles.label}>Party</Text>
          <ChipPicker
            testIDPrefix="party-chip"
            items={[{ id: '', label: 'None' }, ...parties.map((p) => ({ id: p.id, label: p.party_name }))]}
            selected={partyId}
            onChange={setPartyId}
          />

          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <View style={{ flex: 1 }}><Field label="From" value={routeFrom} onChangeText={setRouteFrom} testID="field-from" /></View>
            <View style={{ flex: 1 }}><Field label="To" value={routeTo} onChangeText={setRouteTo} testID="field-to" /></View>
          </View>

          <Text style={styles.section}>Income</Text>
          <MoneyField label="Revenue (To Pay)" value={revenue} onChangeText={setRevenue} testID="field-revenue" />
          <MoneyField label="Received" value={received} onChangeText={setReceived} testID="field-received" />
          <MoneyField label="Return / Adjustment" value={returnAdj} onChangeText={setReturnAdj} testID="field-return-adj" />
          <View style={styles.liveRow}>
            <View style={styles.liveBox}><Text style={styles.liveL}>Pending</Text><Text style={styles.liveV} testID="live-pending">{inr(pending, { showZero: true })}</Text></View>
            <View style={styles.liveBox}><Text style={styles.liveL}>Margin</Text><Text style={[styles.liveV, { color: margin >= 0 ? theme.color.profit : theme.color.loss }]} testID="live-margin">{inr(margin, { showZero: true })}</Text></View>
          </View>

          <Text style={styles.section}>Expenses</Text>
          <View style={styles.grid}>
            {visibleCats.map((c: any) => (
              <View key={c.id} style={styles.expBox}>
                <Text style={styles.expLabel} numberOfLines={1}>{c.name}</Text>
                <TextInput
                  testID={`expense-${c.id}`}
                  keyboardType="numeric"
                  placeholder="0"
                  value={expenses[c.id] || ''}
                  onChangeText={(v) => setExpenses((prev) => ({ ...prev, [c.id]: v }))}
                  style={styles.expInput}
                />
              </View>
            ))}
          </View>
          {!showMoreExpenses && cats.length > visibleCats.length && (
            <Pressable testID="more-expenses" onPress={() => setShowMoreExpenses(true)} style={styles.moreBtn}>
              <Text style={styles.moreTxt}>+ {cats.length - visibleCats.length} more expenses</Text>
            </Pressable>
          )}

          <Text style={styles.section}>Notes</Text>
          <TextInput
            testID="field-notes"
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
          />

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.stickyFooter}>
          {!isEdit && (
            <Pressable testID="save-and-add" onPress={() => save(true)} style={[styles.footerBtn, styles.footerBtnGhost]} disabled={saving}>
              <Text style={styles.footerBtnGhostTxt}>Save & Add Another</Text>
            </Pressable>
          )}
          <Pressable testID="save-trip-btn" onPress={() => save(false)} style={[styles.footerBtn, styles.footerBtnPrimary]} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.footerBtnPrimaryTxt}>{isEdit ? 'Save' : 'Save Trip'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, testID, ...rest }: any) {
  return (
    <View style={{ marginBottom: theme.space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} testID={testID} {...rest} />
    </View>
  );
}

function MoneyField({ label, testID, value, onChangeText }: any) {
  return (
    <View style={{ marginBottom: theme.space.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.moneyBox}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          testID={testID}
          keyboardType="numeric"
          placeholder="0"
          value={value}
          onChangeText={onChangeText}
          style={styles.moneyInput}
        />
      </View>
    </View>
  );
}

function ChipPicker({ items, selected, onChange, testIDPrefix }: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16, paddingVertical: 4 }} style={{ marginBottom: theme.space.md }}>
      {items.map((it: any) => {
        const active = selected === it.id;
        return (
          <Pressable
            key={String(it.id)}
            testID={`${testIDPrefix}-${it.id || 'none'}`}
            onPress={() => onChange(it.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{it.label}</Text>
            {it.sub && <Text style={[styles.chipSub, active && { color: 'rgba(255,255,255,0.7)' }]}>{it.sub}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 11, fontWeight: '800', color: theme.color.muted, textTransform: 'uppercase', marginTop: theme.space.lg, marginBottom: theme.space.sm, letterSpacing: 0.5 },
  label: { fontSize: 12, color: theme.color.muted, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.color.onSurface, minHeight: 44 },
  moneyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, minHeight: 44 },
  rupee: { fontSize: 16, color: theme.color.muted, marginRight: 6 },
  moneyInput: { flex: 1, fontSize: 16, color: theme.color.onSurface, paddingVertical: 10, fontWeight: '600' },
  chip: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0, minHeight: 36 },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipTxt: { color: theme.color.onSurface, fontSize: 13, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  chipSub: { color: theme.color.muted, fontSize: 10, marginTop: 1 },
  liveRow: { flexDirection: 'row', gap: theme.space.md },
  liveBox: { flex: 1, backgroundColor: theme.color.surfaceTertiary, borderRadius: theme.radius.md, padding: 12 },
  liveL: { color: theme.color.muted, fontSize: 11 },
  liveV: { color: theme.color.onSurface, fontSize: 18, fontWeight: '800', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expBox: { flexBasis: '48%', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, padding: 10 },
  expLabel: { fontSize: 11, color: theme.color.muted, fontWeight: '600' },
  expInput: { fontSize: 16, fontWeight: '700', color: theme.color.onSurface, paddingVertical: 4 },
  moreBtn: { paddingVertical: 10, alignItems: 'center' },
  moreTxt: { color: theme.color.brand, fontWeight: '700' },
  error: { color: theme.color.error, marginTop: theme.space.md, fontWeight: '600' },
  stickyFooter: { flexDirection: 'row', gap: 10, padding: theme.space.md, paddingBottom: 24, backgroundColor: theme.color.surfaceSecondary, borderTopWidth: 1, borderTopColor: theme.color.border },
  footerBtn: { flex: 1, minHeight: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  footerBtnPrimary: { backgroundColor: theme.color.brand },
  footerBtnPrimaryTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footerBtnGhost: { borderWidth: 1, borderColor: theme.color.brand, backgroundColor: theme.color.surfaceSecondary },
  footerBtnGhostTxt: { color: theme.color.brand, fontWeight: '700', fontSize: 14 },
});
