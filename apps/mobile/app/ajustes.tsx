/**
 * Ajustes de la app.
 *
 * Lo principal es poder buscar una actualización a mano. Por defecto la app
 * baja los updates en segundo plano y los aplica en el arranque siguiente, así
 * que quien quiere los cambios ya no tiene forma de forzarlo: acá sí.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Icono } from "@/components/Icono";

type EstadoBusqueda = "inactivo" | "buscando" | "descargando" | "al-dia";

export default function AjustesScreen() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoBusqueda>("inactivo");

  const version = Constants.expoConfig?.version ?? "—";

  /**
   * `Updates.updateId` es el id del paquete que está corriendo ahora. Es `null`
   * cuando la app usa el bundle con el que se compiló, es decir cuando todavía
   * no bajó ningún update.
   */
  const idUpdate = Updates.updateId;

  const buscarActualizacion = async () => {
    // En desarrollo no hay updates publicados: avisar es mejor que dejar el
    // botón girando sin explicación.
    if (__DEV__) {
      Alert.alert(
        "No disponible",
        "Las actualizaciones solo funcionan en la app instalada, no en desarrollo."
      );
      return;
    }

    setEstado("buscando");

    try {
      const resultado = await Updates.checkForUpdateAsync();

      if (!resultado.isAvailable) {
        setEstado("al-dia");
        Alert.alert("Todo al día", "Ya tenés la última versión.");
        return;
      }

      setEstado("descargando");
      await Updates.fetchUpdateAsync();

      Alert.alert(
        "Actualización lista",
        "La app se va a reiniciar para aplicar los cambios.",
        [
          {
            text: "Reiniciar",
            onPress: () => {
              // `reloadAsync` aplica el update sin que el usuario tenga que
              // cerrar la app a mano desde las apps recientes.
              void Updates.reloadAsync();
            },
          },
        ]
      );
    } catch (err) {
      setEstado("inactivo");
      Alert.alert(
        "No se pudo buscar",
        err instanceof Error
          ? err.message
          : "Revisá tu conexión e intentá de nuevo."
      );
    }
  };

  const buscando = estado === "buscando" || estado === "descargando";

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-xl bg-surface items-center justify-center active:opacity-70"
          accessibilityLabel="Volver"
        >
          <Icono nombre="volver" tamano={18} color="#8888AA" />
        </TouchableOpacity>
        <View>
          <Text className="text-lima text-xs font-bold tracking-widest uppercase">
            Club Niágara
          </Text>
          <Text className="text-white text-2xl font-black mt-0.5">Ajustes</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5">
        {/* Actualizaciones */}
        <View className="bg-surface border border-border rounded-2xl p-5 mb-4">
          <Text className="text-muted text-xs uppercase tracking-wider mb-3">
            Actualizaciones
          </Text>

          <TouchableOpacity
            onPress={() => void buscarActualizacion()}
            disabled={buscando}
            className={`flex-row items-center justify-between py-3 ${
              buscando ? "opacity-50" : "active:opacity-70"
            }`}
          >
            <View className="flex-1 pr-3">
              <Text className="text-white font-semibold">
                Buscar actualización
              </Text>
              <Text className="text-muted text-xs mt-0.5">
                {estado === "buscando"
                  ? "Buscando…"
                  : estado === "descargando"
                    ? "Descargando…"
                    : estado === "al-dia"
                      ? "Ya tenés la última versión"
                      : "Traer los últimos cambios sin esperar"}
              </Text>
            </View>

            {buscando ? (
              <ActivityIndicator color="#1E50FF" />
            ) : (
              <Icono nombre="avanzar" tamano={18} color="#8888AA" />
            )}
          </TouchableOpacity>

          <View className="border-t border-border pt-3 mt-1 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">Versión</Text>
              <Text className="text-white text-xs">{version}</Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">Paquete</Text>
              <Text className="text-white text-xs">
                {/* Los primeros caracteres alcanzan para saber si dos celulares
                    tienen lo mismo, que es para lo único que sirve al soporte. */}
                {idUpdate ? idUpdate.slice(0, 8) : "original"}
              </Text>
            </View>
          </View>
        </View>

        {/* Apariencia */}
        <View className="bg-surface border border-border rounded-2xl p-5 mb-4">
          <Text className="text-muted text-xs uppercase tracking-wider mb-2">
            Apariencia
          </Text>
          <Text className="text-white text-sm">Tema oscuro</Text>
          <Text className="text-muted text-xs mt-1">
            La app usa siempre el tema oscuro: es lo que se lee sin encandilar
            adentro del boliche.
          </Text>
        </View>

        <Text className="text-muted text-xs text-center mb-8">
          Club Niágara
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
