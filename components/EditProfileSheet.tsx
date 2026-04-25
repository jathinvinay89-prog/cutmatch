import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useApp, AppUser } from "@/context/AppContext";

const Haptics = Platform.OS !== "web" ? require("expo-haptics") : null;

const BIO_MAX = 280;
const NAME_MAX = 50;

export function EditProfileSheet({
  visible,
  onClose,
  user,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  user: AppUser & { bio?: string | null; avatarUrl?: string | null };
  onSaved?: (updated: AppUser) => void;
}) {
  const { colors: C, updateProfile } = useApp();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatarUri, setAvatarUri] = useState<string | null>(user.avatarUrl || null);
  const [pendingAvatarDataUrl, setPendingAvatarDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDisplayName(user.displayName || "");
      setBio(user.bio || "");
      setAvatarUri(user.avatarUrl || null);
      setPendingAvatarDataUrl(null);
      setSaving(false);
    }
  }, [visible, user.displayName, user.bio, user.avatarUrl]);

  const showPermissionDeniedAlert = (kind: "camera" | "photos") => {
    const label = kind === "camera" ? "Camera" : "Photo Library";
    Alert.alert(
      `${label} Access Required`,
      `Enable ${label} access in Settings to update your profile photo.`,
      [
        { text: "Not Now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
  };

  const pickAvatar = async (source: "camera" | "gallery") => {
    Haptics?.selectionAsync?.();
    let result: ImagePicker.ImagePickerResult | undefined;
    try {
      if (source === "camera" && Platform.OS !== "web") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") { showPermissionDeniedAlert("camera"); return; }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { showPermissionDeniedAlert("photos"); return; }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
        });
      }
    } catch {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { showPermissionDeniedAlert("photos"); return; }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
        });
      } catch {
        Alert.alert("Error", "Could not open image picker.");
        return;
      }
    }
    if (!result || result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const b64 = asset.base64;
    if (!b64) { Alert.alert("Error", "Could not read photo. Try again."); return; }
    const dataUrl = `data:image/jpeg;base64,${b64}`;
    setPendingAvatarDataUrl(dataUrl);
    setAvatarUri(asset.uri || dataUrl);
  };

  const promptChangePhoto = () => {
    if (Platform.OS === "web") {
      pickAvatar("gallery");
      return;
    }
    Alert.alert("Change Profile Photo", undefined, [
      { text: "Take Photo", onPress: () => pickAvatar("camera") },
      { text: "Choose from Library", onPress: () => pickAvatar("gallery") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Alert.alert("Display name required", "Please enter a display name.");
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      Alert.alert("Display name too long", `Keep it under ${NAME_MAX} characters.`);
      return;
    }
    if (bio.length > BIO_MAX) {
      Alert.alert("Bio too long", `Keep it under ${BIO_MAX} characters.`);
      return;
    }

    const updates: { displayName?: string; bio?: string; avatarUrl?: string } = {};
    if (trimmedName !== (user.displayName || "")) updates.displayName = trimmedName;
    if (bio !== (user.bio || "")) updates.bio = bio;
    if (pendingAvatarDataUrl) updates.avatarUrl = pendingAvatarDataUrl;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(user.id, updates);
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
      onSaved?.(updated);
      onClose();
    } catch (e: any) {
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Error);
      Alert.alert("Could not save", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || "?").slice(0, 2).toUpperCase();
  const hue = ((displayName || "?").charCodeAt(0) * 37) % 360;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { if (!saving) onClose(); }}
    >
      <View style={[s.container, { backgroundColor: C.background, paddingTop: Platform.OS === "android" ? insets.top : 0 }]}>
        <View style={[s.header, { borderBottomColor: C.border }]}>
          <Pressable onPress={onClose} disabled={saving} style={s.headerBtn} hitSlop={10}>
            <Text style={[s.headerBtnText, { color: saving ? C.textSecondary : C.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[s.headerTitle, { color: C.text }]}>Edit Profile</Text>
          <Pressable onPress={handleSave} disabled={saving} style={s.headerBtn} hitSlop={10}>
            {saving
              ? <ActivityIndicator size="small" color={C.gold} />
              : <Text style={[s.headerBtnText, { color: C.gold, fontFamily: "DMSans_700Bold" }]}>Save</Text>}
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          >
            <View style={s.avatarSection}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={s.avatar} contentFit="cover" />
              ) : (
                <View style={[s.avatar, { backgroundColor: `hsl(${hue}, 50%, 30%)`, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={s.avatarInitials}>{initials}</Text>
                </View>
              )}
              <Pressable onPress={promptChangePhoto} disabled={saving} style={s.changePhotoBtn} hitSlop={6}>
                <Ionicons name="camera-outline" size={16} color={C.gold} />
                <Text style={[s.changePhotoText, { color: C.gold }]}>Change Photo</Text>
              </Pressable>
            </View>

            <Text style={[s.label, { color: C.textSecondary }]}>DISPLAY NAME</Text>
            <TextInput
              value={displayName}
              onChangeText={(t) => setDisplayName(t.slice(0, NAME_MAX))}
              placeholder="Your name"
              placeholderTextColor={C.textSecondary}
              editable={!saving}
              maxLength={NAME_MAX}
              style={[s.input, { color: C.text, backgroundColor: C.surface, borderColor: C.border }]}
            />
            <Text style={[s.counter, { color: C.textSecondary }]}>{displayName.length}/{NAME_MAX}</Text>

            <Text style={[s.label, { color: C.textSecondary, marginTop: 18 }]}>BIO</Text>
            <TextInput
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
              placeholder="Tell people a bit about you"
              placeholderTextColor={C.textSecondary}
              editable={!saving}
              maxLength={BIO_MAX}
              multiline
              style={[s.input, s.bioInput, { color: C.text, backgroundColor: C.surface, borderColor: C.border }]}
            />
            <Text style={[s.counter, { color: C.textSecondary }]}>{bio.length}/{BIO_MAX}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontFamily: "DMSans_700Bold" },
  headerBtn: { minWidth: 60 },
  headerBtnText: { fontSize: 15, fontFamily: "DMSans_500Medium" },
  avatarSection: { alignItems: "center", marginBottom: 24, gap: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarInitials: { color: "white", fontSize: 32, fontFamily: "DMSans_700Bold" },
  changePhotoBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10 },
  changePhotoText: { fontSize: 14, fontFamily: "DMSans_700Bold" },
  label: { fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 8 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "DMSans_400Regular",
  },
  bioInput: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
  counter: { fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 6, alignSelf: "flex-end" },
});
