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
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { router, useLocalSearchParams } from "expo-router";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;

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

function useSpringPress() {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start();
  };
  return { scale, onPressIn, onPressOut };
}

export default function CutMatchScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, settings, colors } = useApp();
  const C = colors;
  const params = useLocalSearchParams<{ sendToFriendId?: string; sendToFriendName?: string }>();
  const sendToFriendId = params.sendToFriendId ? parseInt(params.sendToFriendId) : null;
  const sendToFriendName = params.sendToFriendName || null;
  const [phase, setPhase] = useState<Phase>("camera");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Analyzing your face...");
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [caption, setCaption] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [isSendingToFriend, setIsSendingToFriend] = useState(false);
  const resultsAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const loadingDotAnim = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];
  const ctaGlowAnim = useRef(new Animated.Value(0)).current;
  const ctaGlowLoop = useRef<any>(null);
  const resultsScrollY = useRef(new Animated.Value(0)).current;

  const cameraSpring = useSpringPress();
  const gallerySpring = useSpringPress();
  const analyzeSpring = useSpringPress();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const triggerHaptic = (type: "light" | "medium" | "success" | "error") => {
    if (!settings.enableHaptics) return;
    if (type === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const startGlowPulse = () => {
    ctaGlowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaGlowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(ctaGlowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    ctaGlowLoop.current.start();
  };

  const stopGlowPulse = () => {
    ctaGlowLoop.current?.stop();
    ctaGlowAnim.setValue(0);
  };

  React.useEffect(() => {
    if (selectedImage && phase === "camera") {
      startGlowPulse();
    } else {
      stopGlowPulse();
    }
    return () => stopGlowPulse();
  }, [selectedImage, phase]);

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
    triggerHaptic("success");
  };

  const pickImage = async (source: "camera" | "gallery") => {
    triggerHaptic("light");
    if (source === "camera" && Platform.OS !== "web") {
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
    triggerHaptic("medium");
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
      triggerHaptic("error");
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
      const facePhotoUrl = selectedBase64
        ? `data:image/jpeg;base64,${selectedBase64}`
        : selectedImage;

      const url = new URL("/api/posts", apiBase).toString();
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          facePhotoUrl,
          faceShape: analysis.faceShape,
          faceFeatures: analysis.faceFeatures,
          hasGlasses: analysis.hasGlasses,
          recommendations: analysis.recommendations,
          caption,
          isPublic: settings.publicPosts,
        }),
      });
      triggerHaptic("success");
      setShareModalVisible(false);
      Alert.alert("Shared!", "Your haircut recommendations are now in the Feed.");
      resetToCamera();
    } catch {
      Alert.alert("Error", "Could not share. Try again.");
    }
    setIsSharing(false);
  };

  const sendToFriend = async () => {
    if (!currentUser || !analysis || !sendToFriendId) return;
    setIsSendingToFriend(true);
    try {
      const facePhotoUrl = selectedBase64
        ? `data:image/jpeg;base64,${selectedBase64}`
        : selectedImage ?? "";

      const postUrl = new URL("/api/posts", apiBase).toString();
      const postRes = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          facePhotoUrl,
          faceShape: analysis.faceShape,
          faceFeatures: analysis.faceFeatures,
          hasGlasses: analysis.hasGlasses,
          recommendations: analysis.recommendations,
          caption: "",
          isPublic: false,
        }),
      });
      if (!postRes.ok) throw new Error("Failed to save CutMatch");
      const newPost = await postRes.json();

      const msgUrl = new URL("/api/messages", apiBase).toString();
      const msgRes = await fetch(msgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: sendToFriendId,
          content: `💇 Shared a CutMatch: ${analysis.faceShape} face shape`,
          messageType: "cutmatch",
          metadata: {
            postId: newPost.id,
            faceShape: analysis.faceShape,
            recommendations: analysis.recommendations,
          },
        }),
      });
      if (!msgRes.ok) throw new Error("Failed to send message");

      triggerHaptic("success");
      Alert.alert("Sent!", `Your CutMatch was sent to ${sendToFriendName || "your friend"}.`, [
        { text: "OK", onPress: () => { resetToCamera(); router.back(); } },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not send CutMatch. Try again.");
    }
    setIsSendingToFriend(false);
  };

  const ctaGlowOpacity = ctaGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <LinearGradient
        colors={C.background === "#0A0A0A" ? ["#141414", "#0A0A0A"] : ["#F5F0E8", "#EDE8E0"]}
        style={StyleSheet.absoluteFill}
      />

      {phase !== "results" && (
        <>
          <View style={[styles.header, { paddingTop: topPad + 12 }]}>
            <Text style={[styles.logo, { color: C.gold }]}>CutMatch</Text>
            <Text style={[styles.tagline, { color: C.textSecondary }]}>AI HAIRCUT ADVISOR</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_HEIGHT + bottomPad + 20 }]}
            showsVerticalScrollIndicator={false}
          >
            {selectedImage ? (
              <View style={styles.photoContainer}>
                <Image source={{ uri: selectedImage }} style={styles.photo} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(10,10,10,0.9)"]} style={styles.photoGrad} />
                <Pressable style={[styles.changeBtn, { backgroundColor: "rgba(0,0,0,0.75)", borderColor: C.border }]}
                  onPress={() => { setSelectedImage(null); setSelectedBase64(null); }}>
                  <Feather name="refresh-ccw" size={14} color={C.text} />
                  <Text style={[styles.changeBtnText, { color: C.text }]}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.uploadBox, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={[styles.iconRing, { borderColor: C.gold, backgroundColor: C.gold + "14" }]}>
                  <Ionicons name="person" size={36} color={C.gold} />
                </View>
                <Text style={[styles.uploadTitle, { color: C.text }]}>Upload your photo</Text>
                <Text style={[styles.uploadHint, { color: C.textSecondary }]}>
                  Face camera directly.{"\n"}Good lighting = better results.
                </Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <Animated.View style={[styles.srcBtnWrap, { transform: [{ scale: cameraSpring.scale }] }]}>
                <Pressable
                  style={[styles.srcBtn, { backgroundColor: C.gold + "14", borderColor: C.gold + "40" }]}
                  onPress={() => pickImage("camera")}
                  onPressIn={cameraSpring.onPressIn}
                  onPressOut={cameraSpring.onPressOut}
                >
                  <Ionicons name={Platform.OS === "web" ? "cloud-upload-outline" : "camera"} size={20} color={C.gold} />
                  <Text style={[styles.srcBtnText, { color: C.gold }]}>{Platform.OS === "web" ? "Upload" : "Camera"}</Text>
                </Pressable>
              </Animated.View>
              {Platform.OS !== "web" && (
                <Animated.View style={[styles.srcBtnWrap, { transform: [{ scale: gallerySpring.scale }] }]}>
                  <Pressable
                    style={[styles.srcBtn, { backgroundColor: C.gold + "14", borderColor: C.gold + "40" }]}
                    onPress={() => pickImage("gallery")}
                    onPressIn={gallerySpring.onPressIn}
                    onPressOut={gallerySpring.onPressOut}
                  >
                    <Ionicons name="images" size={20} color={C.gold} />
                    <Text style={[styles.srcBtnText, { color: C.gold }]}>Gallery</Text>
                  </Pressable>
                </Animated.View>
              )}
            </View>

            <View style={[styles.pills, { backgroundColor: C.surface, borderColor: C.border }]}>
              {[
                { icon: "scan-outline" as const, label: "Face Shape" },
                { icon: "sparkles-outline" as const, label: "4 Cuts" },
                { icon: "image-outline" as const, label: "AI Photos" },
              ].map((p) => (
                <View key={p.label} style={styles.pill}>
                  <View style={[styles.pillIconBox, { backgroundColor: C.gold + "18" }]}>
                    <Ionicons name={p.icon} size={15} color={C.gold} />
                  </View>
                  <Text style={[styles.pillText, { color: C.textSecondary }]}>{p.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: TAB_BAR_HEIGHT + bottomPad + 8 }]}>
            {phase === "loading" ? (
              <View style={[styles.loadingBtn, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={styles.dots}>
                  {loadingDotAnim.map((d, i) => (
                    <Animated.View key={i} style={[styles.dot, { backgroundColor: C.gold, opacity: d }]} />
                  ))}
                </View>
                <Text style={[styles.loadingBtnText, { color: C.textSecondary }]}>{statusText}</Text>
              </View>
            ) : (
              <View style={styles.analyzeBtnWrap}>
                {selectedImage && (
                  <Animated.View
                    style={[
                      styles.ctaGlow,
                      { backgroundColor: C.gold, opacity: ctaGlowOpacity, pointerEvents: "none" },
                    ]}
                  />
                )}
                <Animated.View style={{ transform: [{ scale: analyzeSpring.scale }] }}>
                  <Pressable
                    style={[
                      styles.analyzeBtn,
                      { backgroundColor: selectedImage ? C.gold : C.surface },
                      !selectedImage && { borderWidth: 1, borderColor: C.border },
                    ]}
                    onPress={runAnalysis}
                    onPressIn={selectedImage ? analyzeSpring.onPressIn : undefined}
                    onPressOut={selectedImage ? analyzeSpring.onPressOut : undefined}
                    disabled={!selectedImage}
                  >
                    <Ionicons name="sparkles" size={18} color={selectedImage ? C.background : C.textSecondary} />
                    <Text style={[styles.analyzeBtnText, { color: selectedImage ? C.background : C.textSecondary }]}>
                      Find My Best Cuts
                    </Text>
                  </Pressable>
                </Animated.View>
              </View>
            )}
          </View>
        </>
      )}

      <Animated.View style={[styles.resultsPanel, { backgroundColor: C.background, transform: [{ translateY: resultsAnim }] }]}>
        <LinearGradient
          colors={C.background === "#0A0A0A" ? ["#0A0A0A", "#141414"] : ["#F5F0E8", "#EDE8E0"]}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.resultsScroll, { paddingBottom: TAB_BAR_HEIGHT + bottomPad + 100, paddingTop: topPad + 76 }]}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: resultsScrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {analysis?.faceFeatures ? (
            <View style={[styles.featureCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={styles.featureRow}>
                <Ionicons name="scan" size={14} color={C.gold} />
                <Text style={[styles.featureLabel, { color: C.textSecondary }]}>FACE ANALYSIS</Text>
              </View>
              <Text style={[styles.featureText, { color: C.text }]}>{analysis.faceFeatures}</Text>
              <View style={styles.badgeRow}>
                {settings.showFaceShape && (
                  <View style={[styles.badge, { backgroundColor: C.gold + "20", borderColor: C.gold + "40" }]}>
                    <Ionicons name="shapes-outline" size={11} color={C.gold} />
                    <Text style={[styles.badgeText, { color: C.gold }]}>
                      {analysis.faceShape?.charAt(0).toUpperCase() + analysis.faceShape?.slice(1)} face
                    </Text>
                  </View>
                )}
                {analysis.hasGlasses && (
                  <View style={[styles.badge, { backgroundColor: C.gold + "20", borderColor: C.gold + "40" }]}>
                    <Ionicons name="glasses-outline" size={11} color={C.gold} />
                    <Text style={[styles.badgeText, { color: C.gold }]}>With glasses</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.featureCardLoading, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.featureLoadingText, { color: C.textSecondary }]}>Analyzing your face...</Text>
            </View>
          )}

          {(analysis?.recommendations ?? [{}, {}, {}, {}]).map((rec: any, i: number) => (
            <ResultCard key={i} rec={rec} index={i} colors={C} showDifficulty={settings.showDifficulty} />
          ))}
        </Animated.ScrollView>

        <View style={[styles.resultsHeaderWrap, { paddingTop: topPad + 12 }]}>
          <Animated.View
            style={[
              styles.resultsHeaderBg,
              {
                backgroundColor: C.background,
                opacity: resultsScrollY.interpolate({ inputRange: [0, 40], outputRange: [0.85, 0.97], extrapolate: "clamp" }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.resultsHeaderBorder,
              {
                backgroundColor: C.border,
                opacity: resultsScrollY.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: "clamp" }),
              },
            ]}
          />
          <Pressable style={[styles.backBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={resetToCamera}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <View>
            <Text style={[styles.resultsTitle, { color: C.text }]}>Your Best Cuts</Text>
            {settings.showFaceShape && analysis?.faceShape && (
              <Text style={[styles.resultsSubtitle, { color: C.textSecondary }]}>
                {analysis.faceShape.charAt(0).toUpperCase() + analysis.faceShape.slice(1)} face shape
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {analysis && (
          <View style={[styles.shareBar, { paddingBottom: TAB_BAR_HEIGHT + bottomPad + 8, backgroundColor: C.background + "F0", borderTopColor: C.border }]}>
            {sendToFriendId ? (
              <>
                <Pressable style={[styles.keepBtn, { borderColor: C.border }]} onPress={() => { resetToCamera(); router.back(); }}>
                  <Ionicons name="close-outline" size={16} color={C.textSecondary} />
                  <Text style={[styles.keepBtnText, { color: C.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.shareBtn, { backgroundColor: C.gold }, isSendingToFriend && { opacity: 0.7 }]} onPress={sendToFriend} disabled={isSendingToFriend}>
                  <Ionicons name="paper-plane-outline" size={16} color={C.background} />
                  <Text style={[styles.shareBtnText, { color: C.background }]}>{isSendingToFriend ? "Sending..." : `Send to ${sendToFriendName || "Friend"}`}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={[styles.keepBtn, { borderColor: C.border }]} onPress={resetToCamera}>
                  <Ionicons name="lock-closed-outline" size={16} color={C.textSecondary} />
                  <Text style={[styles.keepBtnText, { color: C.textSecondary }]}>Keep Private</Text>
                </Pressable>
                <Pressable style={[styles.shareBtn, { backgroundColor: C.gold }]} onPress={() => setShareModalVisible(true)}>
                  <Ionicons name="share-outline" size={16} color={C.background} />
                  <Text style={[styles.shareBtnText, { color: C.background }]}>Share to Feed</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </Animated.View>

      <Modal visible={shareModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShareModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: C.surface, borderColor: C.border, paddingBottom: bottomPad + 20 }]}>
            <View style={[styles.modalHandle, { backgroundColor: C.border }]} />
            <Text style={[styles.modalTitle, { color: C.text }]}>Share to Feed</Text>
            <Text style={[styles.modalSubtitle, { color: C.textSecondary }]}>Add a caption (optional)</Text>
            <TextInput
              style={[styles.captionInput, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="What do you think? #haircut #cutmatch"
              placeholderTextColor={C.textSecondary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={200}
            />
            <Pressable style={[styles.modalShareBtn, { backgroundColor: C.gold }, isSharing && { opacity: 0.7 }]} onPress={sharePost} disabled={isSharing}>
              <Ionicons name="share-outline" size={18} color={C.background} />
              <Text style={[styles.modalShareText, { color: C.background }]}>{isSharing ? "Sharing..." : "Share Now"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ResultCard({ rec, index, colors: C, showDifficulty }: { rec: any; index: number; colors: any; showDifficulty: boolean }) {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, delay: index * 100, tension: 65, friction: 13, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 350, delay: index * 100, useNativeDriver: true }),
    ]).start();
  }, []);

  const rankColors: Record<number, string> = { 1: C.rank1, 2: C.rank2, 3: C.rank3, 4: C.rank4 };
  const color = rankColors[rec.rank] ?? C.textSecondary;
  const diffColor = rec.difficulty === "Easy" ? "#4CAF50" : rec.difficulty === "Medium" ? "#FF9800" : "#F44336";

  if (!rec.rank) {
    return (
      <Animated.View style={[styles.cardSkeleton, { backgroundColor: C.surface, borderColor: C.border, opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={[styles.skeletonImg, { backgroundColor: C.surface2 }]} />
        <View style={styles.skeletonLines}>
          <View style={[styles.skeletonLine, { backgroundColor: C.surface2, width: "60%" }]} />
          <View style={[styles.skeletonLine, { backgroundColor: C.surface2, width: "90%" }]} />
          <View style={[styles.skeletonLine, { backgroundColor: C.surface2, width: "75%" }]} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { backgroundColor: C.surface, borderColor: rec.rank === 1 ? C.gold + "40" : C.border }, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
      {rec.rank === 1 && (
        <LinearGradient colors={[C.gold + "20", "transparent"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      )}
      <View style={styles.cardRow}>
        <View style={styles.cardImgBox}>
          {rec.generatedImage ? (
            <Image source={{ uri: rec.generatedImage }} style={styles.cardImg} contentFit="cover" />
          ) : (
            <View style={[styles.cardImgPlaceholder, { backgroundColor: C.surface2 }]}>
              <Ionicons name="cut-outline" size={24} color={C.border} />
            </View>
          )}
          {rec.generatedImage && (
            <View style={styles.aiTag}>
              <Ionicons name="sparkles" size={9} color={C.gold} />
              <Text style={[styles.aiTagText, { color: C.gold }]}>AI</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <View style={[styles.rankBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
            {rec.rank === 1 && <Ionicons name="trophy" size={11} color={color} />}
            <Text style={[styles.rankText, { color }]}>#{rec.rank} {rec.rank === 1 ? "Best" : ""}</Text>
          </View>
          <Text style={[styles.cutName, { color: C.text }]}>{rec.name}</Text>
          <Text style={[styles.cutDesc, { color: C.textSecondary }]} numberOfLines={2}>{rec.description}</Text>
          {showDifficulty && rec.difficulty && (
            <View style={styles.diffRow}>
              <View style={[styles.diffDot, { backgroundColor: diffColor }]} />
              <Text style={[styles.diffText, { color: diffColor }]}>{rec.difficulty}</Text>
            </View>
          )}
        </View>
      </View>
      {rec.whyItFits && (
        <View style={[styles.whyBox, { borderTopColor: C.border }]}>
          <Feather name="check-circle" size={12} color={C.gold} />
          <Text style={[styles.whyText, { color: C.textSecondary }]}>{rec.whyItFits}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingBottom: 8 },
  logo: { fontSize: 28, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 11, fontFamily: "DMSans_400Regular", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  photoContainer: { borderRadius: 20, overflow: "hidden", height: 280, position: "relative" },
  photo: { width: "100%", height: "100%" },
  photoGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  changeBtn: {
    position: "absolute", bottom: 12, right: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  changeBtnText: { fontSize: 12, fontFamily: "DMSans_500Medium" },
  uploadBox: {
    height: 240, borderRadius: 20,
    borderWidth: 1, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  iconRing: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  uploadTitle: { fontSize: 17, fontFamily: "DMSans_700Bold" },
  uploadHint: { fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 19 },
  btnRow: { flexDirection: "row", gap: 12 },
  srcBtnWrap: { flex: 1 },
  srcBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 14, borderWidth: 1,
  },
  srcBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium" },
  pills: { flexDirection: "row", justifyContent: "space-around", borderRadius: 14, paddingVertical: 14, borderWidth: 1, paddingHorizontal: 8 },
  pill: { alignItems: "center", gap: 6 },
  pillIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  footer: { paddingHorizontal: 20, paddingTop: 10 },
  analyzeBtnWrap: { position: "relative" },
  ctaGlow: {
    position: "absolute",
    top: -8, left: -8, right: -8, bottom: -8,
    borderRadius: 24,
  },
  analyzeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 16,
  },
  analyzeBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold", letterSpacing: -0.2 },
  loadingBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1,
  },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  loadingBtnText: { fontSize: 15, fontFamily: "DMSans_500Medium" },
  resultsPanel: { ...StyleSheet.absoluteFillObject },
  resultsHeaderWrap: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
  },
  resultsHeaderBg: {
    ...StyleSheet.absoluteFillObject,
  },
  resultsHeaderBorder: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
  },
  resultsHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  resultsTitle: { fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 },
  resultsSubtitle: { fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 1 },
  resultsScroll: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
  featureCard: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureLabel: { fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, textTransform: "uppercase" },
  featureText: { fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 19 },
  badgeRow: { flexDirection: "row", gap: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontFamily: "DMSans_500Medium" },
  featureCardLoading: { padding: 14, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  featureLoadingText: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  shareBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1,
  },
  keepBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  keepBtnText: { fontSize: 14, fontFamily: "DMSans_500Medium" },
  shareBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 14,
  },
  shareBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14, borderWidth: 1 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontFamily: "DMSans_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  captionInput: {
    borderRadius: 14, padding: 14, fontSize: 14, fontFamily: "DMSans_400Regular",
    borderWidth: 1, minHeight: 80, textAlignVertical: "top",
  },
  modalShareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 14,
  },
  modalShareText: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  card: {
    borderRadius: 18, borderWidth: 1, overflow: "hidden", padding: 14, gap: 0,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  cardImgBox: { width: 90, height: 110, borderRadius: 12, overflow: "hidden", position: "relative" },
  cardImg: { width: "100%", height: "100%" },
  cardImgPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  aiTag: {
    position: "absolute", bottom: 4, left: 4,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4,
  },
  aiTagText: { fontSize: 7, fontFamily: "DMSans_700Bold" },
  cardInfo: { flex: 1, gap: 5, justifyContent: "center" },
  rankBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start",
  },
  rankText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  cutName: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  cutDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  diffText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  whyBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    paddingTop: 10, marginTop: 10, borderTopWidth: 1,
  },
  whyText: { flex: 1, fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  cardSkeleton: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  skeletonImg: { width: 90, height: 110, borderRadius: 12 },
  skeletonLines: { flex: 1, gap: 8, justifyContent: "center" },
  skeletonLine: { height: 10, borderRadius: 5 },
});
