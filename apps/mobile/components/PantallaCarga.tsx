/**
 * Pantalla de carga con el logo animado.
 *
 * Se muestra mientras se verifica la sesión guardada, que implica una llamada a
 * la API. En el plan free de Render el servidor se apaga por inactividad y el
 * primer request puede tardar bastante, así que esta pantalla puede quedar
 * visible varios segundos: por eso el logo respira en vez de estar quieto, y
 * aparece un mensaje si la espera se hace larga.
 *
 * Usa `Animated` de React Native y no Reanimated a propósito: es una animación
 * trivial y así no depende de los worklets, que son la parte más frágil del
 * arranque de la app.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, Animated, Easing } from "react-native";

/** A los cuántos ms se avisa que la espera es más larga de lo normal */
const MS_AVISO_DEMORA = 4000;

export function PantallaCarga() {
  const escala = useRef(new Animated.Value(0.94)).current;
  const opacidad = useRef(new Animated.Value(0.55)).current;

  const [demorado, setDemorado] = useState(false);

  useEffect(() => {
    const pulso = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(escala, {
            toValue: 1.04,
            duration: 950,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacidad, {
            toValue: 1,
            duration: 950,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(escala, {
            toValue: 0.94,
            duration: 950,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacidad, {
            toValue: 0.55,
            duration: 950,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulso.start();

    const aviso = setTimeout(() => setDemorado(true), MS_AVISO_DEMORA);

    return () => {
      pulso.stop();
      clearTimeout(aviso);
    };
  }, [escala, opacidad]);

  return (
    <View className="flex-1 bg-bg items-center justify-center">
      <Animated.View style={{ transform: [{ scale: escala }], opacity: opacidad }}>
        <Image
          source={require("../assets/logo.png")}
          style={{ width: 240, height: 240 }}
          resizeMode="contain"
          accessibilityLabel="Club Niágara"
        />
      </Animated.View>

      {demorado && (
        <Text className="text-muted text-xs mt-6 px-10 text-center">
          Conectando con el servidor…
        </Text>
      )}
    </View>
  );
}
