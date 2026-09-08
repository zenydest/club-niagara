/**
 * Registro del celular para recibir avisos del boliche.
 *
 * El permiso se pide **después** del login y no al abrir la app por primera
 * vez. Si se pregunta antes de que la persona entienda para qué sirve, la
 * mayoría dice que no, y en iOS esa negativa no se puede volver a preguntar:
 * hay que mandarla a Ajustes del sistema.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "@/lib/apiClient";

/**
 * Cómo se muestra un aviso con la app abierta.
 *
 * Se muestra igual: si alguien está mirando la lista de eventos y publican uno
 * nuevo, tiene sentido que lo vea sin salir.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permiso, obtiene el token de Expo y lo registra en la API.
 *
 * No lanza: un fallo acá no puede impedir que la persona use la app. Devuelve
 * `false` si no se pudo, por si alguna pantalla quiere reaccionar.
 */
export async function registrarParaAvisos(): Promise<boolean> {
  // El emulador no tiene servicio de push: pedirlo ahí siempre falla.
  if (!Device.isDevice) return false;

  try {
    const { status: actual } = await Notifications.getPermissionsAsync();
    let status = actual;

    if (status !== "granted") {
      const pedido = await Notifications.requestPermissionsAsync();
      status = pedido.status;
    }

    if (status !== "granted") return false;

    // Android necesita un canal declarado o los avisos no suenan.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Avisos del boliche",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#1E50FF",
      });
    }

    /**
     * El `projectId` es obligatorio en builds de EAS: sin él, Expo no sabe a
     * qué proyecto pertenece el token y devuelve un error poco claro.
     */
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    if (!token) return false;

    await api.registrarPush({
      token,
      plataforma: Platform.OS === "ios" ? "ios" : "android",
    });

    return true;
  } catch {
    return false;
  }
}
