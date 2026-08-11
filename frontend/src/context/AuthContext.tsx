import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api, getToken, setToken } from '../api/client';

WebBrowser.maybeCompleteAuthSession();

type User = { user_id: string; email: string; name?: string; picture?: string; role: string };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

const consumedSessionIds = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const exchange = useCallback(async (session_id: string) => {
    if (consumedSessionIds.has(session_id)) return;
    consumedSessionIds.add(session_id);
    try {
      const res = await api.post('/auth/session', { session_id });
      await setToken(res.session_token);
      setUser(res.user);
    } catch (e) {
      console.warn('auth exchange failed', e);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      // Web: parse URL hash/search for session_id first
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const raw = window.location.href;
        const sid = extractSessionId(raw);
        if (sid) {
          await exchange(sid);
          // Clean URL
          try {
            const url = new URL(window.location.href);
            url.hash = '';
            url.searchParams.delete('session_id');
            window.history.replaceState(window.history.state, '', url.toString());
          } catch {}
        }
      } else {
        // Mobile: cold-start check
        const initial = await Linking.getInitialURL();
        const sid = extractSessionId(initial) || extractSessionId(pendingUrl);
        if (sid) await exchange(sid);
      }
      const t = await getToken();
      if (t) {
        try {
          const me = await api.get('/auth/me');
          setUser(me);
        } catch {
          await setToken(null);
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [exchange, pendingUrl]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      setPendingUrl(url);
      const sid = extractSessionId(url);
      if (sid) exchange(sid).then(() => bootstrap());
    });
    return () => sub.remove();
  }, [exchange, bootstrap]);

  const signIn = useCallback(async () => {
    const redirectUrl = Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.location.origin + '/' : '')
      : Linking.createURL('');
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = authUrl;
      return;
    }
    const sub = Linking.addEventListener('url', ({ url }) => setPendingUrl(url));
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = null;
      if (result.type === 'success' && (result as any).url) url = (result as any).url;
      if (!url) url = pendingUrl;
      if (!url) url = await Linking.getInitialURL();
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
      await bootstrap();
    } finally {
      sub.remove();
    }
  }, [pendingUrl, exchange, bootstrap]);

  const signOut = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api.get('/auth/me').catch(() => null);
    setUser(me);
  }, []);

  return <Ctx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}
