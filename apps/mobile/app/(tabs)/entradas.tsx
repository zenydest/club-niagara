/**
 * Tab: Mis Entradas — entradas compradas con QR para acceder al evento.
 */

import React, { useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/apiClient";
import { QRDisplay } from "@/components/QRDisplay";
import type { EntradaConQR } from "@/lib/apiClient";

const ESTADO_EVENTO: Record<string, string> = {
  preventa: "Preventa",
  en_vivo:  "En vivo",
  cerrado:  "Finalizado",
  cancelado: "Cancelado",
};

function EntradaItem({ entrada }: { entrada: EntradaConQR }) {
  const [qrVisible, setQrVisible] = useState(false);

  const fecha = new Date(entrada.evento.fechaInicio);
  const fechaStr = fecha.toLocaleDateString("es-AR", {
    weekday: "short",
    day:     "numeric",
    month:   "long",
  });

  const esActiva = !entrada.usada && entrada.evento.estado !== "cerrado" && entrada.evento.estado !== "cancelado";

  return (
    <View className={`border rounded-2xl p-5 mb-4 ${
      entrada.usada
        ? "bg-border/30 border-border"
        : "bg-surface border-border"
    }`}>
      {/* Estado badge */}
      <View className="flex-row justify-between items-start mb-3">
        <View>
          <Text className="text-muted text-xs uppercase tracking-wider">
            {entrada.tipoEntrada.nombre}
          </Text>
          <Text className="text-white text-lg font-bold mt-0.5">
            {entrada.evento.nombre}
          </Text>
        </View>
        <View className={`px-2 py-1 rounded-full ${
          entrada.usada ? "bg-gray-700" : "bg-lima/20 border border-lima/40"
        }`}>
          <Text className={`text-xs font-bold ${
            entrada.usada ? "text-muted" : "text-lima"
          }`}>
            {entrada.usada ? "Usada" : "Válida"}
          </Text>
        </View>
      </View>

      {/* Fecha + precio */}
      <View className="flex-row justify-between">
        <Text className="text-muted text-sm">{fechaStr}</Text>
        <Text className="text-white text-sm">
          ${Number(entrada.precioPagado).toLocaleString("es-AR")}
        </Text>
      </View>

      {/* Estado del evento */}
      <Text className="text-muted text-xs mt-1">
        Evento: {ESTADO_EVENTO[entrada.evento.estado] ?? entrada.evento.estado}
      </Text>

      {/* Botón QR (solo si la entrada está activa) */}
      {esActiva && (
        <TouchableOpacity
          onPress={() => setQrVisible((v) => !v)}
          className="bg-lima rounded-xl py-3 items-center mt-4 active:opacity-80"
        >
          <Text className="text-bg font-black text-sm">
            {qrVisible ? "Ocultar QR" : "Mostrar QR de acceso"}
          </Text>
        </TouchableOpacity>
      )}

      {/* QR de acceso */}
      {qrVisible && esActiva && (
        <View className="items-center mt-5">
          <QRDisplay
            value={entrada.qrPayload}
            size={220}
            label="Mostrá este QR en portería"
            sublabel={`${entrada.evento.nombre} · ${fechaStr}`}
          />
        </View>
      )}

      {entrada.usada && (
        <View className="mt-3 bg-gray-800 rounded-lg px-3 py-2">
          <Text className="text-muted text-xs text-center">
            Esta entrada ya fue utilizada
          </Text>
        </View>
      )}
    </View>
  );
}

export default function EntradasScreen() {
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["entradas"],
    queryFn:  () => api.entradas(),
  });

  const entradas = data?.entradas ?? [];
  const activas  = entradas.filter((e) => !e.usada);
  const usadas   = entradas.filter((e) => e.usada);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-3">
        <Text className="text-lima text-xs font-bold tracking-widest uppercase">Boletería</Text>
        <Text className="text-white text-2xl font-black mt-0.5">Mis Entradas</Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#C2FF00"
          />
        }
      >
        {isLoading && (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#C2FF00" />
          </View>
        )}

        {error && (
          <View className="bg-red-500/20 border border-red-500/40 rounded-xl p-4 mt-4">
            <Text className="text-red-400 text-sm">{(error as Error).message}</Text>
          </View>
        )}

        {!isLoading && entradas.length === 0 && !error && (
          <View className="items-center justify-center py-20">
            <Text className="text-4xl mb-3">🎟️</Text>
            <Text className="text-white font-semibold">Sin entradas</Text>
            <Text className="text-muted text-sm mt-1 text-center px-4">
              Comprá entradas en la boletería del evento
            </Text>
          </View>
        )}

        {/* Activas primero */}
        {activas.length > 0 && (
          <>
            <Text className="text-muted text-xs uppercase tracking-wider mb-3">
              Próximas ({activas.length})
            </Text>
            {activas.map((e) => <EntradaItem key={e.id} entrada={e} />)}
          </>
        )}

        {/* Usadas al final */}
        {usadas.length > 0 && (
          <>
            <Text className="text-muted text-xs uppercase tracking-wider mb-3 mt-2">
              Historial ({usadas.length})
            </Text>
            {usadas.map((e) => <EntradaItem key={e.id} entrada={e} />)}
          </>
        )}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
