/**
 * QRDisplay — muestra un código QR centrado sobre fondo oscuro.
 * Usado en la tarjeta cashless y en las entradas.
 */

import React from "react";
import { View, Text } from "react-native";
import QRCode from "react-native-qrcode-svg";

interface Props {
  /** Contenido a codificar en el QR (string o JSON stringificado) */
  value:   string;
  /** Tamaño del QR en px (default 200) */
  size?:   number;
  /** Etiqueta debajo del QR */
  label?:  string;
  sublabel?: string;
}

export const QRDisplay: React.FC<Props> = ({
  value,
  size = 200,
  label,
  sublabel,
}) => (
  <View className="items-center">
    {/* Contenedor blanco con padding para legibilidad del scanner */}
    <View className="bg-white p-4 rounded-2xl">
      <QRCode
        value={value}
        size={size}
        color="#06060F"
        backgroundColor="white"
      />
    </View>

    {label && (
      <Text className="text-white text-lg font-semibold mt-4">{label}</Text>
    )}
    {sublabel && (
      <Text className="text-muted text-sm mt-1">{sublabel}</Text>
    )}
  </View>
);
