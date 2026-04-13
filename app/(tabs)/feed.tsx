import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
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

type FeedFilter = "all" | "posts" | "competitions";

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

function FilterPills({ active, onChange, colors: C }: { active: FeedFilter; onChange: (f: FeedFilter) => void; colors: any }) {
  const filters: { key: FeedFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "competitions", label: "Competitions" },
    { key: "posts", label: "Posts" },
  ];
  const pillScales = useRef(filters.map(() => new Animated.Value(1))).current;

  const handlePress = (key: FeedFilter, idx: number) => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
    Animated.sequence([
      Animated.spring(pillScales[idx], { toValue: 0.88, useNativeDriver: true, speed: 60, bounciness: 2 }),
      Animated.spring(pillScales[idx], { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }),
    ]).start();
    onChange(key);
  };

  return (
    <View style={fpS.row}>
      {filters.map((f, i) => {
        const isActive = active === f.key;
        return (
          <Animated.View key={f.key} style={{ transform: [{ scale: pillScales[i] }] }}>
            <Pressable
              style={[
                fpS.pill,
                isActive
                  ? { backgroundColor: C.gold, borderColor: C.gold }
                  : { backgroundColor: "transparent", borderColor: C.border },
              ]}
              onPress={() => handlePress(f.key, i)}
            >
              <Text style={[fpS.pillText, { color: isActive ? "#0A0A0A" : C.textSecondary }]}>{f.label}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const fpS = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6 },
  pill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontFamily: "DMSans_500Medium" },
});

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
    Animated.spring(checkScaleAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 18, delay: 80 }).start();
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
  const isLive = comp.status === "active";
  const totalVotes = (comp.challengerVotes ?? 0) + (comp.challengeeVotes ?? 0);
  const cPct = totalVotes > 0 ? Math.round(((comp.challengerVotes ?? 0) / totalVotes) * 100) : 50;
  const ePct = 100 - cPct;

  return (
    <Pressable
      style={[bS.banner, { backgroundColor: C.surface, borderColor: isLive ? C.gold + "70" : C.border }]}
      onPress={() => router.push({ pathname: "/competition/[id]", params: { id: String(comp.id) } } as any)}
    >
      <LinearGradient colors={isLive ? [C.gold + "22", "transparent"] : ["transparent", "transparent"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />

      <View style={bS.bannerTop}>
        <View style={bS.badgeRow}>
          {isLive && (
            <View style={[bS.liveBadge, { backgroundColor: "#FF3B30" }]}>
              <View style={bS.liveDot} />
              <Text style={bS.liveText}>LIVE</Text>
            </View>
          )}
          <View style={[bS.competitionTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "40" }]}>
            <Ionicons name="trophy" size={11} color={C.gold} />
            <Text style={[bS.competitionTagText, { color: C.gold }]}>CutCompetition</Text>
          </View>
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
            <AvatarCircle name={side.user?.displayName || "?"} size={26} avatarUrl={side.user?.avatarUrl} />
            <Text style={[bS.sideName, { color: C.text }]} numberOfLines={1}>{side.user?.displayName || "Waiting..."}</Text>
            <View style={[bS.sideImgBox, { backgroundColor: C.surface2 }]}>
              {side.rec?.generatedImage
                ? <Image source={{ uri: side.rec.generatedImage }} style={bS.sideImg} contentFit="cover" />
                : side.post?.facePhotoUrl
                  ? <Image source={{ uri: side.post.facePhotoUrl }} style={bS.sideImg} contentFit="cover" />
                  : <View style={[bS.sideImgEmpty, { backgroundColor: C.surface2 }]}><Ionicons name="cut-outline" size={20} color={C.border} /></View>}
            </View>
            {side.rec && <Text style={[bS.cutName, { color: C.textSecondary }]} numberOfLines={1}>{side.rec.name}</Text>}
            <View style={[bS.voteBar, { backgroundColor: C.border }]}>
              <View style={[bS.voteBarFill, { width: `${side.pct}%`, backgroundColor: C.gold }]} />
            </View>
            <Text style={[bS.votePct, { color: C.gold }]}>{side.pct}%</Text>
          </View>
        ))}
        <View style={[bS.vsCircle, { backgroundColor: C.gold, position: "absolute", left: "50%", top: "50%", marginLeft: -15, marginTop: -15 }]}>
          <Text style={[bS.vsText, { color: "#0A0A0A" }]}>VS</Text>
        </View>
      </View>

      <View style={[bS.tapToVote, { backgroundColor: C.gold }]}>
        <Text style={[bS.tapToVoteText, { color: "#0A0A0A" }]}>Tap to vote</Text>
        <Ionicons name="arrow-forward" size={13} color="#0A0A0A" />
      </View>
    </Pressable>
  );
}

