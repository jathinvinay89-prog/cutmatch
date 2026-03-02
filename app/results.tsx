import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

interface Recommendation {
  rank: number;
  name: string;
  description: string;
  whyItFits: string;
  difficulty: string;
  generatedImage: string | null;
}

interface AnalysisData {
  faceShape: string;
  faceFeatures: string;
  hasGlasses: boolean;
  recommendations: Recommendation[];
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = {
    1: Colors.rank1,
    2: Colors.rank2,
    3: Colors.rank3,
    4: Colors.rank4,
  };
  const labels: Record<number, string> = {
    1: "#1 Best",
    2: "#2",
    3: "#3",
    4: "#4",
  };

  return (
    <View style={[styles.rankBadge, { backgroundColor: colors[rank] + "20", borderColor: colors[rank] + "50" }]}>
      {rank === 1 && (
        <Ionicons name="trophy" size={12} color={colors[rank]} />
      )}
      <Text style={[styles.rankText, { color: colors[rank] }]}>
        {labels[rank]}
      </Text>
    </View>
  );
}

function HaircutCard({ rec, photo, index }: { rec: Recommendation; photo: string; index: number }) {
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        delay: index * 120,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const difficultyColor =
    rec.difficulty === "Easy"
      ? "#4CAF50"
      : rec.difficulty === "Medium"
      ? "#FF9800"
      : "#F44336";

  const displayImage = rec.generatedImage && !imageError ? rec.generatedImage : photo;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {rec.rank === 1 && (
        <LinearGradient
          colors={["rgba(201, 168, 76, 0.15)", "transparent"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      )}

      <View style={styles.cardImageRow}>
        <View style={styles.cardImageContainer}>
          <Image
            source={{ uri: displayImage }}
            style={styles.cardImage}
            contentFit="cover"
            onError={() => setImageError(true)}
          />
          {rec.generatedImage && !imageError && (
            <View style={styles.aiTag}>
              <Ionicons name="sparkles" size={10} color={Colors.gold} />
              <Text style={styles.aiTagText}>AI</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <RankBadge rank={rec.rank} />
          <Text style={styles.haircutName}>{rec.name}</Text>
          <Text style={styles.haircutDesc} numberOfLines={2}>
            {rec.description}
          </Text>

          <View style={styles.difficultyBadge}>
            <View style={[styles.difficultyDot, { backgroundColor: difficultyColor }]} />
            <Text style={[styles.difficultyText, { color: difficultyColor }]}>
              {rec.difficulty}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.whyFits}>
        <Feather name="check-circle" size={13} color={Colors.gold} />
        <Text style={styles.whyFitsText}>{rec.whyItFits}</Text>
      </View>
    </Animated.View>
  );
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ data: string; photo: string }>();
  const headerAnim = useRef(new Animated.Value(0)).current;

  const data: AnalysisData = JSON.parse(params.data || "{}");
  const photo = params.photo || "";

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#141414", "#0A0A0A"]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          styles.header,
          {
            paddingTop: topPadding + 12,
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Your Best Cuts</Text>
          <Text style={styles.headerSubtitle}>
            {data.faceShape
              ? `${data.faceShape.charAt(0).toUpperCase() + data.faceShape.slice(1)} face shape`
              : "Analysis complete"}
          </Text>
        </View>

        <View style={styles.backBtn} />
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {data.faceFeatures && (
          <Animated.View style={[styles.featureCard, { opacity: headerAnim }]}>
            <View style={styles.featureHeader}>
              <Ionicons name="scan" size={16} color={Colors.gold} />
              <Text style={styles.featureTitle}>Face Analysis</Text>
            </View>
            <Text style={styles.featureText}>{data.faceFeatures}</Text>
            <View style={styles.badgesRow}>
              <View style={styles.featureBadge}>
                <Ionicons name="shapes-outline" size={12} color={Colors.gold} />
                <Text style={styles.featureBadgeText}>
                  {data.faceShape
                    ? data.faceShape.charAt(0).toUpperCase() + data.faceShape.slice(1)
                    : "Unknown"} face
                </Text>
              </View>
              {data.hasGlasses && (
                <View style={styles.featureBadge}>
                  <Ionicons name="glasses-outline" size={12} color={Colors.gold} />
                  <Text style={styles.featureBadgeText}>Glasses preserved</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        <View style={styles.cardsContainer}>
          {data.recommendations?.map((rec, i) => (
            <HaircutCard
              key={rec.rank}
              rec={rec}
              photo={photo}
              index={i}
            />
          ))}
        </View>

        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.footerText}>
            AI-generated previews show approximate results. Visit a barber to get the exact look.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.gold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  featureCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  featureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featureTitle: {
    fontSize: 13,
    fontFamily: "DMSans_700Bold",
    color: Colors.gold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  featureText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
  },
  featureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.25)",
  },
  featureBadgeText: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: Colors.gold,
  },
  cardsContainer: {
    gap: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    padding: 16,
    gap: 12,
  },
  cardImageRow: {
    flexDirection: "row",
    gap: 14,
  },
  cardImageContainer: {
    width: 90,
    height: 110,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  aiTag: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.4)",
  },
  aiTagText: {
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  cardInfo: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  rankText: {
    fontSize: 12,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 0.3,
  },
  haircutName: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  haircutDesc: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  difficultyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyText: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
  },
  whyFits: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(201, 168, 76, 0.06)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(201, 168, 76, 0.15)",
    alignItems: "flex-start",
  },
  whyFitsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    paddingTop: 4,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.textSecondary,
    lineHeight: 17,
  },
});
