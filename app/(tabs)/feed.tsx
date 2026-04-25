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
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useApp } from "@/context/AppContext";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import { isLiquidGlass, LG_BLUR_INTENSITY, LG_BORDER_GLOW, LG_SURFACE_BG_DARK, LG_SURFACE_BG_LIGHT } from "@/lib/liquidGlass";

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

function ImageWithFallback({ uri, style, contentFit = "cover", fallbackSize = 16, borderColor = "#333" }: {
  uri?: string | null; style: any; contentFit?: any; fallbackSize?: number; borderColor?: string;
}) {
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [uri]);
  if (!uri || errored) {
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor }]}>
        <Ionicons name="image-outline" size={fallbackSize} color={borderColor} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      onError={() => setErrored(true)}
    />
  );
}

function FaceImage({ uri, style, borderColor }: { uri?: string | null; style: any; borderColor: string }) {
  return <ImageWithFallback uri={uri} style={style} fallbackSize={18} borderColor={borderColor} />;
}
function RecThumbImage({ uri, style, borderColor }: { uri?: string | null; style: any; borderColor: string }) {
  return <ImageWithFallback uri={uri} style={style} fallbackSize={12} borderColor={borderColor} />;
}
function CompBannerImage({ uri, style, borderColor }: { uri?: string | null; style: any; borderColor: string }) {
  return <ImageWithFallback uri={uri} style={style} fallbackSize={20} borderColor={borderColor} />;
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

function CompetitionBanner({ item, colors: C }: { item: any; colors: any }) {
  const challRec = item.challengerPost?.recommendations?.find((r: any) => r.rank === 1) || item.challengerPost?.recommendations?.[0];
  const challeRec = item.challengeePost?.recommendations?.find((r: any) => r.rank === 1) || item.challengeePost?.recommendations?.[0];
  const comp = item.competition;
  const isLive = comp.status === "active";
  const totalVotes = (comp.challengerVotes ?? 0) + (comp.challengeeVotes ?? 0);
  const cPct = totalVotes > 0 ? Math.round(((comp.challengerVotes ?? 0) / totalVotes) * 100) : 50;
  const ePct = 100 - cPct;
  const isDark = C.background === "#0A0A0A";
  const glassBg = isDark ? LG_SURFACE_BG_DARK : LG_SURFACE_BG_LIGHT;

  return (
    <Pressable
      style={[bS.banner, isLiquidGlass
        ? { backgroundColor: glassBg, borderColor: isLive ? C.gold + "70" : LG_BORDER_GLOW, overflow: "hidden" }
        : { backgroundColor: C.surface, borderColor: isLive ? C.gold + "70" : C.border }]}
      onPress={() => router.push({ pathname: "/competition/[id]", params: { id: String(comp.id) } } as any)}
    >
      {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
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
            <Pressable onPress={() => side.user && router.push({ pathname: "/profile/[userId]", params: { userId: String(side.user.id) } } as any)}>
              <AvatarCircle name={side.user?.displayName || "?"} size={26} avatarUrl={side.user?.avatarUrl} />
            </Pressable>
            <Pressable onPress={() => side.user && router.push({ pathname: "/profile/[userId]", params: { userId: String(side.user.id) } } as any)}>
              <Text style={[bS.sideName, { color: C.text }]} numberOfLines={1}>{side.user?.displayName || "Waiting..."}</Text>
            </Pressable>
            <View style={[bS.sideImgBox, { backgroundColor: C.surface2 }]}>
              {side.rec?.generatedImage
                ? <CompBannerImage uri={side.rec.generatedImage} style={bS.sideImg} borderColor={C.border} />
                : side.post?.facePhotoUrl
                  ? <CompBannerImage uri={side.post.facePhotoUrl} style={bS.sideImg} borderColor={C.border} />
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
  const recs = item.post.recommendations || [];
  const totalRatings = recs.reduce((s: number, r: any) => s + (r.votesCount ?? 0), 0);
  const isDark = C.background === "#0A0A0A";
  const glassBg = isDark ? LG_SURFACE_BG_DARK : LG_SURFACE_BG_LIGHT;

  const goToDetail = () => {
    router.push({ pathname: "/cutmatch/[id]", params: { id: String(item.post.id) } } as any);
  };
  const goToProfile = () => {
    router.push({ pathname: "/profile/[userId]", params: { userId: String(item.user.id) } } as any);
  };

  if (compact) {
    return (
      <Pressable
        style={[fS.postCardCompact, isLiquidGlass
          ? { backgroundColor: glassBg, borderColor: LG_BORDER_GLOW, overflow: "hidden" }
          : { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={goToDetail}
      >
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
        <Pressable onPress={goToProfile}>
          <AvatarCircle name={item.user.displayName} size={34} avatarUrl={item.user.avatarUrl} />
        </Pressable>
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable onPress={goToProfile}>
              <Text style={[fS.postName, { color: C.text, fontSize: 13 }]}>{item.user.displayName}</Text>
            </Pressable>
            <View style={[fS.shapeTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "30", paddingHorizontal: 7, paddingVertical: 2 }]}>
              <Text style={[fS.shapeTagText, { color: C.gold, fontSize: 10 }]}>{item.post.faceShape}</Text>
            </View>
          </View>
          <Text style={[fS.postMeta, { color: C.textSecondary }]}>@{item.user.username} · {timeAgo(item.post.createdAt)}</Text>
        </View>
        <View style={fS.compactActions}>
          <Ionicons name="star-outline" size={14} color={C.textSecondary} />
          {totalRatings > 0 && <Text style={[fS.ratingCount, { color: C.textSecondary }]}>{totalRatings}</Text>}
          {(item.post.commentCount ?? 0) > 0 && (
            <>
              <Ionicons name="chatbubble-outline" size={13} color={C.textSecondary} style={{ marginLeft: 6 }} />
              <Text style={[fS.ratingCount, { color: C.textSecondary }]}>{item.post.commentCount}</Text>
            </>
          )}
          <Ionicons name="chevron-forward" size={14} color={C.border} style={{ marginLeft: 4 }} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[fS.postCard, isLiquidGlass
        ? { backgroundColor: glassBg, borderColor: LG_BORDER_GLOW, overflow: "hidden" }
        : { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={goToDetail}
    >
      {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
      <View style={fS.postHeader}>
        <Pressable onPress={goToProfile}>
          <AvatarCircle name={item.user.displayName} size={36} avatarUrl={item.user.avatarUrl} />
        </Pressable>
        <Pressable style={fS.postUserInfo} onPress={goToProfile}>
          <Text style={[fS.postName, { color: C.text }]}>{item.user.displayName}</Text>
          <Text style={[fS.postMeta, { color: C.textSecondary }]}>@{item.user.username} · {timeAgo(item.post.createdAt)}</Text>
        </Pressable>
        <View style={[fS.shapeTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "30" }]}>
          <Text style={[fS.shapeTagText, { color: C.gold }]}>{item.post.faceShape}</Text>
        </View>
      </View>

      <View style={fS.photoRow}>
        <View style={[fS.faceBox, { backgroundColor: C.surface2 }]}>
          <FaceImage uri={item.post.facePhotoUrl} style={fS.faceImg} borderColor={C.border} />
          <View style={fS.faceLabel}><Text style={fS.faceLabelText}>Original</Text></View>
        </View>
        <View style={fS.recsGrid}>
          {recs.slice(0, 4).map((rec: any) => (
            <View key={rec.rank} style={[fS.recThumb, { backgroundColor: C.surface2 }]}>
              {rec.generatedImage
                ? <RecThumbImage uri={rec.generatedImage} style={fS.recThumbImg} borderColor={C.border} />
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
          {(item.post.commentCount ?? 0) > 0 && (
            <>
              <Ionicons name="chatbubble-outline" size={13} color={C.textSecondary} style={{ marginLeft: 6 }} />
              <Text style={[fS.ratingCount, { color: C.textSecondary }]}>{item.post.commentCount}</Text>
            </>
          )}
        </View>
        <View style={fS.footerAction}>
          <Text style={[fS.footerActionText, { color: C.textSecondary }]}>View all</Text>
          <Ionicons name="chevron-forward" size={13} color={C.border} />
        </View>
      </View>
    </Pressable>
  );
}

function AnimatedFeedList({
  feedItems, currentUserId, apiBase, colors: C, compact, showCaptions, bottomPad,
  onRefresh, isRefreshing, onLoadMore, isLoadingMore, hasMore, resetKey,
}: any) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;
  const prevResetKey = useRef(resetKey);

  useEffect(() => {
    if (prevResetKey.current === resetKey) return;
    prevResetKey.current = resetKey;
    fadeAnim.setValue(0);
    translateAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, [resetKey]);

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        {isLoadingMore
          ? <ActivityIndicator color={C.gold} size="small" />
          : null}
      </View>
    );
  };

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
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        onEndReached={hasMore && !isLoadingMore ? onLoadMore : undefined}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
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

  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const fetchFeed = useCallback(async (cursor?: string, append = false) => {
    try {
      const url = new URL("/api/feed", apiBase);
      if (cursor) url.searchParams.set("cursor", cursor);
      url.searchParams.set("limit", "20");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load feed");
      const data = await res.json() as { posts: any[]; competitions: any[]; nextCursor: string | null };
      if (append) {
        setAllPosts((prev) => [...prev, ...data.posts]);
      } else {
        setAllPosts(data.posts);
        setCompetitions(data.competitions);
        setResetKey((k) => k + 1);
      }
      setNextCursor(data.nextCursor);
    } catch (e) {
      console.error("Feed fetch error:", e);
    }
  }, [apiBase]);

  useEffect(() => {
    setIsLoading(true);
    fetchFeed().finally(() => setIsLoading(false));
  }, [fetchFeed]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchFeed();
    setIsRefreshing(false);
  }, [fetchFeed]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    await fetchFeed(nextCursor, true);
    setIsLoadingMore(false);
  }, [nextCursor, isLoadingMore, fetchFeed]);

  useEffect(() => {
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  const feedItems = useMemo(() => {
    const activeComps = competitions.filter((c: any) => c.competition.status === "active");
    const otherComps = competitions.filter((c: any) => c.competition.status !== "active");
    const allItems: any[] = [
      ...activeComps.map((c: any) => ({ ...c, _type: "competition", _priority: 0, _date: c.competition.createdAt })),
      ...otherComps.map((c: any) => ({ ...c, _type: "competition", _priority: 1, _date: c.competition.createdAt })),
      ...allPosts.map((p: any) => ({ ...p, _type: "post", _priority: 2, _date: p.post.createdAt })),
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
  }, [allPosts, competitions, filter]);

  const isDark = C.background === "#0A0A0A";

  return (
    <View style={[fS.container, { backgroundColor: C.background }]}>
      <View style={[fS.header, isLiquidGlass
        ? { paddingTop: topPad + 10, borderBottomColor: "transparent", backgroundColor: "transparent", overflow: "hidden" }
        : { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
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
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onLoadMore={handleLoadMore}
          isLoadingMore={isLoadingMore}
          hasMore={!!nextCursor}
          resetKey={resetKey}
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

