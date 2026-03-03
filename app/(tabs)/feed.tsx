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
import { Colors } from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

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

function AvatarCircle({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 37) % 360;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 50%, 30%)` }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

function RecsModal({ post, user, visible, onClose, currentUserId, apiBase }: any) {
  const qc = useQueryClient();
  const [userRank, setUserRank] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const rate = async (rank: number) => {
    if (!currentUserId) return;
    setUserRank(rank);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  const rankColors: Record<number, string> = { 1: Colors.rank1, 2: Colors.rank2, 3: Colors.rank3, 4: Colors.rank4 };
  const diffColor = (d: string) => d === "Easy" ? "#4CAF50" : d === "Medium" ? "#FF9800" : "#F44336";

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[rStyles.overlay, { paddingTop: topPad }]}>
        <View style={rStyles.sheet}>
          <View style={rStyles.handle} />
          <View style={rStyles.sheetHeader}>
            <AvatarCircle name={user.displayName} size={36} />
            <View style={rStyles.sheetUserInfo}>
              <Text style={rStyles.sheetName}>{user.displayName}</Text>
              <Text style={rStyles.sheetShape}>{post.faceShape} face shape</Text>
            </View>
            <Pressable style={rStyles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[rStyles.scroll, { paddingBottom: bottomPad + 16 }]}>
            <Text style={rStyles.voteLabel}>Vote for the best cut</Text>

            {(post.recommendations as Recommendation[]).map((rec) => {
              const color = rankColors[rec.rank] ?? Colors.textSecondary;
              const isVoted = userRank === rec.rank;
              return (
                <Pressable
                  key={rec.rank}
                  style={[rStyles.recCard, isVoted && { borderColor: color + "80", backgroundColor: color + "10" }]}
                  onPress={() => rate(rec.rank)}
                >
                  <View style={rStyles.recImgBox}>
                    {rec.generatedImage ? (
                      <Image source={{ uri: rec.generatedImage }} style={rStyles.recImg} contentFit="cover" />
                    ) : (
                      <View style={rStyles.recImgPlaceholder}>
                        <Ionicons name="cut-outline" size={20} color={Colors.border} />
                      </View>
                    )}
                    {rec.generatedImage && (
                      <View style={rStyles.aiTag}>
                        <Ionicons name="sparkles" size={8} color={Colors.gold} />
                        <Text style={rStyles.aiTagText}>AI</Text>
                      </View>
                    )}
                  </View>
                  <View style={rStyles.recInfo}>
                    <View style={[rStyles.rankBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                      {rec.rank === 1 && <Ionicons name="trophy" size={10} color={color} />}
                      <Text style={[rStyles.rankText, { color }]}>#{rec.rank}</Text>
                    </View>
                    <Text style={rStyles.recName}>{rec.name}</Text>
                    <Text style={rStyles.recDesc} numberOfLines={1}>{rec.description}</Text>
                    <View style={rStyles.diffRow}>
                      <View style={[rStyles.diffDot, { backgroundColor: diffColor(rec.difficulty) }]} />
                      <Text style={[rStyles.diffText, { color: diffColor(rec.difficulty) }]}>{rec.difficulty}</Text>
                    </View>
                  </View>
                  {isVoted && (
                    <View style={rStyles.voteCheck}>
                      <Ionicons name="checkmark-circle" size={22} color={color} />
                    </View>
                  )}
                </Pressable>
              );
            })}

            {currentUserId && user.id !== currentUserId && (
              <Pressable style={rStyles.friendBtn} onPress={addFriend}>
                <Ionicons name="person-add-outline" size={16} color={Colors.gold} />
                <Text style={rStyles.friendBtnText}>Add Friend</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PostCard({ item, currentUserId, apiBase }: { item: FeedPost; currentUserId: number | null; apiBase: string }) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Pressable style={fStyles.postCard} onPress={() => setModalVisible(true)}>
        <View style={fStyles.postHeader}>
          <AvatarCircle name={item.user.displayName} />
          <View style={fStyles.postUserInfo}>
            <Text style={fStyles.postName}>{item.user.displayName}</Text>
            <Text style={fStyles.postMeta}>@{item.user.username} · {timeAgo(item.post.createdAt)}</Text>
          </View>
          <View style={fStyles.shapeTag}>
            <Text style={fStyles.shapeTagText}>{item.post.faceShape}</Text>
          </View>
        </View>

        <View style={fStyles.photoRow}>
          <View style={fStyles.faceBox}>
            <Image source={{ uri: item.post.facePhotoUrl }} style={fStyles.faceImg} contentFit="cover" />
            <View style={fStyles.faceLabel}>
              <Text style={fStyles.faceLabelText}>Original</Text>
            </View>
          </View>
          <View style={fStyles.recsGrid}>
            {(item.post.recommendations as Recommendation[]).slice(0, 4).map((rec) => (
              <View key={rec.rank} style={fStyles.recThumb}>
                {rec.generatedImage ? (
                  <Image source={{ uri: rec.generatedImage }} style={fStyles.recThumbImg} contentFit="cover" />
                ) : (
                  <View style={fStyles.recThumbPlaceholder}>
                    <Ionicons name="cut-outline" size={14} color={Colors.border} />
                  </View>
                )}
                <View style={[fStyles.rankDot, { backgroundColor: [Colors.rank1, Colors.rank2, Colors.rank3, Colors.rank4][rec.rank - 1] }]} />
              </View>
            ))}
          </View>
        </View>

        {!!item.post.caption && (
          <Text style={fStyles.caption}>{item.post.caption}</Text>
        )}

        <View style={fStyles.postFooter}>
          <Pressable style={fStyles.footerAction} onPress={() => setModalVisible(true)}>
            <Ionicons name="star-outline" size={16} color={Colors.textSecondary} />
            <Text style={fStyles.footerActionText}>Rate cuts</Text>
          </Pressable>
          <Pressable style={fStyles.footerAction} onPress={() => setModalVisible(true)}>
            <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            <Text style={fStyles.footerActionText}>View all</Text>
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
      />
    </>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
    <View style={fStyles.container}>
      <View style={[fStyles.header, { paddingTop: topPad + 12 }]}>
        <Text style={fStyles.headerTitle}>Feed</Text>
        <Text style={fStyles.headerSub}>See what others are matching</Text>
      </View>

      {isLoading ? (
        <View style={fStyles.center}>
          <ActivityIndicator color={Colors.gold} />
        </View>
      ) : feed.length === 0 ? (
        <View style={fStyles.center}>
          <Ionicons name="images-outline" size={48} color={Colors.border} />
          <Text style={fStyles.emptyTitle}>No posts yet</Text>
          <Text style={fStyles.emptyText}>Share your haircut results from the CutMatch tab</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => String(item.post.id)}
          renderItem={({ item }) => (
            <PostCard item={item} currentUserId={currentUser?.id ?? null} apiBase={apiBase} />
          )}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 + 34 : 84, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.gold} />}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 16 }} />}
        />
      )}
    </View>
  );
}

const fStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 26, fontFamily: "DMSans_700Bold", color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.text },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 40 },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "DMSans_700Bold", color: Colors.text },
  postCard: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postUserInfo: { flex: 1 },
  postName: { fontSize: 14, fontFamily: "DMSans_700Bold", color: Colors.text },
  postMeta: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, marginTop: 1 },
  shapeTag: { backgroundColor: "rgba(201,168,76,0.12)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(201,168,76,0.25)" },
  shapeTagText: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.gold, textTransform: "capitalize" },
  photoRow: { flexDirection: "row", gap: 8, height: 160 },
  faceBox: { flex: 1, borderRadius: 12, overflow: "hidden", position: "relative" },
  faceImg: { width: "100%", height: "100%" },
  faceLabel: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  faceLabelText: { fontSize: 10, fontFamily: "DMSans_500Medium", color: Colors.text },
  recsGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  recThumb: { width: "48%", flex: undefined, aspectRatio: 1, borderRadius: 10, overflow: "hidden", position: "relative" },
  recThumbImg: { width: "100%", height: "100%" },
  recThumbPlaceholder: { width: "100%", height: "100%", backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center" },
  rankDot: { position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)" },
  caption: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.text, lineHeight: 18 },
  postFooter: { flexDirection: "row", justifyContent: "space-between" },
  footerAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerActionText: { fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.textSecondary },
});

const rStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1, borderColor: Colors.border },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  sheetUserInfo: { flex: 1 },
  sheetName: { fontSize: 15, fontFamily: "DMSans_700Bold", color: Colors.text },
  sheetShape: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, textTransform: "capitalize", marginTop: 1 },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 10 },
  voteLabel: { fontSize: 13, fontFamily: "DMSans_700Bold", color: Colors.gold, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  recCard: { flexDirection: "row", backgroundColor: Colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 12, alignItems: "center" },
  recImgBox: { width: 72, height: 88, borderRadius: 10, overflow: "hidden", position: "relative" },
  recImg: { width: "100%", height: "100%" },
  recImgPlaceholder: { width: "100%", height: "100%", backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  aiTag: { position: "absolute", bottom: 4, left: 4, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  aiTagText: { fontSize: 7, fontFamily: "DMSans_700Bold", color: Colors.gold },
  recInfo: { flex: 1, gap: 4 },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start" },
  rankText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  recName: { fontSize: 14, fontFamily: "DMSans_700Bold", color: Colors.text },
  recDesc: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.textSecondary },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  diffDot: { width: 5, height: 5, borderRadius: 3 },
  diffText: { fontSize: 10, fontFamily: "DMSans_500Medium" },
  voteCheck: { position: "absolute", top: 10, right: 10 },
  friendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", marginTop: 4 },
  friendBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium", color: Colors.gold },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "DMSans_700Bold", color: Colors.text },
});
