import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

export default function Trips() {
  const router = useRouter();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const r = await api.get('/trips?limit=500'); setTrips(r || []); }
    catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="trips-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trips</Text>
        <Pressable testID="add-trip-header-btn" onPress={() => router.push({ pathname: '/trip/[id]', params: { id: 'new' } })} style={styles.addBtn}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addTxt}>Add Trip</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={{ color: theme.color.muted, textAlign: 'center', marginTop: 40 }}>No trips yet.</Text>}
          renderItem={({ item: t }) => (
            <Pressable
              testID={`trip-item-${t.id}`}
              style={styles.card}
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.tCode}>{t.ts_no} · {t.vehicle_no}</Text>
                <Text style={styles.tSub}>{t.date} · {t.party_name || '—'}</Text>
                <Text style={styles.tRoute}>{t.route_from || '-'} → {t.route_to || '-'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.tAmt}>{inr(t.revenue_to_pay)}</Text>
                <Text style={styles.tPending}>Pending {inr(t.pending_freight, { showZero: true })}</Text>
                <Text style={[styles.tMargin, { color: (t.trip_margin ?? 0) >= 0 ? theme.color.profit : theme.color.loss }]}>
                  {inr(t.trip_margin, { showZero: true })}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md,
    backgroundColor: theme.color.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.color.onSurface, letterSpacing: -0.4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.brand, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderRadius: theme.radius.pill },
  addTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: { flexDirection: 'row', padding: theme.space.md, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.space.sm, borderWidth: 1, borderColor: theme.color.border },
  tCode: { fontWeight: '700', color: theme.color.onSurface, fontSize: 15 },
  tSub: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  tRoute: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  tAmt: { fontWeight: '700', color: theme.color.onSurface, fontSize: 15 },
  tPending: { color: theme.color.muted, fontSize: 11, marginTop: 2 },
  tMargin: { fontWeight: '700', fontSize: 13, marginTop: 2 },
});
