import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Animated,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { useApp } from "@/context/AppContext";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

interface Recommendation {
  rank: number;
  name: string;
  description: string;
  whyItFits: string;
  difficulty: string;
  generatedImage: string | null;
}

interface AnalysisState {
  faceShape: string;
  faceFeatures: string;
  hasGlasses: boolean;
  recommendations: Recommendation[];
}

type Phase = "camera" | "loading" | "results";

export default function CutMatchScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase } = useApp();
  const [phase, setPhase] = useState<Phase>("camera");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Analyzing your face...");
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [caption, setCaption] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const resultsAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const loadingDotAnim = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const animateDots = useCallback(() => {
    loadingDotAnim.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  const showResults = () => {
    setPhase("results");
    Animated.spring(resultsAnim, {
      toValue: 0,
      tension: 60,
      friction: 14,
      useNativeDriver: true,
    }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const pickImage = async (source: "camera" | "gallery") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Camera Access Needed", "Allow camera access in settings.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.8, base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        setSelectedBase64(result.assets[0].base64 ?? null);
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Photo Access Needed", "Allow photo library access in settings.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.8, base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        setSelectedBase64(result.assets[0].base64 ?? null);
      }
    }
  };

  const runAnalysis = async () => {
    if (!selectedImage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("loading");
    setStatusText("Analyzing your face...");
    setAnalysis(null);
    animateDots();

    let base64Data: string;
    if (selectedBase64) {
      base64Data = `data:image/jpeg;base64,${selectedBase64}`;
    } else if (Platform.OS === "web") {
      const r = await fetch(selectedImage);
      const blob = await r.blob();
      base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      Alert.alert("Error", "No image data available.");
      setPhase("camera");
      return;
    }

    try {
      const url = new URL("/api/analyze-stream", apiBase).toString();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Data }),
      });

      if (!response.ok) throw new Error("Analysis failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentAnalysis: AnalysisState | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") {
              setStatusText(event.message);
            } else if (event.type === "analysis") {
              currentAnalysis = {
                faceShape: event.faceShape,
                faceFeatures: event.faceFeatures,
                hasGlasses: event.hasGlasses,
                recommendations: event.recommendations,
              };
              setAnalysis(currentAnalysis);
              setStatusText("Generating your AI looks...");
              showResults();
            } else if (event.type === "image") {
              if (currentAnalysis) {
                currentAnalysis = {
                  ...currentAnalysis,
                  recommendations: currentAnalysis.recommendations.map((r) =>
                    r.rank === event.rank
                      ? { ...r, generatedImage: event.generatedImage }
                      : r
                  ),
                };
                setAnalysis({ ...currentAnalysis });
              }
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch (e: any) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Analysis Failed", err.message || "Please try again.");
      setPhase("camera");
    }
  };

  const resetToCamera = () => {
    Animated.timing(resultsAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setPhase("camera");
      setAnalysis(null);
      setSelectedImage(null);
      setSelectedBase64(null);
    });
  };

  const sharePost = async () => {
    if (!currentUser || !analysis || !selectedImage) return;
    setIsSharing(true);
    try {
      const url = new URL("/api/posts", apiBase).toString();
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          facePhotoUrl: selectedImage,
          faceShape: analysis.faceShape,
          faceFeatures: analysis.faceFeatures,
          hasGlasses: analysis.hasGlasses,
          recommendations: analysis.recommendations,
          caption,
          isPublic: true,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShareModalVisible(false);
      Alert.alert("Shared!", "Your haircut recommendations are now in the Feed.");
      resetToCamera();
    } catch {
      Alert.alert("Error", "Could not share. Try again.");
    }
    setIsSharing(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />

      {/* ── CAMERA PHASE ── */}
      {phase !== "results" && (
        <>
          <View style={[styles.header, { paddingTop: topPad + 12 }]}>
            <Text style={styles.logo}>CutMatch</Text>
            <Text style={styles.tagline}>AI HAIRCUT ADVISOR</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            {selectedImage ? (
              <View style={styles.photoContainer}>
                <Image source={{ uri: selectedImage }} style={styles.photo} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(10,10,10,0.9)"]} style={styles.photoGrad} />
                <Pressable style={styles.changeBtn} onPress={() => { setSelectedImage(null); setSelectedBase64(null); }}>
                  <Feather name="refresh-ccw" size={14} color={Colors.text} />
                  <Text style={styles.changeBtnText}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.uploadBox}>
                <View style={styles.iconRing}>
                  <Ionicons name="person" size={36} color={Colors.gold} />
                </View>
                <Text style={styles.uploadTitle}>Upload your photo</Text>
                <Text style={styles.uploadHint}>
                  Face camera directly.{"\n"}Good lighting = better results.
                </Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <Pressable style={styles.srcBtn} onPress={() => pickImage("camera")}>
                <Ionicons name="camera" size={20} color={Colors.gold} />
                <Text style={styles.srcBtnText}>Camera</Text>
              </Pressable>
              <Pressable style={styles.srcBtn} onPress={() => pickImage("gallery")}>
                <Ionicons name="images" size={20} color={Colors.gold} />
                <Text style={styles.srcBtnText}>Gallery</Text>
              </Pressable>
            </View>

            <View style={styles.pills}>
              {[
                { icon: "scan-outline" as const, label: "Face Shape" },
                { icon: "sparkles-outline" as const, label: "4 Cuts" },
                { icon: "image-outline" as const, label: "AI Photos" },
              ].map((p) => (
                <View key={p.label} style={styles.pill}>
                  <Ionicons name={p.icon} size={16} color={Colors.gold} />
                  <Text style={styles.pillText}>{p.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
            {phase === "loading" ? (
              <View style={styles.loadingBtn}>
                <View style={styles.dots}>
                  {loadingDotAnim.map((d, i) => (
                    <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
                  ))}
                </View>
                <Text style={styles.loadingBtnText}>{statusText}</Text>
              </View>
            ) : (
              <Pressable
                style={[styles.analyzeBtn, !selectedImage && styles.analyzeBtnDisabled]}
                onPress={runAnalysis}
                disabled={!selectedImage}
              >
                <Ionicons name="sparkles" size={18} color={selectedImage ? Colors.background : Colors.textSecondary} />
                <Text style={[styles.analyzeBtnText, !selectedImage && styles.analyzeBtnTextDim]}>
                  Find My Best Cuts
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* ── RESULTS OVERLAY ── */}
      <Animated.View style={[styles.resultsPanel, { transform: [{ translateY: resultsAnim }] }]}>
        <LinearGradient colors={["#0A0A0A", "#141414"]} style={StyleSheet.absoluteFill} />

        <View style={[styles.resultsHeader, { paddingTop: topPad + 12 }]}>
          <Pressable style={styles.backBtn} onPress={resetToCamera}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View>
            <Text style={styles.resultsTitle}>Your Best Cuts</Text>
            {analysis?.faceShape && (
              <Text style={styles.resultsSubtitle}>
                {analysis.faceShape.charAt(0).toUpperCase() + analysis.faceShape.slice(1)} face shape
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.resultsScroll, { paddingBottom: bottomPad + 120 }]}
        >
          {analysis?.faceFeatures ? (
            <View style={styles.featureCard}>
              <View style={styles.featureRow}>
                <Ionicons name="scan" size={14} color={Colors.gold} />
                <Text style={styles.featureLabel}>FACE ANALYSIS</Text>
              </View>
              <Text style={styles.featureText}>{analysis.faceFeatures}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Ionicons name="shapes-outline" size={11} color={Colors.gold} />
                  <Text style={styles.badgeText}>
                    {analysis.faceShape?.charAt(0).toUpperCase() + analysis.faceShape?.slice(1)} face
                  </Text>
                </View>
                {analysis.hasGlasses && (
                  <View style={styles.badge}>
                    <Ionicons name="glasses-outline" size={11} color={Colors.gold} />
                    <Text style={styles.badgeText}>With glasses</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.featureCardLoading}>
              <Text style={styles.featureLoadingText}>Analyzing your face...</Text>
            </View>
          )}

          {(analysis?.recommendations ?? [{}, {}, {}, {}]).map((rec: any, i: number) => (
            <ResultCard key={i} rec={rec} index={i} />
          ))}
        </ScrollView>

        {analysis && (
          <View style={[styles.shareBar, { paddingBottom: bottomPad + 16 }]}>
            <Pressable style={styles.keepBtn} onPress={resetToCamera}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.keepBtnText}>Keep Private</Text>
            </Pressable>
            <Pressable style={styles.shareBtn} onPress={() => setShareModalVisible(true)}>
              <Ionicons name="share-outline" size={16} color={Colors.background} />
              <Text style={styles.shareBtnText}>Share to Feed</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>

      {/* ── SHARE MODAL ── */}
      <Modal visible={shareModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShareModalVisible(false)} />
          <View style={[styles.modalCard, { paddingBottom: bottomPad + 20 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Share to Feed</Text>
            <Text style={styles.modalSubtitle}>Add a caption (optional)</Text>
            <TextInput
              style={styles.captionInput}
              placeholder="What do you think? #haircut #cutmatch"
              placeholderTextColor={Colors.textSecondary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={200}
            />
            <Pressable style={[styles.modalShareBtn, isSharing && { opacity: 0.7 }]} onPress={sharePost} disabled={isSharing}>
              <Ionicons name="share-outline" size={18} color={Colors.background} />
              <Text style={styles.modalShareText}>{isSharing ? "Sharing..." : "Share Now"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ResultCard({ rec, index }: { rec: any; index: number }) {
  const slideAnim = useRef(new Animated.Value(40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, delay: index * 80, tension: 70, friction: 14, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const rankColors: Record<number, string> = { 1: Colors.rank1, 2: Colors.rank2, 3: Colors.rank3, 4: Colors.rank4 };
  const color = rankColors[rec.rank] ?? Colors.textSecondary;
  const diffColor = rec.difficulty === "Easy" ? "#4CAF50" : rec.difficulty === "Medium" ? "#FF9800" : "#F44336";

  if (!rec.rank) {
    return (
      <Animated.View style={[styles.cardSkeleton, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.skeletonImg} />
        <View style={styles.skeletonLines}>
          <View style={[styles.skeletonLine, { width: "60%" }]} />
          <View style={[styles.skeletonLine, { width: "90%" }]} />
          <View style={[styles.skeletonLine, { width: "75%" }]} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }, rec.rank === 1 && styles.card1]}>
      {rec.rank === 1 && (
        <LinearGradient colors={["rgba(201,168,76,0.12)", "transparent"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      )}
      <View style={styles.cardRow}>
        <View style={styles.cardImgBox}>
          {rec.generatedImage ? (
            <Image source={{ uri: rec.generatedImage }} style={styles.cardImg} contentFit="cover" />
          ) : (
            <View style={styles.cardImgPlaceholder}>
              <Ionicons name="cut-outline" size={24} color={Colors.border} />
            </View>
          )}
          {rec.generatedImage && (
            <View style={styles.aiTag}>
              <Ionicons name="sparkles" size={9} color={Colors.gold} />
              <Text style={styles.aiTagText}>AI</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <View style={[styles.rankBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
            {rec.rank === 1 && <Ionicons name="trophy" size={11} color={color} />}
            <Text style={[styles.rankText, { color }]}>#{rec.rank} {rec.rank === 1 ? "Best" : ""}</Text>
          </View>
          <Text style={styles.cutName}>{rec.name}</Text>
          <Text style={styles.cutDesc} numberOfLines={2}>{rec.description}</Text>
          <View style={styles.diffRow}>
            <View style={[styles.diffDot, { backgroundColor: diffColor }]} />
            <Text style={[styles.diffText, { color: diffColor }]}>{rec.difficulty}</Text>
          </View>
        </View>
      </View>
      {rec.whyItFits && (
        <View style={styles.whyBox}>
          <Feather name="check-circle" size={12} color={Colors.gold} />
          <Text style={styles.whyText}>{rec.whyItFits}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 24, paddingBottom: 8 },
  logo: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.gold, letterSpacing: -0.5 },
  tagline: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  photoContainer: { borderRadius: 20, overflow: "hidden", height: 280, position: "relative" },
  photo: { width: "100%", height: "100%" },
  photoGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  changeBtn: {
    position: "absolute", bottom: 12, right: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
  },
  changeBtnText: { fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.text },
  uploadBox: {
    height: 240, backgroundColor: Colors.surface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  iconRing: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: Colors.gold,
    alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.08)",
  },
  uploadTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.text },
  uploadHint: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },
  btnRow: { flexDirection: "row", gap: 12 },
  srcBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, backgroundColor: "rgba(201,168,76,0.08)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(201,168,76,0.25)",
  },
  srcBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium", color: Colors.gold },
  pills: { flexDirection: "row", justifyContent: "space-around", backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border },
  pill: { alignItems: "center", gap: 5 },
  pillText: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.textSecondary },
  footer: { paddingHorizontal: 20, paddingTop: 10 },
  analyzeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, backgroundColor: Colors.gold, borderRadius: 16,
  },
  analyzeBtnDisabled: { backgroundColor: Colors.surface2 },
  analyzeBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold", color: Colors.background, letterSpacing: -0.2 },
  analyzeBtnTextDim: { color: Colors.textSecondary },
  loadingBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    paddingVertical: 16, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
  },
  loadingBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium", color: Colors.textSecondary },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.gold },

  // Results Panel
  resultsPanel: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, zIndex: 10 },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  resultsTitle: { fontSize: 18, fontFamily: "DMSans_700Bold", color: Colors.text, textAlign: "center" },
  resultsSubtitle: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.gold, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  resultsScroll: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  featureCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureLabel: { fontSize: 11, fontFamily: "DMSans_700Bold", color: Colors.gold, letterSpacing: 0.5 },
  featureText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, lineHeight: 19 },
  featureCardLoading: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", height: 60, justifyContent: "center" },
  featureLoadingText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(201,168,76,0.2)" },
  badgeText: { fontSize: 10, fontFamily: "DMSans_500Medium", color: Colors.gold },

  card: { backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", padding: 14, gap: 10 },
  card1: { borderColor: "rgba(201,168,76,0.3)" },
  cardSkeleton: { backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 14, flexDirection: "row", gap: 12, height: 120 },
  skeletonImg: { width: 80, height: 100, borderRadius: 10, backgroundColor: Colors.surface2 },
  skeletonLines: { flex: 1, gap: 8, justifyContent: "center" },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: Colors.surface2 },
  cardRow: { flexDirection: "row", gap: 12 },
  cardImgBox: { width: 86, height: 105, borderRadius: 10, overflow: "hidden", position: "relative" },
  cardImg: { width: "100%", height: "100%" },
  cardImgPlaceholder: { width: "100%", height: "100%", backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center" },
  aiTag: { position: "absolute", bottom: 5, left: 5, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: "rgba(201,168,76,0.4)" },
  aiTagText: { fontSize: 8, fontFamily: "DMSans_700Bold", color: Colors.gold },
  cardInfo: { flex: 1, gap: 5, justifyContent: "center" },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start" },
  rankText: { fontSize: 11, fontFamily: "DMSans_700Bold" },
  cutName: { fontSize: 15, fontFamily: "DMSans_700Bold", color: Colors.text, letterSpacing: -0.2 },
  cutDesc: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, lineHeight: 16 },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  diffDot: { width: 5, height: 5, borderRadius: 3 },
  diffText: { fontSize: 10, fontFamily: "DMSans_500Medium" },
  whyBox: { flexDirection: "row", gap: 7, backgroundColor: "rgba(201,168,76,0.06)", borderRadius: 10, padding: 9, borderWidth: 1, borderColor: "rgba(201,168,76,0.13)", alignItems: "flex-start" },
  whyText: { flex: 1, fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, lineHeight: 17 },

  // Share bar
  shareBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  keepBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border },
  keepBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium", color: Colors.textSecondary },
  shareBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: Colors.gold, borderRadius: 14 },
  shareBtnText: { fontSize: 14, fontFamily: "DMSans_700Bold", color: Colors.background },

  // Share Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, borderWidth: 1, borderColor: Colors.border },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontFamily: "DMSans_700Bold", color: Colors.text },
  modalSubtitle: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary },
  captionInput: { backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, color: Colors.text, fontFamily: "DMSans_400Regular", fontSize: 14, minHeight: 80, borderWidth: 1, borderColor: Colors.border },
  modalShareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, backgroundColor: Colors.gold, borderRadius: 14 },
  modalShareText: { fontSize: 15, fontFamily: "DMSans_700Bold", color: Colors.background },
});
