import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { Image } from "expo-image";
import { router } from "expo-router";

function AvatarCircle({ name, size = 56, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  const initials = name.slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 37) % 360;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 50%, 30%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "white", fontSize: size * 0.35, fontFamily: "DMSans_700Bold" }}>{initials}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, settings, updateSettings, logout, colors } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const C = colors;

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out", style: "destructive", onPress: () => {
            logout();
            router.replace("/auth" as any);
          }
        },
      ]
    );
  };

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      <View style={[s.header, { paddingTop: topPad + 12, borderBottomColor: C.border }]}>
        <Text style={[s.headerTitle, { color: C.text }]}>Settings</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + bottomPad + 20, paddingTop: 16 }}
      >
        {currentUser && (
          <View style={[s.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <AvatarCircle name={currentUser.displayName} size={56} avatarUrl={currentUser.avatarUrl} />
            <View style={s.profileInfo}>
              <Text style={[s.profileName, { color: C.text }]}>{currentUser.displayName}</Text>
              <Text style={[s.profileUsername, { color: C.textSecondary }]}>@{currentUser.username}</Text>
            </View>
          </View>
        )}

        <Text style={[s.sectionLabel, { color: C.textSecondary }]}>APPEARANCE</Text>
        <View style={[s.settingsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[s.settingRow, { borderBottomColor: C.border }]}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name="moon-outline" size={18} color={C.gold} />
              </View>
              <View>
                <Text style={[s.settingTitle, { color: C.text }]}>Dark Mode</Text>
                <Text style={[s.settingDesc, { color: C.textSecondary }]}>Dark background UI</Text>
              </View>
            </View>
            <Switch
              value={settings.isDarkMode}
              onValueChange={(v) => updateSettings({ isDarkMode: v })}
              trackColor={{ false: C.border, true: C.gold + "80" }}
              thumbColor={settings.isDarkMode ? C.gold : C.surface2}
            />
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: C.textSecondary }]}>CUTMATCH DISPLAY</Text>
        <View style={[s.settingsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[s.settingRow, { borderBottomColor: C.border }]}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name="shapes-outline" size={18} color={C.gold} />
              </View>
              <View>
                <Text style={[s.settingTitle, { color: C.text }]}>Show Face Shape</Text>
                <Text style={[s.settingDesc, { color: C.textSecondary }]}>Display your detected face shape</Text>
              </View>
            </View>
            <Switch
              value={settings.showFaceShape}
              onValueChange={(v) => updateSettings({ showFaceShape: v })}
              trackColor={{ false: C.border, true: C.gold + "80" }}
              thumbColor={settings.showFaceShape ? C.gold : C.surface2}
            />
          </View>

          <View style={[s.settingRow, { borderBottomColor: C.border }]}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name="bar-chart-outline" size={18} color={C.gold} />
              </View>
              <View>
                <Text style={[s.settingTitle, { color: C.text }]}>Show Difficulty</Text>
                <Text style={[s.settingDesc, { color: C.textSecondary }]}>Show haircut difficulty level</Text>
              </View>
            </View>
            <Switch
              value={settings.showDifficulty}
              onValueChange={(v) => updateSettings({ showDifficulty: v })}
              trackColor={{ false: C.border, true: C.gold + "80" }}
              thumbColor={settings.showDifficulty ? C.gold : C.surface2}
            />
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: C.textSecondary }]}>EXPERIENCE</Text>
        <View style={[s.settingsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name="phone-portrait-outline" size={18} color={C.gold} />
              </View>
              <View>
                <Text style={[s.settingTitle, { color: C.text }]}>Haptic Feedback</Text>
                <Text style={[s.settingDesc, { color: C.textSecondary }]}>Vibration on interactions</Text>
              </View>
            </View>
            <Switch
              value={settings.enableHaptics}
              onValueChange={(v) => updateSettings({ enableHaptics: v })}
              trackColor={{ false: C.border, true: C.gold + "80" }}
              thumbColor={settings.enableHaptics ? C.gold : C.surface2}
            />
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: C.textSecondary }]}>ABOUT</Text>
        <View style={[s.settingsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[s.settingRow, { borderBottomColor: C.border }]}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name="cut-outline" size={18} color={C.gold} />
              </View>
              <Text style={[s.settingTitle, { color: C.text }]}>CutMatch</Text>
            </View>
            <Text style={[s.settingVersion, { color: C.textSecondary }]}>v1.0.0</Text>
          </View>
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "20" }]}>
                <Ionicons name="sparkles-outline" size={18} color={C.gold} />
              </View>
              <View>
                <Text style={[s.settingTitle, { color: C.text }]}>Powered by</Text>
                <Text style={[s.settingDesc, { color: C.textSecondary }]}>OpenAI GPT-4o + DALL-E 2</Text>
              </View>
            </View>
          </View>
        </View>

        {currentUser && (
          <Pressable style={[s.logoutBtn, { borderColor: "#FF4444" + "40" }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#FF4444" />
            <Text style={s.logoutText}>Sign Out</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 26, fontFamily: "DMSans_700Bold" },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 16, padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 20,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontFamily: "DMSans_700Bold" },
  profileUsername: { fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 2 },
  sectionLabel: {
    fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 1,
    textTransform: "uppercase", paddingHorizontal: 20, marginBottom: 8, marginTop: 4,
  },
  settingsCard: { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  settingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  settingIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingTitle: { fontSize: 15, fontFamily: "DMSans_500Medium" },
  settingDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 1 },
  settingVersion: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, paddingVertical: 16, borderRadius: 18, borderWidth: 1, marginBottom: 8,
  },
  logoutText: { fontSize: 16, fontFamily: "DMSans_700Bold", color: "#FF4444" },
});
