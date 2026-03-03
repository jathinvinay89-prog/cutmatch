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

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AppContextValue {
  currentUser: AppUser | null;
  isLoadingUser: boolean;
  setCurrentUser: (user: AppUser | null) => void;
  createUser: (username: string, displayName: string) => Promise<AppUser>;
  apiBase: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<AppUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const apiBase = getApiUrl();

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("cutmatch_user");
        if (stored) {
          setCurrentUserState(JSON.parse(stored));
        }
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

  const value = useMemo(
    () => ({ currentUser, isLoadingUser, setCurrentUser, createUser, apiBase }),
    [currentUser, isLoadingUser, apiBase]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
