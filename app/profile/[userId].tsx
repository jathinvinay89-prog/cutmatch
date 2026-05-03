import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useApp } from "@/context/AppContext";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { fetch } from "expo/fetch";
import { isLiquidGlass, LG_BLUR_INTENSITY, LG_BORDER_GLOW, LG_SURFACE_BG_DARK, LG_SURFACE_BG_LIGHT } from "@/lib/liquidGlass";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;

function AvatarCircle({ name, size = 72, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  const safeName = name || "?";
  const initials = safeName.slice(0, 2).toUpperCase();
  const hue = (safeName.charCodeAt(0) * 37) % 360;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 50%, 30%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "white", fontSize: size * 0.35, fontFamily: "DMSans_700Bold" }}>{initials}</Text>
    </View>
  );
}

function ImageWithFallback({ uri, style, fallbackSize = 12, borderColor = "#333" }: {
  uri?: string | null; style: any; fallbackSize?: number; borderColor?: string;
}) {
  const [errored, setErrored] = useState(false);
  React.useEffect(() => { setErrored(false); }, [uri]);
  const safeUri = uri && uri.startsWith("http") ? uri.replace(/\/uploads\//, "/api/uploads/") : uri;
  if (!safeUri || errored) {
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor }]}>
        <Ionicons name="cut-outline" size={fallbackSize} color={borderColor} />
      </View>
    );
  }
  return (
    <Image source={{ uri: safeUri }} style={style} contentFit="cover" cachePolicy="memory-disk" onError={() => setErrored(true)} />
  );
}

type FriendStatus = "self" | "none" | "sent" | "received" | "friends";

