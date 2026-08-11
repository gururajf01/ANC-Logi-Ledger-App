import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme } from '@/src/theme';

export default function ExcelImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => {
    if (typeof document === 'undefined') { setError('File picker only available on web preview.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = (e: any) => {
      const f = e.target.files?.[0];
      if (f) { setFile(f); setPreview(null); setResult(null); setError(null); }
    };
    input.click();
  };

  const doPreview = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file as any);
      const r = await api.postForm('/excel/import/preview', fd);
      setPreview(r);
    } catch (e: any) { setError(e.message || 'Preview failed'); }
    finally { setLoading(false); }
  };

  const doCommit = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file as any);
      const r = await api.postForm('/excel/import/commit', fd);
      setResult(r);
    } catch (e: any) { setError(e.message || 'Commit failed'); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="excel-import-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Excel Import</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}>
        <Text style={styles.para}>Upload your ANCL Logistics FY workbook (.xlsx). We will preview the row counts before committing, and the import is idempotent — running it twice with the same file will not duplicate trips.</Text>

        <Pressable testID="pick-file-btn" onPress={pick} style={styles.pickBtn}>
          <Ionicons name="cloud-upload" size={20} color={theme.color.brand} />
          <Text style={styles.pickTxt}>{file ? file.name : 'Choose .xlsx file'}</Text>
        </Pressable>

        {file && !preview && !result && (
          <Pressable testID="preview-btn" onPress={doPreview} style={styles.primaryBtn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>Preview</Text>}
          </Pressable>
        )}

        {preview && !result && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Preview</Text>
            <Text style={styles.cardLine}>Sheets found: {preview.sheets.length}</Text>
            <Text style={styles.cardLine}>Trip rows: {preview.trip_rows_found}</Text>
            <Text style={styles.cardLine}>Rented ledger rows: {preview.rented_rows_found}</Text>
            <Pressable testID="commit-btn" onPress={doCommit} style={styles.primaryBtn} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>Confirm & Import</Text>}
            </Pressable>
          </View>
        )}

        {result && (
          <View style={[styles.card, { borderColor: theme.color.success }]}>
            <Ionicons name="checkmark-circle" size={32} color={theme.color.success} />
            <Text style={styles.cardTitle}>Import complete</Text>
            <Text style={styles.cardLine}>Trips imported: {result.imported_trips}</Text>
            <Text style={styles.cardLine}>Overheads imported: {result.imported_overheads}</Text>
          </View>
        )}

        {error && <Text style={styles.err}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  para: { color: theme.color.muted, lineHeight: 20, marginBottom: theme.space.lg },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, padding: theme.space.lg, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, borderStyle: 'dashed' },
  pickTxt: { color: theme.color.onSurface, fontWeight: '600' },
  primaryBtn: { backgroundColor: theme.color.brand, minHeight: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', marginTop: theme.space.md },
  primaryTxt: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.space.lg, borderWidth: 1, borderColor: theme.color.border, marginTop: theme.space.lg, alignItems: 'center' },
  cardTitle: { fontWeight: '800', color: theme.color.onSurface, fontSize: 16, marginBottom: theme.space.sm },
  cardLine: { color: theme.color.onSurfaceSecondary, marginVertical: 2 },
  err: { color: theme.color.error, marginTop: theme.space.md, fontWeight: '600' },
});
