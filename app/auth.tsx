import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  TextInput,
  ScrollView,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useApp } from "@/context/AppContext";
import { fetch } from "expo/fetch";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

type AuthStep =
  | "welcome"
  | "register_creds"
  | "login_creds"
  | "avatar_choice"
  | "avatar_standard"
  | "avatar_virtual"
  | "avatar_virtual_results";

interface HaircutOption {
  rank: number;
  name: string;
  description: string;
  generatedImage: string | null;
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { register, login, uploadAvatar, currentUser, apiBase } = useApp();
  const [step, setStep] = useState<AuthStep>("welcome");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [pendingUser, setPendingUser] = useState<{ id: number } | null>(null);

  const [virtualPhoto, setVirtualPhoto] = useState<string | null>(null);
  const [virtualBase64, setVirtualBase64] = useState<string | null>(null);
  const [haircuts, setHaircuts] = useState<HaircutOption[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("Analyzing your face...");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleRegister = async () => {
    if (!username.trim()) return Alert.alert("", "Enter a username");
    if (!password.trim()) return Alert.alert("", "Enter a password");
    if (password !== confirmPassword) return Alert.alert("", "Passwords don't match");
    if (password.length < 4) return Alert.alert("", "Password must be at least 4 characters");
    setLoading(true);
    try {
      const name = displayName.trim() || username.trim();
      const user = await register(username.trim(), password, name);
      setPendingUser(user);
      setStep("avatar_choice");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Registration failed");
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return Alert.alert("", "Enter username and password");
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Login Failed", e.message || "Invalid credentials");
    }
    setLoading(false);
  };

  const skipAvatar = () => {
    router.replace("/(tabs)");
  };

  const pickStandardPhoto = async (source: "camera" | "gallery") => {
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") return Alert.alert("Camera access needed");
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const b64 = result.assets[0].base64;
        if (b64 && pendingUser) {
          setLoading(true);
          try {
            await uploadAvatar(pendingUser.id, `data:image/jpeg;base64,${b64}`);
          } catch {}
          setLoading(false);
        }
        router.replace("/(tabs)");
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return Alert.alert("Photo access needed");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const b64 = result.assets[0].base64;
        if (b64 && pendingUser) {
          setLoading(true);
          try {
            await uploadAvatar(pendingUser.id, `data:image/jpeg;base64,${b64}`);
          } catch {}
          setLoading(false);
        }
        router.replace("/(tabs)");
      }
    }
  };

  const takeVirtualPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return Alert.alert("Camera access needed");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setVirtualPhoto(result.assets[0].uri);
      setVirtualBase64(result.assets[0].base64 ?? null);
      runVirtualAnalysis(result.assets[0].base64 ?? "");
    }
  };

  const runVirtualAnalysis = async (b64: string) => {
    if (!b64) return;
    setAnalyzing(true);
    setStep("avatar_virtual_results");
    setAnalysisStatus("Analyzing your face...");
    setHaircuts([]);

    try {
      const url = new URL("/api/analyze-stream", apiBase).toString();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: `data:image/jpeg;base64,${b64}` }),
      });
      if (!response.ok) throw new Error("Analysis failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentHaircuts: HaircutOption[] = [];

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
              setAnalysisStatus(event.message);
            } else if (event.type === "analysis") {
              currentHaircuts = event.recommendations.map((r: any) => ({
                rank: r.rank, name: r.name, description: r.description, generatedImage: null,
              }));
              setHaircuts([...currentHaircuts]);
            } else if (event.type === "image") {
              currentHaircuts = currentHaircuts.map((h) =>
                h.rank === event.rank ? { ...h, generatedImage: event.generatedImage } : h
              );
              setHaircuts([...currentHaircuts]);
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }
    } catch (e: any) {
      Alert.alert("Analysis Failed", e.message);
      setStep("avatar_virtual");
    }
    setAnalyzing(false);
  };

  const selectVirtualAvatar = async (haircut: HaircutOption) => {
    if (!haircut.generatedImage || !pendingUser) {
      router.replace("/(tabs)");
      return;
    }
    setLoading(true);
    try {
      await uploadAvatar(pendingUser.id, haircut.generatedImage);
    } catch {}
    setLoading(false);
    router.replace("/(tabs)");
  };

  const C = {
    gold: "#C9A84C",
    bg: "#0A0A0A",
    surface: "#141414",
    surface2: "#1E1E1E",
    border: "#2A2A2A",
    text: "#F5F0E8",
    textSec: "#8A8580",
  };

  if (step === "welcome") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.welcomeContent, { paddingTop: topPad + 40, paddingBottom: bottomPad + 40 }]}>
          <View style={s.logoArea}>
            <View style={[s.logoRing, { borderColor: C.gold }]}>
              <Ionicons name="cut" size={44} color={C.gold} />
            </View>
            <Text style={[s.logoText, { color: C.gold }]}>CutMatch</Text>
            <Text style={[s.logoTagline, { color: C.textSec }]}>AI HAIRCUT ADVISOR</Text>
          </View>

          <View style={s.welcomeBtns}>
            <Pressable style={[s.primaryBtn, { backgroundColor: C.gold }]} onPress={() => setStep("register_creds")}>
              <Ionicons name="person-add-outline" size={18} color={C.bg} />
              <Text style={[s.primaryBtnText, { color: C.bg }]}>Create Account</Text>
            </Pressable>
            <Pressable style={[s.secondaryBtn, { borderColor: C.border }]} onPress={() => setStep("login_creds")}>
              <Ionicons name="log-in-outline" size={18} color={C.text} />
              <Text style={[s.secondaryBtnText, { color: C.text }]}>Sign In</Text>
            </Pressable>
          </View>

          <Text style={[s.disclaimer, { color: C.textSec }]}>
            Find your perfect haircut with AI-powered recommendations
          </Text>
        </View>
      </View>
    );
  }

  if (step === "register_creds") {
    return (
      <KeyboardAvoidingView style={[s.container, { backgroundColor: C.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[s.formScroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 40 }]}>
          <Pressable style={s.backBtn} onPress={() => setStep("welcome")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>

          <Text style={[s.formTitle, { color: C.text }]}>Create Account</Text>
          <Text style={[s.formSubtitle, { color: C.textSec }]}>Join CutMatch to share and discover haircuts</Text>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Display Name</Text>
            <TextInput
              style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="Your name"
              placeholderTextColor={C.textSec}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={30}
            />
          </View>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Username</Text>
            <TextInput
              style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="username (letters, numbers, _)"
              placeholderTextColor={C.textSec}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Password</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.input, s.passwordInput, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
                placeholder="At least 4 characters"
                placeholderTextColor={C.textSec}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={50}
              />
              <Pressable style={[s.eyeBtn, { backgroundColor: C.surface2, borderColor: C.border }]} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSec} />
              </Pressable>
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Confirm Password</Text>
            <TextInput
              style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="Re-enter password"
              placeholderTextColor={C.textSec}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={50}
            />
          </View>

          <Pressable
            style={[s.primaryBtn, { backgroundColor: C.gold, marginTop: 8, opacity: loading ? 0.7 : 1 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={C.bg} /> : (
              <>
                <Text style={[s.primaryBtnText, { color: C.bg }]}>Create Account</Text>
                <Ionicons name="arrow-forward" size={18} color={C.bg} />
              </>
            )}
          </Pressable>

          <Pressable onPress={() => setStep("login_creds")}>
            <Text style={[s.switchText, { color: C.textSec }]}>
              Already have an account? <Text style={{ color: C.gold }}>Sign In</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === "login_creds") {
    return (
      <KeyboardAvoidingView style={[s.container, { backgroundColor: C.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[s.formScroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 40 }]}>
          <Pressable style={s.backBtn} onPress={() => setStep("welcome")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>

          <Text style={[s.formTitle, { color: C.text }]}>Welcome Back</Text>
          <Text style={[s.formSubtitle, { color: C.textSec }]}>Sign in to your CutMatch account</Text>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Username</Text>
            <TextInput
              style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="Your username"
              placeholderTextColor={C.textSec}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Password</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.input, s.passwordInput, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
                placeholder="Your password"
                placeholderTextColor={C.textSec}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={50}
              />
              <Pressable style={[s.eyeBtn, { backgroundColor: C.surface2, borderColor: C.border }]} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSec} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[s.primaryBtn, { backgroundColor: C.gold, marginTop: 8, opacity: loading ? 0.7 : 1 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={C.bg} /> : (
              <>
                <Text style={[s.primaryBtnText, { color: C.bg }]}>Sign In</Text>
                <Ionicons name="arrow-forward" size={18} color={C.bg} />
              </>
            )}
          </Pressable>

          <Pressable onPress={() => setStep("register_creds")}>
            <Text style={[s.switchText, { color: C.textSec }]}>
              No account? <Text style={{ color: C.gold }}>Create one</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === "avatar_choice") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.avatarChoiceContent, { paddingTop: topPad + 20, paddingBottom: bottomPad + 30 }]}>
          <View style={[s.logoRing, { borderColor: C.gold, marginBottom: 8 }]}>
            <Ionicons name="person-circle-outline" size={40} color={C.gold} />
          </View>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center" }]}>Set Profile Picture</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>
            Choose how you want to set up your profile
          </Text>

          <Pressable
            style={[s.avatarOptionBtn, { backgroundColor: C.surface, borderColor: C.gold + "50" }]}
            onPress={() => setStep("avatar_standard")}
          >
            <View style={[s.avatarOptionIcon, { backgroundColor: C.gold + "20" }]}>
              <Ionicons name="camera-outline" size={28} color={C.gold} />
            </View>
            <View style={s.avatarOptionInfo}>
              <Text style={[s.avatarOptionTitle, { color: C.text }]}>Standard Photo</Text>
              <Text style={[s.avatarOptionDesc, { color: C.textSec }]}>Use a photo from your camera or gallery</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textSec} />
          </Pressable>

          <Pressable
            style={[s.avatarOptionBtn, { backgroundColor: C.surface, borderColor: C.gold + "50" }]}
            onPress={() => setStep("avatar_virtual")}
          >
            <View style={[s.avatarOptionIcon, { backgroundColor: C.gold + "20" }]}>
              <Ionicons name="sparkles-outline" size={28} color={C.gold} />
            </View>
            <View style={s.avatarOptionInfo}>
              <Text style={[s.avatarOptionTitle, { color: C.text }]}>Virtual AI Photo</Text>
              <Text style={[s.avatarOptionDesc, { color: C.textSec }]}>Get an AI-generated avatar with your best haircut</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textSec} />
          </Pressable>

          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "avatar_standard") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.avatarChoiceContent, { paddingTop: topPad + 20, paddingBottom: bottomPad + 30 }]}>
          <Pressable style={[s.backBtn, { marginBottom: 20 }]} onPress={() => setStep("avatar_choice")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center" }]}>Choose Photo Source</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>Select a clear, well-lit photo of your face</Text>

          <Pressable style={[s.avatarOptionBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => pickStandardPhoto("camera")}>
            <View style={[s.avatarOptionIcon, { backgroundColor: C.gold + "20" }]}>
              <Ionicons name="camera" size={28} color={C.gold} />
            </View>
            <View style={s.avatarOptionInfo}>
              <Text style={[s.avatarOptionTitle, { color: C.text }]}>Camera</Text>
              <Text style={[s.avatarOptionDesc, { color: C.textSec }]}>Take a photo right now</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textSec} />
          </Pressable>

          <Pressable style={[s.avatarOptionBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => pickStandardPhoto("gallery")}>
            <View style={[s.avatarOptionIcon, { backgroundColor: C.gold + "20" }]}>
              <Ionicons name="images" size={28} color={C.gold} />
            </View>
            <View style={s.avatarOptionInfo}>
              <Text style={[s.avatarOptionTitle, { color: C.text }]}>Gallery</Text>
              <Text style={[s.avatarOptionDesc, { color: C.textSec }]}>Choose from your photo library</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textSec} />
          </Pressable>

          {loading && <ActivityIndicator color={C.gold} style={{ marginTop: 20 }} />}
          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "avatar_virtual") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.avatarChoiceContent, { paddingTop: topPad + 20, paddingBottom: bottomPad + 30 }]}>
          <Pressable style={[s.backBtn, { marginBottom: 20 }]} onPress={() => setStep("avatar_choice")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center" }]}>Virtual AI Avatar</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>
            Take a selfie and AI will generate your avatar with the best haircut for your face shape
          </Text>

          <View style={[s.circleCamera, { borderColor: C.gold }]}>
            <Ionicons name="person" size={64} color={C.border} />
            <Text style={[s.circleText, { color: C.textSec }]}>Position your face in the circle</Text>
          </View>

          <View style={s.virtualTips}>
            {["Face camera directly", "Good lighting", "No hat or sunglasses"].map((tip) => (
              <View key={tip} style={s.tipRow}>
                <Ionicons name="checkmark-circle" size={14} color={C.gold} />
                <Text style={[s.tipText, { color: C.textSec }]}>{tip}</Text>
              </View>
            ))}
          </View>

          <Pressable style={[s.primaryBtn, { backgroundColor: C.gold }]} onPress={takeVirtualPhoto}>
            <Ionicons name="camera" size={18} color={C.bg} />
            <Text style={[s.primaryBtnText, { color: C.bg }]}>Take Selfie & Analyze</Text>
          </Pressable>

          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "avatar_virtual_results") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.resultsHeader, { paddingTop: topPad + 12 }]}>
          <Text style={[s.formTitle, { color: C.text }]}>Choose Your Avatar</Text>
          {analyzing && (
            <View style={s.analyzingRow}>
              <ActivityIndicator color={C.gold} size="small" />
              <Text style={[s.analyzingText, { color: C.textSec }]}>{analysisStatus}</Text>
            </View>
          )}
        </View>
        <ScrollView
          contentContainerStyle={[s.resultsScroll, { paddingBottom: bottomPad + 30 }]}
          showsVerticalScrollIndicator={false}
        >
          {haircuts.length === 0 && analyzing && (
            <View style={s.loadingPlaceholders}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={[s.haircutCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <View style={[s.haircutImgPlaceholder, { backgroundColor: C.surface2 }]} />
                  <View style={[s.haircutSkeleton, { backgroundColor: C.surface2, width: "60%", height: 14, borderRadius: 7 }]} />
                </View>
              ))}
            </View>
          )}
          {haircuts.map((haircut) => (
            <Pressable
              key={haircut.rank}
              style={[s.haircutCard, { backgroundColor: C.surface, borderColor: haircut.rank === 1 ? C.gold + "50" : C.border }]}
              onPress={() => selectVirtualAvatar(haircut)}
              disabled={!haircut.generatedImage && analyzing}
            >
              {haircut.generatedImage ? (
                <Image source={{ uri: haircut.generatedImage }} style={s.haircutImg} contentFit="cover" />
              ) : (
                <View style={[s.haircutImgPlaceholder, { backgroundColor: C.surface2 }]}>
                  <ActivityIndicator color={C.gold} />
                </View>
              )}
              <View style={s.haircutInfo}>
                {haircut.rank === 1 && (
                  <View style={[s.bestBadge, { backgroundColor: C.gold + "20", borderColor: C.gold + "40" }]}>
                    <Ionicons name="trophy" size={11} color={C.gold} />
                    <Text style={[s.bestBadgeText, { color: C.gold }]}>Best Match</Text>
                  </View>
                )}
                <Text style={[s.haircutName, { color: C.text }]}>{haircut.name || `Style #${haircut.rank}`}</Text>
                <Text style={[s.haircutDesc, { color: C.textSec }]} numberOfLines={2}>{haircut.description}</Text>
                {haircut.generatedImage && (
                  <View style={[s.selectBtn, { backgroundColor: C.gold }]}>
                    <Text style={[s.selectBtnText, { color: C.bg }]}>Use as Avatar</Text>
                    {loading && <ActivityIndicator size="small" color={C.bg} />}
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <View style={[s.skipBar, { paddingBottom: bottomPad + 12 }]}>
          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip — enter app without avatar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  welcomeContent: { flex: 1, paddingHorizontal: 28, justifyContent: "space-between" },
  logoArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  logoRing: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 2,
    alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.08)",
  },
  logoText: { fontSize: 38, fontFamily: "DMSans_700Bold", letterSpacing: -1 },
  logoTagline: { fontSize: 12, fontFamily: "DMSans_400Regular", letterSpacing: 2, textTransform: "uppercase" },
  welcomeBtns: { gap: 12 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 17, borderRadius: 16,
  },
  primaryBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  disclaimer: { fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", paddingTop: 16 },
  formScroll: { paddingHorizontal: 24, gap: 16 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  formTitle: { fontSize: 28, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 20 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 12, fontFamily: "DMSans_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "DMSans_400Regular", borderWidth: 1 },
  passwordRow: { flexDirection: "row", gap: 8 },
  passwordInput: { flex: 1 },
  eyeBtn: { width: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  switchText: { fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 8 },
  avatarChoiceContent: { flex: 1, paddingHorizontal: 24, gap: 16 },
  avatarOptionBtn: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
    borderRadius: 18, borderWidth: 1,
  },
  avatarOptionIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  avatarOptionInfo: { flex: 1 },
  avatarOptionTitle: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  avatarOptionDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2, lineHeight: 17 },
  skipBtn: { alignItems: "center", paddingVertical: 12 },
  skipBtnText: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  circleCamera: {
    width: SCREEN_WIDTH - 80, height: SCREEN_WIDTH - 80, borderRadius: (SCREEN_WIDTH - 80) / 2,
    borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center",
    alignSelf: "center", gap: 10, backgroundColor: "rgba(201,168,76,0.05)",
  },
  circleText: { fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", paddingHorizontal: 30 },
  virtualTips: { gap: 8 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  resultsHeader: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  analyzingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  analyzingText: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  resultsScroll: { paddingHorizontal: 20, gap: 12, paddingTop: 8 },
  loadingPlaceholders: { gap: 12 },
  haircutCard: {
    flexDirection: "row", gap: 12, padding: 12, borderRadius: 18, borderWidth: 1,
  },
  haircutImg: { width: 90, height: 110, borderRadius: 12 },
  haircutImgPlaceholder: { width: 90, height: 110, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  haircutSkeleton: { marginTop: 8, alignSelf: "flex-start" },
  haircutInfo: { flex: 1, gap: 6, justifyContent: "center" },
  bestBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, alignSelf: "flex-start",
  },
  bestBadgeText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  haircutName: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  haircutDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", marginTop: 4 },
  selectBtnText: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  skipBar: { paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: "#2A2A2A", alignItems: "center", paddingTop: 12 },
});
