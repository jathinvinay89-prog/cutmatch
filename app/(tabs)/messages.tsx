import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import { Image } from "expo-image";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;

function AvatarCircle({ name, size = 46, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  const initials = name.slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 37) % 360;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 50%, 30%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "DMSans_700Bold", color: "#fff", fontSize: size * 0.35 }}>{initials}</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, isLoadingUser, colors: C } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ["/api/friends", currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const url = new URL(`/api/friends/${currentUser!.id}`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoadingUser) {
    return <View style={[styles.center, { backgroundColor: C.background }]}><ActivityIndicator color={C.gold} /></View>;
  }

  if (!currentUser) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
          <Text style={[styles.headerTitle, { color: C.text }]}>Messages</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={56} color={C.border} />
          <Text style={[styles.emptyTitle, { color: C.text }]}>Chat with friends</Text>
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>Create an account to message people you meet on the feed</Text>
          <Pressable style={[styles.joinBtn, { backgroundColor: C.gold }]} onPress={() => router.replace("/auth" as any)}>
            <Text style={[styles.joinBtnText, { color: C.background }]}>Sign Up / Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: C.text }]}>Messages</Text>
          <Text style={[styles.headerSub, { color: C.textSecondary }]}>@{currentUser.username}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={C.gold} /></View>
      ) : friends.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={C.border} />
          <Text style={[styles.emptyTitle, { color: C.text }]}>No friends yet</Text>
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>Add friends from the Feed tab to start chatting</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + bottomPad + 16 }}
          renderItem={({ item }: any) => (
            <Pressable
              style={[styles.friendRow, { borderBottomColor: C.border }]}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/chat/[userId]", params: { userId: String(item.id), name: item.displayName } });
              }}
            >
              <AvatarCircle name={item.displayName} avatarUrl={item.avatarUrl} />
              <View style={styles.friendInfo}>
                <Text style={[styles.friendName, { color: C.text }]}>{item.displayName}</Text>
                <Text style={[styles.friendUsername, { color: C.textSecondary }]}>@{item.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.border} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 26, fontFamily: "DMSans_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "DMSans_700Bold", textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 19 },
  joinBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  joinBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  friendUsername: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 1 },
});
