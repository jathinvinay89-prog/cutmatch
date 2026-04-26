import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  TextInput,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useApp } from "@/context/AppContext";
import { fetch } from "expo/fetch";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type AuthStep =
  | "welcome"
  | "register_creds"
  | "login_creds"
  | "avatar_choice"
  | "avatar_standard"
  | "avatar_virtual"
  | "avatar_virtual_analyzing"
  | "avatar_virtual_results";

interface HaircutOption {
  rank: number;
  name: string;
  description: string;
  generatedImage: string | null;
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, uploadAvatar, apiBase } = useApp();
  const [step, setStep] = useState<AuthStep>("welcome");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);


  // Avatar state
  const [pendingUser, setPendingUser] = useState<{ id: number } | null>(null);
  const [haircuts, setHaircuts] = useState<HaircutOption[]>([]);
  const [analysisStatus, setAnalysisStatus] = useState("Analyzing your face...");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const C = {
    gold: "#C9A84C",
    bg: "#0A0A0A",
    surface: "#141414",
    surface2: "#1E1E1E",
    border: "#2A2A2A",
    text: "#F5F0E8",
    textSec: "#8A8580",
    success: "#4CAF50",
    error: "#FF4444",
  };

  // ── STEP 1: Begin registration ──────────────────────────────────────────────
  const handleRegister = async () => {
    if (!username.trim()) return Alert.alert("", "Enter a username");
    if (!password.trim()) return Alert.alert("", "Enter a password");
    if (password !== confirmPassword) return Alert.alert("", "Passwords don't match");
    if (password.length < 4) return Alert.alert("", "Password must be at least 4 characters");
    setLoading(true);
    try {
      const name = displayName.trim() || username.trim();
      const user = await register(username.trim(), password, name);
      setPendingUser({ id: user.id });
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

  const skipAvatar = () => router.replace("/(tabs)");

  const showPermissionDeniedAlert = (type: "camera" | "photos") => {
    const title = type === "camera" ? "Camera Access Required" : "Photo Library Access Required";
    const message =
      type === "camera"
        ? "CutMatch needs camera access to take your photo for the hair try-on. Please enable Camera access for CutMatch in your device Settings."
        : "CutMatch needs access to your photo library to select a photo for the hair try-on. Please enable Photos access for CutMatch in your device Settings.";
    Alert.alert(title, message, [
      { text: "Not Now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]);
  };

  const pickAndUploadPhoto = async (source: "camera" | "gallery") => {
    let result;
    if (source === "camera" && Platform.OS !== "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { showPermissionDeniedAlert("camera"); return; }
      try {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
        });
      } catch {
        // Camera unavailable (simulator/restricted) — fall back to gallery
        const libStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libStatus.status !== "granted") { showPermissionDeniedAlert("photos"); return; }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
        });
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { showPermissionDeniedAlert("photos"); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
      });
    }
    if (!result.canceled && result.assets[0] && pendingUser) {
      setLoading(true);
      try {
        const b64 = result.assets[0].base64;
        if (b64) await uploadAvatar(pendingUser.id, `data:image/jpeg;base64,${b64}`);
      } catch {}
      setLoading(false);
    }
    router.replace("/(tabs)");
  };

  const takeVirtualSelfie = async () => {
    let result;

    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status === "granted") {
        try {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
          });
        } catch {
          // Camera hardware unavailable (e.g. simulator) — fall back to gallery
          result = undefined;
        }
      } else {
        const shouldContinue = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Camera Access Required",
            "CutMatch needs camera access to take your selfie for the AI hair try-on. You can still pick a photo from your library, or enable Camera access in Settings.",
            [
              { text: "Use Photo Library", onPress: () => resolve(true) },
              { text: "Open Settings", onPress: () => { Linking.openSettings(); resolve(false); } },
            ]
          );
        });
        if (!shouldContinue) return;
      }
    }

    if (!result) {
      const libStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libStatus.status !== "granted") { showPermissionDeniedAlert("photos"); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
      });
    }

    if (!result || result.canceled || !result.assets[0]) return;
    const b64 = result.assets[0].base64;
    if (!b64) { Alert.alert("Error", "Could not read photo. Try again."); return; }

    setStep("avatar_virtual_analyzing");
    setAnalysisStatus("Analyzing your face shape with Replit AI...");
    setHaircuts([]);

    try {
      const url = new URL("/api/analyze-simple", apiBase).toString();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: `data:image/jpeg;base64,${b64}` }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || "Analysis failed");
      }
      setAnalysisStatus("Generating your AI looks...");
      const data = await response.json();
      setHaircuts(data.recommendations || []);
      setStep("avatar_virtual_results");
    } catch (e: any) {
      Alert.alert("Analysis Failed", e.message || "Could not analyze photo. Try again.");
      setStep("avatar_virtual");
    }
  };

  const selectVirtualAvatar = async (haircut: HaircutOption) => {
    if (!pendingUser) { router.replace("/(tabs)"); return; }
    if (!haircut.generatedImage) { skipAvatar(); return; }
    setLoading(true);
    try { await uploadAvatar(pendingUser.id, haircut.generatedImage); } catch {}
    setLoading(false);
    router.replace("/(tabs)");
  };

  // ── WELCOME ──────────────────────────────────────────────────────────────
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
          <Text style={[s.disclaimer, { color: C.textSec }]}>Find your perfect haircut with AI-powered recommendations</Text>
        </View>
      </View>
    );
  }

  // ── REGISTER ─────────────────────────────────────────────────────────────
  if (step === "register_creds") {
    return (
      <KeyboardAvoidingView style={[s.container, { backgroundColor: C.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[s.formScroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 40 }]} keyboardShouldPersistTaps="handled">
          <Pressable style={s.backBtn} onPress={() => setStep("welcome")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.formTitle, { color: C.text }]}>Create Account</Text>
          <Text style={[s.formSubtitle, { color: C.textSec }]}>Join CutMatch to share and discover haircuts</Text>

          {[
            { label: "Display Name", value: displayName, onChange: setDisplayName, placeholder: "Your name", autoCapitalize: "words" as const },
            { label: "Username", value: username, onChange: setUsername, placeholder: "letters, numbers, _", autoCapitalize: "none" as const },
          ].map((f) => (
            <View key={f.label} style={s.inputGroup}>
              <Text style={[s.inputLabel, { color: C.textSec }]}>{f.label}</Text>
              <TextInput style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
                placeholder={f.placeholder} placeholderTextColor={C.textSec} value={f.value}
                onChangeText={f.onChange} autoCapitalize={f.autoCapitalize} autoCorrect={false} maxLength={30} />
            </View>
          ))}

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Password</Text>
            <View style={s.passwordRow}>
              <TextInput style={[s.input, s.passwordInput, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
                placeholder="At least 4 characters" placeholderTextColor={C.textSec} value={password}
                onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} maxLength={50} />
              <Pressable style={[s.eyeBtn, { backgroundColor: C.surface2, borderColor: C.border }]} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSec} />
              </Pressable>
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Confirm Password</Text>
            <TextInput style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="Re-enter password" placeholderTextColor={C.textSec} value={confirmPassword}
              onChangeText={setConfirmPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} maxLength={50} />
          </View>

          <Pressable style={[s.primaryBtn, { backgroundColor: C.gold, marginTop: 8, opacity: loading ? 0.7 : 1 }]} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={C.bg} /> : (
              <><Text style={[s.primaryBtnText, { color: C.bg }]}>Continue</Text><Ionicons name="arrow-forward" size={18} color={C.bg} /></>
            )}
          </Pressable>

          <Pressable onPress={() => setStep("login_creds")}>
            <Text style={[s.switchText, { color: C.textSec }]}>Already have an account? <Text style={{ color: C.gold }}>Sign In</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (step === "login_creds") {
    return (
      <KeyboardAvoidingView style={[s.container, { backgroundColor: C.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[s.formScroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 40 }]} keyboardShouldPersistTaps="handled">
          <Pressable style={s.backBtn} onPress={() => setStep("welcome")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.formTitle, { color: C.text }]}>Welcome Back</Text>
          <Text style={[s.formSubtitle, { color: C.textSec }]}>Sign in to your CutMatch account</Text>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Username</Text>
            <TextInput style={[s.input, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
              placeholder="Your username" placeholderTextColor={C.textSec} value={username}
              onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} />
          </View>

          <View style={s.inputGroup}>
            <Text style={[s.inputLabel, { color: C.textSec }]}>Password</Text>
            <View style={s.passwordRow}>
              <TextInput style={[s.input, s.passwordInput, { backgroundColor: C.surface2, borderColor: C.border, color: C.text }]}
                placeholder="Your password" placeholderTextColor={C.textSec} value={password}
                onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} maxLength={50} />
              <Pressable style={[s.eyeBtn, { backgroundColor: C.surface2, borderColor: C.border }]} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSec} />
              </Pressable>
            </View>
          </View>

          <Pressable style={[s.primaryBtn, { backgroundColor: C.gold, marginTop: 8, opacity: loading ? 0.7 : 1 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={C.bg} /> : (
              <><Text style={[s.primaryBtnText, { color: C.bg }]}>Sign In</Text><Ionicons name="arrow-forward" size={18} color={C.bg} /></>
            )}
          </Pressable>

          <Pressable onPress={() => setStep("register_creds")}>
            <Text style={[s.switchText, { color: C.textSec }]}>No account? <Text style={{ color: C.gold }}>Create one</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── AVATAR CHOICE ─────────────────────────────────────────────────────────
  if (step === "avatar_choice") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.centeredContent, { paddingTop: topPad + 30, paddingBottom: bottomPad + 30 }]}>
          <View style={[s.logoRing, { borderColor: C.gold, marginBottom: 8 }]}>
            <Ionicons name="person-circle-outline" size={40} color={C.gold} />
          </View>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center" }]}>Account Created!</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>Now set up your profile picture</Text>

          {[
            { icon: "camera-outline" as const, title: "Standard Photo", desc: "Take a photo or pick from gallery", step: "avatar_standard" as AuthStep },
            { icon: "sparkles-outline" as const, title: "Virtual AI Photo", desc: "Get an AI-generated avatar with your best haircut style", step: "avatar_virtual" as AuthStep },
          ].map((opt) => (
            <Pressable key={opt.step} style={[s.optionBtn, { backgroundColor: C.surface, borderColor: C.gold + "50" }]} onPress={() => setStep(opt.step)}>
              <View style={[s.optionIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name={opt.icon} size={26} color={C.gold} />
              </View>
              <View style={s.optionInfo}>
                <Text style={[s.optionTitle, { color: C.text }]}>{opt.title}</Text>
                <Text style={[s.optionDesc, { color: C.textSec }]}>{opt.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textSec} />
            </Pressable>
          ))}

          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── STANDARD PHOTO ────────────────────────────────────────────────────────
  if (step === "avatar_standard") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.centeredContent, { paddingTop: topPad + 20, paddingBottom: bottomPad + 30 }]}>
          <Pressable style={[s.backBtn, { marginBottom: 20, alignSelf: "flex-start" }]} onPress={() => setStep("avatar_choice")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center" }]}>Choose Photo Source</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>Select a clear, well-lit photo of your face</Text>

          {[
            { icon: "camera" as const, title: "Camera", desc: "Take a photo right now", source: "camera" as const },
            { icon: "images" as const, title: "Gallery", desc: "Choose from your photo library", source: "gallery" as const },
          ].map((opt) => (
            <Pressable key={opt.source} style={[s.optionBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => pickAndUploadPhoto(opt.source)}>
              <View style={[s.optionIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name={opt.icon} size={26} color={C.gold} />
              </View>
              <View style={s.optionInfo}>
                <Text style={[s.optionTitle, { color: C.text }]}>{opt.title}</Text>
                <Text style={[s.optionDesc, { color: C.textSec }]}>{opt.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textSec} />
            </Pressable>
          ))}

          {loading && <ActivityIndicator color={C.gold} style={{ marginTop: 20 }} />}
          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── VIRTUAL SELFIE ────────────────────────────────────────────────────────
  if (step === "avatar_virtual") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.centeredContent, { paddingTop: topPad + 20, paddingBottom: bottomPad + 30 }]}>
          <Pressable style={[s.backBtn, { marginBottom: 20, alignSelf: "flex-start" }]} onPress={() => setStep("avatar_choice")}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center" }]}>Virtual AI Avatar</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>
            Powered by Replit AI — take a selfie and generate your avatar with the best haircut for your face shape
          </Text>

          <View style={[s.circleCam, { borderColor: C.gold }]}>
            <Ionicons name="person" size={72} color={C.border} />
            <Text style={[s.circleHint, { color: C.textSec }]}>Position your face here</Text>
          </View>

          <View style={{ gap: 6, width: "100%" }}>
            {["Face camera directly", "Good lighting", "No hat or sunglasses"].map((tip) => (
              <View key={tip} style={s.tipRow}>
                <Ionicons name="checkmark-circle" size={14} color={C.gold} />
                <Text style={[s.tipText, { color: C.textSec }]}>{tip}</Text>
              </View>
            ))}
          </View>

          <Pressable style={[s.primaryBtn, { backgroundColor: C.gold, width: "100%" }]} onPress={takeVirtualSelfie}>
            <Ionicons name="camera" size={18} color={C.bg} />
            <Text style={[s.primaryBtnText, { color: C.bg }]}>Take Selfie & Generate</Text>
          </Pressable>

          <Pressable style={s.skipBtn} onPress={skipAvatar}>
            <Text style={[s.skipBtnText, { color: C.textSec }]}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── ANALYZING ─────────────────────────────────────────────────────────────
  if (step === "avatar_virtual_analyzing") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.centeredContent, { paddingTop: topPad + 30, paddingBottom: bottomPad + 30, alignItems: "center" }]}>
          <View style={[s.logoRing, { borderColor: C.gold, width: 90, height: 90, borderRadius: 45 }]}>
            <ActivityIndicator color={C.gold} size="large" />
          </View>
          <Text style={[s.formTitle, { color: C.text, textAlign: "center", marginTop: 16 }]}>Replit AI is Working</Text>
          <Text style={[s.formSubtitle, { color: C.textSec, textAlign: "center" }]}>{analysisStatus}</Text>
          <Text style={[s.disclaimer, { color: C.textSec, textAlign: "center", marginTop: 8 }]}>
            Generating all 4 looks simultaneously.{"\n"}This takes about 30–60 seconds.
          </Text>
        </View>
      </View>
    );
  }

  // ── VIRTUAL RESULTS ───────────────────────────────────────────────────────
  if (step === "avatar_virtual_results") {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <LinearGradient colors={["#141414", "#0A0A0A"]} style={StyleSheet.absoluteFill} />
        <View style={[s.resultsHeader, { paddingTop: topPad + 12 }]}>
          <Text style={[s.formTitle, { color: C.text }]}>Choose Your Avatar</Text>
          <Text style={[s.formSubtitle, { color: C.textSec }]}>Tap the look you want as your profile picture</Text>
        </View>

        <ScrollView contentContainerStyle={[s.resultsScroll, { paddingBottom: bottomPad + 80 }]} showsVerticalScrollIndicator={false}>
          {haircuts.map((haircut) => (
            <Pressable
              key={haircut.rank}
              style={[s.haircutCard, { backgroundColor: C.surface, borderColor: haircut.rank === 1 ? C.gold + "60" : C.border }]}
              onPress={() => selectVirtualAvatar(haircut)}
              disabled={loading}
            >
              {haircut.rank === 1 && <LinearGradient colors={[C.gold + "18", "transparent"]} style={StyleSheet.absoluteFill} />}
              {haircut.generatedImage ? (
                <Image source={{ uri: haircut.generatedImage }} style={s.haircutImg} contentFit="cover" />
              ) : (
                <View style={[s.haircutImgPlaceholder, { backgroundColor: C.surface2 }]}>
                  <Ionicons name="cut-outline" size={24} color={C.border} />
                </View>
              )}
              <View style={s.haircutInfo}>
                {haircut.rank === 1 && (
                  <View style={[s.bestBadge, { backgroundColor: C.gold + "20", borderColor: C.gold + "40" }]}>
                    <Ionicons name="trophy" size={10} color={C.gold} />
                    <Text style={[s.bestBadgeText, { color: C.gold }]}>Best Match</Text>
                  </View>
                )}
                <Text style={[s.haircutName, { color: C.text }]}>{haircut.name || `Style #${haircut.rank}`}</Text>
                <Text style={[s.haircutDesc, { color: C.textSec }]} numberOfLines={2}>{haircut.description}</Text>
                <View style={[s.useAvatarBtn, { backgroundColor: loading ? C.border : C.gold }]}>
                  {loading ? <ActivityIndicator color={C.bg} size="small" /> : (
                    <Text style={[s.useAvatarText, { color: C.bg }]}>Use as Avatar</Text>
                  )}
                </View>
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
  centeredContent: { flex: 1, paddingHorizontal: 24, gap: 16 },
  logoArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  logoRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.08)" },
  logoText: { fontSize: 38, fontFamily: "DMSans_700Bold", letterSpacing: -1 },
  logoTagline: { fontSize: 12, fontFamily: "DMSans_400Regular", letterSpacing: 2, textTransform: "uppercase" },
  welcomeBtns: { gap: 12 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 17, borderRadius: 16 },
  primaryBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16, borderWidth: 1 },
  secondaryBtnText: { fontSize: 16, fontFamily: "DMSans_500Medium" },
  disclaimer: { fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", paddingTop: 16 },
  formScroll: { paddingHorizontal: 24, gap: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  formTitle: { fontSize: 28, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 20 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 12, fontFamily: "DMSans_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "DMSans_400Regular", borderWidth: 1 },
  passwordRow: { flexDirection: "row", gap: 8 },
  passwordInput: { flex: 1 },
  eyeBtn: { width: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  switchText: { fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center" },
  // avatar
  optionBtn: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, width: "100%" },
  optionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  optionInfo: { flex: 1 },
  optionTitle: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  optionDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2, lineHeight: 17 },
  skipBtn: { alignItems: "center", paddingVertical: 12 },
  skipBtnText: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  circleCam: { width: SCREEN_WIDTH - 100, height: SCREEN_WIDTH - 100, borderRadius: (SCREEN_WIDTH - 100) / 2, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center", alignSelf: "center", gap: 10, backgroundColor: "rgba(201,168,76,0.05)" },
  circleHint: { fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  resultsHeader: { paddingHorizontal: 20, paddingBottom: 8, gap: 4 },
  resultsScroll: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
  haircutCard: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  haircutImg: { width: 90, height: 110, borderRadius: 12 },
  haircutImgPlaceholder: { width: 90, height: 110, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  haircutInfo: { flex: 1, gap: 6, justifyContent: "center" },
  bestBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start" },
  bestBadgeText: { fontSize: 10, fontFamily: "DMSans_700Bold" },
  haircutName: { fontSize: 15, fontFamily: "DMSans_700Bold" },
  haircutDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  useAvatarBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, alignSelf: "flex-start", marginTop: 4 },
  useAvatarText: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  skipBar: { paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: "#2A2A2A", alignItems: "center", paddingTop: 12 },
});
