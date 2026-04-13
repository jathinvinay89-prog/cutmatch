import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  TextInput,
  Animated,
} from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import type { AIAdvisorMessage } from "@/context/AppContext";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

const INTRO_MESSAGE: AIAdvisorMessage = {
  id: "intro",
  role: "assistant",
  content: "Hey! I'm your personal hair advisor. Ask me anything about haircuts, styles, or face shapes.",
};

interface AdvisorRequestMessage {
  role: "user" | "assistant";
  content: string;
}

function AIAvatar({ size = 36, gold }: { size?: number; gold: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: gold + "22", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: gold + "55" }}>
      <Ionicons name="cut" size={size * 0.46} color={gold} />
    </View>
  );
}

function TypingIndicator({ colors: C }: { colors: { gold: string; surface: string; border: string; textSecondary: string } }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -4, duration: 250, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.delay(500),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 150);
    const a3 = anim(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={typS.row}>
      <AIAvatar size={32} gold={C.gold} />
      <View style={[typS.bubble, { backgroundColor: C.surface, borderColor: C.border }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[typS.dot, { backgroundColor: C.textSecondary, transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
}

const typS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16 },
  bubble: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

function SendButton({ onPress, disabled, gold, background }: { onPress: () => void; disabled: boolean; gold: string; background: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 200, friction: 10 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}>
      <Animated.View style={[
        styles.sendBtn,
        disabled ? { backgroundColor: "transparent", borderWidth: 1, borderColor: gold + "33" } : { backgroundColor: gold },
        { transform: [{ scale }] },
      ]}>
        <Ionicons name="arrow-up" size={18} color={disabled ? gold + "55" : background} />
      </Animated.View>
    </Pressable>
  );
}

export default function AIAdvisorScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase, colors: C, settings, aiAdvisorMessages, setAiAdvisorMessages } = useApp();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const allMessages: AIAdvisorMessage[] = aiAdvisorMessages.length > 0 ? aiAdvisorMessages : [INTRO_MESSAGE];

  const scrollToBottom = () => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    if (settings.enableHaptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: AIAdvisorMessage = { id: Date.now().toString(), role: "user", content: text };
    const base = aiAdvisorMessages.length > 0 ? aiAdvisorMessages : [INTRO_MESSAGE];
    const nextMessages = [...base, userMsg];
    setAiAdvisorMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    scrollToBottom();

    try {
      const history: AdvisorRequestMessage[] = nextMessages
        .filter((m) => m.id !== "intro")
        .map((m) => ({ role: m.role, content: m.content }));

      const url = new URL("/api/ai-advisor", apiBase).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          faceShape: currentUser?.faceShape ?? null,
        }),
      });

      if (!res.ok) throw new Error("AI response failed");
      const data = await res.json() as { reply: string };
      const aiMsg: AIAdvisorMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: data.reply };
      setAiAdvisorMessages([...nextMessages, aiMsg]);
    } catch {
      const errMsg: AIAdvisorMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I couldn't process that right now. Please try again!",
      };
      setAiAdvisorMessages([...nextMessages, errMsg]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: C.border }]}>
        <Pressable style={[styles.backBtn, { borderColor: C.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <AIAvatar size={38} gold={C.gold} />
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: C.text }]}>AI Hair Advisor</Text>
          <Text style={[styles.headerSub, { color: C.gold }]}>Personal haircut expert</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatRef}
          data={allMessages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isAI = item.role === "assistant";
            return (
              <View style={[styles.msgRow, !isAI && styles.msgRowMine]}>
                {isAI && <AIAvatar size={32} gold={C.gold} />}
                <View style={[
                  styles.bubble,
                  isAI
                    ? { backgroundColor: C.surface, borderColor: C.border, borderWidth: StyleSheet.hairlineWidth }
                    : { backgroundColor: C.gold },
                ]}>
                  <Text style={[styles.bubbleText, { color: isAI ? C.text : C.background }]}>{item.content}</Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={isLoading ? <TypingIndicator colors={C} /> : null}
          onContentSizeChange={scrollToBottom}
        />

        <View style={[styles.inputBar, { paddingBottom: bottomPad + 8, borderTopColor: C.border, backgroundColor: C.background }]}>
          <TextInput
            style={[styles.input, { backgroundColor: C.surface, borderColor: C.border, color: C.text }]}
            placeholder="Ask about haircuts, styles, face shapes..."
            placeholderTextColor={C.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
            maxLength={600}
          />
          <SendButton onPress={send} disabled={!input.trim() || isLoading} gold={C.gold} background={C.background} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "DMSans_400Regular" },
  messageList: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowMine: { flexDirection: "row-reverse" },
  bubble: { maxWidth: "76%", borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10 },
  bubbleText: { fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 21 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontFamily: "DMSans_400Regular", borderWidth: StyleSheet.hairlineWidth, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
