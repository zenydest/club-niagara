/**
 * Layout de tabs principales.
 */

import React from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";

// Iconos simples con emojis (sin dependencia extra)
const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }}>
    {emoji}
  </Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0C0C1A",
          borderTopColor:  "#1E1E2E",
          borderTopWidth:  1,
          paddingBottom:   4,
          height:          60,
        },
        tabBarActiveTintColor:   "#1E50FF",
        tabBarInactiveTintColor: "#8888AA",
        tabBarLabelStyle: {
          fontSize:   10,
          fontWeight: "600",
          marginTop:  -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Eventos",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎵" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tarjeta"
        options={{
          title: "Mi Tarjeta",
          tabBarIcon: ({ focused }) => <TabIcon emoji="💳" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="entradas"
        options={{
          title: "Mis Entradas",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎟️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
