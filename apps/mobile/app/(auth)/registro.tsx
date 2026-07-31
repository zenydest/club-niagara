/**
 * Pantalla de registro del cliente.
 */

import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function RegistroScreen() {
  const router = useRouter();
  const { registro, isLoading, error, clearError } = useAuthStore();

  const [nombre,    setNombre]    = useState("");
  const [apellido,  setApellido]  = useState("");
  const [email,     setEmail]     = useState("");
  const [telefono,  setTelefono]  = useState("");
  const [password,  setPassword]  = useState("");
  const [password2, setPassword2] = useState("");

  const [errLocal, setErrLocal] = useState<string | null>(null);

  const handleRegistro = async () => {
    setErrLocal(null);
    clearError();

    if (!nombre.trim() || !apellido.trim() || !email.trim() || !password) {
      setErrLocal("Completá todos los campos obligatorios");
      return;
    }
    if (password !== password2) {
      setErrLocal("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 6) {
      setErrLocal("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    try {
      await registro({
        nombre:   nombre.trim(),
        apellido: apellido.trim(),
        email:    email.trim().toLowerCase(),
        password,
        telefono: telefono.trim() || undefined,
      });
      router.replace("/(tabs)");
    } catch {
      // error en el store
    }
  };

  const errorMsg = errLocal ?? error;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 py-10">
          {/* Encabezado */}
          <View className="items-center mb-8">
            <Text className="text-white text-2xl font-black">Crear cuenta</Text>
            <Text className="text-muted text-sm mt-1">Accedé a eventos, entradas y cashless</Text>
          </View>

          {/* Error */}
          {errorMsg && (
            <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-400 text-sm">{errorMsg}</Text>
            </View>
          )}

          <View className="gap-3">
            {/* Nombre y apellido en fila */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Nombre *</Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                  placeholder="Juan"
                  placeholderTextColor="#6B6B8A"
                  value={nombre}
                  onChangeText={setNombre}
                  autoCapitalize="words"
                />
              </View>
              <View className="flex-1">
                <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Apellido *</Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                  placeholder="Pérez"
                  placeholderTextColor="#6B6B8A"
                  value={apellido}
                  onChangeText={setApellido}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View>
              <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Email *</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="tu@email.com"
                placeholderTextColor="#6B6B8A"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View>
              <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Teléfono</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="+54 9 11 1234-5678"
                placeholderTextColor="#6B6B8A"
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
              />
            </View>

            <View>
              <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Contraseña *</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#6B6B8A"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <View>
              <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Repetir contraseña *</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="••••••••"
                placeholderTextColor="#6B6B8A"
                value={password2}
                onChangeText={setPassword2}
                secureTextEntry
              />
            </View>
          </View>

          {/* Botón */}
          <TouchableOpacity
            onPress={() => void handleRegistro()}
            disabled={isLoading}
            className="bg-lima rounded-xl py-4 items-center mt-6 active:opacity-80"
          >
            {isLoading ? (
              <ActivityIndicator color="#06060F" />
            ) : (
              <Text className="text-bg font-black text-base">Crear cuenta</Text>
            )}
          </TouchableOpacity>

          {/* Ya tengo cuenta */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-muted">¿Ya tenés cuenta? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-lima font-semibold">Iniciá sesión</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
