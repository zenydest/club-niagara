/**
 * Pantalla de login.
 */

import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function LoginScreen() {
  const router  = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    clearError();
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch {
      // error ya está en el store
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 justify-center">
          {/* Logo / título */}
          <View className="items-center mb-12">
            <View className="w-20 h-20 rounded-full bg-lima items-center justify-center mb-4">
              <Text className="text-bg text-4xl font-black">N</Text>
            </View>
            <Text className="text-white text-3xl font-black">NOXA</Text>
            <Text className="text-muted text-sm mt-1">Tu entrada al after</Text>
          </View>

          {/* Error */}
          {error && (
            <View className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          )}

          {/* Campos */}
          <View className="gap-3">
            <View>
              <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Email</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="tu@email.com"
                placeholderTextColor="#6B6B8A"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View>
              <Text className="text-muted text-xs mb-1 uppercase tracking-wider">Contraseña</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="••••••••"
                placeholderTextColor="#6B6B8A"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          {/* Botón login */}
          <TouchableOpacity
            onPress={() => void handleLogin()}
            disabled={isLoading}
            className="bg-lima rounded-xl py-4 items-center mt-6 active:opacity-80"
          >
            {isLoading ? (
              <ActivityIndicator color="#08080F" />
            ) : (
              <Text className="text-bg font-black text-base">Entrar</Text>
            )}
          </TouchableOpacity>

          {/* Link a registro */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-muted">¿No tenés cuenta? </Text>
            <Link href="/(auth)/registro" asChild>
              <TouchableOpacity>
                <Text className="text-lima font-semibold">Registrate</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
