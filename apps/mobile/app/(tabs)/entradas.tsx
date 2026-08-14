/**
 * Tab: Mis Entradas — entradas compradas con QR para acceder al evento.
 */

import React, { useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/apiClient";
import { usePreventScreenCapture } from "expo-screen-capture";
import { QREntradaRotativo } from "@/components/QREntradaRotativo";
import { Icono } from "@/components/Icono";
import type { EntradaConQR } from "@/lib/apiClient";

const ESTADO_EVENTO: Record<string, string> = {
  preventa: "Preventa",
  en_vivo:  "En vivo",
  cerrado:  "Finalizado",
  cancelado: "Cancelado",
};

function EntradaItem({ entrada, onCambio }: { entrada: EntradaConQR; onCambio: () => void }) {
  const [qrVisible, setQrVisible] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const fecha = new Date(entrada.evento.fechaInicio);
  const fechaStr = fecha.toLocaleDateString("es-AR", {
    weekday: "short",
    day:     "numeric",
    month:   "long",
  });

  const esActiva =
    !entrada.usada &&
    !entrada.cancelada &&
    entrada.evento.estado !== "cerrado" &&
    entrada.evento.estado !== "cancelado";

  const cancelar = () => {
    Alert.alert(
      "Cancelar entrada",
      entrada.pagada
        ? "Ya pagaste esta entrada. Al cancelarla, el boliche te va a devolver la plata; puede tardar unos días. ¿Seguro?"
        : "Se libera tu lugar y el QR deja de servir. ¿Seguro?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Cancelar entrada",
          style: "destructive",
          onPress: async () => {
            setCancelando(true);
            try {
              const res = await api.cancelarEntrada(entrada.id);
              Alert.alert("Listo", res.mensaje);
              onCambio();
            } catch (err) {
              Alert.alert(
                "No se pudo cancelar",
                err instanceof Error ? err.message : "Intentá de nuevo"
              );
            } finally {
              setCancelando(false);
            }
          },
        },
      ]
    );
  };

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
          entrada.cancelada
            ? "bg-red-500/20 border border-red-500/40"
            : entrada.usada
              ? "bg-gray-700"
              : entrada.pagada
                ? "bg-lima/20 border border-lima/40"
                : "bg-yellow-500/20 border border-yellow-500/40"
        }`}>
          <Text className={`text-xs font-bold ${
            entrada.cancelada
              ? "text-red-400"
              : entrada.usada
                ? "text-muted"
                : entrada.pagada
                  ? "text-lima"
                  : "text-yellow-400"
          }`}>
            {entrada.cancelada
              ? "Cancelada"
              : entrada.usada
                ? "Usada"
                : entrada.pagada
                  ? "Válida"
                  : "Pagás en la puerta"}
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
          <QREntradaRotativo
            qrCode={entrada.qrCode}
            qrSecret={entrada.qrSecret}
            localId={entrada.localId}
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

      {entrada.cancelada && (
        <View className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <Text className="text-red-400 text-xs text-center">
            Cancelaste esta entrada. El QR ya no sirve para entrar.
          </Text>
        </View>
      )}

      {/* Cancelar. `cancelable` lo decide el servidor: depende de que no esté
          usada y de que el evento no haya empezado, y la hora del celular no
          es confiable para esa cuenta. */}
      {entrada.cancelable && (
        <TouchableOpacity
          onPress={cancelar}
          disabled={cancelando}
          className="mt-3 border border-red-500/40 rounded-xl py-3 items-center active:opacity-70"
        >
          {cancelando ? (
            <ActivityIndicator color="#F87171" />
          ) : (
            <Text className="text-red-400 text-sm font-semibold">
              Cancelar entrada
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function EntradasScreen() {
  // Bloquea capturas mientras esta pantalla está montada.
  //
  // En Android usa FLAG_SECURE, que impide la captura a nivel sistema y además
  // muestra la vista en blanco en el conmutador de apps. En iOS, desde SDK 54,
  // Expo logra el mismo efecto y la captura sale negra.
  //
  // Se aplica solo acá y en la tarjeta —las pantallas con QR— y no en toda la
  // app: bloquear el perfil o el listado de eventos molestaría al usuario sin
  // aportar seguridad.
  usePreventScreenCapture();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["entradas"],
    queryFn:  () => api.entradas(),
  });

  const entradas = data?.entradas ?? [];
  // Las canceladas van al historial junto con las usadas: ninguna de las dos
  // sirve para entrar, y arriba solo tienen que quedar las que sí.
  const activas  = entradas.filter((e) => !e.usada && !e.cancelada);
  const usadas   = entradas.filter((e) => e.usada || e.cancelada);

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

        {!isLoading && entradas.length === 0 && !error && (
          <View className="items-center justify-center py-20">
            <View className="mb-3">
              <Icono nombre="entrada" tamano={40} color="#8888AA" />
            </View>
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
            {activas.map((e) => (
              <EntradaItem key={e.id} entrada={e} onCambio={() => void refetch()} />
            ))}
          </>
        )}

        {/* Usadas al final */}
        {usadas.length > 0 && (
          <>
            <Text className="text-muted text-xs uppercase tracking-wider mb-3 mt-2">
              Historial ({usadas.length})
            </Text>
            {usadas.map((e) => (
              <EntradaItem key={e.id} entrada={e} onCambio={() => void refetch()} />
            ))}
          </>
        )}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
