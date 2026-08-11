import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function OverheadForm() {
  const router = useRouter();
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [mode, setMode] = useState('Cash');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const c = await api.get('/categories?kind=Overhead');
    setCats(c || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setErr(null);
    if (!categoryId || !amount) { setErr('Category and amount required'); return; }
    setSaving(true);
    try {
      await api.post('/overheads', {
        date, category_id: categoryId, amount: Number(amount) || 0,
        description: desc || undefined, paid_to: paidTo || undefined, payment_mode: mode,
      });
      router.back();
    } catch (e: any) { setErr(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="overhead-form-screen">
      <View style={styles.header}>
        <Pressable testID="close-overhead" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="close" size={22} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Add Overhead</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Date</Text>
          <TextInput testID="oh-date" value={date} onChangeText={setDate} style={styles.input} />
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16, paddingVertical: 4 }} style={{ marginBottom: theme.space.md }}>
            {cats.map((c: any) => {
              const active = c.id === categoryId;
              return (
                <Pressable key={c.id} testID={`oh-cat-${c.id}`} onPress={() => setCategoryId(c.id)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.moneyBox}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput testID="oh-amount" keyboardType="numeric" value={amount} onChangeText={setAmount} style={styles.moneyInput} placeholder="0" />
          </View>
          <Text style={styles.label}>Paid To</Text>
          <TextInput testID="oh-paid-to" value={paidTo} onChangeText={setPaidTo} style={styles.input} placeholder="Vendor / recipient" />
          <Text style={styles.label}>Description</Text>
          <TextInput testID="oh-desc" value={desc} onChangeText={setDesc} style={styles.input} placeholder="Optional" />
          <Text style={styles.label}>Payment Mode</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {['Cash', 'UPI', 'Bank'].map((m) => (
              <Pressable key={m} testID={`oh-mode-${m}`} onPress={() => setMode(m)} style={[styles.chip, mode === m && styles.chipActive]}>
                <Text style={[styles.chipTxt, mode === m && { color: '#fff' }]}>{m}</Text>
              </Pressable>
            ))}
          </View>
          {err && <Text style={styles.err}>{err}</Text>}
          <Pressable testID="save-overhead-btn" onPress={save} style={styles.saveBtn} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Save Overhead {amount ? `· ${inr(Number(amount))}` : ''}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, color: theme.color.muted, marginBottom: 4, marginTop: theme.space.md, fontWeight: '600' },
  input: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.color.onSurface, minHeight: 44 },
  moneyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, minHeight: 44 },
  rupee: { fontSize: 16, color: theme.color.muted, marginRight: 6 },
  moneyInput: { flex: 1, fontSize: 16, color: theme.color.onSurface, paddingVertical: 10, fontWeight: '600' },
  chip: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0, minHeight: 36 },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipTxt: { color: theme.color.onSurface, fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: theme.color.brand, minHeight: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', marginTop: theme.space.xl },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  err: { color: theme.color.error, marginTop: theme.space.md, fontWeight: '600' },
});
