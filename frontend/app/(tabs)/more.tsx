import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { theme } from '@/src/theme';

const items: { key: string; label: string; icon: any; route: any }[] = [
  { key: 'vehicles', label: 'Vehicles', icon: 'car', route: '/masters/vehicles' },
  { key: 'drivers', label: 'Drivers', icon: 'person', route: '/masters/drivers' },
  { key: 'parties', label: 'Parties', icon: 'people', route: '/masters/parties' },
  { key: 'categories', label: 'Expense Categories', icon: 'pricetag', route: '/masters/categories' },
  { key: 'import', label: 'Excel Import', icon: 'cloud-upload', route: '/excel-import' },
];

export default function More() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="more-screen">
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            {user?.picture ? <Image source={{ uri: user.picture }} style={{ width: 56, height: 56, borderRadius: 28 }} /> :
              <Ionicons name="person" size={28} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name || user?.email || 'User'}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.roleBadge}><Text style={styles.roleTxt}>{(user?.role || '').toUpperCase()}</Text></View>
          </View>
        </View>

        <Text style={styles.section}>Masters</Text>
        {items.map((it) => (
          <Pressable
            key={it.key}
            testID={`more-${it.key}`}
            style={styles.row}
            onPress={() => router.push(it.route)}
          >
            <View style={styles.rowIcon}><Ionicons name={it.icon} size={18} color={theme.color.brand} /></View>
            <Text style={styles.rowLabel}>{it.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.muted} />
          </Pressable>
        ))}

        <Pressable testID="signout-btn" onPress={signOut} style={[styles.row, { marginTop: theme.space.xl }]}>
          <View style={[styles.rowIcon, { backgroundColor: '#FEE2E2' }]}><Ionicons name="log-out" size={18} color={theme.color.error} /></View>
          <Text style={[styles.rowLabel, { color: theme.color.error }]}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  profile: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, padding: theme.space.md, marginBottom: theme.space.xl },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontWeight: '800', color: theme.color.onSurface, fontSize: 16 },
  email: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: theme.color.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill, marginTop: 6 },
  roleTxt: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  section: { fontSize: 12, fontWeight: '800', color: theme.color.muted, textTransform: 'uppercase', marginBottom: theme.space.sm, letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, padding: theme.space.md, marginBottom: theme.space.sm },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, color: theme.color.onSurface, fontWeight: '600', fontSize: 14 },
});
