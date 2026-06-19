import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getTheme } from "@sayable/core";
import { styles } from "@/src/styles";

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL || "http://localhost:3000";

function postAnalytics(name: string, context: Record<string, string | number | boolean | null> = {}) {
  fetch(`${WEB_BASE_URL}/api/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, context })
  }).catch(() => undefined);
}

interface ResultPayload {
  check: {
    title: string;
    plan: string;
    themeId: string;
    customTheme?: { accent: string; icon: string };
  };
  result: {
    responseCount: number;
    bestFit: { label: string; detail: string };
    comfortRange: { label: string; detail: string };
    finalMessage: string;
  };
}

export default function NativeResults() {
  const { hostToken } = useLocalSearchParams<{ hostToken: string }>();
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const theme = getTheme(payload?.check.themeId);
  const accent = payload?.check.customTheme?.accent || theme.accent;

  useEffect(() => {
    if (!hostToken) {
      return;
    }
    postAnalytics("app_opened", { surface: "native_results" });
    fetch(`${WEB_BASE_URL}/api/checks/host/${hostToken}`)
      .then((response) => response.json())
      .then((data: ResultPayload & { error?: string }) => {
        if (data.error) {
          postAnalytics("error_shown", { surface: "native_results_load" });
          setError(data.error);
          return;
        }
        setPayload(data);
      })
      .catch(() => {
        postAnalytics("error_shown", { surface: "native_results_load" });
        setError("Could not load results.");
      });
  }, [hostToken]);

  async function shareFinal() {
    if (!hostToken) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${WEB_BASE_URL}/api/checks/host/${hostToken}/final-share`, { method: "POST" });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok || !data.message) {
        postAnalytics("error_shown", { surface: "native_final_share", status: response.status });
        setError(data.error || "Final message is not available yet.");
        return;
      }
      await Share.share({ message: data.message });
      setMessage("Final message opened in the share sheet.");
    } catch {
      postAnalytics("error_shown", { surface: "native_final_share" });
      setError("Could not share the final message. Check your connection and try again.");
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.paper }]}>
      <Text style={[styles.pill, { color: accent, backgroundColor: theme.soft }]}>Host results</Text>
      {payload ? (
        <>
          <Text style={[styles.title, { color: theme.ink }]}>{payload.check.title}</Text>
          <View style={[styles.panel, { borderColor: accent, backgroundColor: theme.soft }]}>
            <Text style={[styles.heading, { color: theme.ink }]}>{payload.result.bestFit.label}</Text>
            <Text style={styles.body}>{payload.result.bestFit.detail}</Text>
            <Text style={styles.body}>{payload.result.responseCount} private responses</Text>
          </View>
          <View style={[styles.panel, { borderColor: accent, backgroundColor: "#fffefb" }]}>
            <Text style={[styles.heading, { color: theme.ink }]}>{payload.result.comfortRange.label}</Text>
            <Text style={styles.body}>{payload.result.comfortRange.detail}</Text>
          </View>
          <Pressable style={[styles.button, { backgroundColor: accent }]} onPress={shareFinal}>
            <Text style={styles.buttonText}>Share final message</Text>
          </Pressable>
          {message ? <Text style={styles.body}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : (
        <Text style={error ? styles.error : styles.body}>{error || "Loading results..."}</Text>
      )}
    </ScrollView>
  );
}
