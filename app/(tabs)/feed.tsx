import React, { useState, useRef, useCallback } from "react";
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
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useApp } from "@/context/AppContext";
import { router } from "expo-router";
import { fetch } from "expo/fetch";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function timeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}

function AvatarCircle({ name, size = 40, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
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

function RecsModal({ post, user, visible, onClose, currentUserId, apiBase, colors: C }: any) {
  const qc = useQueryClient();
  const [userRank, setUserRank] = useState<number | null>(null);
  const [friendAdded, setFriendAdded] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const checkScaleAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const rate = async (rank: number) => {
    if (!currentUserId) return;
    setUserRank(rank);
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
    try {
      const url = new URL(`/api/posts/${post.id}/rate`, apiBase).toString();
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: currentUserId, rank }) });
    } catch {}
  };

  const addFriend = useCallback(async () => {
    if (!currentUserId || user.id === currentUserId || friendAdded) return;

    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);

    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.08, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();

    setFriendAdded(true);

    Animated.spring(checkScaleAnim, {
      toValue: 1, useNativeDriver: true, speed: 14, bounciness: 18, delay: 80,
    }).start();

    try {
      const url = new URL("/api/friends/request", apiBase).toString();
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requesterId: currentUserId, addresseeId: user.id }) });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
    } catch {}
  }, [currentUserId, user.id, friendAdded, scaleAnim, checkScaleAnim, apiBase, qc]);

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
              <Text style={[rS.sheetShape, { color: C.textSecondary }]}>{post.faceShape} face · {timeAgo(post.createdAt)}</Text>
            </View>
            <Pressable style={rS.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[rS.scroll, { paddingBottom: bottomPad + 16 }]}>
            <Text style={[rS.voteLabel, { color: C.gold }]}>Vote for the best cut</Text>
            {(post.recommendations || []).map((rec: any) => {
              const color = rankColors[rec.rank] ?? C.textSecondary;
              const isVoted = userRank === rec.rank;
              return (
                <Pressable key={rec.rank}
                  style={[rS.recCard, { backgroundColor: C.surface2, borderColor: isVoted ? color + "80" : C.border }, isVoted && { backgroundColor: color + "10" }]}
                  onPress={() => rate(rec.rank)}
                >
                  <View style={rS.recImgBox}>
                    {rec.generatedImage
                      ? <Image source={{ uri: rec.generatedImage }} style={rS.recImg} contentFit="cover" />
                      : <View style={[rS.recImgPlaceholder, { backgroundColor: C.surface }]}><Ionicons name="cut-outline" size={20} color={C.border} /></View>}
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
                  {isVoted && <View style={rS.voteCheck}><Ionicons name="checkmark-circle" size={22} color={color} /></View>}
                </Pressable>
              );
            })}
            {currentUserId && user.id !== currentUserId && (
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Pressable
                  style={[
                    rS.friendBtn,
                    friendAdded
                      ? { backgroundColor: "#4CAF5022", borderColor: "#4CAF5060" }
                      : { backgroundColor: C.gold + "14", borderColor: C.gold + "40" },
                  ]}
                  onPress={addFriend}
                  disabled={friendAdded}
                >
                  {friendAdded ? (
                    <Animated.View style={{ transform: [{ scale: checkScaleAnim }], flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                      <Text style={[rS.friendBtnText, { color: "#4CAF50" }]}>Friend Request Sent!</Text>
                    </Animated.View>
                  ) : (
                    <>
                      <Ionicons name="person-add-outline" size={16} color={C.gold} />
                      <Text style={[rS.friendBtnText, { color: C.gold }]}>Add Friend</Text>
                    </>
                  )}
                </Pressable>
              </Animated.View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CompetitionBanner({ item, colors: C }: { item: any; colors: any }) {
  const challRec = item.challengerPost?.recommendations?.find((r: any) => r.rank === 1) || item.challengerPost?.recommendations?.[0];
  const challeRec = item.challengeePost?.recommendations?.find((r: any) => r.rank === 1) || item.challengeePost?.recommendations?.[0];
  const comp = item.competition;
  const totalVotes = (comp.challengerVotes ?? 0) + (comp.challengeeVotes ?? 0);
  const cPct = totalVotes > 0 ? Math.round(((comp.challengerVotes ?? 0) / totalVotes) * 100) : 50;
  const ePct = 100 - cPct;

  return (
    <Pressable
      style={[bS.banner, { backgroundColor: C.surface, borderColor: C.gold + "50" }]}
      onPress={() => router.push({ pathname: "/competition/[id]", params: { id: String(comp.id) } } as any)}
    >
      <LinearGradient colors={[C.gold + "18", "transparent"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />

      <View style={bS.bannerTop}>
        <View style={[bS.competitionTag, { backgroundColor: C.gold + "20", borderColor: C.gold + "50" }]}>
          <Ionicons name="trophy" size={12} color={C.gold} />
          <Text style={[bS.competitionTagText, { color: C.gold }]}>⚔️ CutCompetition</Text>
        </View>
        {comp.expiresAt && (
          <View style={[bS.timerTag, { backgroundColor: C.surface2, borderColor: C.border }]}>
            <Ionicons name="timer-outline" size={11} color={C.textSecondary} />
            <Text style={[bS.timerText, { color: C.textSecondary }]}>{timeLeft(comp.expiresAt)}</Text>
          </View>
        )}
      </View>

      <Text style={[bS.vsTitle, { color: C.text }]}>Who has the better cut?</Text>

      <View style={bS.competitors}>
        {[
          { user: item.challengerUser, post: item.challengerPost, rec: challRec, votes: comp.challengerVotes ?? 0, pct: cPct },
          { user: item.challengeeUser, post: item.challengeePost, rec: challeRec, votes: comp.challengeeVotes ?? 0, pct: ePct },
        ].map((side, i) => (
          <View key={i} style={bS.side}>
            <AvatarCircle name={side.user?.displayName || "?"} size={28} avatarUrl={side.user?.avatarUrl} />
            <Text style={[bS.sideName, { color: C.text }]} numberOfLines={1}>{side.user?.displayName || "Waiting..."}</Text>
            <View style={[bS.sideImgBox, { backgroundColor: C.surface2 }]}>
              {side.rec?.generatedImage
                ? <Image source={{ uri: side.rec.generatedImage }} style={bS.sideImg} contentFit="cover" />
                : side.post?.facePhotoUrl
                  ? <Image source={{ uri: side.post.facePhotoUrl }} style={bS.sideImg} contentFit="cover" />
                  : <View style={[bS.sideImgEmpty, { backgroundColor: C.surface2 }]}><Ionicons name="cut-outline" size={22} color={C.border} /></View>}
            </View>
            {side.rec && <Text style={[bS.cutName, { color: C.textSecondary }]} numberOfLines={1}>{side.rec.name}</Text>}
            <View style={[bS.voteBar, { backgroundColor: C.border }]}>
              <View style={[bS.voteBarFill, { width: `${side.pct}%`, backgroundColor: C.gold }]} />
            </View>
            <Text style={[bS.votePct, { color: C.gold }]}>{side.pct}%</Text>
          </View>
        ))}
        <View style={[bS.vsCircle, { backgroundColor: C.gold, position: "absolute", left: "50%", top: "50%", marginLeft: -16, marginTop: -16 }]}>
          <Text style={[bS.vsText, { color: "#0A0A0A" }]}>VS</Text>
        </View>
      </View>

      <View style={[bS.tapToVote, { backgroundColor: C.gold }]}>
        <Text style={[bS.tapToVoteText, { color: "#0A0A0A" }]}>Tap to vote</Text>
        <Ionicons name="arrow-forward" size={14} color="#0A0A0A" />
      </View>
    </Pressable>
  );
}

function PostCard({ item, currentUserId, apiBase, colors: C }: any) {
  const [modalVisible, setModalVisible] = useState(false);
  const recs = item.post.recommendations || [];

  return (
    <>
      <Pressable style={[fS.postCard]} onPress={() => setModalVisible(true)}>
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
            <Image source={{ uri: item.post.facePhotoUrl }} style={fS.faceImg} contentFit="cover" cachePolicy="memory-disk" />
            <View style={fS.faceLabel}><Text style={fS.faceLabelText}>Original</Text></View>
          </View>
          <View style={fS.recsGrid}>
            {recs.slice(0, 4).map((rec: any) => (
              <View key={rec.rank} style={[fS.recThumb, { backgroundColor: C.surface2 }]}>
                {rec.generatedImage
                  ? <Image source={{ uri: rec.generatedImage }} style={fS.recThumbImg} contentFit="cover" cachePolicy="memory-disk" />
                  : <View style={[fS.recThumbPlaceholder, { backgroundColor: C.surface2 }]}><Ionicons name="cut-outline" size={14} color={C.border} /></View>}
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

      <RecsModal visible={modalVisible} onClose={() => setModalVisible(false)} post={item.post} user={item.user}
        currentUserId={currentUserId} apiBase={apiBase} colors={C} />
    </>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/feed"],
    queryFn: async () => {
      const url = new URL("/api/feed", apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load feed");
      return res.json() as Promise<{ posts: any[]; competitions: any[] }>;
    },
    refetchInterval: 30000,
  });

  const posts = data?.posts ?? [];
  const competitions = data?.competitions ?? [];

  // Merge competitions and posts into a single list sorted by date
  const feedItems: any[] = [
    ...competitions.map((c: any) => ({ ...c, _type: "competition", _date: c.competition.createdAt })),
    ...posts.map((p: any) => ({ ...p, _type: "post", _date: p.post.createdAt })),
  ].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());

  return (
    <View style={[fS.container, { backgroundColor: C.background }]}>
      <View style={[fS.header, { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        <Text style={[fS.headerTitle, { color: C.text }]}>Feed</Text>
        <Text style={[fS.headerSub, { color: C.textSecondary }]}>Haircuts from the community</Text>
      </View>

      {isLoading ? (
        <View style={fS.center}><ActivityIndicator color={C.gold} size="large" /></View>
      ) : feedItems.length === 0 ? (
        <View style={fS.center}>
          <Ionicons name="images-outline" size={52} color={C.border} />
          <Text style={[fS.emptyTitle, { color: C.text }]}>No posts yet</Text>
          <Text style={[fS.emptyText, { color: C.textSecondary }]}>Share your CutMatch results to appear here</Text>
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={(item, i) => `${item._type}-${item._type === "competition" ? item.competition.id : item.post.id}-${i}`}
          renderItem={({ item }) => {
            if (item._type === "competition") {
              return (
                <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <CompetitionBanner item={item} colors={C} />
                </View>
              );
            }
            return <PostCard item={item} currentUserId={currentUser?.id ?? null} apiBase={apiBase} colors={C} />;
          }}
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
  faceLabel: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
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

const bS = StyleSheet.create({
  banner: { borderRadius: 20, borderWidth: 1.5, overflow: "hidden", padding: 16, gap: 12 },
  bannerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  competitionTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  competitionTagText: { fontSize: 12, fontFamily: "DMSans_700Bold" },
  timerTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  timerText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  vsTitle: { fontSize: 18, fontFamily: "DMSans_700Bold", textAlign: "center" },
  competitors: { flexDirection: "row", gap: 0, position: "relative" },
  side: { flex: 1, alignItems: "center", gap: 6 },
  sideName: { fontSize: 13, fontFamily: "DMSans_700Bold", textAlign: "center" },
  sideImgBox: { width: "90%", aspectRatio: 0.9, borderRadius: 14, overflow: "hidden" },
  sideImg: { width: "100%", height: "100%" },
  sideImgEmpty: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  cutName: { fontSize: 11, fontFamily: "DMSans_500Medium", textAlign: "center" },
  voteBar: { width: "85%", height: 4, borderRadius: 2, overflow: "hidden" },
  voteBarFill: { height: "100%", borderRadius: 2 },
  votePct: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  vsCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 10 },
  vsText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  tapToVote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12 },
  tapToVoteText: { fontSize: 14, fontFamily: "DMSans_700Bold" },
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
  recImgBox: { width: 72, height: 88, borderRadius: 10, overflow: "hidden" },
  recImg: { width: "100%", height: "100%" },
  recImgPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
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
