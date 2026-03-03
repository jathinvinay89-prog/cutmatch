import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

function AvatarCircle({ name, size = 46 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 37) % 360;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 50%, 30%)` }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

function OnboardingModal({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [step, setStep] = useState<"name" | "username">("name");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const { createUser } = useApp();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleContinue = async () => {
    if (step === "name") {
      if (!displayName.trim()) return Alert.alert("", "Enter your name");
      setStep("username");
    } else {
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean.length < 3) return Alert.alert("", "Username must be at least 3 characters");
      setLoading(true);
      try {
        await createUser(clean, displayName.trim());
        onDone();
      } catch (e: any) {
        Alert.alert("Error", e.message || "Could not create account");
      }
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView style={styles.onboardOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.onboardCard, { paddingBottom: bottomPad + 20 }]}>
          <View style={styles.onboardIconRing}>
            <Ionicons name="cut" size={32} color={Colors.gold} />
          </View>
          <Text style={styles.onboardTitle}>Join CutMatch</Text>
          <Text style={styles.onboardSubtitle}>
            {step === "name" ? "What's your name?" : "Pick a username"}
          </Text>
          <TextInput
            key={step}
            style={styles.onboardInput}
            placeholder={step === "name" ? "Your name" : "username"}
            placeholderTextColor={Colors.textSecondary}
            value={step === "name" ? displayName : username}
            onChangeText={step === "name" ? setDisplayName : setUsername}
            autoFocus
            autoCapitalize={step === "name" ? "words" : "none"}
            autoCorrect={false}
            maxLength={30}
          />
          <Pressable
            style={[styles.onboardBtn, loading && { opacity: 0.7 }]}
            onPress={handleContinue}
            disabled={loading}
          >
            <Text style={styles.onboardBtnText}>{loading ? "Creating..." : "Continue"}</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.background} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, isLoadingUser } = useApp();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ["/api/friends", currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const url = new URL(`/api/friends/${currentUser!.id}`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoadingUser) {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} /></View>;
  }

  if (!currentUser) {
    return (
      <>
        <View style={[styles.container]}>
          <View style={[styles.header, { paddingTop: topPad + 12 }]}>
            <Text style={styles.headerTitle}>Messages</Text>
          </View>
          <View style={styles.center}>
            <Ionicons name="chatbubbles-outline" size={56} color={Colors.border} />
            <Text style={styles.emptyTitle}>Chat with friends</Text>
            <Text style={styles.emptyText}>Create an account to message people you meet on the feed</Text>
            <Pressable style={styles.joinBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowOnboarding(true); }}>
              <Text style={styles.joinBtnText}>Create Account</Text>
            </Pressable>
          </View>
        </View>
        <OnboardingModal visible={showOnboarding} onDone={() => setShowOnboarding(false)} />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSub}>@{currentUser.username}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.gold} /></View>
      ) : friends.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyTitle}>No friends yet</Text>
          <Text style={styles.emptyText}>Add friends from the Feed tab to start chatting</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 + 34 : 84 }}
          renderItem={({ item }: any) => (
            <Pressable
              style={styles.friendRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/chat/[userId]", params: { userId: String(item.id), name: item.displayName } });
              }}
            >
              <AvatarCircle name={item.displayName} />
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{item.displayName}</Text>
                <Text style={styles.friendUsername}>@{item.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.border} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 76 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 26, fontFamily: "DMSans_700Bold", color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "DMSans_700Bold", color: Colors.text, textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },
  joinBtn: { paddingHorizontal: 28, paddingVertical: 14, backgroundColor: Colors.gold, borderRadius: 14, marginTop: 8 },
  joinBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold", color: Colors.background },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "DMSans_700Bold", color: Colors.text },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontFamily: "DMSans_700Bold", color: Colors.text },
  friendUsername: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, marginTop: 1 },
  onboardOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  onboardCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, gap: 16, borderWidth: 1, borderColor: Colors.border },
  onboardIconRing: { width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(201,168,76,0.1)", borderWidth: 1, borderColor: Colors.gold, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  onboardTitle: { fontSize: 24, fontFamily: "DMSans_700Bold", color: Colors.text, textAlign: "center" },
  onboardSubtitle: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, textAlign: "center" },
  onboardInput: { backgroundColor: Colors.surface2, borderRadius: 14, padding: 16, color: Colors.text, fontFamily: "DMSans_400Regular", fontSize: 16, borderWidth: 1, borderColor: Colors.border },
  onboardBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, backgroundColor: Colors.gold, borderRadius: 14 },
  onboardBtnText: { fontSize: 16, fontFamily: "DMSans_700Bold", color: Colors.background },
});