function PostCard({ item, currentUserId, apiBase, colors: C, compact, showCaptions }: any) {
  const [modalVisible, setModalVisible] = useState(false);
  const recs = item.post.recommendations || [];
  const totalRatings = recs.reduce((s: number, r: any) => s + (r.votesCount ?? 0), 0);

  if (compact) {
    return (
      <>
        <Pressable
          style={[fS.postCardCompact, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={() => setModalVisible(true)}
        >
          <AvatarCircle name={item.user.displayName} size={34} avatarUrl={item.user.avatarUrl} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[fS.postName, { color: C.text, fontSize: 13 }]}>{item.user.displayName}</Text>
              <View style={[fS.shapeTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "30", paddingHorizontal: 7, paddingVertical: 2 }]}>
                <Text style={[fS.shapeTagText, { color: C.gold, fontSize: 10 }]}>{item.post.faceShape}</Text>
              </View>
            </View>
            <Text style={[fS.postMeta, { color: C.textSecondary }]}>@{item.user.username} · {timeAgo(item.post.createdAt)}</Text>
          </View>
          <View style={fS.compactActions}>
            <Ionicons name="star-outline" size={14} color={C.textSecondary} />
            {totalRatings > 0 && <Text style={[fS.ratingCount, { color: C.textSecondary }]}>{totalRatings}</Text>}
            <Ionicons name="chevron-forward" size={14} color={C.border} style={{ marginLeft: 4 }} />
          </View>
        </Pressable>
        <RecsModal visible={modalVisible} onClose={() => setModalVisible(false)} post={item.post} user={item.user}
          currentUserId={currentUserId} apiBase={apiBase} colors={C} />
      </>
    );
  }

  return (
    <>
      <Pressable
        style={[fS.postCard, { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={() => setModalVisible(true)}
      >
        <View style={fS.postHeader}>
          <AvatarCircle name={item.user.displayName} size={36} avatarUrl={item.user.avatarUrl} />
          <View style={fS.postUserInfo}>
            <Text style={[fS.postName, { color: C.text }]}>{item.user.displayName}</Text>
            <Text style={[fS.postMeta, { color: C.textSecondary }]}>@{item.user.username} · {timeAgo(item.post.createdAt)}</Text>
          </View>
          <View style={[fS.shapeTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "30" }]}>
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
                  : <View style={[fS.recThumbPlaceholder, { backgroundColor: C.surface2 }]}><Ionicons name="cut-outline" size={12} color={C.border} /></View>}
                <View style={[fS.rankDot, { backgroundColor: [C.rank1, C.rank2, C.rank3, C.rank4][rec.rank - 1] }]} />
              </View>
            ))}
          </View>
        </View>

        {showCaptions && !!item.post.caption && (
          <Text style={[fS.caption, { color: C.text }]} numberOfLines={2}>{item.post.caption}</Text>
        )}

        <View style={fS.postFooter}>
          <View style={fS.footerAction}>
            <Ionicons name="star-outline" size={14} color={C.textSecondary} />
            <Text style={[fS.footerActionText, { color: C.textSecondary }]}>Rate cuts</Text>
            {totalRatings > 0 && <Text style={[fS.ratingCount, { color: C.textSecondary }]}>{totalRatings}</Text>}
          </View>
          <View style={fS.footerAction}>
            <Text style={[fS.footerActionText, { color: C.textSecondary }]}>View all</Text>
            <Ionicons name="chevron-forward" size={13} color={C.border} />
          </View>
        </View>
      </Pressable>

      <RecsModal visible={modalVisible} onClose={() => setModalVisible(false)} post={item.post} user={item.user}
        currentUserId={currentUserId} apiBase={apiBase} colors={C} />
    </>
  );
}

