import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { theme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Login() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const onPress = async () => {
    setLoading(true);
    try { await signIn(); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.root} testID="login-screen">
      <View style={styles.body}>
        <View style={styles.brandRow}>
          <View style={styles.logo}><Ionicons name="cube-outline" size={28} color="#fff" /></View>
          <Text style={styles.brand}>ANCL Ledger</Text>
        </View>
        <Text style={styles.title}>Daily transactions, honest P&L.</Text>
        <Text style={styles.sub}>Log a trip in under 20 seconds. See the day&apos;s profit at a glance.</Text>

        <View style={styles.bullets}>
          {[
            'Own & Rented trucks',
            'Accrual + Cash daily P&L',
            'Party-wise pending freight',
            'Excel import / export',
          ].map((t) => (
            <View style={styles.bullet} key={t}>
              <Ionicons name="checkmark-circle" size={18} color={theme.color.success} />
              <Text style={styles.bulletText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          testID="google-signin-button"
          style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.9 }]}
          onPress={onPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#fff" />
              <Text style={styles.googleTxt}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.tos}>First user of this workspace becomes Admin.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface, justifyContent: 'space-between' },
  body: { padding: theme.space.xl, marginTop: theme.space.xxxl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginBottom: theme.space.xxl },
  logo: {
    width: 48, height: 48, borderRadius: theme.radius.md, backgroundColor: theme.color.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  brand: { fontSize: 22, fontWeight: '800', color: theme.color.onSurface, letterSpacing: -0.3 },
  title: { fontSize: 32, fontWeight: '800', color: theme.color.onSurface, letterSpacing: -0.6, marginBottom: theme.space.sm },
  sub: { fontSize: 16, color: theme.color.muted, lineHeight: 22 },
  bullets: { marginTop: theme.space.xxl, gap: theme.space.md },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  bulletText: { fontSize: 15, color: theme.color.onSurfaceSecondary },
  footer: { padding: theme.space.xl, gap: theme.space.md },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space.sm,
    backgroundColor: theme.color.brand, paddingVertical: 16, borderRadius: theme.radius.md,
  },
  googleTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tos: { textAlign: 'center', color: theme.color.muted, fontSize: 12 },
});
