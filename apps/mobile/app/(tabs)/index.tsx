/**
 * Tab: Eventos — lista de eventos activos del local.
 */

import React from "react";
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/apiClient";
import { EventoCard } from "@/components/EventoCard";

export default function EventosScreen() {
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["eventos"],
    queryFn:  () => api.eventos(),
  });

  const eventos = data?.eventos ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <Image
          source={require("../../assets/logo.png")}
          className="w-11 h-11"
          resizeMode="contain"
          accessibilityLabel="Club Niágara"
        />
        <View>
          <Text className="text-azul text-xs font-bold tracking-widest uppercase">
            Club Niágara
          </Text>
          <Text className="text-white text-2xl font-black mt-0.5">Próximos eventos</Text>
        </View>
      </View>

      {/* Contenido */}
      <ScrollView
        className="flex-1 px-5"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#1E50FF"
          />
        }
      >
        {isLoading && (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#1E50FF" />
          </View>
        )}

        {error && (
          <View className="bg-red-500/20 border border-red-500/40 rounded-xl p-4 mt-4">
            <Text className="text-red-400 text-sm">
              {(error as Error).message ?? "Error al cargar eventos"}
            </Text>
          </View>
        )}

        {!isLoading && eventos.length === 0 && !error && (
          <View className="items-center justify-center py-20">
            <Text className="text-4xl mb-3">🎵</Text>
            <Text className="text-white font-semibold">Sin eventos por ahora</Text>
            <Text className="text-muted text-sm mt-1">Volvé pronto para novedades</Text>
          </View>
        )}

        {eventos.map((evento) => (
          <EventoCard key={evento.id} evento={evento} />
        ))}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