function AnimatedFeedList({ feedItems, currentUserId, apiBase, colors: C, compact, showCaptions, bottomPad, onRefresh }: any) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;
  const prevItemsRef = useRef(feedItems);

  useEffect(() => {
    if (prevItemsRef.current === feedItems) return;
    prevItemsRef.current = feedItems;
    fadeAnim.setValue(0);
    translateAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, [feedItems]);

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
      <FlatList
        data={feedItems}
        keyExtractor={(item, i) => `${item._type}-${item._type === "competition" ? item.competition.id : item.post.id}-${i}`}
        renderItem={({ item }) => {
          if (item._type === "competition") {
            return (
              <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                <CompetitionBanner item={item} colors={C} />
              </View>
            );
          }
          return (
            <View style={{ paddingHorizontal: 12, paddingVertical: 5 }}>
              <PostCard
                item={item}
                currentUserId={currentUserId}
                apiBase={apiBase}
                colors={C}
                compact={compact}
                showCaptions={showCaptions}
              />
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + bottomPad + 16, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={C.gold} />}
      />
    </Animated.View>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C, settings } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const [filter, setFilter] = useState<FeedFilter>("all");

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

  const feedItems = useMemo(() => {
    const activeComps = competitions.filter((c: any) => c.competition.status === "active");
    const otherComps = competitions.filter((c: any) => c.competition.status !== "active");
    const allItems: any[] = [
      ...activeComps.map((c: any) => ({ ...c, _type: "competition", _priority: 0, _date: c.competition.createdAt })),
      ...otherComps.map((c: any) => ({ ...c, _type: "competition", _priority: 1, _date: c.competition.createdAt })),
      ...posts.map((p: any) => ({ ...p, _type: "post", _priority: 2, _date: p.post.createdAt })),
    ].sort((a, b) => {
      if (a._priority !== b._priority) return a._priority - b._priority;
      return new Date(b._date).getTime() - new Date(a._date).getTime();
    });
    return allItems.filter((item) => {
      if (filter === "all") return true;
      if (filter === "competitions") return item._type === "competition";
      if (filter === "posts") return item._type === "post";
      return true;
    });
  }, [posts, competitions, filter]);

  return (
    <View style={[fS.container, { backgroundColor: C.background }]}>
      <View style={[fS.header, { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
        <View style={fS.headerRow}>
          <Text style={[fS.headerTitle, { color: C.text }]}>Feed</Text>
        </View>
        <FilterPills active={filter} onChange={setFilter} colors={C} />
      </View>

      {isLoading ? (
        <View style={fS.center}><ActivityIndicator color={C.gold} size="large" /></View>
      ) : feedItems.length === 0 ? (
        <View style={fS.center}>
          <Ionicons name="images-outline" size={48} color={C.border} />
          <Text style={[fS.emptyTitle, { color: C.text }]}>Nothing here yet</Text>
          <Text style={[fS.emptyText, { color: C.textSecondary }]}>Share your CutMatch results to appear here</Text>
        </View>
      ) : (
        <AnimatedFeedList
          feedItems={feedItems}
          currentUserId={currentUser?.id ?? null}
          apiBase={apiBase}
          colors={C}
          compact={settings.compactFeedMode}
          showCaptions={settings.showCaptions}
          bottomPad={bottomPad}
          onRefresh={refetch}
        />
      )}
    </View>
  );
}

const fS = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 4 },
  headerTitle: { fontSize: 24, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "DMSans_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", paddingHorizontal: 40 },
  postCard: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  postCardCompact: {
    borderRadius: 14, borderWidth: 1, overflow: "hidden",
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postUserInfo: { flex: 1 },
  postName: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  postMeta: { fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 1 },
  shapeTag: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  shapeTagText: { fontSize: 11, fontFamily: "DMSans_500Medium", textTransform: "capitalize" },
  photoRow: { flexDirection: "row", gap: 6, height: 136 },
  faceBox: { flex: 1, borderRadius: 10, overflow: "hidden", position: "relative" },
  faceImg: { width: "100%", height: "100%" },
  faceLabel: { position: "absolute", bottom: 5, left: 5, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  faceLabelText: { fontSize: 9, fontFamily: "DMSans_500Medium", color: "#fff" },
  recsGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 3 },
  recThumb: { width: "48%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", position: "relative" },
  recThumbImg: { width: "100%", height: "100%" },
  recThumbPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  rankDot: { position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 3.5, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)" },
  caption: { fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  postFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerActionText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  ratingCount: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  compactActions: { flexDirection: "row", alignItems: "center", gap: 3 },
});

const bS = StyleSheet.create({
  banner: { borderRadius: 16, borderWidth: 1.5, overflow: "hidden", padding: 14, gap: 10 },
  bannerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" },
  liveText: { fontSize: 10, fontFamily: "DMSans_700Bold", color: "#fff", letterSpacing: 0.5 },
  competitionTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  competitionTagText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  timerTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  timerText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  vsTitle: { fontSize: 15, fontFamily: "DMSans_700Bold", textAlign: "center" },
  competitors: { flexDirection: "row", gap: 0, position: "relative" },
  side: { flex: 1, alignItems: "center", gap: 5 },
  sideName: { fontSize: 12, fontFamily: "DMSans_700Bold", textAlign: "center" },
  sideImgBox: { width: "88%", aspectRatio: 0.9, borderRadius: 12, overflow: "hidden" },
  sideImg: { width: "100%", height: "100%" },
  sideImgEmpty: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  cutName: { fontSize: 10, fontFamily: "DMSans_500Medium", textAlign: "center" },
  voteBar: { width: "85%", height: 3, borderRadius: 1.5, overflow: "hidden" },
  voteBarFill: { height: "100%", borderRadius: 1.5 },
  votePct: { fontSize: 12, fontFamily: "DMSans_700Bold" },
  vsCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", zIndex: 10 },
  vsText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  tapToVote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10 },
  tapToVoteText: { fontSize: 13, fontFamily: "DMSans_700Bold" },
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
  voteLabel: { fontSize: 12, fontFamily: "DMSans_700Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  recCard: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 11, gap: 12, alignItems: "center" },
  recImgBox: { width: 68, height: 84, borderRadius: 10, overflow: "hidden" },
  recImg: { width: "100%", height: "100%" },
  recImgPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  recInfo: { flex: 1, gap: 4 },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start" },
  rankText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  recName: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  recDesc: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  diffText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  voteCheck: { marginLeft: "auto" },
  friendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  friendBtnText: { fontSize: 14, fontFamily: "DMSans_700Bold" },
});
