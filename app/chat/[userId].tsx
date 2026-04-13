import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useApp } from "@/context/AppContext";
import { router, useLocalSearchParams } from "expo-router";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { isLiquidGlass, LG_BLUR_INTENSITY, LG_BORDER_GLOW } from "@/lib/liquidGlass";

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  messageType: string;
  metadata: any;
  createdAt: string;
}

function timeLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CompetitionBubble({ meta, isMine, colors: C, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={[
      cbS.card,
      { backgroundColor: isMine ? C.gold + "20" : C.surface2, borderColor: C.gold + "40" }
    ]}>
      <View style={cbS.header}>
        <Ionicons name="trophy" size={16} color={C.gold} />
        <Text style={[cbS.title, { color: C.gold }]}>CutCompetition Challenge!</Text>
      </View>
      <Text style={[cbS.desc, { color: C.text }]}>
        {isMine ? "You challenged them" : "They challenged you"} — who has the better cut?
      </Text>
      <View style={[cbS.tapBtn, { backgroundColor: C.gold }]}>
        <Text style={[cbS.tapText, { color: C.background }]}>View Competition</Text>
      </View>
    </Pressable>
  );
}

function CutMatchBubble({ meta, isMine, colors: C }: any) {
  const rec = meta?.recommendations?.[0];
  return (
    <View style={[cmS.card, { backgroundColor: isMine ? C.gold + "14" : C.surface2, borderColor: C.gold + "30" }]}>
      <View style={cmS.header}>
        <Ionicons name="cut-outline" size={14} color={C.gold} />
        <Text style={[cmS.label, { color: C.gold }]}>Shared CutMatch</Text>
      </View>
      {rec?.generatedImage && (
        <Image source={{ uri: rec.generatedImage }} style={cmS.img} contentFit="cover" />
      )}
      <Text style={[cmS.name, { color: C.text }]}>{rec?.name || "CutMatch Result"}</Text>
      <Text style={[cmS.desc, { color: C.textSecondary }]} numberOfLines={1}>{rec?.description}</Text>
    </View>
  );
}

