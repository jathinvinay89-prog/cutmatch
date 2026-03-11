import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";

export default function TabLayout() {
  const { colors } = useApp();
  const C = colors;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.textSecondary,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: C.surface,
            web: C.surface,
          }),
          borderTopWidth: 1,
          borderTopColor: C.border,
          elevation: 0,
          height: Platform.OS === "web" ? 84 : undefined,
          paddingBottom: Platform.OS === "web" ? 34 : undefined,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={90}
              tint={C.background === "#0A0A0A" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "DMSans_500Medium",
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "CutMatch",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cut-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
