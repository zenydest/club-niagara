/**
 * Tab: Mi Tarjeta — cashless del cliente con QR para cobrar.
 * El QR encode: { tipo: "cashless", id: codigo, localId }
 */

import React, { useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { usePreventScreenCapture } from "expo-screen-capture";
import { api } from "@/lib/apiClient";
import { QRDisplay } from "@/components/QRDisplay";
import { Icono } from "@/components/Icono";
import type { TarjetaCashless } from "@/lib/apiClient";

const LOCAL_ID =
  (Constants.expoConfig?.extra?.localId as string | undefined) ??
  process.env["EXPO_PUBLIC_LOCAL_ID"] ??
  "";

function TarjetaItem({ tarjeta }: { tarjeta: TarjetaCashless }) {
  const [qrVisible, setQrVisible] = useState(false);

  // Payload QR compatible con el scanner de caja
  const qrPayload = JSON.stringify({
    tipo:    "cashless",
    id:      tarjeta.codigo,
    localId: LOCAL_ID,
  });

  const saldoNum = Number(tarjeta.saldo);

  return (
    <View className="bg-surface border border-border rounded-2xl p-5 mb-4">
      {/* Encabezado tarjeta */}
      <View className="flex-row justify-between items-start mb-4">
        <View>
          <Text className="text-muted text-xs uppercase tracking-wider">Saldo disponible</Text>
          <Text className="text-lima text-3xl font-black mt-0.5">
            ${saldoNum.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <View className="bg-purple/20 border border-purple/40 px-3 py-1 rounded-full">
          <Text className="text-purple text-xs font-semibold">Cashless</Text>
        </View>
      </View>

      <Text className="text-muted text-xs font-mono">
        {tarjeta.codigo}
      </Text>

      {/* Botón mostrar QR */}
      <TouchableOpacity
        onPress={() => setQrVisible((v) => !v)}
        className="bg-lima rounded-xl py-3 items-center mt-4 active:opacity-80"
      >
        <Text className="text-bg font-black text-sm">
          {qrVisible ? "Ocultar QR" : "Mostrar QR para cobrar"}
        </Text>
      </TouchableOpacity>

      {/* QR */}
      {qrVisible && (
        <View className="items-center mt-5">
          <QRDisplay
            value={qrPayload}
            size={220}
            label="Presentá este QR en la caja"
            sublabel="El cajero lo escanea para cobrar"
          />
        </View>
      )}

      {/* Últimas recargas */}
      {tarjeta.recargas.length > 0 && (
        <View className="mt-4 border-t border-border pt-4">
          <Text className="text-muted text-xs uppercase tracking-wider mb-2">
            Últimas recargas
          </Text>
          {tarjeta.recargas.map((r) => (
            <View key={r.id} className="flex-row justify-between py-1.5">
              <Text className="text-muted text-sm">
                {new Date(r.createdAt).toLocaleDateString("es-AR")}
              </Text>
              <Text className="text-white text-sm font-semibold">
                +${Number(r.monto).toLocaleString("es-AR")}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function TarjetaScreen() {
  // El QR de la tarjeta cashless da acceso al saldo, así que se protege igual
  // que el de las entradas. Ver la nota en entradas.tsx.
  usePreventScreenCapture();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["cashless"],
    queryFn:  () => api.cashless(),
  });

  const tarjetas = data?.tarjetas ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-3">
        <Text className="text-lima text-xs font-bold tracking-widest uppercase">Cashless</Text>
        <Text className="text-white text-2xl font-black mt-0.5">Mi Tarjeta</Text>
      </View>

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
            <Text className="text-red-400 text-sm">{(error as Error).message}</Text>
          </View>
        )}

        {!isLoading && tarjetas.length === 0 && !error && (
          <View className="items-center justify-center py-20">
            <View className="mb-3">
              <Icono nombre="tarjeta" tamano={40} color="#8888AA" />
            </View>
            <Text className="text-white font-semibold">Sin tarjetas cashless</Text>
            <Text className="text-muted text-sm mt-1 text-center px-4">
              Cargá una tarjeta en la caja del evento para pagar sin efectivo
            </Text>
          </View>
        )}

        {tarjetas.map((t) => <TarjetaItem key={t.id} tarjeta={t} />)}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
