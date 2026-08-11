import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = 'ancl_session_token';

let inMemToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (inMemToken) return inMemToken;
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  const v = await SecureStore.getItemAsync(TOKEN_KEY);
  inMemToken = v;
  return v;
}

export async function setToken(t: string | null): Promise<void> {
  inMemToken = t;
  if (Platform.OS === 'web') {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
    return;
  }
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function req(method: string, path: string, body?: any, isForm = false): Promise<any> {
  const t = await getToken();
  const headers: Record<string, string> = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = isForm ? body : JSON.stringify(body);
  const r = await fetch(`${BASE}/api${path}`, opts);
  if (r.status === 401) {
    await setToken(null);
    throw new Error('Unauthorized');
  }
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${t}`);
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  return r.blob();
}

export const api = {
  get: (p: string) => req('GET', p),
  post: (p: string, b?: any) => req('POST', p, b),
  put: (p: string, b?: any) => req('PUT', p, b),
  del: (p: string) => req('DELETE', p),
  postForm: (p: string, form: FormData) => req('POST', p, form, true),
  base: BASE,
};
