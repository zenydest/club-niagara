/**
 * EventoCard — tarjeta de evento para la pantalla de inicio.
 */

import React from "react";
import { View, Text, Image } from "react-native";
import type { EventoPublico } from "@/lib/apiClient";

interface Props {
  evento: EventoPublico;
}

const ESTADO_LABEL: Record<string, string> = {
  preventa: "Preventa",
  en_vivo:  "En vivo",
};

const ESTADO_COLOR: Record<string, string> = {
  preventa: "bg-purple",
  en_vivo:  "bg-lima",
};

const ESTADO_TEXT: Record<string, string> = {
  preventa: "text-white",
  en_vivo:  "text-bg",
};

export const EventoCard: React.FC<Props> = ({ evento }) => {
  const fecha = new Date(evento.fechaInicio);
  const fechaStr = fecha.toLocaleDateString("es-AR", {
    weekday: "short",
    day:     "numeric",
    month:   "short",
  });
  const horaStr = fecha.toLocaleTimeString("es-AR", {
    hour:   "2-digit",
    minute: "2-digit",
  });

  const precioMin = evento.entradasTipo.length > 0
    ? Math.min(...evento.entradasTipo.map((e) => Number(e.precio)))
    : null;

  return (
    <View className="bg-surface border border-border rounded-2xl overflow-hidden mb-4">
      {/* Imagen */}
      {evento.imagenUrl ? (
        <Image
          source={{ uri: evento.imagenUrl }}
          className="w-full h-40"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-40 bg-border items-center justify-center">
          <Text className="text-muted text-4xl">🎵</Text>
        </View>
      )}

      <View className="p-4">
        {/* Estado + título */}
        <View className="flex-row items-center gap-2 mb-2">
          <View className={`px-2 py-0.5 rounded-full ${ESTADO_COLOR[evento.estado] ?? "bg-muted"}`}>
            <Text className={`text-xs font-bold ${ESTADO_TEXT[evento.estado] ?? "text-white"}`}>
              {ESTADO_LABEL[evento.estado] ?? evento.estado}
            </Text>
          </View>
        </View>

        <Text className="text-white text-lg font-bold">{evento.nombre}</Text>

        {evento.descripcion && (
          <Text className="text-muted text-sm mt-1" numberOfLines={2}>
            {evento.descripcion}
          </Text>
        )}

        {/* Fecha + precio */}
        <View className="flex-row justify-between items-center mt-3">
          <Text className="text-muted text-sm">
            {fechaStr} · {horaStr}
          </Text>
          {precioMin !== null && (
            <Text className="text-lima font-semibold text-sm">
              Desde ${precioMin.toLocaleString("es-AR")}
            </Text>
          )}
        </View>

        {/* Tipos de entrada */}
        {evento.entradasTipo.length > 0 && (
          <View className="mt-3 gap-1">
            {evento.entradasTipo.map((et) => {
              const disponibles = et.cantidadTotal
                ? et.cantidadTotal - et.cantidadVendida
                : null;
              return (
                <View key={et.id} className="flex-row justify-between">
                  <Text className="text-white text-sm">{et.nombre}</Text>
                  <View className="flex-row items-center gap-2">
                    {disponibles !== null && disponibles <= 20 && (
                      <Text className="text-yellow-400 text-xs">
                        ¡Últimas {disponibles}!
                      </Text>
                    )}
                    <Text className="text-lima text-sm font-semibold">
                      ${Number(et.precio).toLocaleString("es-AR")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};
