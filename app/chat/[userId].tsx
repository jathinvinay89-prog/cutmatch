import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import { router, useLocalSearchParams } from "expo-router";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
}

function timeLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, apiBase } = useApp();
  const params = useLocalSearchParams<{ userId: string; name: string }>();
  const otherId = parseInt(params.userId);
  const otherName = params.name || "Friend";
  const [input, setInput] = useState("");
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
    mutationFn: async (content: string) => {
      const url = new URL("/api/messages", apiBase).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: currentUser!.id, receiverId: otherId, content }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messages", currentUser?.id, otherId] });
    },
  });

  const send = () => {
    if (!input.trim() || !currentUser) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMutation.mutate(input.trim());
    setInput("");
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const initials = (name: string) => name.slice(0, 2).toUpperCase();
  const hue = (otherName.charCodeAt(0) * 37) % 360;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={[styles.headerAvatar, { backgroundColor: `hsl(${hue}, 50%, 30%)` }]}>
          <Text style={styles.headerAvatarText}>{initials(otherName)}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherName}</Text>
          <Text style={styles.headerOnline}>CutMatch friend</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.messageList, { paddingTop: 12 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyAvatar, { backgroundColor: `hsl(${hue}, 50%, 30%)` }]}>
                <Text style={styles.emptyAvatarText}>{initials(otherName)}</Text>
              </View>
              <Text style={styles.emptyName}>{otherName}</Text>
              <Text style={styles.emptyHint}>Start a conversation about haircuts</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === currentUser?.id;
            return (
              <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                    {item.content}
                  </Text>
                </View>
                <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>
                  {timeLabel(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />

        <View style={[styles.inputBar, { paddingBottom: bottomPad + 8 }]}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor={Colors.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
            maxLength={500}
          />
          <Pressable
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim()}
          >
            <Ionicons name="arrow-up" size={18} color={input.trim() ? Colors.background : Colors.textSecondary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { fontSize: 14, fontFamily: "DMSans_700Bold", color: Colors.text },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "DMSans_700Bold", color: Colors.text },
  headerOnline: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.textSecondary },
  messageList: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  emptyState: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyAvatarText: { fontSize: 24, fontFamily: "DMSans_700Bold", color: Colors.text },
  emptyName: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.text },
  emptyHint: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.textSecondary },
  msgRow: { alignItems: "flex-start", gap: 2 },
  msgRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  bubbleMine: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  bubbleText: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.text, lineHeight: 20 },
  bubbleTextMine: { color: Colors.background },
  msgTime: { fontSize: 10, fontFamily: "DMSans_400Regular", color: Colors.textSecondary, paddingHorizontal: 4 },
  msgTimeMine: { color: Colors.textSecondary },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  input: { flex: 1, backgroundColor: Colors.surface, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text, fontFamily: "DMSans_400Regular", fontSize: 14, borderWidth: 1, borderColor: Colors.border, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: Colors.surface2 },
});
