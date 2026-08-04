/**
 * QR de entrada con código rotativo.
 *
 * El QR se regenera cada 30 segundos, así que una captura de pantalla deja de
 * servir apenas termina la ventana. Debajo hay un contador para que el usuario
 * entienda por qué el código cambia solo y no crea que la app falla.
 *
 * Si la entrada no tiene secreto —emitidas antes de esta función— cae al QR
 * fijo de siempre.
 */

import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import * as Crypto from "expo-crypto";
import {
  QR_VENTANA_SEGUNDOS,
  codigoDesdeHash,
  materialParaHash,
  segundosRestantes,
  ventanaActual,
  type PayloadQR,
} from "@niagara/core";
import { QRDisplay } from "./QRDisplay";

interface Props {
  qrCode: string;
  qrSecret: string | null;
  localId: string;
  label?: string;
  sublabel?: string;
  size?: number;
}

export function QREntradaRotativo({
  qrCode,
  qrSecret,
  localId,
  label,
  sublabel,
  size = 220,
}: Props) {
  const [payload, setPayload] = useState<string>("");
  const [restantes, setRestantes] = useState(() => segundosRestantes());

  useEffect(() => {
    let activo = true;

    const construir = async () => {
      const base: PayloadQR = { tipo: "entrada", id: qrCode, localId };

      if (qrSecret) {
        // Mismo cálculo que hace el servidor: SHA-256 de "<ventana>:<secreto>".
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          materialParaHash(ventanaActual(), qrSecret)
        );
        base.codigo = codigoDesdeHash(hash);
      }

      if (activo) setPayload(JSON.stringify(base));
    };

    void construir();

    // Un tick por segundo: actualiza el contador y, al cruzar de ventana,
    // recalcula el código.
    const tick = setInterval(() => {
      const quedan = segundosRestantes();
      setRestantes(quedan);
      if (quedan === QR_VENTANA_SEGUNDOS) void construir();
    }, 1000);

    return () => {
      activo = false;
      clearInterval(tick);
    };
  }, [qrCode, qrSecret, localId]);

  if (!payload) {
    return (
      <View className="items-center py-10">
        <Text className="text-muted text-sm">Generando código…</Text>
      </View>
    );
  }

  const progreso = restantes / QR_VENTANA_SEGUNDOS;

  return (
    <View className="items-center">
      <QRDisplay value={payload} size={size} {...(label ? { label } : {})} {...(sublabel ? { sublabel } : {})} />

      {qrSecret && (
        <View className="items-center mt-4 w-full px-8">
          {/* Barra de tiempo restante */}
          <View className="h-1 w-full rounded-full bg-surface-2 overflow-hidden">
            <View
              className="h-full rounded-full bg-azul"
              style={{ width: `${progreso * 100}%` }}
            />
          </View>
          <Text className="text-muted text-xs mt-2">
            El código cambia en {restantes}s · No sirve una captura
          </Text>
        </View>
      )}
    </View>
  );
}
