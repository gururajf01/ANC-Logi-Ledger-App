import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, FlatList, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function RentedLedger() {
  const router = useRouter();
  const [summary, setSummary] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, e, v] = await Promise.all([
        api.get('/rented-ledger/summary'),
        api.get('/rented-ledger'),
        api.get('/vehicles'),
      ]);
      setSummary(s || []); setEntries(e || []);
      setVehicles((v || []).filter((x: any) => x.type === 'Rented'));
    } catch (err) { console.warn(err); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => setModal({ date: todayStr(), ts_no: '', vehicle_id: vehicles[0]?.id || '', revenue_to_pay: '', amount_paid: '', commission_adj: '' });

  const save = async () => {
    if (!modal?.vehicle_id) return;
    setSaving(true);
    try {
      await api.post('/rented-ledger', {
        date: modal.date, ts_no: modal.ts_no || undefined, vehicle_id: modal.vehicle_id,
        revenue_to_pay: Number(modal.revenue_to_pay) || 0,
        amount_paid: Number(modal.amount_paid) || 0,
        commission_adj: Number(modal.commission_adj) || 0,
        notes: modal.notes || undefined,
      });
      setModal(null); await load();
    } catch (e) { console.warn(e); } finally { setSaving(false); }
  };

  const del = async (id: string) => { try { await api.del(`/rented-ledger/${id}`); await load(); } catch (e) { console.warn(e); } };

  const totalOut = summary.reduce((a, o) => a + (o.outstanding || 0), 0);

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="rented-ledger-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Rented Ledger</Text>
        <Pressable testID="rl-add" onPress={openNew} style={styles.addBtn}><Ionicons name="add" size={18} color="#fff" /></Pressable>
      </View>

      {loading ? <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}
          ListHeaderComponent={
            <View>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total owed to owners</Text>
                <Text style={styles.totalVal}>{inr(totalOut, { showZero: true })}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }} style={{ marginBottom: theme.space.md }}>
                {summary.map((o) => (
                  <View key={o.owner} style={styles.ownerCard} testID={`rl-owner-${o.owner}`}>
                    <Text style={styles.ownerName}>{o.owner}</Text>
                    <Text style={styles.ownerOut}>{inr(o.outstanding, { showZero: true })}</Text>
                    <Text style={styles.ownerSub}>{o.trips} trip(s) · paid {inr(o.total_paid)}</Text>
                  </View>
                ))}
                {summary.length === 0 && <Text style={{ color: theme.color.muted }}>No owners yet.</Text>}
              </ScrollView>
              <Text style={styles.sectionTitle}>Entries</Text>
            </View>
          }
          ListEmptyComponent={<Text style={{ color: theme.color.muted, textAlign: 'center', marginTop: 20 }}>No ledger entries. Tap + to add.</Text>}
          renderItem={({ item: e }) => (
            <View style={styles.entry} testID={`rl-entry-${e.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle}>{e.ts_no || '—'} · {e.vehicle_no}</Text>
                <Text style={styles.entrySub}>{e.date} · {e.owner}</Text>
                <Text style={styles.entryDetail}>Rev {inr(e.revenue_to_pay)} · Comm {inr(e.commission_adj)} · Paid {inr(e.amount_paid)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.entryBal, { color: e.balance >= 0 ? theme.color.warning : theme.color.profit }]}>{inr(e.balance, { showZero: true })}</Text>
                <Text style={styles.running}>run {inr(e.running_outstanding, { showZero: true })}</Text>
                <Pressable onPress={() => del(e.id)} testID={`rl-del-${e.id}`} style={{ padding: 4 }}><Ionicons name="trash" size={16} color={theme.color.error} /></Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Ledger Entry</Text>
                <Pressable onPress={() => setModal(null)}><Ionicons name="close" size={22} color={theme.color.onSurface} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: theme.space.md }} keyboardShouldPersistTaps="handled">
                <Label t="Vehicle (Rented)" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: theme.space.md }}>
                  {vehicles.map((v) => (
                    <Pressable key={v.id} testID={`rl-veh-${v.id}`} onPress={() => setModal((m: any) => ({ ...m, vehicle_id: v.id }))} style={[styles.chip, modal?.vehicle_id === v.id && styles.chipActive]}>
                      <Text style={[styles.chipTxt, modal?.vehicle_id === v.id && { color: '#fff' }]}>{v.vehicle_no}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Field t="Date" k="date" modal={modal} setModal={setModal} />
                <Field t="TS No." k="ts_no" modal={modal} setModal={setModal} />
                <Field t="Revenue (₹)" k="revenue_to_pay" modal={modal} setModal={setModal} numeric />
                <Field t="Commission deducted (₹)" k="commission_adj" modal={modal} setModal={setModal} numeric />
                <Field t="Amount paid to owner (₹)" k="amount_paid" modal={modal} setModal={setModal} numeric />
                <Pressable testID="rl-save" onPress={save} style={styles.saveBtn} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save Entry</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const Label = ({ t }: { t: string }) => <Text style={styles.label}>{t}</Text>;
const Field = ({ t, k, modal, setModal, numeric }: any) => (
  <View style={{ marginBottom: theme.space.md }}>
    <Text style={styles.label}>{t}</Text>
    <TextInput
      testID={`rl-field-${k}`}
      style={styles.input}
      value={String(modal?.[k] ?? '')}
      keyboardType={numeric ? 'numeric' : 'default'}
      onChangeText={(v) => setModal((m: any) => ({ ...m, [k]: v }))}
    />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center' },
  totalCard: { backgroundColor: theme.color.surfaceInverse, borderRadius: theme.radius.lg, padding: theme.space.lg, marginBottom: theme.space.md },
  totalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  totalVal: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  ownerCard: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, padding: theme.space.md, minWidth: 150 },
  ownerName: { fontWeight: '800', color: theme.color.onSurface, fontSize: 14 },
  ownerOut: { color: theme.color.warning, fontWeight: '800', fontSize: 18, marginTop: 4 },
  ownerSub: { color: theme.color.muted, fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: theme.color.muted, textTransform: 'uppercase', marginBottom: theme.space.sm, letterSpacing: 0.5 },
  entry: { flexDirection: 'row', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, padding: theme.space.md, marginBottom: theme.space.sm },
  entryTitle: { fontWeight: '700', color: theme.color.onSurface, fontSize: 14 },
  entrySub: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  entryDetail: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  entryBal: { fontWeight: '800', fontSize: 15 },
  running: { color: theme.color.muted, fontSize: 11, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  label: { fontSize: 12, color: theme.color.muted, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.color.onSurface, minHeight: 44 },
  chip: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36 },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipTxt: { color: theme.color.onSurface, fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: theme.color.brand, minHeight: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', marginTop: theme.space.md, marginBottom: theme.space.xl },
});
