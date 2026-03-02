import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animatePress = (fn: () => void) => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
    fn();
  };

  const openCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera Access Needed",
        "Please allow camera access in your settings to take a photo.",
        [{ text: "OK" }]
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setSelectedBase64(result.assets[0].base64 ?? null);
    }
  };

  const openGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Photo Access Needed",
        "Please allow photo library access in your settings.",
        [{ text: "OK" }]
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setSelectedBase64(result.assets[0].base64 ?? null);
    }
  };

  const analyzePhoto = async () => {
    if (!selectedImage || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      let base64Data: string;

      if (selectedBase64) {
        base64Data = `data:image/jpeg;base64,${selectedBase64}`;
      } else if (Platform.OS === "web") {
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        throw new Error("No image data available");
      }

      const apiResponse = await fetch(
        new URL("/api/analyze", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64Data }),
        }
      );

      if (!apiResponse.ok) {
        const err = await apiResponse.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data = await apiResponse.json();

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        router.push({
          pathname: "/results",
          params: {
            data: JSON.stringify(data),
            photo: selectedImage,
          },
        });
        setTimeout(() => {
          fadeAnim.setValue(1);
          setIsLoading(false);
          setSelectedImage(null);
          setSelectedBase64(null);
        }, 500);
      });
    } catch (error: any) {
      setIsLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Analysis Failed",
        error.message || "Could not analyze the photo. Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={["#141414", "#0A0A0A", "#0A0A0A"]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 16 },
        ]}
      >
        <Text style={styles.logoText}>CutMatch</Text>
        <Text style={styles.tagline}>AI-powered haircut recommendations</Text>
      </View>

      <View style={styles.content}>
        {selectedImage ? (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.previewImage}
              contentFit="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(10,10,10,0.8)"]}
              style={styles.imageGradient}
            />
            <Pressable
              style={styles.changePhotoBtn}
              onPress={() => {
                setSelectedImage(null);
                setSelectedBase64(null);
              }}
            >
              <Feather name="refresh-ccw" size={16} color={Colors.text} />
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.uploadArea}>
            <View style={styles.uploadIconRing}>
              <View style={styles.uploadIconInner}>
                <Ionicons name="person" size={40} color={Colors.gold} />
              </View>
            </View>

            <Text style={styles.uploadTitle}>Take or upload a photo</Text>
            <Text style={styles.uploadSubtitle}>
              Face the camera directly for best results.{"\n"}
              Good lighting helps the AI read your features.
            </Text>

            <View style={styles.uploadButtons}>
              <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1 }}>
                <Pressable
                  style={styles.uploadBtn}
                  onPress={() => animatePress(openCamera)}
                >
                  <Ionicons name="camera" size={20} color={Colors.gold} />
                  <Text style={styles.uploadBtnText}>Camera</Text>
                </Pressable>
              </Animated.View>

              <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1 }}>
                <Pressable
                  style={styles.uploadBtn}
                  onPress={() => animatePress(openGallery)}
                >
                  <Ionicons name="images" size={20} color={Colors.gold} />
                  <Text style={styles.uploadBtnText}>Gallery</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          {[
            { icon: "scan-outline" as const, label: "Face Shape" },
            { icon: "sparkles-outline" as const, label: "4 Cuts" },
            { icon: "image-outline" as const, label: "AI Photos" },
          ].map((item) => (
            <View key={item.label} style={styles.infoItem}>
              <Ionicons name={item.icon} size={18} color={Colors.gold} />
              <Text style={styles.infoLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.footer,
          { paddingBottom: bottomPadding + 24 },
        ]}
      >
        <Pressable
          style={[
            styles.analyzeBtn,
            (!selectedImage || isLoading) && styles.analyzeBtnDisabled,
          ]}
          onPress={analyzePhoto}
          disabled={!selectedImage || isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingRow}>
              <LoadingDots />
              <Text style={styles.analyzeBtnText}>Analyzing your face...</Text>
            </View>
          ) : (
            <>
              <Ionicons
                name="sparkles"
                size={20}
                color={selectedImage ? Colors.background : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.analyzeBtnText,
                  !selectedImage && styles.analyzeBtnTextDisabled,
                ]}
              >
                Find My Best Cuts
              </Text>
            </>
          )}
        </Pressable>

        {isLoading && (
          <Text style={styles.loadingHint}>
            Takes ~30 seconds — AI is analyzing your face and generating your looks
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();

    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, []);

  return (
    <View style={styles.dots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  logoText: {
    fontSize: 32,
    fontFamily: "DMSans_700Bold",
    color: Colors.gold,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  uploadArea: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  uploadIconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadIconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(201, 168, 76, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  uploadSubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  uploadButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  uploadBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "rgba(201, 168, 76, 0.1)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(201, 168, 76, 0.3)",
  },
  uploadBtnText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.gold,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  changePhotoBtn: {
    position: "absolute",
    bottom: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  changePhotoText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.text,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoItem: {
    alignItems: "center",
    gap: 6,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    backgroundColor: Colors.gold,
    borderRadius: 18,
  },
  analyzeBtnDisabled: {
    backgroundColor: Colors.surface2,
  },
  analyzeBtnText: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
    color: Colors.background,
    letterSpacing: -0.3,
  },
  analyzeBtnTextDisabled: {
    color: Colors.textSecondary,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingHint: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.background,
  },
});
