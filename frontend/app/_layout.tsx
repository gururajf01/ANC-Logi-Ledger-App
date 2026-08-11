import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const seg0 = segments[0];

  useEffect(() => {
    if (loading) return;
    const inAuth = seg0 === 'login';
    if (!user && !inAuth) {
      router.replace('/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, loading, seg0, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
