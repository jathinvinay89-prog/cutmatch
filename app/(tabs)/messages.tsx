import React from "react";
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

interface Friend {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;

function AvatarCircle({ name, size = 48, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
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

function AIAdvisorAvatar({ size = 48, gold }: { size?: number; gold: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: gold + "22", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: gold + "55" }}>
      <Ionicons name="cut" size={size * 0.46} color={gold} />
    </View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, isLoadingUser, colors: C } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: friends = [], isLoading } = useQuery<Friend[]>({
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
        <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
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

  const todayLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
        <Text style={[styles.headerTitle, { color: C.text }]}>Messages</Text>
        <Text style={[styles.headerSub, { color: C.textSecondary }]}>@{currentUser.username}</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={C.gold} /></View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + bottomPad + 16 }}
          ListHeaderComponent={
            <Pressable
              style={[styles.friendRow, { borderBottomColor: C.border }]}
              onPress={() => {
                Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Light);
                router.push({ pathname: "/chat/ai-advisor" });
              }}
            >
              <AIAdvisorAvatar size={48} gold={C.gold} />
              <View style={styles.friendInfo}>
                <View style={styles.rowTop}>
                  <Text style={[styles.friendName, { color: C.text }]}>AI Hair Advisor</Text>
                  <View style={[styles.aiTag, { backgroundColor: C.gold + "22", borderColor: C.gold + "44" }]}>
                    <Text style={[styles.aiTagText, { color: C.gold }]}>AI</Text>
                  </View>
                  <Text style={[styles.timestamp, { color: C.textSecondary }]}>{todayLabel}</Text>
                </View>
                <Text style={[styles.lastMessage, { color: C.textSecondary }]} numberOfLines={1}>Your personal haircut expert</Text>
              </View>
            </Pressable>
          }
          ListEmptyComponent={
            <View style={[styles.center, { paddingTop: 60 }]}>
              <Ionicons name="people-outline" size={48} color={C.border} />
              <Text style={[styles.emptyTitle, { color: C.text }]}>No friends yet</Text>
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>Add friends from the Feed tab to start chatting</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.friendRow, { borderBottomColor: C.border }]}
              onPress={() => {
                Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Light);
                router.push({ pathname: "/chat/[userId]", params: { userId: String(item.id), name: item.displayName } });
              }}
            >
              <AvatarCircle name={item.displayName} avatarUrl={item.avatarUrl} size={48} />
              <View style={styles.friendInfo}>
                <View style={styles.rowTop}>
                  <Text style={[styles.friendName, { color: C.text }]}>{item.displayName}</Text>
                  <Text style={[styles.timestamp, { color: C.textSecondary }]}>{todayLabel}</Text>
                </View>
                <Text style={[styles.lastMessage, { color: C.textSecondary }]} numberOfLines={1}>Tap to chat</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.border} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 24, fontFamily: "DMSans_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "DMSans_700Bold", textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 19 },
  joinBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  joinBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  friendInfo: { flex: 1 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  friendName: { fontSize: 15, fontFamily: "DMSans_700Bold", flex: 1 },
  lastMessage: { fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 2 },
  timestamp: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  aiTag: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  aiTagText: { fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 },
});
