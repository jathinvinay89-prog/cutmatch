const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8C97A";
const ERROR = "#FF4444";

export const DarkColors = {
  gold: GOLD,
  goldLight: GOLD_LIGHT,
  background: "#0A0A0A",
  surface: "#141414",
  surface2: "#1E1E1E",
  border: "#2A2A2A",
  text: "#F5F0E8",
  textSecondary: "#8A8580",
  white: "#FFFFFF",
  error: ERROR,
  rank1: "#C9A84C",
  rank2: "#A0A0A0",
  rank3: "#CD7F32",
  rank4: "#6A6A6A",
};

export const LightColors = {
  gold: "#B8942A",
  goldLight: GOLD_LIGHT,
  background: "#F5F0E8",
  surface: "#FFFFFF",
  surface2: "#EDE8E0",
  border: "#D8D0C4",
  text: "#1A1612",
  textSecondary: "#7A726A",
  white: "#FFFFFF",
  error: ERROR,
  rank1: "#B8942A",
  rank2: "#808080",
  rank3: "#9B5F1A",
  rank4: "#5A5A5A",
};

export const Colors = DarkColors;

export default {
  light: {
    text: LightColors.text,
    background: LightColors.background,
    tint: GOLD,
    tabIconDefault: LightColors.textSecondary,
    tabIconSelected: GOLD,
  },
  dark: {
    text: DarkColors.text,
    background: DarkColors.background,
    tint: GOLD,
    tabIconDefault: DarkColors.textSecondary,
    tabIconSelected: GOLD,
  },
};
