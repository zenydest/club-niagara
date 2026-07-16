/**
 * Tab: Perfil — datos del cliente + botón de logout.
 */

import React from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-2xl p-4 items-center">
      <Text className="text-lima text-2xl font-black">{value}</Text>
      <Text className="text-muted text-xs mt-1 text-center">{label}</Text>
    </View>
  );
}

export default function PerfilScreen() {
  const router       = useRouter();
  const qc           = useQueryClient();
  const { logout, cliente: clienteCache } = useAuthStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ["perfil"],
    queryFn:  () => api.perfil(),
  });

  const handleLogout = () => {
    Alert.alert(
      "Cerrar sesión",
      "¿Seguro que querés salir?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Salir",
          style: "destructive",
          onPress: async () => {
            await logout();
            qc.clear();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  const cliente = data?.cliente ?? null;
  const nombre  = cliente?.nombre  ?? clienteCache?.nombre  ?? "—";
  const apellido = cliente?.apellido ?? clienteCache?.apellido ?? "";
  const email    = cliente?.email   ?? clienteCache?.email   ?? "—";

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-3">
        <Text className="text-lima text-xs font-bold tracking-widest uppercase">Mi cuenta</Text>
        <Text className="text-white text-2xl font-black mt-0.5">Perfil</Text>
      </View>

      <ScrollView className="flex-1 px-5">
        {isLoading && (
          <View className="items-center py-10">
            <ActivityIndicator color="#C2FF00" />
          </View>
        )}

        {error && (
          <View className="bg-red-500/20 border border-red-500/40 rounded-xl p-4 mt-2">
            <Text className="text-red-400 text-sm">{(error as Error).message}</Text>
          </View>
        )}

        {/* Avatar */}
        <View className="items-center py-6">
          <View className="w-24 h-24 rounded-full bg-purple items-center justify-center mb-3">
            <Text className="text-white text-4xl font-black">
              {nombre.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text className="text-white text-xl font-bold">
            {nombre} {apellido}
          </Text>
          <Text className="text-muted text-sm mt-0.5">{email}</Text>
        </View>

        {/* Stats */}
        {cliente?.stats && (
          <View className="flex-row gap-3 mb-6">
            <StatCard label="Tarjetas" value={cliente.stats.tarjetas} />
            <StatCard label="Entradas"  value={cliente.stats.entradas} />
          </View>
        )}

        {/* Info */}
        <View className="bg-surface border border-border rounded-2xl p-5 mb-4">
          <Text className="text-muted text-xs uppercase tracking-wider mb-3">
            Información de contacto
          </Text>

          <View className="gap-3">
            <View>
              <Text className="text-muted text-xs">Email</Text>
              <Text className="text-white text-sm mt-0.5">{email}</Text>
            </View>

            {cliente?.telefono && (
              <View>
                <Text className="text-muted text-xs">Teléfono</Text>
                <Text className="text-white text-sm mt-0.5">{cliente.telefono}</Text>
              </View>
            )}

            {cliente?.creadoEn && (
              <View>
                <Text className="text-muted text-xs">Miembro desde</Text>
                <Text className="text-white text-sm mt-0.5">
                  {new Date(cliente.creadoEn).toLocaleDateString("es-AR", {
                    year: "numeric", month: "long",
                  })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          className="border border-red-500/40 rounded-2xl py-4 items-center mb-8 active:opacity-70"
        >
          <Text className="text-red-400 font-semibold">Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
