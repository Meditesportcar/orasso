// Erreurs de l'appli vers GlitchTip (compatible Sentry) — lot 15, ARCHITECTURE-SUITE § 1.7. Sans
// `EXPO_PUBLIC_SENTRY_DSN`, rien n'est initialisé. Pas de source maps envoyées (pas de jeton : SENTRY_DISABLE_AUTO_UPLOAD).
import { scrubErrorEvent } from "@orasso/shared";
import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): boolean {
  if (!dsn || Platform.OS === "web") return false;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? "development" : "preview"),
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubErrorEvent(event),
  });
  return true;
}