function FriendButton({
  status, friendshipId, targetId, currentUserId, apiBase, colors: C, onStatusChange,
}: {
  status: FriendStatus; friendshipId?: number; targetId: number;
  currentUserId: number; apiBase: string; colors: any; onStatusChange: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle?.Medium);
    try {
      if (status === "none") {
        await fetch(new URL("/api/friends/request", apiBase).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requesterId: currentUserId, addresseeId: targetId }),
        });
      } else if (status === "sent" && friendshipId) {
        await fetch(new URL(`/api/friends/${friendshipId}?userId=${currentUserId}`, apiBase).toString(), { method: "DELETE" });
      } else if (status === "received" && friendshipId) {
        await fetch(new URL(`/api/friends/${friendshipId}/accept`, apiBase).toString(), { method: "POST" });
      } else if (status === "friends" && friendshipId) {
        Alert.alert("Unfriend", "Remove this friend?", [
          { text: "Cancel", style: "cancel", onPress: () => setLoading(false) },
          {
            text: "Unfriend", style: "destructive", onPress: async () => {
              await fetch(new URL(`/api/friends/${friendshipId}/unfriend`, apiBase).toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId }),
              });
              onStatusChange();
              setLoading(false);
            }
          },
        ]);
        return;
      }
      onStatusChange();
    } catch {}
    setLoading(false);
  };

  if (status === "self") return null;

  let label = "Add Friend";
  let icon: React.ComponentProps<typeof Ionicons>["name"] = "person-add-outline";
  let bg = C.gold;
  let textColor = C.background;
  let borderColor = C.gold;

  if (status === "sent") {
    label = "Requested";
    icon = "time-outline";
    bg = "transparent";
    textColor = C.textSecondary;
    borderColor = C.border;
  } else if (status === "received") {
    label = "Accept Request";
    icon = "checkmark-circle-outline";
    bg = "#4CAF50";
    textColor = "#fff";
    borderColor = "#4CAF50";
  } else if (status === "friends") {
    label = "Friends";
    icon = "people-outline";
    bg = "transparent";
    textColor = C.gold;
    borderColor = C.gold + "60";
  }

  return (
    <Pressable
      style={[p.friendBtn, { backgroundColor: bg, borderColor }]}
      onPress={handlePress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator size="small" color={textColor} />
        : <>
            <Ionicons name={icon} size={16} color={textColor} />
            <Text style={[p.friendBtnText, { color: textColor }]}>{label}</Text>
          </>
      }
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C } = useApp();
  const params = useLocalSearchParams<{ userId: string }>();
  const profileUserId = parseInt(params.userId);
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const isDark = C.background === "#0A0A0A";
  const glassBg = isDark ? LG_SURFACE_BG_DARK : LG_SURFACE_BG_LIGHT;
  const isOwnProfile = currentUser?.id === profileUserId;

  const { data: profileUser, isLoading: userLoading, refetch: refetchUser } = useQuery({
    queryKey: ["/api/users", profileUserId],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${profileUserId}`, apiBase).toString());
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: profilePosts = [], isLoading: postsLoading, refetch: refetchPosts } = useQuery<any[]>({
    queryKey: ["/api/users", profileUserId, "profile-posts"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${profileUserId}/profile-posts`, apiBase).toString());
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: friendStatus, refetch: refetchStatus } = useQuery<{ status: FriendStatus; friendshipId?: number }>({
    queryKey: ["/api/friends/status", currentUser?.id, profileUserId],
    enabled: !!currentUser && !isOwnProfile,
    queryFn: async () => {
      const url = new URL("/api/friends/status", apiBase);
      url.searchParams.set("userId", String(currentUser!.id));
      url.searchParams.set("targetId", String(profileUserId));
      const res = await fetch(url.toString());
      if (!res.ok) return { status: "none" };
      return res.json();
    },
  });

  const { data: friends = [] } = useQuery<any[]>({
    queryKey: ["/api/friends", profileUserId],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/friends/${profileUserId}`, apiBase).toString());
      if (!res.ok) return [];
      return res.json();
    },
  });

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchUser(), refetchPosts(), refetchStatus()]);
  }, [refetchUser, refetchPosts, refetchStatus]);

  useFocusEffect(
    useCallback(() => {
      refetchStatus();
    }, [refetchStatus])
  );

  const handleStatusChange = useCallback(() => {
    refetchStatus();
    qc.invalidateQueries({ queryKey: ["/api/friends"] });
  }, [refetchStatus, qc]);

  if (userLoading) {
    return (
      <View style={[p.container, { backgroundColor: C.background }]}>
        <View style={[p.header, isLiquidGlass
          ? { paddingTop: topPad + 12, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
          : { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
          {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
          <Pressable style={[p.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[p.headerTitle, { color: C.text }]}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={p.center}><ActivityIndicator color={C.gold} size="large" /></View>
      </View>
    );
  }

  if (!profileUser) {
    return (
      <View style={[p.container, { backgroundColor: C.background }]}>
        <View style={[p.header, isLiquidGlass
          ? { paddingTop: topPad + 12, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
          : { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
          {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
          <Pressable style={[p.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[p.headerTitle, { color: C.text }]}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={p.center}><Text style={{ color: C.textSecondary }}>User not found</Text></View>
      </View>
    );
  }

  const numCols = 3;

  return (
    <View style={[p.container, { backgroundColor: C.background }]}>
      <View style={[p.header, isLiquidGlass
        ? { paddingTop: topPad + 12, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
        : { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
        <Pressable style={[p.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={[p.headerTitle, { color: C.text }]} numberOfLines={1}>{profileUser.displayName}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetchAll} tintColor={C.gold} />}
      >
        {/* Profile hero section */}
        <View style={[p.heroCard, isLiquidGlass
          ? { backgroundColor: glassBg, borderColor: LG_BORDER_GLOW, overflow: "hidden" }
          : { backgroundColor: C.surface, borderColor: C.border }]}>
          {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
          <AvatarCircle name={profileUser.displayName} size={72} avatarUrl={profileUser.avatarUrl} />
          <Text style={[p.profileName, { color: C.text }]}>{profileUser.displayName}</Text>
          <Text style={[p.profileUsername, { color: C.textSecondary }]}>@{profileUser.username}</Text>
          {!!profileUser.bio && (
            <Text style={[p.bio, { color: C.textSecondary }]}>{profileUser.bio}</Text>
          )}
          <View style={p.statsRow}>
            <View style={p.statItem}>
              <Text style={[p.statNum, { color: C.text }]}>{profilePosts.length}</Text>
              <Text style={[p.statLabel, { color: C.textSecondary }]}>Cuts</Text>
            </View>
            <View style={[p.statDivider, { backgroundColor: C.border }]} />
            <View style={p.statItem}>
              <Text style={[p.statNum, { color: C.text }]}>{friends.length}</Text>
              <Text style={[p.statLabel, { color: C.textSecondary }]}>Friends</Text>
            </View>
          </View>

          {/* Action button */}
          {isOwnProfile ? (
            <Pressable
              style={[p.editBtn, { borderColor: C.border }]}
              onPress={() => router.push("/(tabs)/settings" as any)}
            >
              <Ionicons name="pencil-outline" size={15} color={C.text} />
              <Text style={[p.editBtnText, { color: C.text }]}>Edit Profile</Text>
            </Pressable>
          ) : currentUser && friendStatus ? (
            <FriendButton
              status={friendStatus.status}
              friendshipId={friendStatus.friendshipId}
              targetId={profileUserId}
              currentUserId={currentUser.id}
              apiBase={apiBase}
              colors={C}
              onStatusChange={handleStatusChange}
            />
          ) : null}
        </View>

        {/* Cutmatches grid */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <Text style={[p.sectionLabel, { color: C.textSecondary }]}>
            ACTIVE CUTMATCHES
          </Text>

          {postsLoading ? (
            <ActivityIndicator color={C.gold} style={{ marginVertical: 20 }} />
          ) : profilePosts.length === 0 ? (
            <View style={[p.emptyGrid, { borderColor: C.border }]}>
              <Ionicons name="cut-outline" size={36} color={C.border} />
              <Text style={[p.emptyGridText, { color: C.textSecondary }]}>No active cut matches yet</Text>
            </View>
          ) : (
            <View style={p.grid}>
              {profilePosts.map((post: any) => {
                const topRec = post.recommendations?.find((r: any) => r.rank === 1) || post.recommendations?.[0];
                return (
                  <Pressable
                    key={post.id}
                    style={[p.gridItem, { backgroundColor: C.surface2, borderColor: C.border }]}
                    onPress={() => router.push({ pathname: "/cutmatch/[id]", params: { id: String(post.id) } } as any)}
                  >
                    <ImageWithFallback
                      uri={topRec?.generatedImage || post.facePhotoUrl}
                      style={p.gridImg}
                      fallbackSize={18}
                      borderColor={C.border}
                    />
                    <View style={[p.gridBadge, { backgroundColor: C.surface + "dd" }]}>
                      <Text style={[p.gridBadgeText, { color: C.gold }]}>{post.faceShape}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const p = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", flex: 1, textAlign: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroCard: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    borderRadius: 20, borderWidth: 1, padding: 20, alignItems: "center", gap: 6,
  },
  profileName: { fontSize: 20, fontFamily: "DMSans_700Bold", marginTop: 8 },
  profileUsername: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  bio: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 19, marginTop: 4 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 10, marginBottom: 4 },
  statItem: { alignItems: "center", gap: 2 },
  statNum: { fontSize: 18, fontFamily: "DMSans_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  statDivider: { width: 1, height: 24 },
  friendBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22, borderWidth: 1, marginTop: 8,
  },
  friendBtnText: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, borderWidth: 1, marginTop: 8,
  },
  editBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium" },
  sectionLabel: { fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 },
  emptyGrid: { alignItems: "center", gap: 10, padding: 40, borderRadius: 16, borderWidth: 1, borderStyle: "dashed" },
  emptyGridText: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  gridItem: { width: "32%", aspectRatio: 0.85, borderRadius: 10, overflow: "hidden", borderWidth: 1, position: "relative" },
  gridImg: { width: "100%", height: "100%" },
  gridBadge: { position: "absolute", bottom: 5, left: 5, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  gridBadgeText: { fontSize: 9, fontFamily: "DMSans_700Bold" },
});
