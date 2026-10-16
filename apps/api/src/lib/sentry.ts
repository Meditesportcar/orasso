// Erreurs vers GlitchTip (compatible Sentry) — lot 15, ARCHITECTURE-SUITE § 1.7. Sans `SENTRY_DSN`, rien n'est
// initialisé. Identifiant d'utilisateur seulement ; jamais de plaque, de téléphone, d'e-mail ni de corps de requête
// (`scrubErrorEvent` de @orasso/shared, commun au site et à l'appli).
import { scrubErrorEvent } from "@orasso/shared";
import * as Sentry from "@sentry/node";

import { env } from "../env";

export function initSentry(): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubErrorEvent(event),
  });
  return true;
}

/** Erreur inattendue d'une requête (les erreurs métier `AppError` ne sont pas envoyées). */
export function captureError(error: unknown, userId?: string | null) {
  if (!env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (userId) scope.setUser({ id: userId });
    Sentry.captureException(error);
  });
}
