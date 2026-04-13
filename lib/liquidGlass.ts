import { Platform } from "react-native";

export const isLiquidGlass =
  Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 26;

export const LG_BLUR_INTENSITY = 80;
export const LG_TINT_DARK = "dark";
export const LG_TINT_LIGHT = "light";
export const LG_BORDER_GLOW = "rgba(255, 255, 255, 0.18)";
export const LG_BORDER_RADIUS = 20;
export const LG_SURFACE_BG_DARK = "rgba(20, 20, 20, 0.55)";
export const LG_SURFACE_BG_LIGHT = "rgba(255, 255, 255, 0.45)";
export const LG_HEADER_BG_DARK = "rgba(10, 10, 10, 0.6)";
export const LG_HEADER_BG_LIGHT = "rgba(245, 240, 232, 0.6)";