function BottomSheet({ visible, onClose, children, colors: C }: { visible: boolean; onClose: () => void; children: React.ReactNode; colors: any }) {
  const translateY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 300, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <View style={bsS.overlay} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[bsS.backdrop, { opacity }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[bsS.sheet, { backgroundColor: C.surface, borderColor: C.border, transform: [{ translateY }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const bsS = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, overflow: "hidden", paddingBottom: 24 },
});

function SendButton({ onPress, disabled, gold, background }: { onPress: () => void; disabled: boolean; gold: string; background: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 200, friction: 10 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}>
      <Animated.View style={[
        styles.sendBtn,
        disabled ? { backgroundColor: "transparent", borderWidth: 1 } : { backgroundColor: gold },
        { transform: [{ scale }] },
      ]}>
        <Ionicons name="arrow-up" size={18} color={disabled ? gold + "66" : background} />
      </Animated.View>
    </Pressable>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C, settings } = useApp();
  const params = useLocalSearchParams<{ userId: string; name: string }>();
  const otherId = parseInt(params.userId);
  const otherName = params.name || "Friend";
  const [input, setInput] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [loadingComp, setLoadingComp] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages", currentUser?.id, otherId],
    enabled: !!currentUser,
    refetchInterval: 3000,
    queryFn: async () => {
      const url = new URL(`/api/messages/${currentUser!.id}/${otherId}`, apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ content, messageType, metadata }: { content: string; messageType?: string; metadata?: any }) => {
      const url = new URL("/api/messages", apiBase).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: currentUser!.id, receiverId: otherId, content, messageType: messageType || "text", metadata }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messages", currentUser?.id, otherId] });
    },
  });

  const send = () => {
    if (!input.trim() || !currentUser) return;
    if (settings.enableHaptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMutation.mutate({ content: input.trim() });
    setInput("");
  };

  const sendCutMatch = () => {
    setShowPlusMenu(false);
    router.push({ pathname: "/(tabs)", params: { sendToFriendId: String(otherId), sendToFriendName: otherName } } as any);
  };

  const startCompetition = async () => {
    setShowPlusMenu(false);
    if (!currentUser) return;
    setLoadingComp(true);
    try {
      const url = new URL("/api/competitions", apiBase).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengerId: currentUser.id, challengeeId: otherId }),
      });
      if (!res.ok) throw new Error("Failed to create competition");
      const comp = await res.json();
      sendMutation.mutate({
        content: "⚔️ Started a CutCompetition! Both need to do a CutMatch to participate.",
        messageType: "competition_invite",
        metadata: { competitionId: comp.id },
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not start competition.");
    }
    setLoadingComp(false);
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const initials = (name: string) => name.slice(0, 2).toUpperCase();
  const hue = (otherName.charCodeAt(0) * 37) % 360;

  const isDark = C.background === "#0A0A0A";

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, isLiquidGlass
        ? { paddingTop: topPad + 10, borderBottomColor: "transparent", backgroundColor: "transparent", overflow: "hidden" }
        : { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
        {isLiquidGlass && <BlurView intensity={LG_BLUR_INTENSITY} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
        <Pressable style={[styles.backBtn, { borderColor: C.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <View style={[styles.headerAvatar, { backgroundColor: `hsl(${hue}, 50%, 30%)` }]}>
          <Text style={[styles.headerAvatarText, { color: "#fff" }]}>{initials(otherName)}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: C.text }]}>{otherName}</Text>
          <Text style={[styles.headerOnline, { color: C.textSecondary }]}>CutMatch friend</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.messageList, { paddingTop: 16 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyAvatar, { backgroundColor: `hsl(${hue}, 50%, 30%)` }]}>
                <Text style={[styles.emptyAvatarText, { color: "#fff" }]}>{initials(otherName)}</Text>
              </View>
              <Text style={[styles.emptyName, { color: C.text }]}>{otherName}</Text>
              <Text style={[styles.emptyHint, { color: C.textSecondary }]}>Start a conversation about haircuts</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === currentUser?.id;
            if (item.messageType === "competition_invite") {
              return (
                <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                  <CompetitionBubble
                    meta={item.metadata}
                    isMine={isMine}
                    colors={C}
                    onPress={() => {
                      if (item.metadata?.competitionId) {
                        router.push({ pathname: "/competition/[id]", params: { id: String(item.metadata.competitionId) } } as any);
                      }
                    }}
                  />
                  <Text style={[styles.msgTime, isMine && styles.msgTimeMine, { color: C.textSecondary }]}>{timeLabel(item.createdAt)}</Text>
                </View>
              );
            }
            if (item.messageType === "cutmatch") {
              return (
                <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                  <CutMatchBubble meta={item.metadata} isMine={isMine} colors={C} />
                  <Text style={[styles.msgTime, isMine && styles.msgTimeMine, { color: C.textSecondary }]}>{timeLabel(item.createdAt)}</Text>
                </View>
              );
            }
            return (
              <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                <View style={[styles.bubble, isMine ? { backgroundColor: C.gold } : { backgroundColor: C.surface, borderColor: C.border, borderWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.bubbleText, { color: isMine ? C.background : C.text }]}>{item.content}</Text>
                </View>
                <Text style={[styles.msgTime, isMine && styles.msgTimeMine, { color: C.textSecondary }]}>{timeLabel(item.createdAt)}</Text>
              </View>
            );
          }}
        />

        <View style={[styles.inputBar, { paddingBottom: bottomPad + 8, borderTopColor: C.border, backgroundColor: C.background }]}>
          <Pressable
            style={[styles.plusBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => setShowPlusMenu(true)}
          >
            <Ionicons name="add" size={22} color={C.gold} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: C.surface, borderColor: C.border, color: C.text }]}
            placeholder="Message..."
            placeholderTextColor={C.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
            maxLength={500}
          />
          <SendButton onPress={send} disabled={!input.trim()} gold={C.gold} background={C.background} />
        </View>
      </KeyboardAvoidingView>

      <BottomSheet visible={showPlusMenu} onClose={() => setShowPlusMenu(false)} colors={C}>
        <Text style={[styles.menuTitle, { color: C.textSecondary }]}>Send Something</Text>

        <Pressable style={[styles.menuItem, { borderBottomColor: C.border }]} onPress={sendCutMatch}>
          <View style={[styles.menuIcon, { backgroundColor: C.gold + "20" }]}>
            <Ionicons name="cut-outline" size={24} color={C.gold} />
          </View>
          <View style={styles.menuInfo}>
            <Text style={[styles.menuItemTitle, { color: C.text }]}>Send CutMatch</Text>
            <Text style={[styles.menuItemDesc, { color: C.textSecondary }]}>Share your latest haircut results</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.border} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={startCompetition} disabled={loadingComp}>
          <View style={[styles.menuIcon, { backgroundColor: C.gold + "20" }]}>
            {loadingComp ? <ActivityIndicator color={C.gold} size="small" /> : <Ionicons name="trophy-outline" size={24} color={C.gold} />}
          </View>
          <View style={styles.menuInfo}>
            <Text style={[styles.menuItemTitle, { color: C.text }]}>CutCompetition</Text>
            <Text style={[styles.menuItemDesc, { color: C.textSecondary }]}>Challenge them — who has the better cut?</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.border} />
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const cbS = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 8, maxWidth: "80%" },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 13, fontFamily: "DMSans_700Bold" },
  desc: { fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17 },
  tapBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, alignSelf: "flex-start" },
  tapText: { fontSize: 12, fontFamily: "DMSans_700Bold" },
});

const cmS = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 12, gap: 6, maxWidth: "75%" },
  header: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { fontSize: 10, fontFamily: "DMSans_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  img: { width: "100%", height: 120, borderRadius: 12 },
  name: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  desc: { fontSize: 11, fontFamily: "DMSans_400Regular" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  headerOnline: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  messageList: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  emptyState: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyAvatarText: { fontSize: 24, fontFamily: "DMSans_700Bold" },
  emptyName: { fontSize: 17, fontFamily: "DMSans_700Bold" },
  emptyHint: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  msgRow: { alignItems: "flex-start", gap: 3 },
  msgRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "76%", borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10 },
  bubbleText: { fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: "DMSans_400Regular", paddingHorizontal: 4 },
  msgTimeMine: {},
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  plusBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  input: { flex: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontFamily: "DMSans_400Regular", borderWidth: StyleSheet.hairlineWidth, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderColor: "transparent" },
  menuTitle: { fontSize: 11, fontFamily: "DMSans_700Bold", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  menuIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  menuInfo: { flex: 1 },
  menuItemTitle: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  menuItemDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
});
