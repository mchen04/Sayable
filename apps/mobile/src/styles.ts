import { StyleSheet } from "react-native";
import { getTheme } from "@sayable/core";

const sayableTheme = getTheme("sayable_default");

export const colors = {
  paper: sayableTheme.paper,
  ink: sayableTheme.ink,
  muted: "#56635f",
  accent: sayableTheme.accent,
  soft: sayableTheme.soft,
  line: "#d9ded2",
  danger: "#aa3030"
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: 20,
    gap: 16
  },
  title: {
    fontSize: 42,
    lineHeight: 44,
    fontWeight: "900",
    color: colors.ink
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted
  },
  field: {
    gap: 8
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    color: colors.ink
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 16,
    gap: 12
  },
  button: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: 16
  },
  secondaryButton: {
    backgroundColor: colors.soft
  },
  dangerButton: {
    backgroundColor: colors.danger
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16
  },
  secondaryText: {
    color: colors.ink
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.soft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.ink,
    fontWeight: "800"
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingTop: 4
  },
  linkText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    textDecorationLine: "underline"
  }
});
