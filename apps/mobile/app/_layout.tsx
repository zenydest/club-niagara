/**
 * Layout raíz — inicializa providers globales y redirige según auth.
 */

import "../global.css";
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { leerToken, api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";
import { queryClient } from "@/lib/queryClient";
import { PantallaCarga } from "@/components/PantallaCarga";

// Mantener el splash hasta que terminemos de verificar la sesión
SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { isAuthenticated, inicializar, verificada } = useAuthStore();
  const router   = useRouter();
  const segments = useSegments();

  // Estado del navegador raíz. Hasta que tenga `key`, el Stack no terminó de
  // montarse y cualquier navegación tira
  // "Attempted to navigate before mounting the Root Layout component".
  const navegadorRaiz = useRootNavigationState();

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
      }
      // `inicializar` deja `verificada` en true en cualquier caso, así que no
      // hace falta un flag aparte acá.
    };
    void verificar();
  }, [inicializar]);

  useEffect(() => {
    if (!navegadorRaiz?.key) return;
    if (!verificada) return;

    const enAuth = segments[0] === "(auth)";
    if (isAuthenticated && enAuth) {
      router.replace("/(tabs)");
    } else if (!isAuthenticated && !enAuth) {
      router.replace("/(auth)/login");
    }
  }, [navegadorRaiz?.key, verificada, isAuthenticated, segments, router]);

  return null;
}

export default function RootLayout() {
  const verificada = useAuthStore((s) => s.verificada);

  // El splash nativo se oculta apenas monta el layout, no al terminar de
  // verificar: así toma el relevo la pantalla animada en vez de quedarse una
  // imagen estática todo el tiempo que dure la llamada a la API.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#06060F" />
        <AuthGuard />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          {/* Fuera de los tabs: se abre desde el engranaje de Perfil y vuelve
              con el botón de atrás, sin ocupar un lugar en la barra. */}
          <Stack.Screen name="ajustes" options={{ animation: "slide_from_right" }} />
        </Stack>

        {/* La carga va SUPERPUESTA, no en lugar del Stack.
            Si se desmontara el navegador, AuthGuard intentaría redirigir sobre
            un árbol que no existe y volvería el crash de
            "Attempted to navigate before mounting the Root Layout". */}
        {!verificada && (
          <View style={StyleSheet.absoluteFill}>
            <PantallaCarga />
          </View>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
