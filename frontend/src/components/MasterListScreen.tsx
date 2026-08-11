import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { theme, inr } from '@/src/theme';

type FieldDef = { key: string; label: string; type?: 'text' | 'number' | 'bool'; placeholder?: string };

export function MasterListScreen({
  title, endpoint, itemLabel, itemSubtitle, fields, defaultItem,
}: {
  title: string; endpoint: string; itemLabel: (x: any) => string; itemSubtitle?: (x: any) => string;
  fields: FieldDef[]; defaultItem: any;
}) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get(endpoint); setItems(r || []); }
    catch (e) { console.warn(e); } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!modal) return;
    const clean: any = {};
    for (const f of fields) {
      const v = modal[f.key];
      if (f.type === 'number') clean[f.key] = Number(v) || 0;
      else if (f.type === 'bool') clean[f.key] = !!v;
      else clean[f.key] = v ?? '';
    }
    clean.id = modal.id;
    // Preserve non-field keys
    for (const k of Object.keys(modal)) if (!(k in clean)) clean[k] = modal[k];
    try {
      if (modal.id) await api.put(`${endpoint}/${modal.id}`, clean);
      else await api.post(endpoint, clean);
      setModal(null); await load();
    } catch (e: any) { console.warn(e); }
  };

  const del = async (id: string) => {
    try { await api.del(`${endpoint}/${id}`); await load(); } catch (e) { console.warn(e); }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID={`master-${title.toLowerCase()}`}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-btn"><Ionicons name="chevron-back" size={22} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <Pressable onPress={() => setModal({ ...defaultItem })} style={styles.addBtn} testID="master-add">
          <Ionicons name="add" size={16} color="#fff" />
        </Pressable>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.color.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={{ color: theme.color.muted, textAlign: 'center', marginTop: 40 }}>No records yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setModal({ ...item })} testID={`master-item-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{itemLabel(item)}</Text>
                {itemSubtitle && <Text style={styles.cardSub}>{itemSubtitle(item)}</Text>}
              </View>
              <Pressable onPress={() => del(item.id)} testID={`master-delete-${item.id}`} style={{ padding: 8 }}>
                <Ionicons name="trash" size={18} color={theme.color.error} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modal?.id ? `Edit ${title}` : `New ${title}`}</Text>
                <Pressable onPress={() => setModal(null)}><Ionicons name="close" size={22} color={theme.color.onSurface} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: theme.space.md }}>
                {fields.map((f) => (
                  <View key={f.key} style={{ marginBottom: theme.space.md }}>
                    <Text style={styles.label}>{f.label}</Text>
                    {f.type === 'bool' ? (
                      <Pressable
                        onPress={() => setModal((m: any) => ({ ...m, [f.key]: !m[f.key] }))}
                        style={[styles.toggle, modal?.[f.key] && styles.toggleOn]}
                      >
                        <Text style={{ color: modal?.[f.key] ? '#fff' : theme.color.onSurface, fontWeight: '700' }}>
                          {modal?.[f.key] ? 'Yes' : 'No'}
                        </Text>
                      </Pressable>
                    ) : (
                      <TextInput
                        testID={`field-${f.key}`}
                        value={String(modal?.[f.key] ?? '')}
                        onChangeText={(v) => setModal((m: any) => ({ ...m, [f.key]: v }))}
                        style={styles.input}
                        keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                        placeholder={f.placeholder}
                      />
                    )}
                  </View>
                ))}
                <Pressable testID="save-master-btn" onPress={save} style={styles.saveBtn}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.brand },
  card: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.space.sm, borderWidth: 1, borderColor: theme.color.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.color.onSurface },
  cardSub: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.color.onSurface },
  label: { fontSize: 12, color: theme.color.muted, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.color.onSurface, minHeight: 44 },
  toggle: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  toggleOn: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  saveBtn: { backgroundColor: theme.color.brand, minHeight: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', marginTop: theme.space.md, marginBottom: theme.space.xl },
});
