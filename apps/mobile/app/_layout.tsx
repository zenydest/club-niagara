/**
 * Layout raíz — inicializa providers globales y redirige según auth.
 */

import "../global.css";
import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { leerToken, api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";
import { queryClient } from "@/lib/queryClient";

// Mantener el splash hasta que terminemos de verificar la sesión
SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { isAuthenticated, inicializar } = useAuthStore();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const verificar = async () => {
      try {
        const token = await leerToken();
        if (token) {
          // Intentar cargar el perfil para validar el token
          const { cliente } = await api.perfil();
          inicializar(token, {
            id:       cliente.id,
            nombre:   cliente.nombre,
            apellido: cliente.apellido,
            email:    cliente.email,
            telefono: cliente.telefono,
          });
        } else {
          inicializar(null);
        }
      } catch {
        // Token inválido o expirado
        inicializar(null);
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    void verificar();
  }, []);

  useEffect(() => {
    const enAuth = segments[0] === "(auth)";
    if (isAuthenticated && enAuth) {
      router.replace("/(tabs)");
    } else if (!isAuthenticated && !enAuth) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#08080F" />
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
