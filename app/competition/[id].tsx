import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useApp } from "@/context/AppContext";
import { router, useLocalSearchParams } from "expo-router";
import { fetch } from "expo/fetch";
import { LinearGradient } from "expo-linear-gradient";

export default function CompetitionScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C } = useApp();
  const params = useLocalSearchParams<{ id: string }>();
  const competitionId = parseInt(params.id);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const qc = useQueryClient();
  const [voted, setVoted] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);

  const { data: comp, isLoading: compLoading } = useQuery({
    queryKey: ["/api/competitions", competitionId],
    queryFn: async () => {
      const url = new URL(`/api/competitions/${competitionId}`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: challengerPost } = useQuery({
    queryKey: ["/api/posts", comp?.challengerPostId],
    enabled: !!comp?.challengerPostId,
    queryFn: async () => {
      const url = new URL(`/api/posts/${comp.challengerPostId}`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: challengeePost } = useQuery({
    queryKey: ["/api/posts", comp?.challengeePostId],
    enabled: !!comp?.challengeePostId,
    queryFn: async () => {
      const url = new URL(`/api/posts/${comp.challengeePostId}`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: challengerUser } = useQuery({
    queryKey: ["/api/users", comp?.challengerId],
    enabled: !!comp?.challengerId,
    queryFn: async () => {
      const url = new URL(`/api/users/${comp.challengerId}`, apiBase).toString();
      const res = await fetch(url);
      return res.json();
    },
  });

  const { data: challengeeUser } = useQuery({
    queryKey: ["/api/users", comp?.challengeeId],
    enabled: !!comp?.challengeeId,
    queryFn: async () => {
      const url = new URL(`/api/users/${comp.challengeeId}`, apiBase).toString();
      const res = await fetch(url);
      return res.json();
    },
  });

  const voteFor = async (userId: number) => {
    if (!currentUser || voting) return;
    setVoting(true);
    try {
      const url = new URL(`/api/competitions/${competitionId}/vote`, apiBase).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votedForUserId: userId }),
      });
      if (!res.ok) throw new Error("Vote failed");
      setVoted(userId);
      qc.invalidateQueries({ queryKey: ["/api/competitions", competitionId] });
      Alert.alert("Vote Cast!", "Your vote has been recorded.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setVoting(false);
  };

  const submitMyPost = async () => {
    if (!currentUser) return;
    try {
      const url = new URL(`/api/users/${currentUser.id}/posts`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) return Alert.alert("No Posts", "Complete a CutMatch first.");
      const userPosts = await res.json();
      if (!userPosts.length) return Alert.alert("No Posts", "Complete a CutMatch first to participate.");
      const latest = userPosts[0];
      const submitUrl = new URL(`/api/competitions/${competitionId}/submit`, apiBase).toString();
      const submitRes = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, postId: latest.id }),
      });
      if (!submitRes.ok) throw new Error("Failed to submit");
      qc.invalidateQueries({ queryKey: ["/api/competitions", competitionId] });
      Alert.alert("Submitted!", "Your CutMatch has been entered in the competition.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const isParticipant = currentUser && comp && (comp.challengerId === currentUser.id || comp.challengeeId === currentUser.id);
  const isChallenger = currentUser && comp?.challengerId === currentUser.id;
  const hasSubmitted = isChallenger ? !!comp?.challengerPostId : !!comp?.challengeePostId;
  const isCompleted = comp?.status === "completed";
  const isActive = comp?.status === "active";

  const totalVotes = (comp?.challengerVotes ?? 0) + (comp?.challengeeVotes ?? 0);
  const challengerPct = totalVotes > 0 ? Math.round(((comp?.challengerVotes ?? 0) / totalVotes) * 100) : 50;
  const challengeePct = totalVotes > 0 ? Math.round(((comp?.challengeeVotes ?? 0) / totalVotes) * 100) : 50;

  function getTopRec(post: any) {
    if (!post?.post?.recommendations) return null;
    const recs = post.post.recommendations;
    return recs.find((r: any) => r.rank === 1) || recs[0];
  }

  if (compLoading) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!comp) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <Text style={[styles.errorText, { color: C.text }]}>Competition not found</Text>
      </View>
    );
  }

  const challRec = getTopRec(challengerPost);
  const challeRec = getTopRec(challengeePost);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: C.text }]}>CutCompetition</Text>
          <View style={[styles.statusBadge, { backgroundColor: isCompleted ? "#4CAF5020" : isActive ? C.gold + "20" : C.border + "40",
            borderColor: isCompleted ? "#4CAF5040" : isActive ? C.gold + "40" : C.border }]}>
            <Text style={[styles.statusText, { color: isCompleted ? "#4CAF50" : isActive ? C.gold : C.textSecondary }]}>
              {isCompleted ? "Completed" : isActive ? "Voting Open" : "Pending"}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 30 }]}>
        <View style={[styles.banner, { backgroundColor: C.gold + "10", borderColor: C.gold + "30" }]}>
          <Ionicons name="trophy" size={20} color={C.gold} />
          <Text style={[styles.bannerText, { color: C.gold }]}>Who has the better cut?</Text>
          {comp.expiresAt && (
            <Text style={[styles.bannerSub, { color: C.textSecondary }]}>
              Ends {new Date(comp.expiresAt).toLocaleDateString()}
            </Text>
          )}
        </View>

        {isActive && (
          <View style={[styles.voteBar, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={[styles.voteBarFill, { width: `${challengerPct}%`, backgroundColor: C.gold + "60" }]} />
            <View style={[styles.voteBarFill, { width: `${challengeePct}%`, backgroundColor: C.rank2 + "60" }]} />
          </View>
        )}

        <View style={styles.competitors}>
          {[
            { user: challengerUser, post: challengerPost, rec: challRec, votes: comp.challengerVotes ?? 0, pct: challengerPct, isWinner: isCompleted && comp.winnerId === comp.challengerId },
            { user: challengeeUser, post: challengeePost, rec: challeRec, votes: comp.challengeeVotes ?? 0, pct: challengeePct, isWinner: isCompleted && comp.winnerId === comp.challengeeId },
          ].map((side, idx) => (
            <View key={idx} style={[styles.competitorCard, { backgroundColor: C.surface, borderColor: side.isWinner ? C.gold : C.border }]}>
              {side.isWinner && (
                <LinearGradient colors={[C.gold + "20", "transparent"]} style={StyleSheet.absoluteFill} />
              )}
              {side.isWinner && (
                <View style={[styles.winnerBadge, { backgroundColor: C.gold }]}>
                  <Ionicons name="trophy" size={10} color={C.background} />
                  <Text style={[styles.winnerText, { color: C.background }]}>Winner</Text>
                </View>
              )}

              <Text style={[styles.compUsername, { color: C.textSecondary }]}>
                {side.user ? `@${side.user.username}` : "Waiting..."}
              </Text>

              <View style={[styles.compImgBox, { backgroundColor: C.surface2 }]}>
                {side.rec?.generatedImage ? (
                  <Image source={{ uri: side.rec.generatedImage }} style={styles.compImg} contentFit="cover" />
                ) : side.post?.post?.facePhotoUrl ? (
                  <Image source={{ uri: side.post.post.facePhotoUrl }} style={styles.compImg} contentFit="cover" />
                ) : (
                  <View style={styles.compImgPlaceholder}>
                    <Ionicons name="cut-outline" size={32} color={C.border} />
                    <Text style={[styles.waitingText, { color: C.textSecondary }]}>Awaiting CutMatch...</Text>
                  </View>
                )}
              </View>

              {side.rec && (
                <Text style={[styles.compCutName, { color: C.text }]} numberOfLines={1}>
                  {side.rec.name}
                </Text>
              )}

              {isActive && (
                <View style={styles.votesRow}>
                  <Ionicons name="heart" size={12} color={C.gold} />
                  <Text style={[styles.votesText, { color: C.gold }]}>{side.votes} votes · {side.pct}%</Text>
                </View>
              )}

              {isActive && !voted && currentUser && currentUser.id !== comp.challengerId && currentUser.id !== comp.challengeeId && side.user && (
                <Pressable
                  style={[styles.voteBtn, { backgroundColor: C.gold, opacity: voting ? 0.7 : 1 }]}
                  onPress={() => voteFor(side.user.id)}
                  disabled={voting}
                >
                  {voting ? <ActivityIndicator color={C.background} size="small" /> : (
                    <>
                      <Ionicons name="heart-outline" size={14} color={C.background} />
                      <Text style={[styles.voteBtnText, { color: C.background }]}>Vote</Text>
                    </>
                  )}
                </Pressable>
              )}

              {voted === side.user?.id && (
                <View style={[styles.votedBadge, { backgroundColor: C.gold + "20", borderColor: C.gold + "40" }]}>
                  <Ionicons name="checkmark-circle" size={14} color={C.gold} />
                  <Text style={[styles.votedText, { color: C.gold }]}>You voted</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {isParticipant && !hasSubmitted && !isCompleted && (
          <Pressable style={[styles.submitBtn, { backgroundColor: C.gold }]} onPress={submitMyPost}>
            <Ionicons name="cut-outline" size={18} color={C.background} />
            <Text style={[styles.submitBtnText, { color: C.background }]}>Submit My CutMatch</Text>
          </Pressable>
        )}

        {isParticipant && hasSubmitted && !isActive && (
          <View style={[styles.waitingBanner, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Ionicons name="hourglass-outline" size={20} color={C.textSecondary} />
            <Text style={[styles.waitingBannerText, { color: C.textSecondary }]}>
              Waiting for the other participant to submit their CutMatch
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, fontFamily: "DMSans_400Regular" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerCenter: { flex: 1, alignItems: "center", gap: 4 },
  headerTitle: { fontSize: 18, fontFamily: "DMSans_700Bold" },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  banner: { borderRadius: 16, borderWidth: 1, padding: 16, alignItems: "center", gap: 6 },
  bannerText: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  bannerSub: { fontSize: 12, fontFamily: "DMSans_400Regular" },
  voteBar: { height: 8, borderRadius: 4, overflow: "hidden", flexDirection: "row", borderWidth: 1 },
  voteBarFill: { height: "100%" },
  competitors: { flexDirection: "row", gap: 12 },
  competitorCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 12, gap: 8, overflow: "hidden", alignItems: "center" },
  winnerBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: "center" },
  winnerText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  compUsername: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  compImgBox: { width: "100%", aspectRatio: 0.85, borderRadius: 12, overflow: "hidden" },
  compImg: { width: "100%", height: "100%" },
  compImgPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 8 },
  waitingText: { fontSize: 11, fontFamily: "DMSans_400Regular", textAlign: "center", paddingHorizontal: 8 },
  compCutName: { fontSize: 12, fontFamily: "DMSans_700Bold", textAlign: "center" },
  votesRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  votesText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  voteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  voteBtnText: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  votedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  votedText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 16 },
  submitBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  waitingBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  waitingBannerText: { flex: 1, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 19 },
});
