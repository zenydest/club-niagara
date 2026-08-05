/**
 * Layout de tabs principales.
 */

import React from "react";
import { Tabs } from "expo-router";
import { Icono, type NombreIcono } from "@/components/Icono";

const ACTIVO = "#1E50FF";
const INACTIVO = "#8888AA";

const TabIcon = ({ nombre, focused }: { nombre: NombreIcono; focused: boolean }) => (
  <Icono
    nombre={nombre}
    tamano={focused ? 23 : 21}
    color={focused ? ACTIVO : INACTIVO}
  />
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
          tabBarIcon: ({ focused }) => <TabIcon nombre="eventos" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tarjeta"
        options={{
          title: "Mi Tarjeta",
          tabBarIcon: ({ focused }) => <TabIcon nombre="tarjeta" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="entradas"
        options={{
          title: "Mis Entradas",
          tabBarIcon: ({ focused }) => <TabIcon nombre="entrada" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ focused }) => <TabIcon nombre="perfil" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
