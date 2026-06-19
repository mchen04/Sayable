import { Stack } from "expo-router";
import { getTheme } from "@sayable/core";

export default function Layout() {
  const theme = getTheme("sayable_default");
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.paper },
        headerTitleStyle: { color: theme.ink },
        headerTintColor: theme.accent,
        contentStyle: { backgroundColor: theme.paper }
      }}
    />
  );
}
