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

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function SettingRow({
  icon,
  iconColor,
  title,
  description,
  right,
  isLast = false,
  colors: C,
}: {
  icon: IconName;
  iconColor?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
  isLast?: boolean;
  colors: any;
}) {
  const color = iconColor ?? C.gold;
  return (
    <View style={[s.settingRow, !isLast && { borderBottomColor: C.border, borderBottomWidth: 1 }]}>
      <View style={s.settingLeft}>
        <View style={[s.settingIcon, { backgroundColor: color + "1E" }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.settingTitle, { color: C.text }]}>{title}</Text>
          {description ? <Text style={[s.settingDesc, { color: C.textSecondary }]}>{description}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

function SectionCard({ children, colors: C }: { children: React.ReactNode; colors: any }) {
  return (
    <View style={[s.settingsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      {children}
    </View>
  );
}

function SectionLabel({ label, colors: C }: { label: string; colors: any }) {
  return <Text style={[s.sectionLabel, { color: C.textSecondary }]}>{label}</Text>;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, settings, updateSettings, logout, colors } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const C = colors;

  const toggleSwitch = (key: Parameters<typeof updateSettings>[0]) => updateSettings(key);

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

  const switchProps = (value: boolean) => ({
    value,
    trackColor: { false: C.border, true: C.gold + "80" },
    thumbColor: value ? C.gold : C.surface2,
  });

  const hairLengths: Array<"Short" | "Medium" | "Long"> = ["Short", "Medium", "Long"];

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
            <AvatarCircle name={currentUser.displayName} size={54} avatarUrl={currentUser.avatarUrl} />
            <View style={s.profileInfo}>
              <Text style={[s.profileName, { color: C.text }]}>{currentUser.displayName}</Text>
              <Text style={[s.profileUsername, { color: C.textSecondary }]}>@{currentUser.username}</Text>
            </View>
            <View style={[s.profileBadge, { backgroundColor: C.gold + "18", borderColor: C.gold + "30" }]}>
              <Ionicons name="checkmark-circle" size={14} color={C.gold} />
              <Text style={[s.profileBadgeText, { color: C.gold }]}>Active</Text>
            </View>
          </View>
        )}

        <SectionLabel label="APPEARANCE" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="moon-outline"
            title="Dark Mode"
            description="Dark background UI"
            isLast
            colors={C}
            right={
              <Switch
                {...switchProps(settings.isDarkMode)}
                onValueChange={(v) => toggleSwitch({ isDarkMode: v })}
              />
            }
          />
        </SectionCard>

        <SectionLabel label="CUTMATCH DISPLAY" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="shapes-outline"
            title="Show Face Shape"
            description="Display your detected face shape"
            colors={C}
            right={
              <Switch
                {...switchProps(settings.showFaceShape)}
                onValueChange={(v) => toggleSwitch({ showFaceShape: v })}
              />
            }
          />
          <SettingRow
            icon="bar-chart-outline"
            title="Show Difficulty"
            description="Show haircut difficulty level"
            isLast
            colors={C}
            right={
              <Switch
                {...switchProps(settings.showDifficulty)}
                onValueChange={(v) => toggleSwitch({ showDifficulty: v })}
              />
            }
          />
        </SectionCard>

        <SectionLabel label="FEED PREFERENCES" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="albums-outline"
            title="Compact Feed"
            description="Smaller cards, more posts visible"
            colors={C}
            right={
              <Switch
                {...switchProps(settings.compactFeedMode)}
                onValueChange={(v) => toggleSwitch({ compactFeedMode: v })}
              />
            }
          />
          <SettingRow
            icon="chatbubble-outline"
            title="Show Captions"
            description="Display post captions in feed"
            isLast
            colors={C}
            right={
              <Switch
                {...switchProps(settings.showCaptions)}
                onValueChange={(v) => toggleSwitch({ showCaptions: v })}
              />
            }
          />
        </SectionCard>

        <SectionLabel label="NOTIFICATIONS" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="notifications-outline"
            title="Push Notifications"
            description="Alerts for likes and activity"
            colors={C}
            right={
              <Switch
                {...switchProps(settings.pushNotifications)}
                onValueChange={(v) => toggleSwitch({ pushNotifications: v })}
              />
            }
          />
          <SettingRow
            icon="trophy-outline"
            title="Competition Alerts"
            description="Notify when competitions go live"
            isLast
            colors={C}
            right={
              <Switch
                {...switchProps(settings.competitionAlerts)}
                onValueChange={(v) => toggleSwitch({ competitionAlerts: v })}
              />
            }
          />
        </SectionCard>

        <SectionLabel label="PROFILE" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="earth-outline"
            title="Public Posts"
            description="New posts visible to everyone"
            isLast
            colors={C}
            right={
              <Switch
                {...switchProps(settings.publicPosts)}
                onValueChange={(v) => toggleSwitch({ publicPosts: v })}
              />
            }
          />
        </SectionCard>

        <SectionLabel label="HAIRCUT PREFERENCES" colors={C} />
        <SectionCard colors={C}>
          <View style={[s.settingRow, { borderBottomColor: C.border, borderBottomWidth: 0 }]}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: C.gold + "1E" }]}>
                <Ionicons name="cut-outline" size={18} color={C.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.settingTitle, { color: C.text }]}>Preferred Length</Text>
                <Text style={[s.settingDesc, { color: C.textSecondary }]}>Filter recommendations by hair length</Text>
              </View>
            </View>
          </View>
          <View style={s.segmentRow}>
            {hairLengths.map((len, i) => {
              const isActive = settings.preferredHairLength === len;
              return (
                <Pressable
                  key={len}
                  style={[
                    s.segmentBtn,
                    i === 0 && s.segmentFirst,
                    i === hairLengths.length - 1 && s.segmentLast,
                    { borderColor: C.border },
                    isActive && { backgroundColor: C.gold, borderColor: C.gold },
                  ]}
                  onPress={() => updateSettings({ preferredHairLength: len })}
                >
                  <Text style={[s.segmentText, { color: isActive ? "#0A0A0A" : C.textSecondary }]}>{len}</Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        <SectionLabel label="EXPERIENCE" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="phone-portrait-outline"
            title="Haptic Feedback"
            description="Vibration on interactions"
            isLast
            colors={C}
            right={
              <Switch
                {...switchProps(settings.enableHaptics)}
                onValueChange={(v) => toggleSwitch({ enableHaptics: v })}
              />
            }
          />
        </SectionCard>

        <SectionLabel label="ABOUT" colors={C} />
        <SectionCard colors={C}>
          <SettingRow
            icon="cut-outline"
            title="CutMatch"
            isLast={false}
            colors={C}
            right={<Text style={[s.settingVersion, { color: C.textSecondary }]}>v1.0.0</Text>}
          />
          <SettingRow
            icon="sparkles-outline"
            title="Powered by"
            description="OpenAI GPT-4o + DALL-E 2"
            isLast
            colors={C}
          />
        </SectionCard>

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
  headerTitle: { fontSize: 24, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 16, padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 20,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  profileUsername: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
  profileBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  profileBadgeText: { fontSize: 11, fontFamily: "DMSans_500Medium" },
  sectionLabel: {
    fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 1,
    textTransform: "uppercase", paddingHorizontal: 20, marginBottom: 8, marginTop: 4,
  },
  settingsCard: { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  settingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 13,
  },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingTitle: { fontSize: 14, fontFamily: "DMSans_500Medium" },
  settingDesc: { fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 1 },
  settingVersion: { fontSize: 13, fontFamily: "DMSans_400Regular" },
  segmentRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 14, marginTop: 2 },
  segmentBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderLeftWidth: 0,
  },
  segmentFirst: { borderLeftWidth: 1, borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  segmentLast: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  segmentText: { fontSize: 13, fontFamily: "DMSans_500Medium" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, paddingVertical: 15, borderRadius: 18, borderWidth: 1, marginBottom: 8,
  },
  logoutText: { fontSize: 15, fontFamily: "DMSans_700Bold", color: "#FF4444" },
});
