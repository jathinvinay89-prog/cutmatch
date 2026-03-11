import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { DarkColors, LightColors } from "@/constants/colors";

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AppSettings {
  isDarkMode: boolean;
  showFaceShape: boolean;
  showDifficulty: boolean;
  enableHaptics: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  isDarkMode: true,
  showFaceShape: true,
  showDifficulty: true,
  enableHaptics: true,
};

interface AppContextValue {
  currentUser: AppUser | null;
  isLoadingUser: boolean;
  setCurrentUser: (user: AppUser | null) => void;
  createUser: (username: string, displayName: string) => Promise<AppUser>;
  login: (username: string, password: string) => Promise<AppUser>;
  register: (username: string, password: string, displayName: string) => Promise<AppUser>;
  logout: () => void;
  uploadAvatar: (userId: number, avatarUrl: string) => Promise<AppUser>;
  apiBase: string;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  colors: typeof DarkColors;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<AppUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const apiBase = getApiUrl();
  const colors = settings.isDarkMode ? DarkColors : LightColors;

  useEffect(() => {
    (async () => {
      try {
        const [stored, storedSettings] = await Promise.all([
          AsyncStorage.getItem("cutmatch_user"),
          AsyncStorage.getItem("cutmatch_settings"),
        ]);
        if (stored) setCurrentUserState(JSON.parse(stored));
        if (storedSettings) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      } catch {}
      setIsLoadingUser(false);
    })();
  }, []);

  const setCurrentUser = (user: AppUser | null) => {
    setCurrentUserState(user);
    if (user) {
      AsyncStorage.setItem("cutmatch_user", JSON.stringify(user));
    } else {
      AsyncStorage.removeItem("cutmatch_user");
    }
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    AsyncStorage.setItem("cutmatch_settings", JSON.stringify(next));
  };

  const createUser = async (username: string, displayName: string): Promise<AppUser> => {
    const url = new URL("/api/users", apiBase).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, displayName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create user");
    }
    const user = await res.json();
    setCurrentUser(user);
    return user;
  };

  const register = async (username: string, password: string, displayName: string): Promise<AppUser> => {
    const url = new URL("/api/auth/register", apiBase).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, displayName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to register");
    }
    const user = await res.json();
    setCurrentUser(user);
    return user;
  };

  const login = async (username: string, password: string): Promise<AppUser> => {
    const url = new URL("/api/auth/login", apiBase).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to login");
    }
    const user = await res.json();
    setCurrentUser(user);
    return user;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const uploadAvatar = async (userId: number, avatarUrl: string): Promise<AppUser> => {
    const url = new URL(`/api/users/${userId}/avatar`, apiBase).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl }),
    });
    if (!res.ok) throw new Error("Failed to upload avatar");
    const user = await res.json();
    setCurrentUser({ ...currentUser!, avatarUrl: user.avatarUrl });
    return user;
  };

  const value = useMemo(
    () => ({ currentUser, isLoadingUser, setCurrentUser, createUser, login, register, logout, uploadAvatar, apiBase, settings, updateSettings, colors }),
    [currentUser, isLoadingUser, apiBase, settings]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
