import type { ActivityType, ThemeDefinition } from "./types";

export const THEMES: ThemeDefinition[] = [
  {
    id: "sayable_default",
    name: "Sayable Default",
    description: "Clean, calm, and trustworthy.",
    premium: false,
    accent: "#2f6f5e",
    ink: "#17211d",
    paper: "#fbf8f2",
    soft: "#e8f0ea",
    icon: "sparkle"
  },
  {
    id: "dinner_drinks",
    name: "Dinner/Drinks",
    description: "Warm, social, and low-pressure.",
    premium: true,
    activityHint: "dinner_drinks",
    accent: "#b45132",
    ink: "#251916",
    paper: "#fff7ef",
    soft: "#f6dfcf",
    icon: "glass"
  },
  {
    id: "birthday",
    name: "Birthday",
    description: "Celebratory without feeling childish.",
    premium: true,
    activityHint: "birthday",
    accent: "#b02d63",
    ink: "#25101a",
    paper: "#fff5fa",
    soft: "#f4d9e7",
    icon: "cake"
  },
  {
    id: "night_out",
    name: "Night Out",
    description: "Bolder and group-chat ready.",
    premium: true,
    activityHint: "tickets_event",
    accent: "#315fd6",
    ink: "#0f1930",
    paper: "#f7f8ff",
    soft: "#dce5ff",
    icon: "bolt"
  },
  {
    id: "trip",
    name: "Trip",
    description: "Organized, airy, and planning-oriented.",
    premium: true,
    activityHint: "group_trip",
    accent: "#1c7f89",
    ink: "#102226",
    paper: "#f3fbfb",
    soft: "#d4eef0",
    icon: "map"
  },
  {
    id: "cozy_home",
    name: "Cozy/Home",
    description: "Softer, quieter, and homey.",
    premium: true,
    activityHint: "home_chill",
    accent: "#72513f",
    ink: "#241c18",
    paper: "#fffaf4",
    soft: "#eadfd4",
    icon: "home"
  }
];

// Theme/custom icons are stored as short names; map them to display glyphs so
// badges render an emoji rather than the raw uppercased name (e.g. "SPARKLE").
const THEME_ICON_GLYPHS: Record<string, string> = {
  sparkle: "✨",
  glass: "🍸",
  cake: "🎂",
  bolt: "⚡",
  map: "🗺️",
  home: "🏠",
  party: "🎉",
  star: "⭐",
  heart: "❤️",
  fire: "🔥",
  coffee: "☕",
  pizza: "🍕",
  music: "🎵",
  sun: "☀️",
  moon: "🌙",
  gift: "🎁",
  camera: "📸",
  beach: "🏖️"
};

export const THEME_ICON_NAMES = Object.keys(THEME_ICON_GLYPHS);

export function themeIconGlyph(icon?: string): string {
  if (!icon) {
    return THEME_ICON_GLYPHS.sparkle!;
  }
  return THEME_ICON_GLYPHS[icon.toLowerCase()] ?? THEME_ICON_GLYPHS.sparkle!;
}

export function getTheme(themeId?: string): ThemeDefinition {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0]!;
}

export function defaultThemeForActivity(activityType: ActivityType): string {
  if (activityType === "casual_hangout") {
    return "night_out";
  }
  return THEMES.find((theme) => theme.activityHint === activityType)?.id ?? "sayable_default";
}

export function canUseTheme(plan: "free" | "premium", themeId: string): boolean {
  const theme = THEMES.find((item) => item.id === themeId);
  return Boolean(theme && (!theme.premium || plan === "premium"));
}
