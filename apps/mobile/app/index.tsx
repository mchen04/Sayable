import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ACTIVITY_TYPES, activityLabel, createComfortDraft, getTheme, type ActivityType } from "@sayable/core";
import { styles } from "@/src/styles";

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL || "http://localhost:3000";
const DEFAULT_THEME = getTheme("sayable_default");

function postAnalytics(name: string, context: Record<string, string | number | boolean | null> = {}) {
  fetch(`${WEB_BASE_URL}/api/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, context })
  }).catch(() => undefined);
}

async function getCreatorNonce(): Promise<string> {
  const existing = await SecureStore.getItemAsync("creator_nonce");
  if (existing) {
    return existing;
  }
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  await SecureStore.setItemAsync("creator_nonce", created);
  return created;
}

export default function HostHome() {
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("dinner_drinks");
  const [currentIdea, setCurrentIdea] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const draft = useMemo(
    () => createComfortDraft({ title, activityType, currentIdea: currentIdea || undefined }),
    [activityType, currentIdea, title]
  );

  useEffect(() => {
    postAnalytics("app_opened", { surface: "native_host_home" });
  }, []);

  async function createCheck() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`${WEB_BASE_URL}/api/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          activityType,
          currentIdea: currentIdea || undefined,
          creatorNonce: await getCreatorNonce()
        })
      });
      const payload = (await response.json()) as {
        hostToken?: string;
        guestUrl?: string;
        hostUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.hostToken || !payload.guestUrl) {
        throw new Error(payload.error || "Could not create this Comfort Check.");
      }
      await SecureStore.setItemAsync("last_host_token", payload.hostToken);
      postAnalytics("host_review_opened", { surface: "native_host_home" });
      await Linking.openURL(payload.hostUrl || `${WEB_BASE_URL}/checks/${payload.hostToken}/review`);
    } catch (caught) {
      postAnalytics("error_shown", { surface: "native_create" });
      setError(caught instanceof Error ? caught.message : "Could not create this Comfort Check.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: DEFAULT_THEME.paper }]}>
      <Text style={[styles.pill, { color: DEFAULT_THEME.accent, backgroundColor: DEFAULT_THEME.soft }]}>Comfort Check</Text>
      <Text style={styles.title}>Sayable</Text>
      <Text style={styles.body}>
        Create and share a private group-chat comfort check before locking in dinner, tickets, birthdays, trips, or a
        casual hang.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Plan title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Friday dinner before the show"
          maxLength={120}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Activity</Text>
        {ACTIVITY_TYPES.map((type) => (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityState={{ selected: activityType === type }}
            style={[styles.button, activityType === type ? undefined : styles.secondaryButton]}
            onPress={() => setActivityType(type)}
          >
            <Text style={[styles.buttonText, activityType === type ? undefined : styles.secondaryText]}>
              {activityLabel(type)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Current idea or price</Text>
        <TextInput
          style={styles.input}
          value={currentIdea}
          onChangeText={setCurrentIdea}
          placeholder="$45/person, 7pm, or still flexible"
          maxLength={160}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Draft preview</Text>
        <Text style={styles.body}>{draft.shareText}</Text>
        <Text style={styles.body}>{draft.privacyCopy}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, { backgroundColor: DEFAULT_THEME.accent }]} onPress={createCheck} disabled={isLoading}>
        <Text style={styles.buttonText}>{isLoading ? "Drafting..." : "Create and review"}</Text>
      </Pressable>
      <Pressable
        style={[styles.button, styles.secondaryButton]}
        onPress={() => Linking.openURL(`${WEB_BASE_URL}/dashboard`).catch(() => Alert.alert("Could not open dashboard"))}
      >
        <Text style={[styles.buttonText, styles.secondaryText]}>Open web dashboard</Text>
      </Pressable>
      <View style={styles.linkRow}>
        {[
          ["Privacy", "/privacy"],
          ["Terms", "/terms"],
          ["Support", "/support"],
          ["Deletion", "/delete"]
        ].map(([label, path]) => (
          <Pressable
            key={path}
            accessibilityRole="link"
            onPress={() => Linking.openURL(`${WEB_BASE_URL}${path}`).catch(() => Alert.alert(`Could not open ${label}`))}
          >
            <Text style={styles.linkText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
