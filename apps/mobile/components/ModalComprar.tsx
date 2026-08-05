/**
 * Compra de entradas desde la app.
 *
 * Dos caminos:
 *   - **Pagar ahora**: abre el checkout de Mercado Pago en el navegador. La
 *     entrada se confirma cuando MP avisa por webhook.
 *   - **Pagar en la puerta**: la entrada queda reservada e impaga. El portero
 *     cobra al ingresar y recién ahí la habilita.
 *
 * En los dos casos la entrada nace impaga. Que exista el QR no significa que
 * la plata haya entrado, y esa distinción es la que evita descuadres.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { api, type EventoPublico } from "@/lib/apiClient";

interface Props {
  evento: EventoPublico | null;
  onCerrar: () => void;
  onComprado: () => void;
}

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export function ModalComprar({ evento, onCerrar, onComprado }: Props) {
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [procesando, setProcesando] = useState(false);

  if (!evento) return null;

  const tipo = evento.entradasTipo.find((t) => t.id === tipoId) ?? null;
  const total = tipo ? Number(tipo.precio) * cantidad : 0;

  const comprar = async (modalidad: "puerta" | "online") => {
    if (!tipo) return;
    setProcesando(true);

    try {
      const res = await api.comprar({
        entradaTipoId: tipo.id,
        cantidad,
        modalidad,
      });

      if (modalidad === "online") {
        if (!res.linkPago) {
          Alert.alert(
            "Pago no disponible",
            "El pago online todavía no está habilitado. Podés reservar y pagar en la puerta."
          );
          return;
        }
        await Linking.openURL(res.linkPago);
      } else {
        Alert.alert(
          "Entrada reservada",
          `Te esperamos con ${ARS(res.total)}. Mostrá el QR en la puerta y pagás al entrar.`
        );
      }

      onComprado();
      onCerrar();
    } catch (err) {
      Alert.alert(
        "No se pudo completar",
        err instanceof Error ? err.message : "Intentá de nuevo en un momento"
      );
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCerrar}>
      <View className="flex-1 bg-black/80 justify-end">
        <View className="bg-surface rounded-t-3xl p-6 pb-10">
          <Text className="text-white text-xl font-black">{evento.nombre}</Text>
          <Text className="text-muted text-sm mt-1">Elegí tu entrada</Text>

          {/* Tipos de entrada */}
          <View className="mt-5 gap-2">
            {evento.entradasTipo.map((t) => {
              const disponibles = t.cantidadTotal
                ? t.cantidadTotal - t.cantidadVendida
                : null;
              const agotada = disponibles !== null && disponibles <= 0;
              const elegida = t.id === tipoId;

              return (
                <TouchableOpacity
                  key={t.id}
                  disabled={agotada}
                  onPress={() => setTipoId(t.id)}
                  className={`flex-row justify-between items-center p-4 rounded-2xl border ${
                    elegida ? "border-azul bg-azul/10" : "border-border bg-surface-2"
                  } ${agotada ? "opacity-40" : ""}`}
                >
                  <View>
                    <Text className="text-white font-bold">{t.nombre}</Text>
                    {agotada ? (
                      <Text className="text-danger text-xs mt-0.5">Agotada</Text>
                    ) : (
                      disponibles !== null &&
                      disponibles <= 20 && (
                        <Text className="text-warning text-xs mt-0.5">
                          Quedan {disponibles}
                        </Text>
                      )
                    )}
                  </View>
                  <Text className="text-azul font-black text-base">
                    {ARS(Number(t.precio))}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cantidad */}
          {tipo && (
            <View className="flex-row items-center justify-between mt-5">
              <Text className="text-muted text-sm">Cantidad</Text>
              <View className="flex-row items-center gap-4">
                <TouchableOpacity
                  onPress={() => setCantidad((c) => Math.max(1, c - 1))}
                  className="w-10 h-10 rounded-full bg-surface-2 items-center justify-center"
                >
                  <Text className="text-white text-xl font-bold">−</Text>
                </TouchableOpacity>
                <Text className="text-white text-lg font-black w-6 text-center">
                  {cantidad}
                </Text>
                <TouchableOpacity
                  // El tope de 10 es el mismo que valida la API.
                  onPress={() => setCantidad((c) => Math.min(10, c + 1))}
                  className="w-10 h-10 rounded-full bg-surface-2 items-center justify-center"
                >
                  <Text className="text-white text-xl font-bold">+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Total */}
          {tipo && (
            <View className="flex-row justify-between items-center mt-5 pt-5 border-t border-border">
              <Text className="text-muted">Total</Text>
              <Text className="text-white text-2xl font-black">{ARS(total)}</Text>
            </View>
          )}

          {/* Acciones */}
          <View className="mt-6 gap-3">
            <TouchableOpacity
              disabled={!tipo || procesando}
              onPress={() => void comprar("online")}
              className={`py-4 rounded-2xl items-center ${
                tipo && !procesando ? "bg-azul" : "bg-surface-2"
              }`}
            >
              {procesando ? (
                <ActivityIndicator color="#F0F0FF" />
              ) : (
                <Text className="text-white font-black">Pagar ahora</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              disabled={!tipo || procesando}
              onPress={() => void comprar("puerta")}
              className="py-4 rounded-2xl items-center border border-border"
            >
              <Text className="text-white font-bold">Reservar y pagar en la puerta</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onCerrar} className="py-3 items-center">
              <Text className="text-muted text-sm">Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
