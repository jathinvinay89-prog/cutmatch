import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useApp } from "@/context/AppContext";
import { router, useLocalSearchParams } from "expo-router";
import { fetch } from "expo/fetch";
import { isLiquidGlass, LG_BLUR_INTENSITY, LG_BORDER_GLOW, LG_SURFACE_BG_DARK, LG_SURFACE_BG_LIGHT } from "@/lib/liquidGlass";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function AvatarCircle({ name, size = 36, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
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

function ImageWithFallback({ uri, style, fallbackSize = 16, borderColor = "#333" }: {
  uri?: string | null; style: any; fallbackSize?: number; borderColor?: string;
}) {
  const [errored, setErrored] = useState(false);
  React.useEffect(() => { setErrored(false); }, [uri]);
  const safeUri = uri && uri.startsWith("http") ? uri.replace(/\/uploads\//, "/api/uploads/") : uri;
  if (!safeUri || errored) {
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor }]}>
        <Ionicons name="image-outline" size={fallbackSize} color={borderColor} />
      </View>
    );
  }
  return (
    <Image source={{ uri: safeUri }} style={style} contentFit="cover" cachePolicy="memory-disk" onError={() => setErrored(true)} />
  );
}

export default function CutmatchDetailScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C } = useApp();
  const params = useLocalSearchParams<{ id: string }>();
  const postId = parseInt(params.id);
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const isDark = C.background === "#0A0A0A";
  const glassBg = isDark ? LG_SURFACE_BG_DARK : LG_SURFACE_BG_LIGHT;

  const [userRank, setUserRank] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const { data: postData, isLoading: postLoading, refetch: refetchPost } = useQuery({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/posts/${postId}`, apiBase).toString());
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: commentsPage, isLoading: commentsLoading, refetch: refetchComments } = useQuery<{ data: any[]; offset: number; limit: number; hasMore: boolean }>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/posts/${postId}/comments?limit=50`, apiBase).toString());
      if (!res.ok) return { data: [], offset: 0, limit: 50, hasMore: false };
      return res.json();
    },
  });
  const commentsData = commentsPage?.data ?? [];

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchPost(), refetchComments()]);
  }, [refetchPost, refetchComments]);

  const rate = async (rank: number) => {
    if (!currentUser) return;
    setUserRank(rank);
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
    try {
      await fetch(new URL(`/api/posts/${postId}/rate`, apiBase).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, rank }),
      });
    } catch {}
  };

  const submitComment = async () => {
    if (!currentUser || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(new URL(`/api/posts/${postId}/comments`, apiBase).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, text: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText("");
        qc.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
        refetchComments();
      }
    } catch {}
    setSubmittingComment(false);
  };

  const deleteComment = async (commentId: number) => {
    if (!currentUser) return;
    Alert.alert("Delete Comment", "Remove this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await fetch(new URL(`/api/comments/${commentId}`, apiBase).toString(), {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: currentUser.id }),
            });
            qc.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
            refetchComments();
          } catch {}
        }
      },
    ]);
  };

  if (postLoading) {
    return (
      <View style={[s.container, { backgroundColor: C.background }]}>
        <View style={[s.header, isLiquidGlass
          ? { paddingTop: topPad + 12, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
          : { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
          {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
          <Pressable style={[s.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.headerTitle, { color: C.text }]}>CutMatch</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.center}><ActivityIndicator color={C.gold} size="large" /></View>
      </View>
    );
  }

  if (!postData) {
    return (
      <View style={[s.container, { backgroundColor: C.background }]}>
        <View style={[s.header, isLiquidGlass
          ? { paddingTop: topPad + 12, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
          : { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
          {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
          <Pressable style={[s.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.headerTitle, { color: C.text }]}>CutMatch</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.center}><Text style={{ color: C.textSecondary }}>Post not found</Text></View>
      </View>
    );
  }

  const { post, user } = postData;
  const recs = post.recommendations || [];
  const rankColors: Record<number, string> = { 1: C.rank1, 2: C.rank2, 3: C.rank3, 4: C.rank4 };
  const diffColor = (d: string) => d === "Easy" ? "#4CAF50" : d === "Medium" ? "#FF9800" : "#F44336";

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      <View style={[s.header, isLiquidGlass
        ? { paddingTop: topPad + 12, backgroundColor: "transparent", borderBottomColor: "transparent", overflow: "hidden" }
        : { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
        <Pressable style={[s.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: C.text }]}>CutMatch</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchAll} tintColor={C.gold} />}
        >
          {/* Poster header — taps to profile */}
          <Pressable
            style={[s.posterHeader, isLiquidGlass
              ? { backgroundColor: glassBg, borderColor: LG_BORDER_GLOW, overflow: "hidden" }
              : { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: String(user.id) } } as any)}
          >
            {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
            <AvatarCircle name={user.displayName} size={44} avatarUrl={user.avatarUrl} />
            <View style={{ flex: 1 }}>
              <Text style={[s.posterName, { color: C.text }]}>{user.displayName}</Text>
              <Text style={[s.posterMeta, { color: C.textSecondary }]}>@{user.username} · {timeAgo(post.createdAt)}</Text>
            </View>
            <View style={[s.shapeTag, { backgroundColor: C.gold + "18", borderColor: C.gold + "30" }]}>
              <Text style={[s.shapeTagText, { color: C.gold }]}>{post.faceShape}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.border} style={{ marginLeft: 4 }} />
          </Pressable>

          {/* Caption */}
          {!!post.caption && (
            <Text style={[s.caption, { color: C.text }]}>{post.caption}</Text>
          )}

          {/* Original face photo */}
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text style={[s.sectionLabel, { color: C.textSecondary }]}>ORIGINAL PHOTO</Text>
            <View style={[s.facePhotoBox, { backgroundColor: C.surface2 }]}>
              <ImageWithFallback uri={post.facePhotoUrl} style={s.facePhoto} fallbackSize={32} borderColor={C.border} />
            </View>
          </View>

          {/* Recommendations — vote for the best cut */}
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={[s.sectionLabel, { color: C.textSecondary }]}>VOTE FOR THE BEST CUT</Text>
            {recs.map((rec: any) => {
              const color = rankColors[rec.rank] ?? C.textSecondary;
              const isVoted = userRank === rec.rank;
              return (
                <Pressable
                  key={rec.rank}
                  style={[s.recCard, isLiquidGlass
                    ? { backgroundColor: glassBg, borderColor: isVoted ? color + "80" : LG_BORDER_GLOW, overflow: "hidden" }
                    : { backgroundColor: isVoted ? color + "10" : C.surface, borderColor: isVoted ? color + "60" : C.border }]}
                  onPress={() => rate(rec.rank)}
                >
                  {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
                  <View style={s.recImgBox}>
                    <ImageWithFallback uri={rec.generatedImage} style={s.recImg} fallbackSize={20} borderColor={C.border} />
                  </View>
                  <View style={s.recInfo}>
                    <View style={[s.rankBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                      {rec.rank === 1 && <Ionicons name="trophy" size={10} color={color} />}
                      <Text style={[s.rankText, { color }]}>#{rec.rank}</Text>
                    </View>
                    <Text style={[s.recName, { color: C.text }]}>{rec.name}</Text>
                    <Text style={[s.recDesc, { color: C.textSecondary }]} numberOfLines={2}>{rec.description}</Text>
                    <View style={s.diffRow}>
                      <View style={[s.diffDot, { backgroundColor: diffColor(rec.difficulty) }]} />
                      <Text style={[s.diffText, { color: diffColor(rec.difficulty) }]}>{rec.difficulty}</Text>
                    </View>
                  </View>
                  {isVoted && (
                    <View style={s.voteCheck}>
                      <Ionicons name="checkmark-circle" size={24} color={color} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Comments section */}
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Text style={[s.sectionLabel, { color: C.textSecondary }]}>
              COMMENTS ({commentsData.length})
            </Text>

            {commentsLoading && <ActivityIndicator color={C.gold} style={{ marginVertical: 12 }} />}

            {commentsData.length === 0 && !commentsLoading && (
              <Text style={[s.emptyComments, { color: C.textSecondary }]}>No comments yet. Be the first!</Text>
            )}

            {commentsData.map((comment: any) => (
              <View key={comment.id} style={[s.commentRow, { borderBottomColor: C.border }]}>
                <Pressable onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: String(comment.user.id) } } as any)}>
                  <AvatarCircle name={comment.user.displayName} size={32} avatarUrl={comment.user.avatarUrl} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={s.commentHeader}>
                    <Pressable onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: String(comment.user.id) } } as any)}>
                      <Text style={[s.commentAuthor, { color: C.text }]}>{comment.user.displayName}</Text>
                    </Pressable>
                    <Text style={[s.commentTime, { color: C.textSecondary }]}>{timeAgo(comment.createdAt)}</Text>
                  </View>
                  <Text style={[s.commentText, { color: C.text }]}>{comment.text}</Text>
                </View>
                {currentUser && comment.userId === currentUser.id && (
                  <Pressable onPress={() => deleteComment(comment.id)} style={s.deleteBtn}>
                    <Ionicons name="trash-outline" size={14} color={C.textSecondary} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Comment input bar */}
        {currentUser && (
          <View style={[s.inputBar, { borderTopColor: C.border, backgroundColor: isLiquidGlass ? "transparent" : C.background, paddingBottom: bottomPad + 8 }]}>
            {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
            <AvatarCircle name={currentUser.displayName} size={30} avatarUrl={currentUser.avatarUrl} />
            <TextInput
              style={[s.commentInput, { backgroundColor: C.surface, borderColor: C.border, color: C.text }]}
              placeholder="Add a comment..."
              placeholderTextColor={C.textSecondary}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={300}
              returnKeyType="send"
              onSubmitEditing={submitComment}
            />
            <Pressable
              style={[s.sendBtn, { backgroundColor: commentText.trim() ? C.gold : C.surface, borderColor: C.border }]}
              onPress={submitComment}
              disabled={!commentText.trim() || submittingComment}
            >
              {submittingComment
                ? <ActivityIndicator size="small" color={C.background} />
                : <Ionicons name="arrow-up" size={16} color={commentText.trim() ? C.background : C.textSecondary} />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "DMSans_700Bold" },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  posterHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 14, marginBottom: 8,
    padding: 14, borderRadius: 16, borderWidth: 1,
  },
  posterName: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  posterMeta: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
  shapeTag: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  shapeTagText: { fontSize: 11, fontFamily: "DMSans_500Medium", textTransform: "capitalize" },
  caption: { fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 20, paddingHorizontal: 16, marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  facePhotoBox: { borderRadius: 16, overflow: "hidden", height: 200 },
  facePhoto: { width: "100%", height: "100%" },
  recCard: {
    flexDirection: "row", borderRadius: 14, borderWidth: 1,
    padding: 12, gap: 12, alignItems: "center", marginBottom: 10,
  },
  recImgBox: { width: 72, height: 88, borderRadius: 10, overflow: "hidden" },
  recImg: { width: "100%", height: "100%" },
  recInfo: { flex: 1, gap: 4 },
  rankBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start",
  },
  rankText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  recName: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  recDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  diffText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  voteCheck: { marginLeft: 4 },
  emptyComments: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", paddingVertical: 16 },
  commentRow: {
    flexDirection: "row", gap: 10, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start",
  },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  commentAuthor: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  commentTime: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  commentText: { fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 18 },
  deleteBtn: { padding: 6 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, fontFamily: "DMSans_400Regular", borderWidth: StyleSheet.hairlineWidth, maxHeight: 80,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
});
