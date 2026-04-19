import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useApp } from "@/context/AppContext";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import { isLiquidGlass, LG_BLUR_INTENSITY, LG_BORDER_GLOW, LG_SURFACE_BG_DARK, LG_SURFACE_BG_LIGHT } from "@/lib/liquidGlass";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;

interface CutRecommendation {
  rank: number;
  name: string;
  description: string;
  difficulty: string;
  generatedImage: string | null;
  votesCount: number;
}

interface MyCutPost {
  id: number;
  userId: number;
  faceShape: string;
  facePhotoUrl: string | null;
  caption: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  createdAt: string;
  recommendations: CutRecommendation[];
}

interface AppColors {
  background: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textSecondary: string;
  gold: string;
  rank1: string;
  rank2: string;
  rank3: string;
  rank4: string;
}

interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function timeLeft(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 24) return `${Math.floor(hrs / 24)}d left`;
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

function MyCutDetailModal({ post, user, visible, onClose, colors: C }: {
  post: MyCutPost | null;
  user: CurrentUser | null;
  visible: boolean;
  onClose: () => void;
  colors: AppColors;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const recs = post?.recommendations || [];
  const totalVotes = recs.reduce((s, r) => s + (r.votesCount ?? 0), 0);
  const rankColors = [C.rank1, C.rank2, C.rank3, C.rank4];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[dS.overlay, { paddingTop: topPad }]}>
        <View style={[dS.sheet, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[dS.handle, { backgroundColor: C.border }]} />
          <View style={[dS.header, { borderBottomColor: C.border }]}>
            <AvatarCircle name={user?.displayName || "?"} size={34} avatarUrl={user?.avatarUrl} />
            <View style={{ flex: 1 }}>
              <Text style={[dS.name, { color: C.text }]}>{user?.displayName}</Text>
              <Text style={[dS.meta, { color: C.textSecondary }]}>{post?.faceShape} · {post ? timeAgo(post.createdAt) : ""}</Text>
            </View>
            <Pressable onPress={onClose} style={dS.closeBtn}>
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16 }}>
            <Text style={[dS.sectionLabel, { color: C.gold }]}>Vote Results — {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}</Text>
            {recs.map((rec, i) => {
              const color = rankColors[i] ?? C.textSecondary;
              const votes = rec.votesCount ?? 0;
              const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
              return (
                <View key={rec.rank} style={[dS.recRow, { backgroundColor: C.surface2, borderColor: C.border }]}>
                  <View style={[dS.rankBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                    {rec.rank === 1 && <Ionicons name="trophy" size={10} color={color} />}
                    <Text style={[dS.rankText, { color }]}>#{rec.rank}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[dS.recName, { color: C.text }]}>{rec.name}</Text>
                    <View style={[dS.voteBar, { backgroundColor: C.border }]}>
                      <View style={[dS.voteBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                  <View style={dS.voteCount}>
                    <Text style={[dS.votePct, { color }]}>{pct}%</Text>
                    <Text style={[dS.voteNum, { color: C.textSecondary }]}>{votes} vote{votes !== 1 ? "s" : ""}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MyCutCard({ post, user, colors: C }: { post: MyCutPost; user: CurrentUser; colors: AppColors }) {
  const [modalVisible, setModalVisible] = useState(false);
  const recs = post.recommendations || [];
  const totalVotes = recs.reduce((s, r) => s + (r.votesCount ?? 0), 0);
  const isDark = C.background === "#0A0A0A";
  const glassBg = isDark ? LG_SURFACE_BG_DARK : LG_SURFACE_BG_LIGHT;
  const expires = timeLeft(post.expiresAt);
  const rankColors = [C.rank1, C.rank2, C.rank3, C.rank4];

  return (
    <>
      <Pressable
        style={[cS.card, isLiquidGlass
          ? { backgroundColor: glassBg, borderColor: LG_BORDER_GLOW, overflow: "hidden" }
          : { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={() => {
          Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
          setModalVisible(true);
        }}
      >
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}

        <View style={cS.header}>
          <View style={[cS.shapeTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "30" }]}>
            <Text style={[cS.shapeText, { color: C.gold }]}>{post.faceShape}</Text>
          </View>
          <Text style={[cS.meta, { color: C.textSecondary }]}>{timeAgo(post.createdAt)}</Text>
          {expires && (
            <View style={[cS.timerTag, { backgroundColor: C.surface2, borderColor: C.border }]}>
              <Ionicons name="timer-outline" size={10} color={C.textSecondary} />
              <Text style={[cS.timerText, { color: C.textSecondary }]}>{expires}</Text>
            </View>
          )}
        </View>

        <View style={cS.recGrid}>
          {recs.slice(0, 4).map((rec, i) => {
            const color = rankColors[i] ?? C.textSecondary;
            const votes = rec.votesCount ?? 0;
            return (
              <View key={rec.rank} style={[cS.recThumb, { backgroundColor: C.surface2, borderColor: C.border }]}>
                {rec.generatedImage ? (
                  <Image source={{ uri: rec.generatedImage }} style={cS.recImg} contentFit="cover" />
                ) : (
                  <View style={[cS.recImgPlaceholder, { backgroundColor: C.surface }]}>
                    <Ionicons name="cut-outline" size={14} color={C.border} />
                  </View>
                )}
                <View style={[cS.rankDot, { backgroundColor: color }]} />
                <View style={[cS.voteBadge, { backgroundColor: C.surface + "cc" }]}>
                  <Text style={[cS.voteBadgeText, { color }]}>{votes}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={cS.footer}>
          <View style={cS.footerLeft}>
            <Ionicons name="star" size={13} color={C.gold} />
            <Text style={[cS.footerText, { color: C.textSecondary }]}>
              {totalVotes} vote{totalVotes !== 1 ? "s" : ""} total
            </Text>
          </View>
          <View style={cS.footerRight}>
            <Text style={[cS.footerText, { color: C.textSecondary }]}>View breakdown</Text>
            <Ionicons name="chevron-forward" size={13} color={C.border} />
          </View>
        </View>
      </Pressable>

      <MyCutDetailModal
        post={post}
        user={user}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        colors={C}
      />
    </>
  );
}

export default function MyCutsScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, isLoadingUser, colors: C } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const isDark = C.background === "#0A0A0A";

  const { data: myCuts = [], isLoading, refetch, isRefetching } = useQuery<MyCutPost[]>({
    queryKey: ["/api/my-cuts", currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${currentUser!.id}/my-cuts`, apiBase).toString());
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoadingUser) {
    return <View style={[s.center, { backgroundColor: C.background }]}><ActivityIndicator color={C.gold} /></View>;
  }

  if (!currentUser) {
    return (
      <View style={[s.container, { backgroundColor: C.background }]}>
        <View style={[s.headerBar, isLiquidGlass
          ? { paddingTop: topPad + 10, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
          : { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
          {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
          <Text style={[s.title, { color: C.text }]}>My Cuts</Text>
        </View>
        <View style={s.center}>
          <Ionicons name="cut-outline" size={56} color={C.border} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Your cut matches</Text>
          <Text style={[s.emptyText, { color: C.textSecondary }]}>Sign in to see your posted cut matches and vote results</Text>
          <Pressable style={[s.joinBtn, { backgroundColor: C.gold }]} onPress={() => router.replace("/auth" as any)}>
            <Text style={[s.joinBtnText, { color: C.background }]}>Sign Up / Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      <View style={[s.headerBar, isLiquidGlass
        ? { paddingTop: topPad + 10, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
        : { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
        <Text style={[s.title, { color: C.text }]}>My Cuts</Text>
        <Text style={[s.subtitle, { color: C.textSecondary }]}>{myCuts.length} active post{myCuts.length !== 1 ? "s" : ""}</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={C.gold} /></View>
      ) : (
        <FlatList
          data={myCuts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: TAB_BAR_HEIGHT + bottomPad + 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={C.gold}
              colors={[C.gold]}
            />
          }
          ListEmptyComponent={
            <View style={[s.center, { paddingTop: 80 }]}>
              <Ionicons name="cut-outline" size={56} color={C.border} />
              <Text style={[s.emptyTitle, { color: C.text }]}>No cut matches yet</Text>
              <Text style={[s.emptyText, { color: C.textSecondary }]}>
                Post a cut match from the CutMatch tab — it will appear here with vote results. Posts expire after 3 days.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MyCutCard post={item} user={currentUser as CurrentUser} colors={C as AppColors} />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontFamily: "DMSans_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "DMSans_700Bold", textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 19 },
  joinBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  joinBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold" },
});

const cS = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  shapeTag: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  shapeText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  meta: { fontSize: 12, fontFamily: "DMSans_400Regular", flex: 1 },
  timerTag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  timerText: { fontSize: 10, fontFamily: "DMSans_500Medium" },
  recGrid: { flexDirection: "row", gap: 8 },
  recThumb: { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: "hidden", borderWidth: 1, position: "relative" },
  recImg: { width: "100%", height: "100%" },
  recImgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  rankDot: { position: "absolute", top: 5, left: 5, width: 8, height: 8, borderRadius: 4 },
  voteBadge: { position: "absolute", bottom: 4, right: 4, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  voteBadgeText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 3 },
  footerText: { fontSize: 12, fontFamily: "DMSans_400Regular" },
});

const dS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, maxHeight: "85%" },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  meta: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 1 },
  closeBtn: { padding: 4 },
  sectionLabel: { fontSize: 13, fontFamily: "DMSans_700Bold", marginBottom: 12 },
  recRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  rankText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  recName: { fontSize: 13, fontFamily: "DMSans_700Bold", marginBottom: 5 },
  voteBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  voteBarFill: { height: "100%", borderRadius: 2 },
  voteCount: { alignItems: "flex-end", minWidth: 52 },
  votePct: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  voteNum: { fontSize: 10, fontFamily: "DMSans_400Regular", marginTop: 1 },
});
