import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { fetch } from "expo/fetch";
import { router } from "expo-router";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;

interface Recommendation {
  rank: number;
  name: string;
  description: string;
  whyItFits: string;
  difficulty: string;
  generatedImage: string | null;
}

interface FeedPost {
  post: {
    id: number;
    userId: number;
    facePhotoUrl: string;
    faceShape: string;
    faceFeatures: string;
    hasGlasses: boolean;
    recommendations: Recommendation[];
    caption: string;
    createdAt: string;
    postType?: string;
  };
  user: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function AvatarCircle({ name, size = 40, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  const safeName = name || "User";
  const initials = safeName.slice(0, 2).toUpperCase();
  const hue = (safeName.charCodeAt(0) * 37) % 360;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 50%, 30%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "white", fontSize: size * 0.35, fontWeight: "bold" }}>{initials}</Text>
    </View>
  );
}

function RecsModal({ post, user, visible, onClose, currentUserId, apiBase, colors: C }: any) {
  const qc = useQueryClient();
  const [userRank, setUserRank] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const rate = async (rank: number) => {
    if (!currentUserId) return;
    setUserRank(rank);
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const url = new URL(`/api/posts/${post.id}/rate`, apiBase).toString();
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, rank }),
      });
    } catch {}
  };

  const addFriend = async () => {
    if (!currentUserId || user.id === currentUserId) return;
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = new URL("/api/friends/request", apiBase).toString();
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: currentUserId, addresseeId: user.id }),
      });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
    } catch {}
  };

  const rankColors: Record<number, string> = { 1: C.rank1, 2: C.rank2, 3: C.rank3, 4: C.rank4 };
  const diffColor = (d: string) => d === "Easy" ? "#4CAF50" : d === "Medium" ? "#FF9800" : "#F44336";

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[rS.overlay, { paddingTop: topPad }]}>
        <View style={[rS.sheet, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[rS.handle, { backgroundColor: C.border }]} />
          <View style={[rS.sheetHeader, { borderBottomColor: C.border }]}>
            <AvatarCircle name={user.displayName} size={36} avatarUrl={user.avatarUrl} />
            <View style={rS.sheetUserInfo}>
              <Text style={[rS.sheetName, { color: C.text }]}>{user.displayName}</Text>
              <Text style={[rS.sheetShape, { color: C.textSecondary }]}>{post.faceShape} face shape</Text>
            </View>
            <Pressable style={rS.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[rS.scroll, { paddingBottom: bottomPad + 16 }]}>
            <Text style={[rS.voteLabel, { color: C.gold }]}>Vote for the best cut</Text>

            {(post.recommendations as Recommendation[]).map((rec) => {
              const color = rankColors[rec.rank] ?? C.textSecondary;
              const isVoted = userRank === rec.rank;
              return (
                <Pressable
                  key={rec.rank}
                  style={[rS.recCard, { backgroundColor: C.surface2, borderColor: isVoted ? color + "80" : C.border },
                    isVoted && { backgroundColor: color + "10" }]}
                  onPress={() => rate(rec.rank)}
                >
                  <View style={rS.recImgBox}>
                    {rec.generatedImage ? (
                      <Image source={{ uri: rec.generatedImage }} style={rS.recImg} contentFit="cover" />
                    ) : (
                      <View style={[rS.recImgPlaceholder, { backgroundColor: C.surface }]}>
                        <Ionicons name="cut-outline" size={20} color={C.border} />
                      </View>
                    )}
                    {rec.generatedImage && (
                      <View style={rS.aiTag}>
                        <Ionicons name="sparkles" size={8} color={C.gold} />
                        <Text style={[rS.aiTagText, { color: C.gold }]}>AI</Text>
                      </View>
                    )}
                  </View>
                  <View style={rS.recInfo}>
                    <View style={[rS.rankBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                      {rec.rank === 1 && <Ionicons name="trophy" size={10} color={color} />}
                      <Text style={[rS.rankText, { color }]}>#{rec.rank}</Text>
                    </View>
                    <Text style={[rS.recName, { color: C.text }]}>{rec.name}</Text>
                    <Text style={[rS.recDesc, { color: C.textSecondary }]} numberOfLines={1}>{rec.description}</Text>
                    <View style={rS.diffRow}>
                      <View style={[rS.diffDot, { backgroundColor: diffColor(rec.difficulty) }]} />
                      <Text style={[rS.diffText, { color: diffColor(rec.difficulty) }]}>{rec.difficulty}</Text>
                    </View>
                  </View>
                  {isVoted && (
                    <View style={rS.voteCheck}>
                      <Ionicons name="checkmark-circle" size={22} color={color} />
                    </View>
                  )}
                </Pressable>
              );
            })}

            {currentUserId && user.id !== currentUserId && (
              <Pressable style={[rS.friendBtn, { backgroundColor: C.gold + "14", borderColor: C.gold + "40" }]} onPress={addFriend}>
                <Ionicons name="person-add-outline" size={16} color={C.gold} />
                <Text style={[rS.friendBtnText, { color: C.gold }]}>Add Friend</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PostCard({ item, currentUserId, apiBase, colors: C }: { item: FeedPost; currentUserId: number | null; apiBase: string; colors: any }) {
  const [modalVisible, setModalVisible] = useState(false);
  const topRec = item.post.recommendations?.[0];

  return (
    <>
      <Pressable style={[fS.postCard, { backgroundColor: C.background }]} onPress={() => setModalVisible(true)}>
        <View style={fS.postHeader}>
          <AvatarCircle name={item.user.displayName} avatarUrl={item.user.avatarUrl} />
          <View style={fS.postUserInfo}>
            <Text style={[fS.postName, { color: C.text }]}>{item.user.displayName}</Text>
            <Text style={[fS.postMeta, { color: C.textSecondary }]}>@{item.user.username} · {timeAgo(item.post.createdAt)}</Text>
          </View>
          <View style={[fS.shapeTag, { backgroundColor: C.gold + "20", borderColor: C.gold + "40" }]}>
            <Text style={[fS.shapeTagText, { color: C.gold }]}>{item.post.faceShape}</Text>
          </View>
        </View>

        <View style={fS.photoRow}>
          <View style={[fS.faceBox, { backgroundColor: C.surface2 }]}>
            <Image
              source={{ uri: item.post.facePhotoUrl }}
              style={fS.faceImg}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View style={fS.faceLabel}>
              <Text style={fS.faceLabelText}>Original</Text>
            </View>
          </View>
          <View style={fS.recsGrid}>
            {(item.post.recommendations as Recommendation[]).slice(0, 4).map((rec) => (
              <View key={rec.rank} style={[fS.recThumb, { backgroundColor: C.surface2 }]}>
                {rec.generatedImage ? (
                  <Image source={{ uri: rec.generatedImage }} style={fS.recThumbImg} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[fS.recThumbPlaceholder, { backgroundColor: C.surface2 }]}>
                    <Ionicons name="cut-outline" size={14} color={C.border} />
                  </View>
                )}
                <View style={[fS.rankDot, { backgroundColor: [C.rank1, C.rank2, C.rank3, C.rank4][rec.rank - 1] }]} />
              </View>
            ))}
          </View>
        </View>

        {!!item.post.caption && <Text style={[fS.caption, { color: C.text }]}>{item.post.caption}</Text>}

        <View style={fS.postFooter}>
          <Pressable style={fS.footerAction} onPress={() => setModalVisible(true)}>
            <Ionicons name="star-outline" size={16} color={C.textSecondary} />
            <Text style={[fS.footerActionText, { color: C.textSecondary }]}>Rate cuts</Text>
          </Pressable>
          <Pressable style={fS.footerAction} onPress={() => setModalVisible(true)}>
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
            <Text style={[fS.footerActionText, { color: C.textSecondary }]}>View all</Text>
          </Pressable>
        </View>
      </Pressable>

      <RecsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        post={item.post}
        user={item.user}
        currentUserId={currentUserId}
        apiBase={apiBase}
        colors={C}
      />
    </>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: feed = [], isLoading, refetch } = useQuery<FeedPost[]>({
    queryKey: ["/api/feed"],
    queryFn: async () => {
      const url = new URL("/api/feed", apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load feed");
      return res.json();
    },
  });

  return (
    <View style={[fS.container, { backgroundColor: C.background }]}>
      <View style={[fS.header, { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        <Text style={[fS.headerTitle, { color: C.text }]}>Feed</Text>
        <Text style={[fS.headerSub, { color: C.textSecondary }]}>See what others are matching</Text>
      </View>

      {isLoading ? (
        <View style={fS.center}>
          <ActivityIndicator color={C.gold} />
        </View>
      ) : feed.length === 0 ? (
        <View style={fS.center}>
          <Ionicons name="images-outline" size={48} color={C.border} />
          <Text style={[fS.emptyTitle, { color: C.text }]}>No posts yet</Text>
          <Text style={[fS.emptyText, { color: C.textSecondary }]}>Share your haircut results from the CutMatch tab</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => String(item.post.id)}
          renderItem={({ item }) => (
            <PostCard item={item} currentUserId={currentUser?.id ?? null} apiBase={apiBase} colors={C} />
          )}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + bottomPad + 16, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={C.gold} />}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16 }} />}
        />
      )}
    </View>
  );
}

const fS = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1 },
  headerTitle: { fontSize: 26, fontFamily: "DMSans_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "DMSans_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", paddingHorizontal: 40 },
  postCard: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postUserInfo: { flex: 1 },
  postName: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  postMeta: { fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 1 },
  shapeTag: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  shapeTagText: { fontSize: 11, fontFamily: "DMSans_500Medium", textTransform: "capitalize" },
  photoRow: { flexDirection: "row", gap: 8, height: 160 },
  faceBox: { flex: 1, borderRadius: 12, overflow: "hidden", position: "relative" },
  faceImg: { width: "100%", height: "100%" },
  faceLabel: {
    position: "absolute", bottom: 6, left: 6,
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  faceLabelText: { fontSize: 10, fontFamily: "DMSans_500Medium", color: "#fff" },
  recsGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  recThumb: { width: "48%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", position: "relative" },
  recThumbImg: { width: "100%", height: "100%" },
  recThumbPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  rankDot: { position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)" },
  caption: { fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 18 },
  postFooter: { flexDirection: "row", justifyContent: "space-between" },
  footerAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerActionText: { fontSize: 12, fontFamily: "DMSans_500Medium" },
});

const rS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  sheetUserInfo: { flex: 1 },
  sheetName: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  sheetShape: { fontSize: 12, fontFamily: "DMSans_400Regular", textTransform: "capitalize", marginTop: 1 },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 10 },
  voteLabel: { fontSize: 13, fontFamily: "DMSans_700Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  recCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 12, gap: 12, alignItems: "center" },
  recImgBox: { width: 72, height: 88, borderRadius: 10, overflow: "hidden", position: "relative" },
  recImg: { width: "100%", height: "100%" },
  recImgPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  aiTag: {
    position: "absolute", bottom: 4, left: 4, flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4,
  },
  aiTagText: { fontSize: 7, fontFamily: "DMSans_700Bold" },
  recInfo: { flex: 1, gap: 4 },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start" },
  rankText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  recName: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  recDesc: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  diffDot: { width: 5, height: 5, borderRadius: 3 },
  diffText: { fontSize: 10, fontFamily: "DMSans_500Medium" },
  voteCheck: { position: "absolute", top: 10, right: 10 },
  friendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  friendBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium" },
});
